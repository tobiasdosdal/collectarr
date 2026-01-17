/**
 * Admin Authorization Middleware
 * Single source of truth for admin access checks
 */

import type { FastifyRequest, FastifyReply } from 'fastify';

/**
 * Middleware to require admin access for protected routes
 * Use as a preHandler hook on routes that need admin privileges
 *
 * @example
 * fastify.post('/admin-only', {
 *   preHandler: [requireAdmin],
 * }, async (request, reply) => { ... })
 */
export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.user || !request.user.isAdmin) {
    return reply.code(403).send({
      error: 'Forbidden',
      message: 'Admin access required',
    });
  }
}
