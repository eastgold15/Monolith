/**
 * init 命令 - 初始化项目
 */

import { defineCommand } from 'citty';
import { consola } from 'consola';
import pc from 'picocolors';
import prompts from 'prompts';
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
      // ========== 第一步：收集基础必选信息 ==========
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

      // 解构基础信息
      const { projectType, packageManager } = baseAnswers;

      // ========== 第二步：根据项目类型条件收集信息 ==========
      let backendName = '';
      let frontendName = '';

      // 只有 monorepo 类型才询问前后端名称
      if (projectType === 'monorepo') {
        const repoAnswers = await prompts([
          {
            type: 'text',
            name: 'backendName',
            message: '默认的后端应用名称',
            initial: 'api',
            validate: (value) => value.trim() ? true : '应用名称不能为空', // 加个简单校验
          },
          {
            type: 'text',
            name: 'frontendName',
            message: '请输入前端应用名称',
            initial: 'web',
            validate: (value) => value.trim() ? true : '应用名称不能为空',
          },
        ]);
        backendName = repoAnswers.backendName;
        frontendName = repoAnswers.frontendName;
      }

      // ========== 第三步：构建最终配置 ==========
      // 统一配置结构，single-app 时前后端名称置空或给默认值
      const config = {
        projectType,
        packageManager,
        // single-app 时前后端名称为空，也可以根据需求设为 undefined
        backendName: projectType === 'monorepo' ? backendName : '',
        frontendName: projectType === 'monorepo' ? frontendName : '',
        modules: [],
        createdAt: new Date().toISOString(),
      };

      await writeFile(configPath, JSON.stringify(config, null, 2));

      // 创建目录结构
      consola.start('创建目录结构...');

      if (projectType === 'single-app') {
        // 单应用结构
        const dirs = [
          'src/modules',
          'src/plugins',
        ];
        for (const dir of dirs) {
          const path = resolve(projectRoot, dir);
          if (!existsSync(path)) {
            await mkdir(path, { recursive: true });
          }
        }
      } else {
        // Monorepo 结构
        // @ = 根目录
        // packages/contract/ - 契约层（共享类型定义）
        // apps/api/ - 后端
        // apps/web/ - 前端
        const dirs = [
          `packages/contract/src`,
          `apps/${backendName}/src/modules`,
          `apps/${backendName}/src/plugins`,
          `apps/${frontendName}/src/components`,
        ];
        for (const dir of dirs) {
          const path = resolve(projectRoot, dir);
          if (!existsSync(path)) {
            await mkdir(path, { recursive: true });
          }
        }

        // 创建 workspace 配置
        const workspacePath = resolve(projectRoot, packageManager === 'pnpm' ? 'pnpm-workspace.yaml' : 'bun.lockb');
        if (!existsSync(workspacePath)) {
          if (packageManager === 'pnpm') {
            const workspaceConfig = `packages:
  - 'packages/*'
  - 'apps/*'
`;
            await writeFile(workspacePath, workspaceConfig);
          }
        }
      }



      consola.success('项目结构已创建');

      // 显示配置摘要
      let summaryMessage = `${pc.white('项目类型:')} ${pc.cyan(projectType)}
${pc.white('包管理器:')} ${pc.cyan(packageManager)}`;

      if (projectType === 'monorepo') {
        summaryMessage += `
${pc.white('后端应用:')} ${pc.cyan(`apps/${backendName}/`)}
${pc.white('前端应用:')} ${pc.cyan(`apps/${frontendName}/`)}
${pc.white('契约层:')} ${pc.cyan('packages/contract/')}

${pc.dim('项目结构:')}
${pc.dim('├── packages/')}
${pc.dim('│   └── contract/     # 共享类型定义')}
${pc.dim('├── apps/')}
${pc.dim('│   ├── api/         # 后端 (modules/ 放 controller + service)')}
${pc.dim('│   └── web/         # 前端 (components/ 放组件)')}`;
      } else {
        summaryMessage += `
${pc.dim('项目结构:')}
${pc.dim('└── src/modules/    # 模块目录')}`;
      }

      consola.box({
        title: pc.cyan('配置摘要'),
        message: summaryMessage,
      });

      consola.success('初始化完成!');
      console.log();
      consola.log(`${pc.dim('接下来可以:')}`);
      consola.log(`  ${pc.cyan('monolith list')}     - 查看可用模块`);
      consola.log(`  ${pc.cyan('monolith add auth')} - 安装认证模块`);

    } catch (error) {
      consola.error(`错误: ${error instanceof Error ? error.message : String(error)}`);
      if (globalOptions.debug) {
        console.error(error);
      }
      process.exit(1);
    }
  },
});
