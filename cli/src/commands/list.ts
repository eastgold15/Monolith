/**
 * list 命令 - 列出所有可用模块
 */

import { defineCommand } from 'citty';
import { consola } from 'consola';
import pc from 'picocolors';
import { resolve } from 'node:path';
import { cwd } from 'node:process';
import { RegistryManager } from '../utils/registry.js';
import type { ModuleConfig } from '../types/index.js';

export default defineCommand({
  meta: {
    name: 'list',
    description: '列出所有可用的模块',
  },
  args: {
    category: {
      type: 'string',
      description: '按分类筛选',
      alias: 'c',
    },
    search: {
      type: 'string',
      description: '搜索模块',
      alias: 's',
    },
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
  },
  async run(ctx) {
    const globalOptions = ctx.args;
    const category = ctx.args.category as string | undefined;
    const search = ctx.args.search as string | undefined;
    const projectRoot = resolve(cwd());

    try {
      consola.wrapConsole();
      consola.info('正在加载模块列表...');

      const registryManager = new RegistryManager({
        cwd: projectRoot,
        registryUrl: globalOptions.registryUrl as string | undefined,
        debug: globalOptions.debug as boolean,
        local: globalOptions.local as boolean,
      });

      let modules: Record<string, ModuleConfig>;

      if (search) {
        consola.start(`搜索 "${pc.cyan(search)}"...`);
        modules = await registryManager.searchModules(search);
        consola.success(`找到 ${Object.keys(modules).length} 个匹配的模块`);
      } else if (category) {
        consola.start(`加载 ${pc.cyan(category)} 分类...`);
        modules = await registryManager.getModulesByCategory(category);
        consola.success(`找到 ${Object.keys(modules).length} 个 ${category} 模块`);
      } else {
        consola.start('加载模块列表...');
        modules = await registryManager.listModules();
        consola.success(`找到 ${Object.keys(modules).length} 个可用模块`);
      }

      if (Object.keys(modules).length === 0) {
        consola.warn('没有找到匹配的模块');
        consola.info('使用 -c 或 -s 参数筛选模块');
        return;
      }

      // 按分类分组显示
      const grouped = new Map<string, Array<{ name: string; config: ModuleConfig }>>();
      const categoryColors: Record<string, (str: string) => string> = {
        core: pc.cyan,
        security: pc.red,
        database: pc.yellow,
        api: pc.green,
        ui: pc.magenta,
        utility: pc.blue,
      };

      for (const [name, config] of Object.entries(modules)) {
        const cat = config.category || 'other';
        if (!grouped.has(cat)) {
          grouped.set(cat, []);
        }
        grouped.get(cat)!.push({ name, config });
      }

      // 显示每个分类
      console.log();
      for (const [cat, items] of grouped.entries()) {
        const color = categoryColors[cat] || pc.white;
        consola.log(`${color(`● ${cat.toUpperCase()}`)} ${pc.dim(`(${items.length} 个模块)`)}`);

        for (const item of items) {
          const tags = item.config.tags?.map(t => pc.dim(`#${t}`)).join(' ') || '';
          const desc = item.config.description.slice(0, 50);
          consola.log(`  ${pc.cyan(item.name.padEnd(12))} ${pc.dim(desc)}${tags ? ' ' + tags : ''}`);
        }
        console.log();
      }

      // 显示使用提示
      consola.log(`${pc.dim('使用')} ${pc.cyan('monolith add <module>')} ${pc.dim('安装模块')}`);
      consola.log(`${pc.dim('使用')} ${pc.cyan('monolith info <module>')} ${pc.dim('查看详情')}`);

    } catch (error) {
      consola.error(`错误: ${error instanceof Error ? error.message : String(error)}`);
      if (globalOptions.debug) {
        console.error(error);
      }
      process.exit(1);
    }
  },
});
