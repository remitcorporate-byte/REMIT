import crypto from 'node:crypto';
import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import config from '../config';
import { AppError } from '../middleware/errorHandler';
import { parseCookieHeader } from '../middleware/auth';
import { accessTokenExpiresIn, createSession, generateAccessToken, hashToken, safeEqualText, sessionExpiry } from '../auth/tokens';
import { getPermissions } from '../auth/permissions';
import { auditService } from '../services/audit.service';
import { sendEmail } from '../services/email.service';

export const passwordSchema = z.string().min(10, 'Password must be at least 10 characters').regex(/[A-Za-z]/, 'Password must contain a letter').regex(/[0-9]/, 'Password must contain a number');
const registerSchema = z.object({ email: z.string().email('Invalid email'), password: passwordSchema, firstName: z.string().min(1), lastName: z.string().min(1), companyName: z.string().min(1) });
const loginSchema = z.object({ email: z.string().email('Invalid email'), password: z.string().min(1) });

function clientIsMobile(req: Request) { return req.header('X-Client')?.toLowerCase() === 'mobile'; }
function setRefreshCookie(res: Response, token: string) {
  const maxAge = config.auth.refreshTokenTtlDays * 24 * 60 * 60 * 1000;
  const sameSite = config.auth.cookieCrossSite ? 'none' : 'lax';
  res.setHeader('Set-Cookie', `remit_rt=${encodeURIComponent(token)}; Max-Age=${Math.floor(maxAge / 1000)}; Path=/api/v1/auth; HttpOnly; SameSite=${sameSite}${config.env === 'production' || config.auth.cookieCrossSite ? '; Secure' : ''}`);
}
function clearRefreshCookie(res: Response) { res.setHeader('Set-Cookie', 'remit_rt=; Max-Age=0; Path=/api/v1/auth; HttpOnly; SameSite=Lax'); }
function refreshFromRequest(req: Request) { return (req.body as { refreshToken?: string } | undefined)?.refreshToken || parseCookieHeader(req.headers.cookie).remit_rt; }
function userPayload(user: any) {
  return { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role, permissions: getPermissions(user.role), companyId: user.companyId, companyName: user.company?.name || user.ownedCompany?.name };
}
function requestMeta(req: Request) { return { userAgent: req.get('user-agent') || undefined, ipAddress: req.ip, deviceName: req.header('X-Device-Name') || undefined }; }
async function issueSession(res: Response, req: Request, user: any, family?: { id: string; createdAt: Date }) {
  const created = await createSession({ userId: user.id, familyId: family?.id, familyCreatedAt: family?.createdAt, ...requestMeta(req) });
  const accessToken = generateAccessToken({ sub: user.id, sid: created.session.id, role: user.role });
  if (clientIsMobile(req)) return { accessToken, refreshToken: created.refreshToken, expiresIn: accessTokenExpiresIn(accessToken) };
  setRefreshCookie(res, created.refreshToken);
  return { accessToken, expiresIn: accessTokenExpiresIn(accessToken) };
}
function sessionData(session: any, currentId?: string) { return { id: session.id, deviceName: session.deviceName, userAgent: session.userAgent, ip: session.ipAddress, createdAt: session.createdAt, lastUsedAt: session.lastUsedAt, current: session.id === currentId }; }

const REFRESH_REUSE_GRACE_MS = 30 * 1000;
// Compared against when the email is unknown so login timing doesn't reveal which accounts exist.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('remit-timing-equaliser', 12);

export const register = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = registerSchema.parse(req.body);
    if (await prisma.user.findUnique({ where: { email: body.email } })) throw new AppError('User with this email already exists', 400);
    const hashedPassword = await bcrypt.hash(body.password, 12);
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { email: body.email, password: hashedPassword, firstName: body.firstName, lastName: body.lastName, role: 'OWNER' } });
      const company = await tx.company.create({ data: { name: body.companyName, email: body.email, ownerId: user.id } });
      await tx.user.update({ where: { id: user.id }, data: { companyId: company.id } });
      await tx.wallet.create({ data: { companyId: company.id } });
      return { user: { ...user, companyId: company.id }, company };
    });
    const issued = await issueSession(res, req, result.user);
    res.status(201).json({ success: true, data: { ...issued, token: issued.accessToken, user: userPayload({ ...result.user, company: result.company }) } });
  } catch (error) { next(error instanceof z.ZodError ? new AppError(error.errors.map((e) => e.message).join(', '), 400) : error); }
};

export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: body.email }, include: { company: true, ownedCompany: true } });
    const passwordOk = await bcrypt.compare(body.password, user?.password || DUMMY_PASSWORD_HASH);
    if (!user || !user.password || !passwordOk) {
      if (user?.companyId) await auditService.record({ companyId: user.companyId, userId: user.id, action: 'LOGIN_FAILURE', entityType: 'Auth', metadata: { reason: 'invalid_credentials' } });
      throw new AppError('Invalid credentials', 401);
    }
    if (!user.isActive) {
      if (user.companyId) await auditService.record({ companyId: user.companyId, userId: user.id, action: 'LOGIN_FAILURE', entityType: 'Auth', metadata: { reason: 'inactive_account' } });
      throw new AppError('Account is deactivated', 401);
    }
    const issued = await issueSession(res, req, user);
    await auditService.record({ companyId: user.companyId || user.ownedCompany?.id || '', userId: user.id, action: 'LOGIN_SUCCESS', entityType: 'Auth' });
    res.json({ success: true, data: { ...issued, token: issued.accessToken, user: userPayload(user) } });
  } catch (error) { next(error instanceof z.ZodError ? new AppError(error.errors.map((e) => e.message).join(', '), 400) : error); }
};

export const refresh = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const raw = refreshFromRequest(req);
    if (!raw) throw new AppError('Refresh token required', 401);
    const existing = await prisma.authSession.findUnique({ where: { refreshTokenHash: hashToken(raw) }, include: { user: { include: { company: true, ownedCompany: true } } } });
    if (!existing) throw new AppError('Refresh token invalid', 401);
    // Grace window: a client whose refresh response was lost (flaky mobile network)
    // or two tabs racing will resend the just-rotated token. Reject it, but don't
    // treat it as theft and log the user out everywhere.
    if (existing.revokedAt && existing.revokedReason === 'rotated' && Date.now() - new Date(existing.revokedAt).getTime() < REFRESH_REUSE_GRACE_MS) {
      throw new AppError('Refresh token already rotated', 401);
    }
    if (existing.revokedAt && existing.revokedReason === 'rotated') {
      await prisma.authSession.updateMany({ where: { familyId: existing.familyId, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: 'reuse_detected' } });
      await auditService.record({ companyId: existing.user.companyId || existing.user.ownedCompany?.id || '', userId: existing.userId, action: 'REFRESH_REUSE_DETECTED', entityType: 'AuthSession', entityId: existing.id });
      throw new AppError('Refresh token reuse detected', 401);
    }
    if (existing.revokedAt || existing.expiresAt <= new Date() || !existing.user.isActive) throw new AppError('Refresh session expired', 401);
    const now = new Date();
    const nextRaw = crypto.randomBytes(48).toString('base64url');
    const familyRoot = await prisma.authSession.findFirst({ where: { familyId: existing.familyId }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } });
    const nextExpiry = sessionExpiry(now, familyRoot?.createdAt || existing.createdAt);
    const result = await prisma.$transaction(async (tx) => {
      const locked = await tx.authSession.updateMany({ where: { id: existing.id, revokedAt: null }, data: { revokedAt: now, revokedReason: 'rotated' } });
      if (locked.count !== 1) throw new AppError('Refresh token already used', 401);
      const next = await tx.authSession.create({ data: { userId: existing.userId, refreshTokenHash: hashToken(nextRaw), familyId: existing.familyId, userAgent: req.get('user-agent') || existing.userAgent, ipAddress: req.ip, deviceName: req.header('X-Device-Name') || existing.deviceName, createdAt: now, lastUsedAt: now, expiresAt: nextExpiry } });
      await tx.authSession.update({ where: { id: existing.id }, data: { replacedById: next.id } });
      return next;
    });
    const accessToken = generateAccessToken({ sub: existing.userId, sid: result.id, role: existing.user.role });
    if (clientIsMobile(req)) res.json({ success: true, data: { accessToken, token: accessToken, refreshToken: nextRaw, expiresIn: accessTokenExpiresIn(accessToken), user: userPayload(existing.user) } });
    else { setRefreshCookie(res, nextRaw); res.json({ success: true, data: { accessToken, token: accessToken, expiresIn: accessTokenExpiresIn(accessToken), user: userPayload(existing.user) } }); }
  } catch (error) { next(error); }
};

export const logout = async (req: Request, res: Response, next: NextFunction) => {
  try { if (req.authSessionId) await prisma.authSession.updateMany({ where: { id: req.authSessionId, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: 'logout' } }); if (req.user?.companyId) await auditService.record({ companyId: req.user.companyId, userId: req.user.id, action: 'LOGOUT', entityType: 'AuthSession', entityId: req.authSessionId }); clearRefreshCookie(res); res.json({ success: true }); } catch (error) { next(error); }
};
export const logoutAll = async (req: Request, res: Response, next: NextFunction) => {
  try { await prisma.authSession.updateMany({ where: { userId: req.user!.id, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: 'logout_all' } }); if (req.user?.companyId) await auditService.record({ companyId: req.user.companyId, userId: req.user.id, action: 'LOGOUT_ALL', entityType: 'AuthSession' }); clearRefreshCookie(res); res.json({ success: true }); } catch (error) { next(error); }
};
export const listSessions = async (req: Request, res: Response, next: NextFunction) => { try { const sessions = await prisma.authSession.findMany({ where: { userId: req.user!.id, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { lastUsedAt: 'desc' } }); res.json({ success: true, data: sessions.map((s: any) => sessionData(s, req.authSessionId)) }); } catch (error) { next(error); } };
export const revokeSession = async (req: Request, res: Response, next: NextFunction) => { try { const result = await prisma.authSession.updateMany({ where: { id: req.params.id as string, userId: req.user!.id, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: 'user_revoked' } }); if (!result.count) throw new AppError('Session not found', 404); res.json({ success: true }); } catch (error) { next(error); } };

export const forgotPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      const token = crypto.randomBytes(32).toString('base64url');
      await prisma.$transaction(async (tx) => { await tx.oneTimeCode.updateMany({ where: { userId: user.id, purpose: 'PASSWORD_RESET', consumedAt: null }, data: { consumedAt: new Date() } }); await tx.oneTimeCode.create({ data: { userId: user.id, purpose: 'PASSWORD_RESET', codeHash: hashToken(token), expiresAt: new Date(Date.now() + 30 * 60 * 1000) } }); });
      // Swallow delivery errors so the response is identical whether or not the account exists.
      await sendEmail({ to: user.email, subject: 'Reset your REMIT password', text: `Reset your password: ${config.auth.appUrl}/reset-password?token=${token}` })
        .catch((error: unknown) => console.error('[Auth] Password reset email failed:', error instanceof Error ? error.message : error));
      if (user.companyId) await auditService.record({ companyId: user.companyId, userId: user.id, action: 'PASSWORD_RESET_REQUESTED', entityType: 'User', entityId: user.id });
    }
    res.json({ success: true, message: 'If an account exists, password reset instructions have been sent.' });
  } catch (error) { next(error); }
};
export const resetPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = z.object({ token: z.string().min(1), password: passwordSchema }).parse(req.body);
    const code = await prisma.oneTimeCode.findFirst({ where: { purpose: 'PASSWORD_RESET', codeHash: hashToken(body.token), consumedAt: null, expiresAt: { gt: new Date() } } });
    if (!code) throw new AppError('Reset token invalid or expired', 400);
    const now = new Date(); const password = await bcrypt.hash(body.password, 12);
    const result = await prisma.$transaction(async (tx) => { const consumed = await tx.oneTimeCode.updateMany({ where: { id: code.id, consumedAt: null, expiresAt: { gt: now } }, data: { consumedAt: now } }); if (consumed.count !== 1) throw new AppError('Reset token invalid or expired', 400); const user = await tx.user.update({ where: { id: code.userId }, data: { password, passwordChangedAt: now } as any }); await tx.authSession.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: now, revokedReason: 'password_reset' } }); return user; });
    if (result.companyId) await auditService.record({ companyId: result.companyId, userId: result.id, action: 'PASSWORD_RESET_COMPLETED', entityType: 'User', entityId: result.id });
    res.json({ success: true, message: 'Password reset successfully.' });
  } catch (error) { next(error instanceof z.ZodError ? new AppError(error.errors.map((e) => e.message).join(', '), 400) : error); }
};
export const changePassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = z.object({ currentPassword: z.string(), newPassword: passwordSchema }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user?.password || !(await bcrypt.compare(body.currentPassword, user.password))) throw new AppError('Current password is incorrect', 400);
    const now = new Date();
    await prisma.$transaction(async (tx) => { await tx.user.update({ where: { id: user.id }, data: { password: await bcrypt.hash(body.newPassword, 12), passwordChangedAt: now } as any }); await tx.authSession.updateMany({ where: { userId: user.id, revokedAt: null, id: { not: req.authSessionId } }, data: { revokedAt: now, revokedReason: 'password_changed' } }); });
    const fresh = await prisma.authSession.findUnique({ where: { id: req.authSessionId! } });
    const accessToken = fresh ? generateAccessToken({ sub: user.id, sid: fresh.id, role: user.role }) : '';
    if (req.user?.companyId) await auditService.record({ companyId: req.user.companyId, userId: user.id, action: 'PASSWORD_CHANGED', entityType: 'User', entityId: user.id });
    res.json({ success: true, data: { accessToken, token: accessToken, expiresIn: accessTokenExpiresIn(accessToken) } });
  } catch (error) { next(error instanceof z.ZodError ? new AppError(error.errors.map((e) => e.message).join(', '), 400) : error); }
};

export const getMe = async (req: Request, res: Response, next: NextFunction) => {
  try { const user = await prisma.user.findUnique({ where: { id: req.user!.id }, include: { company: { include: { wallet: { select: { id: true, balance: true, currency: true } } } } } }); if (!user) throw new AppError('User not found', 404); res.json({ success: true, data: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role, permissions: getPermissions(user.role), companyId: user.companyId, company: user.company ? { id: user.company.id, name: user.company.name, email: user.company.email, wallet: user.company.wallet } : null } }); } catch (error) { next(error); }
};

export { safeEqualText };
