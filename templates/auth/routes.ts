import { Elysia, t } from 'elysia';
import type { DB } from '../types/database';
import { authPlugin } from './auth';

/**
 * Auth Routes - 认证路由
 *
 * 独立的路由配置，可以挂载到主应用
 */
export const authRoutes = (db: DB) =>
  new Elysia({ prefix: '/api' })
    .use(authPlugin(db))
    .get('/health', () => ({
      status: 'ok',
      service: 'auth',
      timestamp: new Date().toISOString(),
    }));

export default authRoutes;
