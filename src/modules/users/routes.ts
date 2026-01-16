import bcrypt from 'bcrypt';
import { z } from 'zod';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

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

export default async function usersRoutes(fastify: FastifyInstance) {
  // All routes require authentication
  fastify.addHook('preHandler', fastify.authenticate);

  // Admin routes - require admin access
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
  fastify.post('/', {
    preHandler: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
    const validation = createUserSchema.safeParse(request.body);
    if (!validation.success) {
      return reply.code(400).send({
        error: 'Validation Error',
        details: validation.error.flatten().fieldErrors,
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

    return reply.code(201).send(user);
  });

  // Update user (admin only, or user updating themselves)
  fastify.patch<{ Params: { id: string } }>('/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const isAdmin = request.user.isAdmin;
    const isSelf = request.user.id === id;

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
        details: validation.error.flatten().fieldErrors,
      });
    }

    const { email, password, isAdmin: newIsAdmin } = validation.data;

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

    return updated;
  });

  // Delete user (admin only, cannot delete self)
  fastify.delete<{ Params: { id: string } }>('/:id', {
    preHandler: [fastify.authenticate, requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params;

    if (request.user.id === id) {
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

    return reply.code(204).send();
  });

  // Get user profile
  fastify.get('/profile', async (request) => {
    const user = await fastify.prisma.user.findUnique({
      where: { id: request.user.id },
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
  fastify.get<{ Querystring: { limit?: string; offset?: string } }>('/sync-logs', async (request) => {
    const { limit = '50', offset = '0' } = request.query;

    const logs = await fastify.prisma.syncLog.findMany({
      where: { userId: request.user.id },
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
