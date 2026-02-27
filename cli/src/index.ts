#!/usr/bin/env bun
/**
 * Monolith CLI - 类似 shadcn/ui 的模块化插件系统
 *
 * 使用方式:
 *   monolith add <module>     - 安装模块
 *   monolith list             - 列出所有可用模块
 *   monolith init             - 初始化项目
 *   monolith update <module>  - 更新模块
 *   monolith remove <module>  - 移除模块
 *   monolith info <module>    - 查看模块详情
 */

import { defineCommand, runMain } from 'citty';
import { consola } from 'consola';
import pc from 'picocolors';
import { resolve } from 'node:path';
import { cwd } from 'node:process';

// CLI 版本
const VERSION = '0.1.0';

// 全局选项接口
interface GlobalOptions {
  local?: boolean;
  debug?: boolean;
  yes?: boolean;
}

// 主命令
const main = defineCommand({
  meta: {
    name: 'monolith',
    description: 'Monolith 模块化插件系统 - shadcn/ui 风格的 Elysia 模块管理器',
    version: VERSION,
  },
  args: {
    local: {
      type: 'boolean',
      description: '使用本地模块而非远程仓库',
      default: false,
    },
    debug: {
      type: 'boolean',
      description: '调试模式',
      default: false,
    },
    yes: {
      type: 'boolean',
      description: '跳过所有确认提示',
      default: false,
      alias: 'y',
    },
  },
  setup(ctx) {
    const options = ctx.args as GlobalOptions;

    // 设置 consola
    if (options.debug) {
      consola.level = 1;
    }

    // 显示欢迎信息
    if (!ctx.rawArgs.slice(2).length) {
      consola.box({
        title: pc.bgCyan(pc.black(' Monolith CLI ')),
        message: `${pc.cyan('模块化插件系统')}

${pc.white('快速开始:')}
  ${pc.cyan('monolith init')}    - 初始化项目
  ${pc.cyan('monolith list')}    - 查看可用模块
  ${pc.cyan('monolith add auth')} - 安装认证模块

${pc.white('更多信息:')}
  ${pc.dim('https://github.com/eastgold15/Monolith')}`,
      });
    }

    return {
      options,
      projectRoot: resolve(cwd()),
    };
  },
  subCommands: {
    // 动态导入子命令（避免循环依赖）
    add: () => import('./commands/add.js').then(m => m.default),
    list: () => import('./commands/list.js').then(m => m.default),
    init: () => import('./commands/init.js').then(m => m.default),
    info: () => import('./commands/info.js').then(m => m.default),
    update: () => import('./commands/update.js').then(m => m.default),
    remove: () => import('./commands/remove.js').then(m => m.default),
  },
});

// 运行主程序
runMain(main);

// 导出供测试使用
export { main };
