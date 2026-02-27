import { eq, and } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import type { Hunk } from 'elysia';
import type { DB } from '../types/database';
import { user, refreshToken, passwordReset } from './auth.schema';
import type {
  CreateUser,
  LoginInput,
  User,
  TokenResponse,
} from './auth.model';

/**
 * Auth Service - 认证相关业务逻辑
 */
export class AuthService {
  constructor(private db: DB) {}

  /**
   * 注册新用户
   */
  async register(data: CreateUser): Promise<Omit<User, 'password'>> {
    // 检查邮箱是否已存在
    const existingEmail = await this.db
      .select()
      .from(user)
      .where(eq(user.email, data.email))
      .get();

    if (existingEmail) {
      throw new Error('EMAIL_EXISTS');
    }

    // 检查用户名是否已存在
    const existingUsername = await this.db
      .select()
      .from(user)
      .where(eq(user.username, data.username))
      .get();

    if (existingUsername) {
      throw new Error('USERNAME_EXISTS');
    }

    // 加密密码
    const hashedPassword = await bcrypt.hash(data.password, 10);

    // 创建用户
    const newUser = await this.db
      .insert(user)
      .values({
        email: data.email,
        username: data.username,
        password: hashedPassword,
        isActive: true,
      })
      .returning()
      .get();

    // 返回用户信息（不包含密码）
    const { password: _, ...userWithoutPassword } = newUser;
    return userWithoutPassword;
  }

  /**
   * 用户登录
   */
  async login(data: LoginInput): Promise<{ user: Omit<User, 'password'>; tokens: TokenResponse }> {
    // 查找用户
    const foundUser = await this.db
      .select()
      .from(user)
      .where(eq(user.email, data.email))
      .get();

    if (!foundUser) {
      throw new Error('INVALID_CREDENTIALS');
    }

    // 验证密码
    const isValidPassword = await bcrypt.compare(data.password, foundUser.password);

    if (!isValidPassword) {
      throw new Error('INVALID_CREDENTIALS');
    }

    // 检查账户是否激活
    if (!foundUser.isActive) {
      throw new Error('ACCOUNT_DISABLED');
    }

    // 更新最后登录时间
    await this.db
      .update(user)
      .set({ lastLoginAt: new Date() })
      .where(eq(user.id, foundUser.id));

    // 生成 token（这里需要 JWT 实现）
    const tokens = await this.generateTokens(foundUser.id);

    // 保存 refresh token
    await this.db.insert(refreshToken).values({
      userId: foundUser.id,
      token: tokens.refreshToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 天
    });

    const { password: _, ...userWithoutPassword } = foundUser;

    return {
      user: userWithoutPassword,
      tokens,
    };
  }

  /**
   * 刷新 token
   */
  async refreshToken(token: string): Promise<TokenResponse> {
    // 查找 refresh token
    const foundToken = await this.db
      .select()
      .from(refreshToken)
      .where(and(
        eq(refreshToken.token, token),
        eq(refreshToken.isRevoked, false)
      ))
      .get();

    if (!foundToken) {
      throw new Error('INVALID_REFRESH_TOKEN');
    }

    // 检查是否过期
    if (foundToken.expiresAt < new Date()) {
      throw new Error('REFRESH_TOKEN_EXPIRED');
    }

    // 生成新的 token
    const tokens = await this.generateTokens(foundToken.userId);

    // 撤销旧的 refresh token
    await this.db
      .update(refreshToken)
      .set({ isRevoked: true })
      .where(eq(refreshToken.id, foundToken.id));

    // 保存新的 refresh token
    await this.db.insert(refreshToken).values({
      userId: foundToken.userId,
      token: tokens.refreshToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    return tokens;
  }

  /**
   * 登出
   */
  async logout(refreshToken: string): Promise<void> {
    await this.db
      .update(refreshToken)
      .set({ isRevoked: true })
      .where(eq(refreshToken.token, refreshToken));
  }

  /**
   * 请求密码重置
   */
  async requestPasswordReset(email: string): Promise<void> {
    const foundUser = await this.db
      .select()
      .from(user)
      .where(eq(user.email, email))
      .get();

    if (!foundUser) {
      // 不暴露用户是否存在
      return;
    }

    // 生成重置 token
    const resetToken = this.generateResetToken();

    // 保存到数据库
    await this.db.insert(passwordReset).values({
      userId: foundUser.id,
      token: resetToken,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 小时
    });

    // TODO: 发送邮件
    // await sendPasswordResetEmail(foundUser.email, resetToken);
  }

  /**
   * 确认密码重置
   */
  async confirmPasswordReset(token: string, newPassword: string): Promise<void> {
    // 查找 token
    const foundReset = await this.db
      .select()
      .from(passwordReset)
      .where(eq(passwordReset.token, token))
      .get();

    if (!foundReset) {
      throw new Error('INVALID_RESET_TOKEN');
    }

    // 检查是否过期
    if (foundReset.expiresAt < new Date()) {
      throw new Error('RESET_TOKEN_EXPIRED');
    }

    // 检查是否已使用
    if (foundReset.usedAt) {
      throw new Error('RESET_TOKEN_ALREADY_USED');
    }

    // 加密新密码
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // 更新密码
    await this.db
      .update(user)
      .set({ password: hashedPassword })
      .where(eq(user.id, foundReset.userId));

    // 标记 token 已使用
    await this.db
      .update(passwordReset)
      .set({ usedAt: new Date() })
      .where(eq(passwordReset.id, foundReset.id));
  }

  /**
   * 获取用户信息
   */
  async getUserById(id: number): Promise<Omit<User, 'password'> | null> {
    const foundUser = await this.db
      .select()
      .from(user)
      .where(eq(user.id, id))
      .get();

    if (!foundUser) {
      return null;
    }

    const { password: _, ...userWithoutPassword } = foundUser;
    return userWithoutPassword;
  }

  /**
   * 生成 access token 和 refresh token
   * @private
   */
  private async generateTokens(userId: number): Promise<TokenResponse> {
    // TODO: 实现 JWT 生成
    // 这里需要集成 @elysiajs/jwt
    return {
      accessToken: `access_${userId}_${Date.now()}`,
      refreshToken: `refresh_${userId}_${Date.now()}`,
      expiresIn: 3600, // 1 小时
    };
  }

  /**
   * 生成重置 token
   * @private
   */
  private generateResetToken(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }
}

/**
 * 创建 Auth Service 实例
 */
export const createAuthService = (db: DB) => new AuthService(db);
