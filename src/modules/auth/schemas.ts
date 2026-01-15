import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

export function zodToJsonSchema(schema: z.ZodObject<z.ZodRawShape>): {
  type: string;
  properties: Record<string, { type: string }>;
  required: string[];
} {
  return {
    type: 'object',
    properties: Object.fromEntries(
      Object.keys(schema.shape).map((key) => {
        const type = 'string';
        return [key, { type }];
      })
    ),
    required: Object.keys(schema.shape),
  };
}
