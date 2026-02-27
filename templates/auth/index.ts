/**
 * Auth Module - 认证模块
 *
 * 导出所有认证相关的组件
 */

export { authPlugin, default } from './auth';
export { authRoutes, default as authRoutesDefault } from './routes';
export { AuthService, createAuthService } from './auth.service';
export * from './auth.schema';
export * from './auth.model';

/**
 * 模块元信息
 */
export const meta = {
  name: 'auth',
  version: '1.0.0',
  description: '完整的认证系统，包含登录、注册、JWT、密码重置等功能',
  dependencies: [
    '@elysiajs/jwt',
    '@elysiajs/cookie',
    'bcrypt',
    'zod',
    'drizzle-orm',
  ],
  envVariables: [
    'JWT_SECRET',
    'JWT_EXPIRES_IN',
  ],
};
