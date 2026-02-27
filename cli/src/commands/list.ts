import { Command } from 'commander';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { resolve } from 'node:path';
import { cwd } from 'node:process';
import { RegistryManager } from '../utils/registry.js';
import type { ModuleConfig } from '../types/index.js';

/**
 * list 命令 - 列出所有可用模块
 */
export const listCommand = new Command('list')
  .description('列出所有可用的模块')
  .option('-c, --category <category>', '按分类筛选')
  .option('-s, --search <query>', '搜索模块')
  .action(async (options) => {
    const globalOptions = listCommand.parent?.opts() || {};
    const projectRoot = resolve(cwd());

    try {
      p.intro(pc.bgCyan(pc.black(' Monolith Modules ')));

      const registryManager = new RegistryManager({
        cwd: projectRoot,
        registryUrl: globalOptions.registryUrl,
        debug: globalOptions.debug,
        local: globalOptions.local,
      });

      const s = p.spinner();

      let modules: Record<string, ModuleConfig>;

      if (options.search) {
        s.start(`搜索 "${options.search}"...`);
        modules = await registryManager.searchModules(options.search);
        s.stop(`找到 ${Object.keys(modules).length} 个匹配的模块`);
      } else if (options.category) {
        s.start(`加载 ${options.category} 分类...`);
        modules = await registryManager.getModulesByCategory(options.category);
        s.stop(`找到 ${Object.keys(modules).length} 个 ${options.category} 模块`);
      } else {
        s.start('加载模块列表...');
        modules = await registryManager.listModules();
        s.stop(`找到 ${Object.keys(modules).length} 个可用模块`);
      }

      if (Object.keys(modules).length === 0) {
        p.note(pc.dim('没有找到匹配的模块'), '结果');
        p.outro('提示: 使用 -c 或 -s 参数筛选模块');
        return;
      }

      // 按分类分组显示
      const grouped = new Map<string, Array<{ name: string; config: ModuleConfig }>>();
      const categoryColors: Record<string, string> = {
        core: pc.cyan,
        security: pc.red,
        database: pc.yellow,
        api: pc.green,
        ui: pc.magenta,
        utility: pc.blue,
      };

      for (const [name, config] of Object.entries(modules)) {
        const category = config.category || 'other';
        if (!grouped.has(category)) {
          grouped.set(category, []);
        }
        grouped.get(category)!.push({ name, config });
      }

      // 显示每个分类
      for (const [category, items] of grouped.entries()) {
        const color = categoryColors[category] || pc.white;
        p.note(
          items.map(item => {
            const tags = item.config.tags?.map(t => pc.dim(`#${t}`)).join(' ') || '';
            return `${pc.cyan(item.name.padEnd(15))} ${color(category)} ${tags ? pc.dim(tags) : ''}`;
          }).join('\n'),
          `${color(category.toUpperCase())} - ${items.length} 个模块`
        );
      }

      // 显示使用提示
      p.outro(`使用 ${pc.cyan('monolith add <module>')} 安装模块
使用 ${pc.cyan('monolith info <module>')} 查看详情`);

    } catch (error) {
      p.cancel(pc.red(`错误: ${error instanceof Error ? error.message : String(error)}`));
      if (globalOptions.debug) {
        console.error(error);
      }
      process.exit(1);
    }
  });
