import type { FastifyInstance, FastifyRequest } from 'fastify';

export interface AuditLogParams {
  action: string;
  entity: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}

function getUserId(request: FastifyRequest): string | null {
  const userId = request.user?.id || null;
  // Return null for fake auth-disabled user to avoid FK constraint violation
  if (userId === 'auth-disabled-user') {
    return null;
  }
  return userId;
}

function getIpAddress(request: FastifyRequest): string | null {
  return request.ip || null;
}

function getUserAgent(request: FastifyRequest): string | null {
  const userAgent = request.headers['user-agent'];
  return typeof userAgent === 'string' ? userAgent : null;
}

export async function writeAuditLog(
  fastify: FastifyInstance,
  request: FastifyRequest,
  params: AuditLogParams
): Promise<void> {
  try {
    await fastify.prisma.auditLog.create({
      data: {
        userId: getUserId(request),
        action: params.action,
        entity: params.entity,
        entityId: params.entityId ?? null,
        metadata: params.metadata ? JSON.stringify(params.metadata) : null,
        ipAddress: getIpAddress(request),
        userAgent: getUserAgent(request),
      },
    });
  } catch (error) {
    fastify.log.warn(
      { err: (error as Error).message, action: params.action, entity: params.entity },
      'Failed to write audit log'
    );
  }
}
