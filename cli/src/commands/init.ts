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
import { mkdir, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

/**
 * 检测目录类型
 */
async function detectDirType(dirPath: string): Promise<'backend' | 'frontend' | 'unknown' | null> {
  if (!existsSync(dirPath)) {
    return null;
  }

  const entries = await readdir(dirPath);

  // 有 src/modules 的是 backend
  if (entries.includes('src')) {
    const srcPath = resolve(dirPath, 'src');
    const srcEntries = await readdir(srcPath).catch(() => []);

    if (srcEntries.includes('modules') || (srcEntries as string[]).includes('routes')) {
      return 'backend';
    }
    if ((srcEntries as string[]).includes('components') || (srcEntries as string[]).includes('pages') || (srcEntries as string[]).includes('app')) {
      return 'frontend';
    }
  }

  // 检查是否有典型的 frontend 文件
  const hasFrontendFiles = entries.some(e =>
    e === 'package.json' ||
    e === 'tsconfig.json' ||
    e === 'vite.config.ts' ||
    e === 'next.config.js'
  );

  if (hasFrontendFiles) {
    // 读取 package.json 判断
    const pkgPath = resolve(dirPath, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        const content = await (await import('node:fs/promises')).readFile(pkgPath, 'utf-8');
        const pkg = JSON.parse(content);
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };

        if (deps['elysia'] || deps['@elysiajs/jwt'] || deps['drizzle-orm']) {
          return 'backend';
        }
        if (deps['react'] || deps['vue'] || deps['next'] || deps['nuxt'] || deps['vite']) {
          return 'frontend';
        }
      } catch {
        // ignore
      }
    }
  }

  return 'unknown';
}

/**
 * 扫描 apps 目录
 */
async function scanAppsDir(projectRoot: string): Promise<AppConfig[]> {
  const appsPath = resolve(projectRoot, 'apps');

  if (!existsSync(appsPath)) {
    return [];
  }

  const entries = await readdir(appsPath, { withFileTypes: true });
  const apps: AppConfig[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const appPath = resolve(appsPath, entry.name);
    const type = await detectDirType(appPath);

    if (type === 'backend' || type === 'frontend') {
      apps.push({
        name: entry.name,
        type,
        path: `apps/${entry.name}`,
      });
    }
  }

  return apps;
}

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

      // ========== 第一步：检测项目结构 ==========
      consola.start('扫描项目结构...');

      const detectedApps = await scanAppsDir(projectRoot);

      if (detectedApps.length > 0) {
        consola.success(`检测到 ${detectedApps.length} 个应用`);
      }

      // ========== 第二步：收集基础信息 ==========
      const baseAnswers = await prompts([
        {
          type: 'select',
          name: 'projectType',
          message: '项目类型?',
          choices: [
            { title: '单应用 (Single App)', value: 'single-app' },
            { title: 'Monorepo (pnpm/bun workspaces)', value: 'monorepo' },
          ],
          initial: detectedApps.length > 1 ? 1 : 0,
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
        // ========== 第三步：确认应用列表 ==========
        if (detectedApps.length > 0) {
          // 显示检测到的应用
          consola.log('');
          consola.log(pc.cyan('检测到的应用:'));
          for (const app of detectedApps) {
            const icon = app.type === 'backend' ? '🔧' : '🎨';
            consola.log(`  ${icon} ${pc.cyan(app.name)} (${pc.dim(app.type)}) → ${pc.dim(app.path)}`);
          }

          const { useDetected } = await prompts({
            type: 'confirm',
            name: 'useDetected',
            message: '使用检测到的应用?',
            initial: true,
          });

          if (useDetected) {
            apps = detectedApps;

            // 允许用户手动调整类型
            const { shouldAdjust } = await prompts({
              type: 'confirm',
              name: 'shouldAdjust',
              message: '是否需要调整应用类型?',
              initial: false,
            });

            if (shouldAdjust) {
              for (const app of apps) {
                const { type } = await prompts({
                  type: 'select',
                  name: 'type',
                  message: `${app.name} 类型?`,
                  choices: [
                    { title: '🔧 后端 (Backend)', value: 'backend' },
                    { title: '🎨 前端 (Frontend)', value: 'frontend' },
                  ],
                  initial: app.type === 'backend' ? 0 : 1,
                });
                app.type = type;
              }
            }
          }
        }

        // 如果没有检测到应用或用户选择不使用，手动添加
        if (apps.length === 0) {
          consola.log('');
          consola.log(pc.dim('没有检测到应用，请手动添加...'));

          let adding = true;
          while (adding) {
            const { name } = await prompts({
              type: 'text',
              name: 'name',
              message: `应用名称 (${apps.length + 1})`,
              initial: apps.length === 0 ? 'api' : apps.length === 1 ? 'web' : `app${apps.length + 1}`,
            });

            const { type } = await prompts({
              type: 'select',
              name: 'type',
              message: `${name} 类型?`,
              choices: [
                { title: '🔧 后端 (Backend)', value: 'backend' },
                { title: '🎨 前端 (Frontend)', value: 'frontend' },
              ],
              initial: apps.length === 0 ? 0 : 1,
            });

            apps.push({
              name,
              type,
              path: `apps/${name}`,
            });

            const { addMore } = await prompts({
              type: 'confirm',
              name: 'addMore',
              message: '继续添加应用?',
              initial: apps.length < 2,
            });

            adding = addMore;
          }
        }

        // 检查是否有至少一个 backend 和 frontend
        const hasBackend = apps.some(a => a.type === 'backend');
        const hasFrontend = apps.some(a => a.type === 'frontend');

        if (!hasBackend && !hasFrontend) {
          consola.warn('没有有效的应用，请至少添加一个应用');
          return;
        }
      }

      // ========== 第四步：构建配置 ==========
      const config: any = {
        projectType,
        packageManager,
        apps,
        modules: [],
        createdAt: new Date().toISOString(),
      };

      await writeFile(configPath, JSON.stringify(config, null, 2));

      // ========== 第五步：创建目录结构 ==========
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

          // 创建 app 目录（如果不存在）
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

      // ========== 第六步：显示配置摘要 ==========
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
