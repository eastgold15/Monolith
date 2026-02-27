# 贡献指南

感谢你有兴趣为 Monolith Modules 做出贡献！

## 开发设置

### 1. 克隆仓库

```bash
git clone https://github.com/your-org/Monolith.git
cd Monolith
```

### 2. 安装依赖

```bash
bun install
```

### 3. 开发模式

```bash
# 在 cli 目录下开发
cd cli
bun run dev --help

# 使用本地模式测试
bun run dev add auth --local
```

### 4. 构建

```bash
# 构建 CLI
bun run build

# 构建后的二进制文件在 dist/monolith
```

## 模块开发规范

### 命名约定

- 模块文件夹使用 `kebab-case`（短横线连接小写）
- 文件名以模块名开头 + 特定后缀
- 所有模块使用单数（不用 `users` 用 `user`）

### 文件结构

```
templates/module-name/
├── module_name.schema.ts    # Drizzle 表定义
├── module_name.model.ts     # TypeScript 类型
├── module_name.service.ts   # 业务逻辑（可选）
├── module_name.ts           # 控制器/插件
├── routes.ts                # 路由（可选）
└── index.ts                 # 导出入口
```

### 代码规范

1. **使用 TypeScript** - 所有代码必须有类型定义
2. **使用 Ultracite 格式化** - `bun run format:fix`
3. **文件头注释** - 自动添加 Monolith 标记
4. **类型导出** - model.ts 必须导出所有类型供前端使用

### Schema 规范

```typescript
// templates/user/user.schema.ts
import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const user = pgTable('user', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  username: text('username').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
```

### Model 规范

```typescript
// templates/user/user.model.ts
import { z } from 'zod';

// Zod 验证 schema
export const CreateUserSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3),
});

// 导出类型
export type CreateUser = z.infer<typeof CreateUserSchema>;

// 导出 TypeBox 格式（用于 Elysia）
export const UserResponse = {
  id: 'number',
  email: 'string',
  // ...
} as const;
```

## 提交规范

使用语义化提交信息：

```
feat: 添加 OAuth 认证模块
fix: 修复 JWT token 过期处理
docs: 更新 README 安装说明
refactor: 重构 CLI 安装逻辑
test: 添加 auth 模块测试
```

## Pull Request 流程

1. Fork 并创建分支
2. 编写代码和测试
3. 运行 `bun run lint` 和 `bun run format`
4. 提交并推送到 GitHub
5. 创建 PR 并填写模板

## 模块检查清单

提交新模块前请确认：

- [ ] 遵循标准目录结构
- [ ] 导出完整的 TypeScript 类型
- [ ] 包含 Zod 验证 schema
- [ ] 添加 Drizzle 表定义
- [ ] 在 registry.json 中正确配置
- [ ] 包含环境变量说明
- [ ] 通过 `bun run dev add <module> --local` 测试
- [ ] 更新 README 模块列表

有任何问题？欢迎提 Issue 讨论！
