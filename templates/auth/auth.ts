import { Elysia, t } from 'elysia';
import { jwt } from '@elysiajs/jwt';
import { cookie } from '@elysiajs/cookie';
import type { DB } from '../types/database';
import { createAuthService } from './auth.service';
import {
  LoginSchema,
  CreateUserSchema,
  TokenResponseSchema,
} from './auth.model';

/**
 * Auth Plugin - 认证插件
 *
 * 提供用户注册、登录、登出等功能
 */
export const authPlugin = (db: DB) =>
  new Elysia({ name: 'auth-plugin' })
    .use(
      jwt({
        name: 'jwt',
        secret: process.env.JWT_SECRET || 'your-secret-key',
      })
    )
    .use(cookie())
    .derive(({ jwt, cookie }) => ({
      async getCurrentUser() {
        const token = cookie.auth_token;
        if (!token) return null;

        const payload = await jwt.verify(token);
        if (!payload) return null;

        // TODO: 从数据库获取用户信息
        return payload;
      },
    }))
    .model({
      login: t.Object({
        email: t.String({ format: 'email' }),
        password: t.String(),
      }),
      register: t.Object({
        email: t.String({ format: 'email' }),
        username: t.String({ minLength: 3, maxLength: 20 }),
        password: t.String({ minLength: 8 }),
      }),
      tokenResponse: t.Object({
        accessToken: t.String(),
        refreshToken: t.String(),
        expiresIn: t.Number(),
      }),
    })
    .group('/auth', (app) =>
      app
        // 注册
        .post(
          '/register',
          async ({ body }) => {
            const authService = createAuthService(db);

            try {
              const user = await authService.register(body);
              return {
                success: true,
                data: user,
              };
            } catch (error) {
              if (error instanceof Error) {
                if (error.message === 'EMAIL_EXISTS') {
                  return {
                    success: false,
                    error: 'EMAIL_EXISTS',
                    message: '该邮箱已被注册',
                  };
                }
                if (error.message === 'USERNAME_EXISTS') {
                  return {
                    success: false,
                    error: 'USERNAME_EXISTS',
                    message: '该用户名已被使用',
                  };
                }
              }
              throw error;
            }
          },
          {
            body: 'register',
            response: {
              200: t.Object({
                success: t.Boolean(),
                data: t.Object({
                  id: t.Number(),
                  email: t.String(),
                  username: t.String(),
                  isActive: t.Boolean(),
                  createdAt: t.String(),
                  updatedAt: t.String(),
                  lastLoginAt: t.Union([t.String(), t.Null()]),
                }),
              }),
            },
          }
        )
        // 登录
        .post(
          '/login',
          async ({ body, jwt, setCookie }) => {
            const authService = createAuthService(db);

            try {
              const result = await authService.login(body);

              // 生成 JWT
              const accessToken = await jwt.sign({
                userId: result.user.id,
                email: result.user.email,
              });

              // 设置 cookie
              setCookie('auth_token', accessToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                maxAge: 60 * 60, // 1 小时
              });

              return {
                success: true,
                data: {
                  user: result.user,
                  tokens: result.tokens,
                },
              };
            } catch (error) {
              if (error instanceof Error && error.message === 'INVALID_CREDENTIALS') {
                return {
                  success: false,
                  error: 'INVALID_CREDENTIALS',
                  message: '邮箱或密码错误',
                };
              }
              if (error instanceof Error && error.message === 'ACCOUNT_DISABLED') {
                return {
                  success: false,
                  error: 'ACCOUNT_DISABLED',
                  message: '该账户已被禁用',
                };
              }
              throw error;
            }
          },
          {
            body: 'login',
            response: {
              200: t.Union([
                t.Object({
                  success: t.Literal(true),
                  data: t.Object({
                    user: t.Object({
                      id: t.Number(),
                      email: t.String(),
                      username: t.String(),
                      isActive: t.Boolean(),
                    }),
                    tokens: t.Object({
                      accessToken: t.String(),
                      refreshToken: t.String(),
                      expiresIn: t.Number(),
                    }),
                  }),
                }),
                t.Object({
                  success: t.Literal(false),
                  error: t.String(),
                  message: t.String(),
                }),
              ]),
            },
          }
        )
        // 登出
        .post('/logout', async ({ setCookie }) => {
          setCookie('auth_token', '', {
            maxAge: 0,
          });

          return {
            success: true,
            message: '已成功登出',
          };
        })
        // 刷新 token
        .post(
          '/refresh',
          async ({ body }) => {
            const authService = createAuthService(db);

            try {
              const tokens = await authService.refreshToken(body.refreshToken);
              return {
                success: true,
                data: tokens,
              };
            } catch (error) {
              if (error instanceof Error) {
                return {
                  success: false,
                  error: error.message,
                  message: '刷新 token 失败',
                };
              }
              throw error;
            }
          },
          {
            body: t.Object({
              refreshToken: t.String(),
            }),
            response: {
              200: t.Object({
                success: t.Boolean(),
                data: 'tokenResponse',
              }),
            },
          }
        )
        // 获取当前用户
        .get('/me', async ({ getCurrentUser }) => {
          const user = await getCurrentUser();

          if (!user) {
            return {
              success: false,
              error: 'NOT_AUTHENTICATED',
              message: '请先登录',
            };
          }

          return {
            success: true,
            data: user,
          };
        })
    );

export default authPlugin;
