# Monolith Modules

> 类似 shadcn/ui 的模块化插件系统，专为 Elysia + Bun 全栈应用设计

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Bun](https://img.shields.io/badge/Bun-+-brightgreen)](https://bun.sh)
[![Elysia](https://img.shields.io/badge/Elysia-+-cyan)](https://elysiajs.com)

## 🚀 特性

- **代码归你所有** - 模块代码直接复制到你的项目中，可以随意修改
- **版本控制友好** - 基于文件头的标记系统，支持更新检测
- **类型安全** - 完整的 TypeScript 支持，前端可直接使用后端定义的类型
- **自动注册** - 使用 ts-morph 自动注入代码，无需手动配置
- **依赖管理** - 自动安装 npm 依赖和配置环境变量
- **模块化** - 按 monorepo 结构组织，方便维护和扩展

## 📦 安装 CLI

```bash
# 使用 bunx 直接运行
bunx monolith add auth

# 或全局安装
bun install -g monolith

# 或从 GitHub 直接运行
bunx github:your-org/Monolith add auth
```

## 🎯 快速开始

### 1. 初始化项目

```bash
# 在你的 Elysia 项目中运行
monolith init
```

### 2. 查看可用模块

```bash
monolith list

# 或搜索模块
monolith list --search auth

# 按分类筛选
monolith list --category security
```

### 3. 安装模块

```bash
# 安装认证模块
monolith add auth

# CLI 会自动：
# ✓ 下载模块文件到 src/modules/auth/
# ✓ 安装 npm 依赖
# ✓ 配置环境变量
# ✓ 自动注册到 src/index.ts
```

### 4. 使用模块

```typescript
// src/index.ts
import { Elysia } from 'elysia'
import { authPlugin } from './modules/auth/auth'

const app = new Elysia()
  .use(authPlugin(db))
  .listen(3000)

// Auth 路由已自动注册：
// POST /auth/register - 用户注册
// POST /auth/login    - 用户登录
// POST /auth/logout   - 用户登出
// GET  /auth/me       - 获取当前用户
```

## 📚 可用模块

### 核心 (Core)

| 模块 | 描述 | 状态 |
|------|------|------|
| [auth](./templates/auth/) | 完整的认证系统（JWT、登录、注册） | ✅ |
| [user](./templates/user/) | 用户管理模块 | 🚧 |
| [rbac](./templates/rbac/) | 基于角色的访问控制 | 🚧 |

### 安全 (Security)

| 模块 | 描述 | 状态 |
|------|------|------|
| rbac | 权限管理系统 | 🚧 |
| rate-limit | 请求限流 | 📝 |
| audit-log | 操作审计日志 | 📝 |

### 数据库 (Database)

| 模块 | 描述 | 状态 |
|------|------|------|
| cache | Redis 缓存层 | 📝 |
| queue | 任务队列 | 📝 |
| migration | 数据库迁移工具 | 📝 |

## 🛠️ CLI 命令

```bash
# 查看帮助
monolith --help

# 初始化项目
monolith init

# 列出所有模块
monolith list

# 查看模块详情
monolith info auth

# 安装模块
monolith add auth
monolith add auth --skip-deps    # 跳过依赖安装

# 更新模块
monolith update                  # 检查所有更新
monolith update auth             # 更新指定模块
monolith update auth --diff      # 显示文件差异

# 移除模块
monolith remove auth
```

## 📖 模块开发指南

### 模块结构

```
templates/
├── auth/                          # 模块目录
│   ├── auth.schema.ts             # Drizzle ORM 表定义
│   ├── auth.model.ts              # TypeScript 类型定义
│   ├── auth.service.ts            # 业务逻辑层
│   ├── auth.ts                    # Elysia 插件/控制器
│   ├── routes.ts                  # 路由定义
│   └── index.ts                   # 导出入口
└── registry.json                  # 模块清单
```

### 创建新模块

1. **创建模块目录**

```bash
mkdir templates/my-module
```

2. **编写模块代码**

按照标准结构编写你的 Elysia 插件代码。

3. **注册到 registry.json**

```json
{
  "modules": {
    "my-module": {
      "name": "My Module",
      "description": "模块描述",
      "version": "1.0.0",
      "dependencies": [
        { "name": "zod", "version": "^3.23.0" }
      ],
      "files": [
        {
          "path": "templates/my-module/schema.ts",
          "target": "src/modules/my-module/schema.ts",
          "type": "schema"
        }
      ]
    }
  }
}
```

4. **测试模块**

```bash
# 使用本地模式测试
monolith add my-module --local
```

## 🔧 配置选项

### monolith.config.json

```json
{
  "name": "my-project",
  "type": "elysia",
  "typescript": true,
  "modules": [
    {
      "name": "auth",
      "version": "1.0.0"
    }
  ]
}
```

### 环境变量

```bash
# CLI 配置
MONOLITH_REGISTRY_URL=https://raw.githubusercontent.com/.../registry.json
MONOLITH_DEBUG=true
```

## 🤝 贡献

欢迎贡献模块！请阅读 [CONTRIBUTING.md](./CONTRIBUTING.md) 了解详情。

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/amazing-module`)
3. 提交更改 (`git commit -m 'Add amazing module'`)
4. 推送到分支 (`git push origin feature/amazing-module`)
5. 创建 Pull Request

## 📄 许可证

MIT License - 详见 [LICENSE](./LICENSE)

## 🙏 致谢

- [shadcn/ui](https://ui.shadcn.com/) - 灵感来源
- [Elysia](https://elysiajs.com/) - 优秀的 Bun Web 框架
- [Drizzle ORM](https://orm.drizzle.team/) - 类型安全的 ORM

---

Made with ❤️ by the Monolith Team
