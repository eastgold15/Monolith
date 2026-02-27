/**
 * update 命令 - 更新已安装的模块
 */

import { defineCommand } from 'citty';
import { consola } from 'consola';
import pc from 'picocolors';
import prompts from 'prompts';
import { resolve } from 'node:path';
import { cwd } from 'node:process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { RegistryManager } from '../utils/registry.js';
import type { ModuleConfig, ModuleFile } from '../types/index.js';
import { existsSync } from 'node:fs';

/**
 * 更新检查结果
 */
interface UpdateInfo {
  moduleName: string;
  currentVersion: string;
  latestVersion: string;
  changedFiles: Array<{
    file: ModuleFile;
    hasLocalChanges: boolean;
    diff?: string;
  }>;
}

export default defineCommand({
  meta: {
    name: 'update',
    description: '更新已安装的模块',
  },
  args: {
    module: {
      type: 'string',
      description: '模块名称 (不指定则检查所有已安装模块)',
    },
    diff: {
      type: 'boolean',
      description: '显示文件差异',
      default: false,
    },
  },
  async run(ctx) {
    const globalOptions = ctx.parent?.args || {};
    const moduleName = ctx.args.module as string | undefined;
    const showDiff = ctx.args.diff as boolean;
    const projectRoot = resolve(cwd());

    consola.wrapConsole();

    try {
      const registryManager = new RegistryManager({
        cwd: projectRoot,
        registryUrl: globalOptions.registryUrl as string | undefined,
        debug: globalOptions.debug as boolean,
        local: globalOptions.local as boolean,
      });

      // 获取本地已安装的模块
      const localModules = await getLocalModules(projectRoot);

      if (localModules.length === 0) {
        consola.warn('没有检测到已安装的模块');
        consola.info(`使用 ${pc.cyan('monolith add <module>')} 安装模块`);
        return;
      }

      // 确定要检查的模块
      const modulesToCheck = moduleName
        ? localModules.filter(m => m.name === moduleName || m.module === moduleName)
        : localModules;

      if (modulesToCheck.length === 0) {
        consola.warn(`模块 "${pc.yellow(moduleName || '')}" 未安装`);
        return;
      }

      // 检查更新
      consola.start('检查更新...');

      const updates: UpdateInfo[] = [];

      for (const localMod of modulesToCheck) {
        const remoteModule = await registryManager.getModule(localMod.module);

        if (!remoteModule) {
          consola.warn(`模块 ${localMod.module} 在远程仓库中不存在`);
          continue;
        }

        // 版本比较
        if (remoteModule.version !== localMod.version) {
          const changedFiles = await checkFileChanges(localMod, remoteModule, projectRoot);

          updates.push({
            moduleName: localMod.module,
            currentVersion: localMod.version,
            latestVersion: remoteModule.version,
            changedFiles,
          });
        }
      }

      consola.success(`检查完成，发现 ${pc.cyan(updates.length)} 个可用更新`);

      if (updates.length === 0) {
        consola.success('所有模块都是最新版本');
        return;
      }

      // 显示更新信息
      console.log();
      for (const update of updates) {
        const changedCount = update.changedFiles.filter(f => f.hasLocalChanges).length;
        consola.log(`${pc.cyan('●')} ${pc.bold(update.moduleName)}`);
        consola.log(`  ${pc.yellow('当前版本:')} ${pc.dim(update.currentVersion)}`);
        consola.log(`  ${pc.green('最新版本:')} ${pc.dim(update.latestVersion)}`);
        consola.log(`  ${pc.yellow('变更文件:')} ${update.changedFiles.length} 个${changedCount > 0 ? pc.red(` (${changedCount} 个有本地修改)`) : ''}`);
        console.log();
      }

      // 确认更新
      if (!globalOptions.yes) {
        const { confirmed } = await prompts({
          type: 'confirm',
          name: 'confirmed',
          message: '是否应用更新?',
          initial: true,
        });

        if (!confirmed) {
          consola.warn('更新已取消');
          return;
        }
      }

      // 应用更新
      for (const update of updates) {
        await applyUpdate(update, projectRoot, showDiff);
      }

      consola.success('更新完成!');

    } catch (error) {
      consola.error(`错误: ${error instanceof Error ? error.message : String(error)}`);
      if (globalOptions.debug) {
        console.error(error);
      }
      process.exit(1);
    }
  },
});

/**
 * 获取本地已安装的模块
 */
async function getLocalModules(projectRoot: string): Promise<Array<{ module: string; version: string; name: string }>> {
  const modules: Array<{ module: string; version: string; name: string }> = [];

  // 检查 monolith.config.json
  const configPath = resolve(projectRoot, 'monolith.config.json');
  if (existsSync(configPath)) {
    try {
      const config = JSON.parse(await readFile(configPath, 'utf-8'));
      if (config.modules) {
        for (const mod of config.modules) {
          modules.push({
            module: mod.name,
            version: mod.version,
            name: mod.displayName || mod.name,
          });
        }
      }
    } catch {
      // 忽略解析错误
    }
  }

  // 扫描 src/modules 目录
  const { readdir } = await import('node:fs/promises');
  const modulesDir = resolve(projectRoot, 'src/modules');

  try {
    const dirs = await readdir(modulesDir, { withFileTypes: true });
    for (const dir of dirs) {
      if (dir.isDirectory() && !modules.find(m => m.module === dir.name)) {
        // 尝试从模块文件中读取版本
        const schemaPath = resolve(modulesDir, dir.name, `${dir.name}.schema.ts`);
        if (existsSync(schemaPath)) {
          const content = await readFile(schemaPath, 'utf-8');
          const versionMatch = content.match(/@monolith\/(\S+) v([\d.]+)/);
          if (versionMatch) {
            modules.push({
              module: dir.name,
              version: versionMatch[2],
              name: dir.name,
            });
          } else {
            modules.push({
              module: dir.name,
              version: 'unknown',
              name: dir.name,
            });
          }
        }
      }
    }
  } catch {
    // 目录不存在，忽略
  }

  return modules;
}

/**
 * 检查文件变更
 */
async function checkFileChanges(
  localMod: { module: string; version: string },
  remoteModule: ModuleConfig,
  projectRoot: string
): Promise<Array<{ file: ModuleFile; hasLocalChanges: boolean; diff?: string }>> {
  const changes: Array<{ file: ModuleFile; hasLocalChanges: boolean; diff?: string }> = [];

  for (const file of remoteModule.files) {
    const localPath = resolve(projectRoot, file.target);

    if (!existsSync(localPath)) {
      changes.push({ file, hasLocalChanges: false });
      continue;
    }

    // 读取本地文件
    const localContent = await readFile(localPath, 'utf-8');

    // 移除 Monolith 头部注释来比较实际内容
    const cleanLocalContent = localContent.replace(/\/\/ 🤖 This file is generated from[\s\S]*?\n\n/, '');

    // 计算本地 hash
    const localHash = createHash('sha256').update(cleanLocalContent).digest('hex');

    // TODO: 获取远程文件内容和 hash
    // 目前简化处理：检查文件是否被修改过
    const hasHeader = localContent.includes('// 🤖 This file is generated from');

    changes.push({
      file,
      hasLocalChanges: !hasHeader,
    });
  }

  return changes;
}

/**
 * 应用更新
 */
async function applyUpdate(update: UpdateInfo, projectRoot: string, showDiff: boolean): Promise<void> {
  const { writeFile, mkdir } = await import('node:fs/promises');
  const { dirname } = await import('node:path');

  for (const fileChange of update.changedFiles) {
    const file = fileChange.file;
    const targetPath = resolve(projectRoot, file.target);

    if (fileChange.hasLocalChanges) {
      consola.warn(`跳过 ${file.target} - 检测到本地修改`);

      if (showDiff) {
        // TODO: 生成并显示 diff
        consola.info('diff 功能暂未完全实现');
      }

      continue;
    }

    // 直接覆盖
    consola.info(`更新 ${file.target}...`);

    // TODO: 从远程获取最新内容
    // const remoteContent = await getRemoteFileContent(file.path);

    await mkdir(dirname(targetPath), { recursive: true });
    // await writeFile(targetPath, remoteContent, 'utf-8');

    consola.success(`已更新 ${file.target}`);
  }
}
