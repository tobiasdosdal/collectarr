import { z } from 'zod';

const uuidSchema = z.string().uuid('Invalid ID format');

export const validateUuid = async (request, reply, done) => {
  if (request.params.id) {
    const result = uuidSchema.safeParse(request.params.id);
    if (!result.success) {
      return reply.code(400).send({
        error: 'Validation Error',
        message: result.error.errors[0].message,
      });
    }
    request.validatedId = request.params.id;
  }
  done();
};
