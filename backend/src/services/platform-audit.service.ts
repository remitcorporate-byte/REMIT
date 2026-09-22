import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

class PlatformAuditService {
  async record(params: {
    platformUserId?: string | null;
    companyId?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    metadata?: Record<string, unknown>;
  }) {
    try {
      await prisma.platformAuditLog.create({
        data: {
          platformUserId: params.platformUserId || null,
          companyId: params.companyId || null,
          action: params.action,
          entityType: params.entityType,
          entityId: params.entityId || null,
          metadata: (params.metadata as any) || undefined,
        },
      });
    } catch (error) {
      console.error('[PlatformAuditLog] Failed to record event:', error);
    }
  }
}

export const platformAuditService = new PlatformAuditService();
