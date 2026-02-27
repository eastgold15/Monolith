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

import { Command } from 'commander';
import { resolve, cwd } from 'node:path';
import { logger } from './utils/logger.js';
import { addCommand } from './commands/add.js';
import { listCommand } from './commands/list.js';
import { initCommand } from './commands/init.js';
import { infoCommand } from './commands/info.js';
import { updateCommand } from './commands/update.js';

// CLI 版本
const VERSION = '0.1.0';

// 创建 CLI 程序
const program = new Command();

program
  .name('monolith')
  .description('Monolith 模块化插件系统 - shadcn/ui 风格的 Elysia 模块管理器')
  .version(VERSION)
  .option('-l, --local', '使用本地模块而非远程仓库')
  .option('-d, --debug', '调试模式')
  .option('-y, --yes', '跳过所有确认提示')
  .hook('preAction', (thisCommand) => {
    const options = thisCommand.opts();
    if (options.debug) {
      logger.setDebugMode(true);
      logger.debug('调试模式已启用');
    }
  });

// 添加子命令
program.addCommand(addCommand);
program.addCommand(listCommand);
program.addCommand(initCommand);
program.addCommand(infoCommand);
program.addCommand(updateCommand);

// 解析参数
program.parse();

// 导出供测试使用
export { program };
