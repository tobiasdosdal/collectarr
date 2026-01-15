import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import bcrypt from 'bcrypt';
import { z } from 'zod';

interface SyncLogsQuery {
  limit?: string;
  offset?: string;
}

interface UserParams {
  id: string;
}

const createUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  isAdmin: z.boolean().optional().default(false),
});

const updateUserSchema = z.object({
  email: z.string().email('Invalid email address').optional(),
  password: z.string().min(8, 'Password must be at least 8 characters').optional(),
  isAdmin: z.boolean().optional(),
});

export default async function usersRoutes(fastify: FastifyInstance): Promise<void> {
  // All routes require authentication
  fastify.addHook('preHandler', fastify.authenticate);

  // Admin routes - require admin access
  // Helper to check admin status (must be used after authenticate)
  const requireAdmin = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user || !request.user.isAdmin) {
      return reply.code(403).send({
        error: 'Forbidden',
        message: 'Admin access required',
      });
    }
  };

  // List all users (admin only)
  fastify.get('/list', {
    preHandler: [fastify.authenticate, requireAdmin],
  }, async () => {
    const users = await fastify.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        isAdmin: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    return users;
  });

  // Create new user (admin only)
  fastify.post<{ Body: z.infer<typeof createUserSchema> }>('/', {
    preHandler: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
    const validation = createUserSchema.safeParse(request.body);
    if (!validation.success) {
      return reply.code(400).send({
        error: 'Validation Error',
        details: z.flattenError(validation.error).fieldErrors,
      });
    }

    const { email, password, isAdmin } = validation.data;

    // Check if user exists
    const existing = await fastify.prisma.user.findUnique({
      where: { email },
    });

    if (existing) {
      return reply.code(409).send({
        error: 'Conflict',
        message: 'Email already registered',
      });
    }

    // Prevent creating another admin if current user is not admin (extra safety)
    if (isAdmin && !request.user?.isAdmin) {
      return reply.code(403).send({
        error: 'Forbidden',
        message: 'Only admins can create admin users',
      });
    }

    // Hash password and create user
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await fastify.prisma.user.create({
      data: {
        email,
        passwordHash,
        isAdmin: isAdmin || false,
      },
      select: {
        id: true,
        email: true,
        isAdmin: true,
        createdAt: true,
      },
    });

    fastify.log.info({
      createdBy: request.user!.email,
      newUserEmail: email,
      isAdmin,
    }, 'User created by admin');

    return reply.code(201).send(user);
  });

  // Update user (admin only, or user updating themselves)
  fastify.patch<{ Params: UserParams; Body: z.infer<typeof updateUserSchema> }>('/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const isAdmin = request.user!.isAdmin;
    const isSelf = request.user!.id === id;

    // Only admins can update other users, or users can update themselves (limited fields)
    if (!isAdmin && !isSelf) {
      return reply.code(403).send({
        error: 'Forbidden',
        message: 'You can only update your own account',
      });
    }

    const validation = updateUserSchema.safeParse(request.body);
    if (!validation.success) {
      return reply.code(400).send({
        error: 'Validation Error',
        details: z.flattenError(validation.error).fieldErrors,
      });
    }

    const { email, password, isAdmin: newIsAdmin } = validation.data;

    // Find the user
    const targetUser = await fastify.prisma.user.findUnique({
      where: { id },
    });

    if (!targetUser) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'User not found',
      });
    }

    // Non-admins cannot change admin status or email
    if (!isAdmin && (newIsAdmin !== undefined || email)) {
      return reply.code(403).send({
        error: 'Forbidden',
        message: 'You can only change your password',
      });
    }

    // Prevent removing last admin
    if (isAdmin && newIsAdmin === false && targetUser.isAdmin) {
      const adminCount = await fastify.prisma.user.count({
        where: { isAdmin: true },
      });
      if (adminCount <= 1) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'Cannot remove the last admin user',
        });
      }
    }

    // Prevent non-admins from creating admins
    if (!isAdmin && newIsAdmin === true) {
      return reply.code(403).send({
        error: 'Forbidden',
        message: 'Only admins can grant admin privileges',
      });
    }

    // Build update data
    const updateData: { email?: string; passwordHash?: string; isAdmin?: boolean } = {};
    if (email) updateData.email = email;
    if (password) {
      updateData.passwordHash = await bcrypt.hash(password, 12);
    }
    if (newIsAdmin !== undefined && isAdmin) {
      updateData.isAdmin = newIsAdmin;
    }

    const updated = await fastify.prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        isAdmin: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    fastify.log.info({
      updatedBy: request.user!.email,
      targetUserId: id,
      changes: Object.keys(updateData),
    }, 'User updated');

    return updated;
  });

  // Delete user (admin only, cannot delete self)
  fastify.delete<{ Params: UserParams }>('/:id', {
    preHandler: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params;

    // Cannot delete yourself
    if (request.user!.id === id) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'You cannot delete your own account',
      });
    }

    const targetUser = await fastify.prisma.user.findUnique({
      where: { id },
    });

    if (!targetUser) {
      return reply.code(404).send({
        error: 'Not Found',
        message: 'User not found',
      });
    }

    // Prevent deleting last admin
    if (targetUser.isAdmin) {
      const adminCount = await fastify.prisma.user.count({
        where: { isAdmin: true },
      });
      if (adminCount <= 1) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'Cannot delete the last admin user',
        });
      }
    }

    await fastify.prisma.user.delete({
      where: { id },
    });

    fastify.log.info({
      deletedBy: request.user!.email,
      deletedUserEmail: targetUser.email,
    }, 'User deleted by admin');

    return reply.code(204).send();
  });

  // Get user profile
  fastify.get('/profile', async (request: FastifyRequest) => {
    const user = await fastify.prisma.user.findUnique({
      where: { id: request.user!.id },
      select: {
        id: true,
        email: true,
        isAdmin: true,
        apiKey: true,
        createdAt: true,
      },
    });

    return user;
  });

  // Get sync logs for user
  fastify.get<{ Querystring: SyncLogsQuery }>('/sync-logs', async (request) => {
    const { limit = '50', offset = '0' } = request.query;

    const logs = await fastify.prisma.syncLog.findMany({
      where: { userId: request.user!.id },
      orderBy: { startedAt: 'desc' },
      take: parseInt(limit, 10),
      skip: parseInt(offset, 10),
      include: {
        embyServer: {
          select: { name: true },
        },
      },
    });

    return logs;
  });
}
