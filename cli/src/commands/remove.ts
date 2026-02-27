/**
 * remove 命令 - 移除已安装的模块
 */

import { defineCommand } from 'citty';
import { consola } from 'consola';
import pc from 'picocolors';
import prompts from 'prompts';
import { resolve, join } from 'node:path';
import { cwd } from 'node:process';
import { rm, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

export default defineCommand({
  meta: {
    name: 'remove',
    description: '移除已安装的模块',
  },
  args: {
    module: {
      type: 'positional',
      description: '模块名称',
      required: true,
    },
    yes: {
      type: 'boolean',
      description: '跳过确认提示',
      default: false,
      alias: 'y',
    },
    debug: {
      type: 'boolean',
      description: '调试模式',
      default: false,
    },
  },
  async run(ctx) {
    const globalOptions = ctx.args;
    const moduleName = ctx.args.module as string;
    const projectRoot = resolve(cwd());

    consola.wrapConsole();

    try {
      const modulePath = join(projectRoot, 'src/modules', moduleName);

      // 检查模块是否存在
      if (!existsSync(modulePath)) {
        consola.error(`模块 "${pc.red(moduleName)}" 未安装`);
        process.exit(1);
      }

      // 显示警告
      consola.warn(`即将移除模块 "${pc.cyan(moduleName)}"`);
      consola.warn('此操作将删除模块文件，但不会移除已安装的 npm 依赖');

      if (!globalOptions.yes) {
        const { confirmed } = await prompts({
          type: 'confirm',
          name: 'confirmed',
          message: `确定要移除模块 "${moduleName}" 吗?`,
          initial: false,
        });

        if (!confirmed) {
          consola.warn('操作已取消');
          return;
        }
      }

      // 删除模块目录
      consola.start('删除模块文件...');
      await rm(modulePath, { recursive: true, force: true });
      consola.success(`模块目录已删除`);

      // 更新 monolith.config.json
      const configPath = join(projectRoot, 'monolith.config.json');
      if (existsSync(configPath)) {
        const config = JSON.parse(await readFile(configPath, 'utf-8'));
        if (config.modules) {
          config.modules = config.modules.filter((m: { name: string }) => m.name !== moduleName);
          await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
          consola.success('配置文件已更新');
        }
      }

      // 提示手动清理
      consola.box({
        title: pc.yellow('提示'),
        message: `模块 "${moduleName}" 已移除

${pc.white('你可能需要:')}
  • 手动移除相关的 npm 依赖
  • 移除 src/index.ts 中的导入和注册代码
  • 重启开发服务器`,
      });

      consola.success('移除完成!');

    } catch (error) {
      consola.error(`错误: ${error instanceof Error ? error.message : String(error)}`);
      if (globalOptions.debug) {
        console.error(error);
      }
      process.exit(1);
    }
  },
});
