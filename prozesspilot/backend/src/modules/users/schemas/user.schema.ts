import { z } from 'zod';

export const PresetEnum = z.enum(['super_admin', 'admin', 'operator', 'viewer', 'custom']);
export type Preset = z.infer<typeof PresetEnum>;

export const PermissionSchema = z
  .string()
  .max(80)
  .regex(/^\*$|^[a-z_]+\.(\*|[a-z_]+)$/);

export const CreateUserSchema = z.object({
  email: z.string().email().max(320),
  display_name: z.string().min(1).max(120),
  preset: PresetEnum.default('viewer'),
  permissions: z.array(PermissionSchema).max(50).optional(),
  // Optional: super_admin kann tenant_id explizit setzen (null = anderer super_admin).
  tenant_id: z.string().uuid().nullable().optional(),
  // Optional: Admin kann temporäres Passwort vorgeben; sonst wird eines generiert.
  temporary_password: z.string().min(12).max(256).optional(),
});
export type CreateUserInput = z.infer<typeof CreateUserSchema>;

export const UpdateUserSchema = z.object({
  display_name: z.string().min(1).max(120).optional(),
  preset: PresetEnum.optional(),
  permissions: z.array(PermissionSchema).max(50).optional(),
  is_active: z.boolean().optional(),
  // Manuelles Entsperren
  locked_until: z.null().optional(),
  failed_attempts: z.literal(0).optional(),
});
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;

export const ResetPasswordSchema = z.object({
  temporary_password: z.string().min(12).max(256).optional(),
});
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;
