/**
 * info 命令 - 显示模块详细信息
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
    name: 'info',
    description: '显示模块详细信息',
  },
  args: {
    module: {
      type: 'positional',
      description: '模块名称',
      required: true,
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
    const moduleName = ctx.args.module as string;
    const projectRoot = resolve(cwd());

    consola.wrapConsole();

    try {
      const registryManager = new RegistryManager({
        cwd: projectRoot,
        registryUrl: globalOptions.registryUrl as string | undefined,
        debug: globalOptions.debug as boolean,
        local: globalOptions.local as boolean,
      });

      consola.start('加载模块信息...');

      const module = await registryManager.getModule(moduleName);

      if (!module) {
        consola.fail(`模块 "${pc.red(moduleName)}" 不存在`);
        process.exit(1);
      }

      consola.success('模块信息加载完成');
      console.log();

      // 基本信息卡片
      consola.box({
        title: pc.cyan(module.name),
        message: `${pc.white('版本:')} ${pc.yellow(module.version)}
${pc.white('分类:')} ${pc.magenta(module.category || 'general')}
${pc.white('作者:')} ${pc.yellow(module.author || 'Unknown')}

${pc.white('描述:')}
  ${pc.dim(module.description)}
${module.tags?.length ? `\n${pc.white('标签:')} ${module.tags.map(t => pc.dim(`#${t}`)).join(' ')}` : ''}`,
      });

      // 依赖信息
      if (module.dependencies?.length || module.requires?.length) {
        console.log();
        consola.log(`${pc.cyan('依赖')}`);
        if (module.requires?.length) {
          consola.log(`  ${pc.white('依赖模块:')} ${module.requires.join(', ')}`);
        }
        if (module.dependencies?.length) {
          consola.log(`  ${pc.white('NPM 依赖:')}`);
          for (const dep of module.dependencies) {
            consola.log(`    • ${pc.white(dep.name)} ${pc.dim(dep.version)}`);
          }
        }
      }

      // 文件列表
      if (module.files.length) {
        console.log();
        consola.log(`${pc.cyan('包含文件')}`);
        const fileGroups = new Map<string, string[]>();

        for (const file of module.files) {
          if (!fileGroups.has(file.type)) {
            fileGroups.set(file.type, []);
          }
          fileGroups.get(file.type)!.push(file.target);
        }

        for (const [type, files] of fileGroups.entries()) {
          consola.log(`  ${pc.white(type)}: ${files.length} 个文件`);
          for (const file of files) {
            consola.log(`    ${pc.dim('•')} ${pc.white(file)}`);
          }
        }
      }

      // 环境变量
      if (module.envVariables?.length) {
        console.log();
        consola.log(`${pc.cyan('环境变量')} ${pc.dim(`(${module.envVariables.length}) ${pc.red('* 必需')}`)}`);
        for (const envVar of module.envVariables) {
          consola.log(`  ${pc.cyan(envVar.name)}${envVar.required ? pc.red(' *') : ''}`);
          consola.log(`    ${pc.dim(envVar.description)}`);
          if (envVar.default) {
            consola.log(`    默认: ${pc.yellow(envVar.default)}`);
          }
        }
      }

      console.log();
      consola.log(`${pc.dim('运行')} ${pc.cyan(`monolith add ${moduleName}`)} ${pc.dim('安装此模块')}`);

    } catch (error) {
      consola.error(`错误: ${error instanceof Error ? error.message : String(error)}`);
      if (globalOptions.debug) {
        console.error(error);
      }
      process.exit(1);
    }
  },
});
