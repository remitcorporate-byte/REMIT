import { Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { verifyAccessToken } from '../auth/tokens';
import { AppError } from './errorHandler';
import { Permission, roleHasPermission } from '../auth/permissions';

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; email: string; firstName: string; lastName: string; role: Role; companyId: string | null };
      authSessionId?: string;
    }
  }
}

export function parseCookieHeader(header?: string): Record<string, string> {
  if (!header) return {};
  const result: Record<string, string> = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index <= 0) continue;
    result[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return result;
}

export const protect = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : undefined;
    if (!token) throw new AppError('Not authorized, no token provided', 401);
    const decoded = verifyAccessToken(token);
    if (!decoded.sub || !decoded.sid || !decoded.iat) throw new AppError('Not authorized, token invalid', 401);
    // Redis caching could be added here later; session revocation is checked on every request for now.
    const session = await prisma.authSession.findUnique({ where: { id: decoded.sid } });
    if (!session || session.userId !== decoded.sub || session.revokedAt || session.expiresAt <= new Date()) {
      throw new AppError('Not authorized, session expired or revoked', 401);
    }
    const user = await prisma.user.findUnique({
      where: { id: decoded.sub },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, companyId: true, isActive: true, passwordChangedAt: true } as any,
    }) as any;
    if (!user || !user.isActive) throw new AppError('Not authorized, user not found or inactive', 401);
    if (user.passwordChangedAt && decoded.iat < Math.floor(user.passwordChangedAt.getTime() / 1000)) {
      throw new AppError('Not authorized, credentials changed', 401);
    }
    req.authSessionId = session.id;
    req.user = user;
    next();
  } catch (error) {
    next(error instanceof AppError ? error : new AppError('Not authorized, token invalid', 401));
  }
};

export const authorize = (...roles: Role[]) => (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user) return next(new AppError('Not authorized', 401));
  if (!roles.includes(req.user.role)) return next(new AppError('Not authorized for this action', 403));
  next();
};

export const authorizePermission = (permission: Permission) => (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user) return next(new AppError('Not authorized', 401));
  if (!roleHasPermission(req.user.role, permission)) return next(new AppError('Not authorized for this action', 403));
  next();
};
