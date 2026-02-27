/**
 * add 命令 - 安装模块
 */

import { defineCommand } from 'citty';
import { consola } from 'consola';
import pc from 'picocolors';
import prompts from 'prompts';
import { resolve } from 'node:path';
import { cwd } from 'node:process';
import { RegistryManager } from '../utils/registry.js';
import { ModuleInstaller } from '../utils/installer.js';

export default defineCommand({
  meta: {
    name: 'add',
    description: '安装一个模块到当前项目',
  },
  args: {
    module: {
      type: 'positional',
      description: '模块名称',
      required: true,
    },
    'skip-deps': {
      type: 'boolean',
      description: '跳过依赖安装',
      default: false,
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
    yes: {
      type: 'boolean',
      description: '跳过所有确认提示',
      default: false,
    },
  },
  async run(ctx) {
    const globalOptions = ctx.args;
    const moduleName = ctx.args.module as string;
    const skipDeps = ctx.args['skip-deps'] as boolean;
    const projectRoot = resolve(cwd());

    consola.wrapConsole();
    consola.info(`正在安装模块: ${pc.cyan(moduleName)}`);

    try {
      // 初始化
      const registryManager = new RegistryManager({
        cwd: projectRoot,
        registryUrl: globalOptions.registryUrl as string | undefined,
        debug: globalOptions.debug as boolean,
        local: globalOptions.local as boolean,
      });

      // 获取模块信息
      const module = await registryManager.getModule(moduleName);

      if (!module) {
        consola.error(`模块 "${pc.red(moduleName)}" 不存在`);
        consola.info(`运行 ${pc.cyan('monolith list')} 查看所有可用模块`);
        process.exit(1);
      }

      // 显示模块信息
      consola.box({
        title: pc.cyan('模块信息'),
        message: `${pc.white('名称:')} ${pc.cyan(module.name)}
${pc.white('描述:')} ${pc.dim(module.description)}
${pc.white('版本:')} ${pc.yellow(module.version)}
${pc.white('分类:')} ${pc.white(module.category || '-')}
${module.dependencies?.length ? `${pc.white('依赖:')} ${pc.dim(module.dependencies.map(d => d.name).join(', '))}` : ''}`,
      });

      // 检查依赖
      consola.start('验证模块依赖...');

      const depCheck = await registryManager.checkDependencies(moduleName);

      if (depCheck.missing.length > 0) {
        consola.fail('依赖检查失败');
        consola.warn(`缺少依赖模块: ${pc.red(depCheck.missing.join(', '))}`);

        if (!globalOptions.yes) {
          const { shouldInstall } = await prompts({
            type: 'confirm',
            name: 'shouldInstall',
            message: '是否自动安装缺少的依赖?',
            initial: true,
          });

          if (shouldInstall) {
            const installer = new ModuleInstaller(registryManager, projectRoot, globalOptions.local as boolean, globalOptions.yes as boolean);
            for (const dep of depCheck.missing) {
              consola.info(`正在安装依赖: ${pc.cyan(dep)}`);
              await installer.install(dep, skipDeps);
            }
          } else {
            process.exit(1);
          }
        }
      } else {
        consola.success('依赖检查通过');
      }

      // 确认安装
      if (!globalOptions.yes) {
        const { confirmed } = await prompts({
          type: 'confirm',
          name: 'confirmed',
          message: '是否继续安装?',
          initial: true,
        });

        if (!confirmed) {
          consola.warn('安装已取消');
          process.exit(0);
        }
      }

      // 执行安装
      const installer = new ModuleInstaller(registryManager, projectRoot, globalOptions.local as boolean, globalOptions.yes as boolean);
      const result = await installer.install(moduleName, skipDeps);

      if (result.success) {
        consola.success(`模块 "${pc.cyan(moduleName)}" 安装完成!`);
        consola.info(`创建文件: ${result.installedFiles.length}`);
        consola.info(`安装依赖: ${result.installedDeps.join(', ') || '无'}`);
      } else {
        consola.error(`安装失败: ${result.errors.join(', ')}`);
        process.exit(1);
      }

    } catch (error) {
      consola.error(`错误: ${error instanceof Error ? error.message : String(error)}`);
      if (globalOptions.debug) {
        console.error(error);
      }
      process.exit(1);
    }
  },
});
