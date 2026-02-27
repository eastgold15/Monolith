import { Command } from 'commander';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { resolve } from 'node:path';
import { cwd } from 'node:process';
import { RegistryManager } from '../utils/registry.js';
import type { ModuleConfig } from '../types/index.js';

/**
 * info 命令 - 显示模块详细信息
 */
export const infoCommand = new Command('info')
  .description('显示模块详细信息')
  .argument('<module>', '模块名称')
  .action(async (moduleName: string) => {
    const globalOptions = infoCommand.parent?.opts() || {};
    const projectRoot = resolve(cwd());

    try {
      p.intro(pc.bgCyan(pc.black(` ${moduleName} 模块信息 `)));

      const registryManager = new RegistryManager({
        cwd: projectRoot,
        registryUrl: globalOptions.registryUrl,
        debug: globalOptions.debug,
        local: globalOptions.local,
      });

      const s = p.spinner();
      s.start('加载模块信息...');

      const module = await registryManager.getModule(moduleName);

      s.stop('模块信息加载完成');

      if (!module) {
        p.cancel(pc.red(`模块 "${moduleName}" 不存在`));
        process.exit(1);
      }

      // 基本信息卡片
      p.note(
        `${pc.bold(pc.cyan(module.name))} ${pc.dim(`v${module.version}`)}

${pc.white('描述:')}
  ${module.description}

${pc.white('作者:')} ${pc.yellow(module.author || 'Unknown')}
${pc.white('分类:')} ${pc.magenta(module.category || 'general')}
${module.tags?.length ? `${pc.white('标签:')} ${module.tags.map(t => pc.dim(`#${t}`)).join(' ')}` : ''}`,
        '基本信息'
      );

      // 依赖信息
      if (module.dependencies?.length || module.requires?.length) {
        const depInfo = [];

        if (module.requires?.length) {
          depInfo.push(`${pc.cyan('依赖模块:')} ${module.requires.join(', ')}`);
        }

        if (module.dependencies?.length) {
          depInfo.push(`${pc.cyan('NPM 依赖:')}
${module.dependencies.map(d => `  • ${pc.white(d.name)} ${pc.dim(d.version)}`).join('\n')}`);
        }

        if (depInfo.length) {
          p.note(depInfo.join('\n\n'), '依赖');
        }
      }

      // 文件列表
      if (module.files.length) {
        const fileGroups = new Map<string, string[]>();

        for (const file of module.files) {
          if (!fileGroups.has(file.type)) {
            fileGroups.set(file.type, []);
          }
          fileGroups.get(file.type)!.push(file.target);
        }

        const fileList = [];
        for (const [type, files] of fileGroups.entries()) {
          fileList.push(`${pc.cyan(type)}: ${files.length} 个文件`);
          for (const file of files) {
            fileList.push(`  ${pc.dim('•')} ${pc.white(file)}`);
          }
        }

        p.note(fileList.join('\n'), '包含文件');
      }

      // 环境变量
      if (module.envVariables?.length) {
        const envInfo = module.envVariables.map(v =>
          `${pc.cyan(v.name)}${v.required ? pc.red('*') : ''}
    ${pc.dim(v.description)}${v.default ? `\n    默认: ${pc.yellow(v.default)}` : ''}`
        ).join('\n\n');

        p.note(envInfo, `环境变量 (${module.envVariables.length})${pc.red(' * 必需')}`);
      }

      // 安装提示
      p.outro(`运行 ${pc.cyan(`monolith add ${moduleName}`)} 安装此模块`);

    } catch (error) {
      p.cancel(pc.red(`错误: ${error instanceof Error ? error.message : String(error)}`));
      if (globalOptions.debug) {
        console.error(error);
      }
      process.exit(1);
    }
  });
