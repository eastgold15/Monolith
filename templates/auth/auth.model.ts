import { type } from 'arktype';
import { z } from 'zod';

/**
 * 用户实体类型
 */
export const UserEntity = type({
  id: 'number',
  email: 'string',
  username: 'string',
  isActive: 'boolean',
  createdAt: 'Date',
  updatedAt: 'Date',
  lastLoginAt: 'Date | null',
});

/**
 * 用户创建输入
 */
export const CreateUserSchema = z.object({
  email: z.string().email('无效的邮箱地址'),
  username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/, '用户名只能包含字母、数字和下划线'),
  password: z.string().min(8, '密码至少 8 个字符'),
});

/**
 * 用户登录输入
 */
export const LoginSchema = z.object({
  email: z.string().email('无效的邮箱地址'),
  password: z.string().min(1, '请输入密码'),
});

/**
 * 用户更新输入
 */
export const UpdateUserSchema = z.object({
  email: z.string().email('无效的邮箱地址').optional(),
  username: z.string().min(3).max(20).optional(),
  isActive: z.boolean().optional(),
}).partial();

/**
 * 密码重置请求
 */
export const PasswordResetRequestSchema = z.object({
  email: z.string().email('无效的邮箱地址'),
});

/**
 * 密码重置确认
 */
export const PasswordResetConfirmSchema = z.object({
  token: z.string(),
  newPassword: z.string().min(8, '密码至少 8 个字符'),
});

/**
 * Token 响应
 */
export const TokenResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number(),
});

/**
 * 导出类型
 */
export type User = typeof UserEntity.infer;
export type CreateUser = z.infer<typeof CreateUserSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type UpdateUser = z.infer<typeof UpdateUserSchema>;
export type PasswordResetRequest = z.infer<typeof PasswordResetRequestSchema>;
export type PasswordResetConfirm = z.infer<typeof PasswordResetConfirmSchema>;
export type TokenResponse = z.infer<typeof TokenResponseSchema>;

/**
 * 导出 TypeBox 格式（用于 Elysia 验证）
 */
export const UserResponse = {
  id: 'number',
  email: 'string',
  username: 'string',
  isActive: 'boolean',
  createdAt: 'string',
  updatedAt: 'string',
  lastLoginAt: ['string', 'null'],
} as const;
