import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
type NotificationType =
  | 'PAYROLL_SCHEDULED'
  | 'PAYROLL_COMPLETED'
  | 'PAYROLL_FAILED'
  | 'DEPOSIT_SUCCESS'
  | 'LOW_BALANCE'
  | 'EMPLOYEE_ADDED'
  | 'SUPPORT_UPDATE'
  | 'GENERAL';
type NotificationChannel = 'IN_APP' | 'EMAIL' | 'SMS';

class NotificationService {
  async create(params: {
    companyId: string;
    userId: string;
    type: NotificationType;
    title: string;
    message: string;
    channel?: NotificationChannel;
  }) {
    return prisma.notification.create({
      data: {
        companyId: params.companyId,
        userId: params.userId,
        type: params.type,
        title: params.title,
        message: params.message,
        channel: params.channel || 'IN_APP',
      },
    });
  }

  async notifyCompanyAdmins(params: {
    companyId: string;
    type: NotificationType;
    title: string;
    message: string;
  }) {
    const admins = await prisma.user.findMany({
      where: {
        companyId: params.companyId,
        // Companies are created with an OWNER (not ADMIN), so owners must be
        // included or single-founder companies receive no alerts at all.
        role: { in: ['OWNER', 'ADMIN'] },
        isActive: true,
      },
      select: { id: true },
    });

    const notifications = admins.map((admin: { id: string }) => ({
      companyId: params.companyId,
      userId: admin.id,
      type: params.type,
      channel: 'IN_APP' as NotificationChannel,
      title: params.title,
      message: params.message,
    }));

    if (notifications.length > 0) {
      await prisma.notification.createMany({ data: notifications });
    }
  }

  async notifySupportParticipants(params: {
    companyId: string;
    createdById: string;
    title: string;
    message: string;
  }) {
    const users = await prisma.user.findMany({
      where: {
        companyId: params.companyId,
        isActive: true,
        OR: [{ id: params.createdById }, { role: { in: ['OWNER', 'ADMIN'] } }],
      },
      select: { id: true },
    });
    const userIds = [...new Set(users.map((user) => user.id))];
    if (!userIds.length) return;
    await prisma.notification.createMany({
      data: userIds.map((userId) => ({
        companyId: params.companyId,
        userId,
        type: 'SUPPORT_UPDATE',
        channel: 'IN_APP',
        title: params.title,
        message: params.message,
      })),
    });
  }
}

export const notificationService = new NotificationService();
