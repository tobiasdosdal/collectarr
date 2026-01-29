import bcrypt from 'bcrypt';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { requireAdmin } from '../../shared/middleware/index.js';

const createUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  isAdmin: z.boolean().optional().default(false),
});

const updateUserSchema = z.object({
  email: z.string().email('Invalid email address').optional(),
  password: z.string().min(8, 'Password must be at least 8 characters').optional(),
  currentPassword: z.string().optional(),
  isAdmin: z.boolean().optional(),
});

export default async function usersRoutes(fastify: FastifyInstance) {
  // All routes require authentication
  fastify.addHook('preHandler', fastify.authenticate);

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

    const { email, password, currentPassword, isAdmin: newIsAdmin } = validation.data;

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

    // When user changes their OWN password, require current password verification
    if (isSelf && password) {
      if (!currentPassword) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: 'Current password is required to change your password',
        });
      }

      const isValidPassword = await bcrypt.compare(currentPassword, targetUser.passwordHash);
      if (!isValidPassword) {
        return reply.code(401).send({
          error: 'Unauthorized',
          message: 'Current password is incorrect',
        });
      }
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

  // ==================== Onboarding Endpoints ====================

  // Onboarding step IDs that are tracked
  const ONBOARDING_STEP_IDS = [
    'connect_media_server',
    'link_trakt',
    'create_collection',
    'run_sync',
    'configure_preferences',
  ];

  // Get onboarding status
  fastify.get('/onboarding/status', async (request) => {
    const user = await fastify.prisma.user.findUnique({
      where: { id: request.user.id },
      select: {
        onboardingCompleted: true,
        onboardingDismissedAt: true,
        onboardingSteps: true,
      },
    });

    if (!user) {
      return {
        completed: false,
        dismissed: false,
        steps: {},
      };
    }

    // Parse onboarding steps from JSON string
    let steps: Record<string, boolean> = {};
    if (user.onboardingSteps) {
      try {
        steps = JSON.parse(user.onboardingSteps);
      } catch {
        steps = {};
      }
    }

    // Auto-detect completion status based on actual app state
    const detectedSteps = await detectOnboardingProgress(fastify, request.user.id);

    // Merge detected steps with stored steps (detected takes precedence)
    const mergedSteps = { ...steps, ...detectedSteps };

    return {
      completed: user.onboardingCompleted,
      dismissed: !!user.onboardingDismissedAt,
      steps: mergedSteps,
    };
  });

  // Complete an onboarding step
  fastify.post<{ Body: { stepId: string } }>('/onboarding/step', async (request, reply) => {
    const { stepId } = request.body;

    if (!ONBOARDING_STEP_IDS.includes(stepId)) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: 'Invalid step ID',
      });
    }

    const user = await fastify.prisma.user.findUnique({
      where: { id: request.user.id },
      select: { onboardingSteps: true },
    });

    // Parse existing steps
    let steps: Record<string, boolean> = {};
    if (user?.onboardingSteps) {
      try {
        steps = JSON.parse(user.onboardingSteps);
      } catch {
        steps = {};
      }
    }

    // Mark step as completed
    steps[stepId] = true;

    // Check if all steps are completed
    const allCompleted = ONBOARDING_STEP_IDS.every((id) => steps[id] === true);

    // Update user
    await fastify.prisma.user.update({
      where: { id: request.user.id },
      data: {
        onboardingSteps: JSON.stringify(steps),
        onboardingCompleted: allCompleted,
      },
    });

    return {
      success: true,
      allCompleted,
    };
  });

  // Dismiss onboarding (hide checklist but don't mark as completed)
  fastify.post('/onboarding/dismiss', async (request) => {
    await fastify.prisma.user.update({
      where: { id: request.user.id },
      data: {
        onboardingDismissedAt: new Date(),
      },
    });

    return { success: true };
  });

  // Reset onboarding (for testing or re-showing)
  fastify.post('/onboarding/reset', async (request) => {
    await fastify.prisma.user.update({
      where: { id: request.user.id },
      data: {
        onboardingCompleted: false,
        onboardingDismissedAt: null,
        onboardingSteps: null,
      },
    });

    return { success: true };
  });
}

// Helper function to auto-detect onboarding progress based on app state
async function detectOnboardingProgress(
  fastify: FastifyInstance,
  userId: string
): Promise<Record<string, boolean>> {
  const detected: Record<string, boolean> = {};

  // Check if media server is connected
  const embyServerCount = await fastify.prisma.embyServer.count();
  detected['connect_media_server'] = embyServerCount > 0;

  // Check if Trakt is connected (from global settings)
  const settings = await fastify.prisma.settings.findUnique({
    where: { id: 'singleton' },
    select: { traktAccessToken: true },
  });
  detected['link_trakt'] = !!settings?.traktAccessToken;

  // Check if at least one collection exists
  const collectionCount = await fastify.prisma.collection.count();
  detected['create_collection'] = collectionCount > 0;

  // Check if at least one sync has been run
  const syncLogCount = await fastify.prisma.syncLog.count({
    where: { userId },
  });
  detected['run_sync'] = syncLogCount > 0;

  // Configure preferences is considered done if any of the above are done
  // (indicates user has explored settings)
  detected['configure_preferences'] =
    detected['connect_media_server'] ||
    detected['link_trakt'] ||
    collectionCount > 0;

  return detected;
}
