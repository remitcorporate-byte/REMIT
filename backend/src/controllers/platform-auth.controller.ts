import { NextFunction, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import config from '../config';
import { getPlatformPermissions } from '../auth/platform-permissions';
import { AppError } from '../middleware/errorHandler';
import { platformAuditService } from '../services/platform-audit.service';

const prisma = new PrismaClient();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const createStaffSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12, 'Platform passwords must be at least 12 characters'),
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  role: z.enum(['SUPPORT_AGENT', 'SUPPORT_ADMIN']).default('SUPPORT_AGENT'),
});

function platformUserResponse(user: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'SUPPORT_AGENT' | 'SUPPORT_ADMIN';
  isActive: boolean;
  lastLoginAt?: Date | null;
  createdAt?: Date;
}) {
  return { ...user, permissions: getPlatformPermissions(user.role) };
}

export const platformLogin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = loginSchema.parse(req.body);
    const user = await prisma.platformUser.findUnique({ where: { email: body.email.toLowerCase() } });
    if (!user || !user.isActive || !(await bcrypt.compare(body.password, user.password))) {
      throw new AppError('Invalid platform credentials', 401);
    }

    const token = jwt.sign(
      { id: user.id, role: user.role, kind: 'platform' },
      config.platformJwt.secret,
      { expiresIn: config.platformJwt.expire } as jwt.SignOptions
    );
    const updated = await prisma.platformUser.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, isActive: true, lastLoginAt: true, createdAt: true },
    });

    await platformAuditService.record({
      platformUserId: user.id,
      action: 'PLATFORM_LOGIN',
      entityType: 'PlatformUser',
      entityId: user.id,
    });
    res.json({ success: true, data: { token, user: platformUserResponse(updated) } });
  } catch (error) {
    if (error instanceof z.ZodError) return next(new AppError(error.errors.map((item) => item.message).join(', '), 400));
    next(error);
  }
};

export const getPlatformMe = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.platformUser.findUnique({
      where: { id: req.platformUser!.id },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, isActive: true, lastLoginAt: true, createdAt: true },
    });
    if (!user) throw new AppError('Platform account not found', 404);
    res.json({ success: true, data: platformUserResponse(user) });
  } catch (error) {
    next(error);
  }
};

export const listPlatformStaff = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const users = await prisma.platformUser.findMany({
      orderBy: [{ isActive: 'desc' }, { firstName: 'asc' }],
      select: { id: true, email: true, firstName: true, lastName: true, role: true, isActive: true, lastLoginAt: true, createdAt: true },
    });
    res.json({ success: true, data: users.map(platformUserResponse) });
  } catch (error) {
    next(error);
  }
};

export const createPlatformStaff = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = createStaffSchema.parse(req.body);
    const email = body.email.toLowerCase();
    if (await prisma.platformUser.findUnique({ where: { email } })) {
      throw new AppError('A platform account with this email already exists', 409);
    }
    const user = await prisma.platformUser.create({
      data: { ...body, email, password: await bcrypt.hash(body.password, 12) },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, isActive: true, lastLoginAt: true, createdAt: true },
    });
    await platformAuditService.record({
      platformUserId: req.platformUser!.id,
      action: 'PLATFORM_STAFF_CREATED',
      entityType: 'PlatformUser',
      entityId: user.id,
      metadata: { email: user.email, role: user.role },
    });
    res.status(201).json({ success: true, data: platformUserResponse(user) });
  } catch (error) {
    if (error instanceof z.ZodError) return next(new AppError(error.errors.map((item) => item.message).join(', '), 400));
    next(error);
  }
};

export const deactivatePlatformStaff = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.params.id === req.platformUser!.id) throw new AppError('You cannot deactivate your own platform account', 400);
    const target = await prisma.platformUser.findUnique({ where: { id: req.params.id as string } });
    if (!target) throw new AppError('Platform account not found', 404);
    const user = await prisma.platformUser.update({
      where: { id: target.id },
      data: { isActive: false },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, isActive: true, lastLoginAt: true, createdAt: true },
    });
    await platformAuditService.record({
      platformUserId: req.platformUser!.id,
      action: 'PLATFORM_STAFF_DEACTIVATED',
      entityType: 'PlatformUser',
      entityId: user.id,
      metadata: { email: user.email, role: user.role },
    });
    res.json({ success: true, data: platformUserResponse(user) });
  } catch (error) {
    next(error);
  }
};
