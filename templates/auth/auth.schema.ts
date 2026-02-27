import { pgTable, serial, text, timestamp, boolean, index } from 'drizzle-orm/pg-core';

/**
 * 用户表
 */
export const user = pgTable('user', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  username: text('username').notNull().unique(),
  password: text('password').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  lastLoginAt: timestamp('last_login_at'),
}, (table) => ({
  emailIdx: index('user_email_idx').on(table.email),
  usernameIdx: index('user_username_idx').on(table.username),
}));

/**
 * 刷新令牌表
 */
export const refreshToken = pgTable('refresh_token', {
  id: serial('id').primaryKey(),
  userId: serial('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  isRevoked: boolean('is_revoked').notNull().default(false),
}, (table) => ({
  tokenIdx: index('refresh_token_idx').on(table.token),
  userIdx: index('refresh_token_user_idx').on(table.userId),
}));

/**
 * 密码重置表
 */
export const passwordReset = pgTable('password_reset', {
  id: serial('id').primaryKey(),
  userId: serial('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  usedAt: timestamp('used_at'),
}, (table) => ({
  tokenIdx: index('password_reset_token_idx').on(table.token),
}));
