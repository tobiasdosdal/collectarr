import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export function zodToJsonSchema(schema) {
  // Simple conversion for Fastify validation
  return {
    type: 'object',
    properties: Object.fromEntries(
      Object.entries(schema.shape).map(([key, value]) => {
        let type = 'string';
        return [key, { type }];
      })
    ),
    required: Object.keys(schema.shape),
  };
}
