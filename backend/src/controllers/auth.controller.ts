import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import config from '../config';
import { AppError } from '../middleware/errorHandler';

const prisma = new PrismaClient();

const registerSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  companyName: z.string().min(1, 'Company name is required'),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password is required'),
});

function generateToken(id: string, role: string): string {
  return jwt.sign({ id, role }, config.jwt.secret, {
    expiresIn: config.jwt.expire,
  } as jwt.SignOptions);
}

// @desc    Register user + company + wallet
// @route   POST /api/v1/auth/register
export const register = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = registerSchema.parse(req.body);

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { email: body.email },
    });
    if (existingUser) {
      throw new AppError('User with this email already exists', 400);
    }

    // Hash password
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(body.password, salt);

    // Create user, company, and wallet in a transaction
    const result = await prisma.$transaction(async (tx: any) => {
      const user = await tx.user.create({
        data: {
          email: body.email,
          password: hashedPassword,
          firstName: body.firstName,
          lastName: body.lastName,
          role: 'OWNER',
        },
      });

      const company = await tx.company.create({
        data: {
          name: body.companyName,
          email: body.email,
          ownerId: user.id,
        },
      });

      // Link user to company
      await tx.user.update({
        where: { id: user.id },
        data: { companyId: company.id },
      });

      // Create wallet
      await tx.wallet.create({
        data: { companyId: company.id },
      });

      return { user, company };
    });

    const token = generateToken(result.user.id, result.user.role);

    res.status(201).json({
      success: true,
      data: {
        token,
        user: {
          id: result.user.id,
          email: result.user.email,
          firstName: result.user.firstName,
          lastName: result.user.lastName,
          role: result.user.role,
          companyId: result.company.id,
          companyName: result.company.name,
        },
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.errors.map((e) => e.message).join(', ');
      return next(new AppError(messages, 400));
    }
    next(error);
  }
};

// @desc    Login user
// @route   POST /api/v1/auth/login
export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { email: body.email },
      include: { company: true, ownedCompany: true },
    });

    if (!user || !user.password) {
      throw new AppError('Invalid credentials', 401);
    }

    if (!user.isActive) {
      throw new AppError('Account is deactivated', 401);
    }

    const isMatch = await bcrypt.compare(body.password, user.password);
    if (!isMatch) {
      throw new AppError('Invalid credentials', 401);
    }

    const token = generateToken(user.id, user.role);

    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          companyId: user.companyId,
          companyName: user.company?.name || user.ownedCompany?.name,
        },
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.errors.map((e) => e.message).join(', ');
      return next(new AppError(messages, 400));
    }
    next(error);
  }
};

// @desc    Get current user
// @route   GET /api/v1/auth/me
export const getMe = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      include: {
        company: {
          include: {
            wallet: { select: { id: true, balance: true, currency: true } },
          },
        },
      },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        companyId: user.companyId,
        company: user.company
          ? {
              id: user.company.id,
              name: user.company.name,
              email: user.company.email,
              wallet: user.company.wallet,
            }
          : null,
      },
    });
  } catch (error) {
    next(error);
  }
};
