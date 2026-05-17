import { z } from 'zod';

export const LoginSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(256),
});
export type LoginInput = z.infer<typeof LoginSchema>;

export const ChangePasswordSchema = z.object({
  current_password: z.string().min(1).max(256),
  new_password: z.string().min(12).max(256),
});
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;
