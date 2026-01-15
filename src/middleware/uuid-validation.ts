import { z } from 'zod';
import type { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';

const uuidSchema = z.string().uuid('Invalid ID format');

declare module 'fastify' {
  interface FastifyRequest {
    validatedId?: string;
  }
}

export const validateUuid = async (
  request: FastifyRequest<{ Params: { id?: string } }>,
  reply: FastifyReply,
  done: HookHandlerDoneFunction
): Promise<void> => {
  if (request.params.id) {
    const result = uuidSchema.safeParse(request.params.id);
    if (!result.success) {
      reply.code(400).send({
        error: 'Validation Error',
        message: result.error.errors[0]?.message ?? 'Invalid ID',
      });
      return;
    }
    request.validatedId = request.params.id;
  }
  done();
};
