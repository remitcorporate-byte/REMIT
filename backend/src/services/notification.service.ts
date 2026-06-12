import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
type NotificationType =
  | 'PAYROLL_SCHEDULED'
  | 'PAYROLL_COMPLETED'
  | 'PAYROLL_FAILED'
  | 'DEPOSIT_SUCCESS'
  | 'LOW_BALANCE'
  | 'EMPLOYEE_ADDED'
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
        role: 'ADMIN',
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
}

export const notificationService = new NotificationService();
