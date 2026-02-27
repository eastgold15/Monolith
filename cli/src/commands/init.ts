/**
 * init 命令 - 初始化项目
 */

import { defineCommand } from 'citty';
import { consola } from 'consola';
import pc from 'picocolors';
import prompts from 'prompts';
import type { AppConfig } from '../types/index.js';
import { resolve } from 'node:path';
import { cwd } from 'node:process';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

export default defineCommand({
  meta: {
    name: 'init',
    description: '初始化 Monolith 项目配置，@符号为项目更目录',
  },
  async run(ctx) {
    const globalOptions = ctx.args || {};
    const projectRoot = resolve(cwd());

    consola.wrapConsole();

    try {
      // 检查是否已存在配置
      const configPath = resolve(projectRoot, 'monolith.config.json');
      if (existsSync(configPath)) {
        const { shouldOverwrite } = await prompts({
          type: 'confirm',
          name: 'shouldOverwrite',
          message: '检测到已存在的配置文件，是否覆盖?',
          initial: false,
        });

        if (!shouldOverwrite) {
          consola.warn('初始化已取消');
          return;
        }
      }

      // ========== 第一步：收集基础信息 ==========
      const baseAnswers = await prompts([
        {
          type: 'select',
          name: 'projectType',
          message: '项目类型?',
          choices: [
            { title: '单应用 (Single App)', value: 'single-app' },
            { title: 'Monorepo (pnpm/bun workspaces)', value: 'monorepo' },
          ],
          initial: 0,
        },
        {
          type: 'select',
          name: 'packageManager',
          message: '请选择包管理器',
          choices: [
            { title: 'bun', value: 'bun' },
            { title: 'pnpm', value: 'pnpm' },
          ],
          initial: 0,
        },
      ]);

      const { projectType, packageManager } = baseAnswers;

      let apps: AppConfig[] = [];

      if (projectType === 'monorepo') {
        // ========== 第二步：收集应用信息 ==========
        const { appCount } = await prompts({
          type: 'number',
          name: 'appCount',
          message: '需要创建几个应用?',
          initial: 2,
          min: 1,
        });

        const appAnswers = await prompts(
          Array.from({ length: appCount }, (_, i) => ({
            type: 'select',
            name: `appType${i}`,
            message: `应用 ${i + 1} 类型?`,
            choices: [
              { title: '后端 (Backend)', value: 'backend' },
              { title: '前端 (Frontend)', value: 'frontend' },
            ],
            initial: i % 2,
          }))
        );

        for (let i = 0; i < appCount; i++) {
          const type = appAnswers[`appType${i}`] as 'backend' | 'frontend';
          const defaultName = type === 'backend' ? 'api' : 'web';

          // 自动生成唯一的名称
          let name = defaultName;
          let count = 1;
          while (apps.some(a => a.name === name)) {
            name = `${defaultName}${count}`;
            count++;
          }

          // 自动生成路径
          const path = `apps/${name}`;

          apps.push({ name, type, path });
        }
      }

      // ========== 第三步：构建配置 ==========
      const config: any = {
        projectType,
        packageManager,
        apps,
        modules: [],
        createdAt: new Date().toISOString(),
      };

      // 添加默认值
      if (projectType === 'monorepo' && apps.length > 0) {
        const defaultBackend = apps.find(a => a.type === 'backend');
        const defaultFrontend = apps.find(a => a.type === 'frontend');
        config.defaults = {
          backend: defaultBackend?.name,
          frontend: defaultFrontend?.name,
        };
      }

      await writeFile(configPath, JSON.stringify(config, null, 2));

      // ========== 第四步：创建目录结构 ==========
      consola.start('创建目录结构...');

      if (projectType === 'single-app') {
        const dirs = ['src/modules', 'src/plugins'];
        for (const dir of dirs) {
          const path = resolve(projectRoot, dir);
          if (!existsSync(path)) {
            await mkdir(path, { recursive: true });
          }
        }
      } else {
        // 创建 monorepo 结构
        for (const app of apps) {
          const appPath = resolve(projectRoot, app.path);
          if (!existsSync(appPath)) {
            await mkdir(appPath, { recursive: true });
          }

          if (app.type === 'backend') {
            const dirs = ['src/modules', 'src/plugins'];
            for (const dir of dirs) {
              const path = resolve(appPath, dir);
              if (!existsSync(path)) {
                await mkdir(path, { recursive: true });
              }
            }
          } else {
            const dirs = ['src/components'];
            for (const dir of dirs) {
              const path = resolve(appPath, dir);
              if (!existsSync(path)) {
                await mkdir(path, { recursive: true });
              }
            }
          }
        }

        // 创建 packages/contract 目录
        const contractPath = resolve(projectRoot, 'packages/contract/src');
        if (!existsSync(contractPath)) {
          await mkdir(contractPath, { recursive: true });
        }

        // 创建 workspace 配置
        if (packageManager === 'pnpm') {
          const workspacePath = resolve(projectRoot, 'pnpm-workspace.yaml');
          if (!existsSync(workspacePath)) {
            const workspaceConfig = `packages:
  - 'packages/*'
  - 'apps/*'
`;
            await writeFile(workspacePath, workspaceConfig);
          }
        }
      }

      consola.success('项目结构已创建');

      // ========== 第五步：显示配置摘要 ==========
      let summaryMessage = `${pc.white('项目类型:')} ${pc.cyan(projectType)}
${pc.white('包管理器:')} ${pc.cyan(packageManager)}`;

      if (projectType === 'monorepo' && apps.length > 0) {
        summaryMessage += `\n\n${pc.white('应用列表:')}`;
        for (const app of apps) {
          const icon = app.type === 'backend' ? '🔧' : '🎨';
          summaryMessage += `\n  ${icon} ${pc.cyan(app.name)} (${pc.dim(app.type)}) → ${pc.dim(app.path)}`;
        }

        summaryMessage += `

${pc.dim('项目结构:')}
${pc.dim('├── packages/')}
${pc.dim('│   └── contract/     # 共享类型定义')}
${pc.dim('├── apps/')}`;
        for (const app of apps) {
          const icon = app.type === 'backend' ? '🔧' : '🎨';
          summaryMessage += `\n${pc.dim('│   ├── ')}${icon} ${pc.cyan(app.name)}`;
        }
      }

      consola.box({
        title: pc.cyan('配置摘要'),
        message: summaryMessage,
      });

      consola.success('初始化完成!');
      console.log();
      consola.log(`${pc.dim('接下来可以:')}`);
      if (apps.length > 0) {
        const backendApps = apps.filter(a => a.type === 'backend');
        if (backendApps.length > 0) {
          consola.log(`  ${pc.cyan(`cd ${backendApps[0].path} && monolith add auth`)} - 安装认证模块`);
        }
      } else {
        consola.log(`  ${pc.cyan('monolith list')}     - 查看可用模块`);
        consola.log(`  ${pc.cyan('monolith add auth')} - 安装认证模块`);
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
