import { Command } from 'commander';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { resolve } from 'node:path';
import { cwd } from 'node:process';
import { RegistryManager } from '../utils/registry.js';
import { ModuleInstaller } from '../utils/installer.js';
import { logger } from '../utils/logger.js';

/**
 * add 命令 - 安装模块
 */
export const addCommand = new Command('add')
  .description('安装一个模块到当前项目')
  .argument('<module>', '模块名称')
  .option('-s, --skip-deps', '跳过依赖安装')
  .action(async (moduleName: string, options) => {
    const globalOptions = addCommand.parent?.opts() || {};
    const projectRoot = resolve(cwd());

    try {
      // 初始化
      const registryManager = new RegistryManager({
        cwd: projectRoot,
        registryUrl: globalOptions.registryUrl,
        debug: globalOptions.debug,
        local: globalOptions.local,
      });

      // 显示欢迎信息
      p.intro(pc.bgCyan(pc.black(' Monolith CLI ')));

      // 获取模块信息
      const module = await registryManager.getModule(moduleName);

      if (!module) {
        p.cancel(pc.red(`模块 "${moduleName}" 不存在`));
        p.note(
          pc.dim('运行 "monolith list" 查看所有可用模块'),
          '提示'
        );
        process.exit(1);
      }

      // 显示模块信息
      const s = p.spinner();
      s.start('验证模块依赖...');

      const depCheck = await registryManager.checkDependencies(moduleName);

      if (depCheck.missing.length > 0) {
        s.stop(pc.red('依赖检查失败'));
        p.cancel(pc.red(`缺少依赖模块: ${depCheck.missing.join(', ')}`));

        // 提示是否自动安装依赖
        const shouldInstall = await p.confirm({
          message: '是否自动安装缺少的依赖?',
          initialValue: true,
        });

        if (shouldInstall) {
          for (const dep of depCheck.missing) {
            logger.info(`正在安装依赖: ${dep}`);
            // 递归安装依赖
            const installer = new ModuleInstaller(registryManager, projectRoot, globalOptions.local);
            await installer.install(dep, options.skipDeps);
          }
        } else {
          process.exit(1);
        }
      } else {
        s.stop(pc.green('依赖检查通过'));
      }

      // 确认安装
      if (!globalOptions.yes) {
        p.note(
          `名称: ${pc.cyan(module.name)}
描述: ${pc.dim(module.description)}
版本: ${pc.yellow(module.version)}
分类: ${pc.white(module.category || '-')}
${module.dependencies?.length ? `依赖: ${module.dependencies.map(d => d.name).join(', ')}` : ''}
${module.requires?.length ? `需要模块: ${module.requires.join(', ')}` : ''}`,
          '模块信息'
        );

        const shouldContinue = await p.confirm({
          message: '是否继续安装?',
          initialValue: true,
        });

        if (p.isCancel(shouldContinue) || !shouldContinue) {
          p.cancel('安装已取消');
          process.exit(0);
        }
      }

      // 执行安装
      const installer = new ModuleInstaller(registryManager, projectRoot, globalOptions.local);
      const result = await installer.install(moduleName, options.skipDeps);

      if (result.success) {
        p.outro(pc.green(`✓ 模块 "${moduleName}" 安装完成!`));
      } else {
        p.cancel(pc.red(`安装失败: ${result.errors.join(', ')}`));
        process.exit(1);
      }

    } catch (error) {
      p.cancel(pc.red(`错误: ${error instanceof Error ? error.message : String(error)}`));
      if (globalOptions.debug) {
        console.error(error);
      }
      process.exit(1);
    }
  });
