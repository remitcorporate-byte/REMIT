import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler';
import { auditService } from '../services/audit.service';

const prisma = new PrismaClient();
const teamRoles = ['ADMIN', 'FINANCE', 'VIEWER'] as const;

const inviteSchema = z.object({
  email: z.string().email('Invalid email'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  role: z.enum(teamRoles),
  password: z.string().min(8).optional(),
});

const updateRoleSchema = z.object({
  role: z.enum(teamRoles),
});

function assertOwner(req: Request) {
  if (req.user?.role !== 'OWNER') {
    throw new AppError('Only the company owner can manage team members', 403);
  }
  if (!req.user.companyId) {
    throw new AppError('No company associated with this user', 400);
  }
}

export const getTeam = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.companyId) throw new AppError('No company associated with this user', 400);

    const users = await prisma.user.findMany({
      where: { companyId: req.user.companyId },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    res.json({ success: true, data: users });
  } catch (error) {
    next(error);
  }
};

export const inviteTeamMember = async (req: Request, res: Response, next: NextFunction) => {
  try {
    assertOwner(req);
    const body = inviteSchema.parse(req.body);

    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) throw new AppError('A user with this email already exists', 400);

    const temporaryPassword = body.password || `Remit-${Math.random().toString(36).slice(2, 10)}!`;
    const password = await bcrypt.hash(temporaryPassword, 12);

    const user = await prisma.user.create({
      data: {
        email: body.email,
        password,
        firstName: body.firstName,
        lastName: body.lastName,
        role: body.role,
        companyId: req.user!.companyId!,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    await auditService.record({
      companyId: req.user!.companyId!,
      userId: req.user!.id,
      action: 'TEAM_MEMBER_INVITED',
      entityType: 'User',
      entityId: user.id,
      metadata: { email: user.email, role: user.role },
    });

    res.status(201).json({
      success: true,
      data: {
        ...user,
        temporaryPassword: body.password ? undefined : temporaryPassword,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) return next(new AppError(error.errors.map((e) => e.message).join(', '), 400));
    next(error);
  }
};

export const updateTeamMemberRole = async (req: Request, res: Response, next: NextFunction) => {
  try {
    assertOwner(req);
    const body = updateRoleSchema.parse(req.body);

    const target = await prisma.user.findFirst({
      where: { id: req.params.id as string, companyId: req.user!.companyId! },
    });
    if (!target) throw new AppError('Team member not found', 404);
    if (target.role === 'OWNER') throw new AppError('Owner role cannot be changed from team settings', 400);

    const user = await prisma.user.update({
      where: { id: target.id },
      data: { role: body.role },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    await auditService.record({
      companyId: req.user!.companyId!,
      userId: req.user!.id,
      action: 'TEAM_MEMBER_ROLE_UPDATED',
      entityType: 'User',
      entityId: user.id,
      metadata: { email: user.email, role: user.role },
    });

    res.json({ success: true, data: user });
  } catch (error) {
    if (error instanceof z.ZodError) return next(new AppError(error.errors.map((e) => e.message).join(', '), 400));
    next(error);
  }
};

export const deactivateTeamMember = async (req: Request, res: Response, next: NextFunction) => {
  try {
    assertOwner(req);

    if (req.params.id === req.user!.id) {
      throw new AppError('Owner cannot deactivate their own account', 400);
    }

    const target = await prisma.user.findFirst({
      where: { id: req.params.id as string, companyId: req.user!.companyId! },
    });
    if (!target) throw new AppError('Team member not found', 404);
    if (target.role === 'OWNER') throw new AppError('Owner cannot be deactivated here', 400);

    const user = await prisma.user.update({
      where: { id: target.id },
      data: { isActive: false },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    await auditService.record({
      companyId: req.user!.companyId!,
      userId: req.user!.id,
      action: 'TEAM_MEMBER_DEACTIVATED',
      entityType: 'User',
      entityId: user.id,
      metadata: { email: user.email, role: user.role },
    });

    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
};
