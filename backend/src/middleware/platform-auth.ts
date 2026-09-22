import { NextFunction, Request, Response } from 'express';
import { PlatformRole, PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { PlatformPermission, platformRoleHasPermission } from '../auth/platform-permissions';
import config from '../config';
import { AppError } from './errorHandler';

const prisma = new PrismaClient();

interface PlatformJwtPayload {
  id: string;
  role: PlatformRole;
  kind: 'platform';
}

declare global {
  namespace Express {
    interface Request {
      platformUser?: {
        id: string;
        email: string;
        firstName: string;
        lastName: string;
        role: PlatformRole;
      };
    }
  }
}

export const protectPlatform = async (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  try {
    const token = req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.split(' ')[1]
      : undefined;

    if (!token) {
      throw new AppError('Not authorized, no platform token provided', 401);
    }

    const decoded = jwt.verify(
      token,
      config.platformJwt.secret
    ) as PlatformJwtPayload;

    if (decoded.kind !== 'platform') {
      throw new AppError('Not authorized for platform routes', 401);
    }

    const user = await prisma.platformUser.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      throw new AppError('Platform account not found or inactive', 401);
    }

    req.platformUser = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
    };
    next();
  } catch (error) {
    next(
      error instanceof AppError
        ? error
        : new AppError('Not authorized, platform token invalid', 401)
    );
  }
};

export const authorizePlatformPermission = (
  permission: PlatformPermission
) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.platformUser) {
      return next(new AppError('Not authorized', 401));
    }

    if (!platformRoleHasPermission(req.platformUser.role, permission)) {
      return next(new AppError('Not authorized for this platform action', 403));
    }

    next();
  };
};
