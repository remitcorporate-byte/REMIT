import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type AuditParams = {
  companyId: string;
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
};

class AuditService {
  async record(params: AuditParams) {
    try {
      await prisma.auditLog.create({
        data: {
          companyId: params.companyId,
          userId: params.userId || null,
          action: params.action,
          entityType: params.entityType,
          entityId: params.entityId || null,
          metadata: (params.metadata as any) || undefined,
        },
      });
    } catch (error) {
      console.error('[AuditLog] Failed to record event:', error);
    }
  }
}

export const auditService = new AuditService();
