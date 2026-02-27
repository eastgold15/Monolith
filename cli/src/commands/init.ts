import { Command } from 'commander';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { resolve } from 'node:path';
import { cwd } from 'node:process';
import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

/**
 * init 命令 - 初始化项目
 */
export const initCommand = new Command('init')
  .description('初始化 Monolith 项目配置')
  .action(async () => {
    const globalOptions = initCommand.parent?.opts() || {};
    const projectRoot = resolve(cwd());

    try {
      p.intro(pc.bgCyan(pc.black(' Monolith Init ')));

      // 检查是否已存在配置
      const configPath = resolve(projectRoot, 'monolith.config.json');
      if (existsSync(configPath)) {
        const shouldOverwrite = await p.confirm({
          message: '检测到已存在的配置文件，是否覆盖?',
          initialValue: false,
        });

        if (p.isCancel(shouldOverwrite) || !shouldOverwrite) {
          p.cancel('初始化已取消');
          return;
        }
      }

      // 收集项目信息
      const projectName = await p.text({
        message: '项目名称?',
        placeholder: 'my-project',
        defaultValue: 'my-project',
      });

      if (p.isCancel(projectName)) {
        p.cancel('初始化已取消');
        return;
      }

      const projectType = await p.select({
        message: '项目类型?',
        options: [
          { value: 'elysia', label: 'Elysia (Bun)' },
          { value: 'express', label: 'Express (Node.js)' },
          { value: 'next', label: 'Next.js' },
        ],
        initialValue: 'elysia',
      });

      if (p.isCancel(projectType)) {
        p.cancel('初始化已取消');
        return;
      }

      const useTypescript = await p.confirm({
        message: '使用 TypeScript?',
        initialValue: true,
      });

      if (p.isCancel(useTypescript)) {
        p.cancel('初始化已取消');
        return;
      }

      // 创建配置文件
      const s = p.spinner();
      s.start('创建配置文件...');

      const config = {
        name: projectName,
        type: projectType,
        typescript: useTypescript,
        modules: [],
        createdAt: new Date().toISOString(),
      };

      await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');

      // 创建目录结构
      s.start('创建目录结构...');
      await mkdir(resolve(projectRoot, 'src/modules'), { recursive: true });
      await mkdir(resolve(projectRoot, 'src/plugins'), { recursive: true });
      await mkdir(resolve(projectRoot, 'src/components'), { recursive: true });

      s.stop('项目结构已创建');

      // 显示下一步提示
      p.note(
        `${pc.cyan('项目名称:')} ${projectName}
${pc.cyan('项目类型:')} ${projectType}
${pc.cyan('TypeScript:')} ${useTypescript ? '是' : '否'}`,
        '配置摘要'
      );

      p.outro(`${pc.green('✓ 初始化完成!')}

接下来可以:
  ${pc.cyan('monolith list')}     - 查看可用模块
  ${pc.cyan('monolith add auth')} - 安装认证模块`);

    } catch (error) {
      p.cancel(pc.red(`错误: ${error instanceof Error ? error.message : String(error)}`));
      if (globalOptions.debug) {
        console.error(error);
      }
      process.exit(1);
    }
  });
