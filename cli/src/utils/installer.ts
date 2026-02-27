import type { ModuleConfig, ModuleFile, Dependency, EnvVariable, AppConfig, ProjectConfig } from '../types/index.js';
import type { RegistryManager } from './registry.js';
import { logger } from './logger.js';
import { resolve, join, dirname, relative } from 'node:path';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { Project, SyntaxKind, SourceFile } from 'ts-morph';
import { existsSync } from 'node:fs';
import prompts from 'prompts';
import { cwd } from 'node:process';

/**
 * 文件操作结果
 */
interface FileOperationResult {
  path: string;
  action: 'created' | 'skipped' | 'merged' | 'error';
  error?: string;
}

/**
 * 安装目标
 */
interface InstallTarget {
  /** app 配置 */
  app: AppConfig;
  /** 要安装的目标类型（backend/frontend） */
  types: ('backend' | 'frontend')[];
}

/**
 * 安装器类
 */
export class ModuleInstaller {
  private registryManager: RegistryManager;
  private projectRoot: string;
  private isLocal: boolean;
  private templateRoot: string;
  private tsProject: Project | null = null;
  private projectConfig: ProjectConfig | null = null;
  private currentWorkingDir: string;

  constructor(
    registryManager: RegistryManager,
    projectRoot: string,
    isLocal: boolean = false
  ) {
    this.registryManager = registryManager;
    this.projectRoot = projectRoot;
    this.isLocal = isLocal;
    this.currentWorkingDir = resolve(cwd());
    // 本地模式：从项目根目录的 templates 读取
    // 远程模式：从 GitHub 下载
    this.templateRoot = isLocal
      ? resolve(projectRoot, 'templates')
      : resolve(projectRoot, '.monolith-cache');
  }

  /**
   * 获取项目配置
   */
  private async getProjectConfig(): Promise<ProjectConfig | null> {
    if (this.projectConfig) {
      return this.projectConfig;
    }

    const configPath = resolve(this.projectRoot, 'monolith.config.json');
    if (!existsSync(configPath)) {
      return null;
    }

    try {
      const content = await readFile(configPath, 'utf-8');
      this.projectConfig = JSON.parse(content);

      // 向后兼容：转换旧配置格式
      if (this.projectConfig && !this.projectConfig.apps && (this.projectConfig as any).backendName) {
        const oldConfig = this.projectConfig as any;
        this.projectConfig = {
          ...oldConfig,
          apps: [
            { name: oldConfig.backendName, type: 'backend', path: `apps/${oldConfig.backendName}` },
            { name: oldConfig.frontendName, type: 'frontend', path: `apps/${oldConfig.frontendName}` },
          ],
          defaults: {
            backend: oldConfig.backendName,
            frontend: oldConfig.frontendName,
          },
        };
        // 移除旧字段
        delete (this.projectConfig as any).backendName;
        delete (this.projectConfig as any).frontendName;
      }

      return this.projectConfig;
    } catch {
      return null;
    }
  }

  /**
   * 检测当前所在的应用
   */
  private detectCurrentApp(): AppConfig | null {
    const config = this.projectConfig;
    if (!config || !config.apps) {
      return null;
    }

    // 获取相对路径
    const relativePath = relative(this.projectRoot, this.currentWorkingDir);

    // 检查是否在某个 app 目录内
    for (const app of config.apps) {
      if (relativePath.startsWith(app.path) || relativePath === app.path) {
        return app;
      }
    }

    return null;
  }

  /**
   * 选择安装目标（交互式）
   */
  private async selectInstallTargets(module: ModuleConfig): Promise<InstallTarget[]> {
    const config = await this.getProjectConfig();
    if (!config || !config.apps || config.apps.length === 0) {
      // 单应用模式，默认安装到当前目录
      return [{
        app: {
          name: '',
          type: 'backend',
          path: '',
        },
        types: ['backend', 'frontend'],
      }];
    }

    // 检测是否在某个 app 目录内
    const currentApp = this.detectCurrentApp();
    if (currentApp) {
      // 在 app 目录内，自动安装到当前 app
      const moduleTargets = module.targets || ['backend', 'frontend'];
      const validTypes = moduleTargets.filter(t => t === currentApp.type);
      return [{
        app: currentApp,
        types: validTypes.length > 0 ? validTypes : [currentApp.type],
      }];
    }

    // 在根目录，需要选择目标
    const targets: InstallTarget[] = [];

    // 获取模块的目标类型
    const moduleTargets = module.targets || ['backend', 'frontend'];

    for (const targetType of moduleTargets) {
      const sameTypeApps = config.apps.filter(a => a.type === targetType);

      if (sameTypeApps.length === 0) {
        continue;
      }

      let selectedApp: AppConfig;

      if (sameTypeApps.length === 1) {
        // 只有一个，使用默认
        selectedApp = sameTypeApps[0];
      } else {
        // 多个，提示选择
        const { appName } = await prompts({
          type: 'select',
          name: 'appName',
          message: `${targetType === 'backend' ? '后端' : '前端'} 安装到:`,
          choices: sameTypeApps.map(app => ({
            title: app.name,
            value: app.name,
          })),
        });
        selectedApp = sameTypeApps.find(a => a.name === appName)!;
      }

      targets.push({
        app: selectedApp,
        types: [targetType],
      });
    }

    return targets;
  }

  /**
   * 根据目标类型过滤文件
   */
  private filterFilesByTarget(files: ModuleFile[] | Record<'backend' | 'frontend', ModuleFile[]>, targetType: 'backend' | 'frontend'): ModuleFile[] {
    // 向后兼容：如果 files 是数组，直接返回
    if (Array.isArray(files)) {
      return files;
    }

    // 新格式：按目标类型过滤
    return files[targetType] || [];
  }

  /**
   * 获取安装路径
   */
  private getInstallPath(app: AppConfig): string {
    if (app.path) {
      return resolve(this.projectRoot, app.path);
    }
    return this.projectRoot;
  }

  /**
   * 安装模块
   */
  async install(moduleName: string, skipDeps: boolean = false): Promise<{
    success: boolean;
    installedFiles: string[];
    installedDeps: string[];
    errors: string[];
  }> {
    logger.title(`安装模块: ${moduleName}`);

    const results: FileOperationResult[] = [];
    const errors: string[] = [];
    const installedDeps: string[] = [];
    const autoRegistrations: ModuleFile[] = [];

    try {
      // 1. 获取项目配置
      await this.getProjectConfig();

      // 2. 获取模块配置
      const module = await this.registryManager.getModule(moduleName);
      if (!module) {
        throw new Error(`模块 "${moduleName}" 不存在`);
      }

      logger.info('模块信息:');
      logger.keyValue({
        '名称': module.name,
        '描述': module.description,
        '版本': module.version,
        '分类': module.category || '-',
      });

      // 显示模块包含的目标类型
      if (module.targets && module.targets.length > 0) {
        logger.info(`模块包含: ${module.targets.join(', ')}`);
      }

      // 3. 选择安装目标
      const installTargets = await this.selectInstallTargets(module);

      logger.info(`将安装到: ${installTargets.map(t => `${t.app.name}(${t.types.join(', ')})`).join(', ')}`);

      // 4. 检查依赖模块
      if (module.requires && module.requires.length > 0) {
        logger.info('\n检查依赖模块...');
        const depCheck = await this.registryManager.checkDependencies(moduleName);

        if (depCheck.missing.length > 0) {
          logger.warn(`缺少依赖模块: ${depCheck.missing.join(', ')}`);
          throw new Error(`请先安装依赖模块: ${depCheck.missing.join(', ')}`);
        }

        if (depCheck.circular.length > 0) {
          throw new Error(`检测到循环依赖: ${depCheck.circular.join(' -> ')}`);
        }

        logger.success(`依赖检查通过: ${depCheck.satisfied.join(', ')}`);
      }

      // 5. 处理文件 - 为每个目标安装对应文件
      logger.info('\n开始安装文件...');

      for (const target of installTargets) {
        const installPath = this.getInstallPath(target.app);
        const filteredFiles = this.filterFilesByTarget(module.files, target.types[0]);

        logger.info(`\n安装到 ${target.app.name} (${target.types[0]}):`);
        for (let i = 0; i < filteredFiles.length; i++) {
          const fileConfig = filteredFiles[i];
          logger.step(i + 1, filteredFiles.length, fileConfig.target);

          const result = await this.installFile(fileConfig, installPath, module);
          results.push(result);

          if (result.action === 'created') {
            logger.success(`已创建: ${result.path}`);
          } else if (result.action === 'skipped') {
            logger.warn(`已跳过: ${result.path} (文件已存在)`);
          } else if (result.action === 'error') {
            logger.error(`错误: ${result.error}`);
            errors.push(result.error || '');
          }

          // 收集需要自动注册的文件
          if (fileConfig.autoRegister) {
            autoRegistrations.push({
              ...fileConfig,
              __targetApp: target.app, // 标记目标 app
            } as any);
          }
        }
      }

      // 6. 安装依赖（只在第一个目标 app 中安装）
      if (!skipDeps && (module.dependencies?.length ?? 0) > 0 && installTargets.length > 0) {
        logger.info('\n安装 npm 依赖...');
        const firstTarget = installTargets[0];
        const workDir = this.getInstallPath(firstTarget.app);
        const deps = await this.installDependencies(module.dependencies || [], workDir);
        installedDeps.push(...deps);
      }

      // 7. 配置环境变量（只在第一个目标 app 中配置）
      if (module.envVariables && module.envVariables.length > 0 && installTargets.length > 0) {
        const firstTarget = installTargets[0];
        const workDir = this.getInstallPath(firstTarget.app);
        await this.configureEnvVariables(module.envVariables, workDir);
      }

      // 8. 自动注册
      if (autoRegistrations.length > 0) {
        logger.info('\n自动注册模块...');
        await this.autoRegister(autoRegistrations);
      }

      // 9. 执行 afterInstall hooks
      if (module.hooks?.afterInstall) {
        await this.executeHooks(module.hooks.afterInstall);
      }

      // 汇总结果
      const success = errors.length === 0;
      const installedFiles = results
        .filter(r => r.action === 'created')
        .map(r => r.path);

      if (success) {
        logger.separator();
        logger.success(`模块 "${moduleName}" 安装完成!`);
        logger.info(`创建文件: ${installedFiles.length}`);
        logger.info(`安装依赖: ${installedDeps.length}`);
      } else {
        logger.separator();
        logger.error(`模块 "${moduleName}" 安装时出现错误`);
      }

      return {
        success,
        installedFiles,
        installedDeps,
        errors,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(message);
      return {
        success: false,
        installedFiles: results.filter(r => r.action === 'created').map(r => r.path),
        installedDeps,
        errors: [message, ...errors],
      };
    }
  }

  /**
   * 安装单个文件
   */
  private async installFile(
    fileConfig: ModuleFile,
    installPath: string,
    module: ModuleConfig
  ): Promise<FileOperationResult> {
    const targetPath = resolve(installPath, fileConfig.target);

    // 检查文件是否已存在
    if (existsSync(targetPath)) {
      return {
        path: relative(this.projectRoot, targetPath),
        action: 'skipped',
      };
    }

    // 获取源文件内容
    let content: string;
    try {
      content = await this.getSourceFileContent(fileConfig.path);
    } catch (error) {
      return {
        path: relative(this.projectRoot, targetPath),
        action: 'error',
        error: `无法读取源文件: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    // 替换模板变量
    content = this.processTemplateVariables(content, module);

    // 创建目录
    await mkdir(dirname(targetPath), { recursive: true });

    // 写入文件
    await writeFile(targetPath, content, 'utf-8');

    return {
      path: relative(this.projectRoot, targetPath),
      action: 'created',
    };
  }

  /**
   * 获取源文件内容
   */
  private async getSourceFileContent(relativePath: string): Promise<string> {
    if (this.isLocal) {
      const sourcePath = resolve(this.templateRoot, relativePath);
      return await readFile(sourcePath, 'utf-8');
    } else {
      // 从 GitHub raw 下载
      const rawUrl = `https://raw.githubusercontent.com/eastgold15/Monolith/main/${relativePath}`;
      const response = await fetch(rawUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.text();
    }
  }

  /**
   * 处理模板变量
   */
  private processTemplateVariables(content: string, module: ModuleConfig): string {
    // 获取项目名称
    const projectName = this.getProjectName();

    // 定义替换规则
    const replacements: Record<string, string> = {
      '__MODULE_NAME__': module.name,
      '__MODULE_VERSION__': module.version,
      '__PROJECT_NAME__': projectName,
      '__YEAR__': new Date().getFullYear().toString(),
    };

    // 执行替换
    let result = content;
    for (const [key, value] of Object.entries(replacements)) {
      result = result.replace(new RegExp(key, 'g'), value);
    }

    // 添加文件头注释
    const header = this.generateFileHeader(module);
    if (!content.startsWith('//') && !content.startsWith('/*') && !content.startsWith('<!')) {
      result = `${header}\n\n${result}`;
    }

    return result;
  }

  /**
   * 生成文件头注释
   */
  private generateFileHeader(module: ModuleConfig): string {
    return `// 🤖 This file is generated from @monolith/${module.name} v${module.version}
// Do not edit this file directly unless you know what you are doing.
// Source: https://github.com/eastgold15/Monolith`;
  }

  /**
   * 获取项目名称
   */
  private getProjectName(): string {
    try {
      const pkgPath = resolve(this.projectRoot, 'package.json');
      const content = fsReadFileSync(pkgPath, 'utf-8');
      const pkg = JSON.parse(content);
      return pkg.name || 'my-project';
    } catch {
      return 'my-project';
    }
  }

  /**
   * 安装 npm 依赖
   */
  private async installDependencies(dependencies: Dependency[], workDir: string): Promise<string[]> {
    const installed: string[] = [];

    // 检测包管理器
    const packageManager = this.detectPackageManager(workDir);

    for (const dep of dependencies) {
      try {
        logger.debug(`安装 ${dep.name}@${dep.version}...`);
        execSync(
          `${packageManager} add ${dep.name}@${dep.version}`,
          { cwd: workDir, stdio: 'pipe' }
        );
        installed.push(dep.name);
        logger.success(`${dep.name}@${dep.version}`);
      } catch (error) {
        logger.warn(`无法安装 ${dep.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return installed;
  }

  /**
   * 检测包管理器
   */
  private detectPackageManager(workDir: string): string {
    // 优先使用 bun
    if (existsSync(resolve(workDir, 'bun.lockb'))) {
      return 'bun';
    }
    if (existsSync(resolve(workDir, 'pnpm-lock.yaml'))) {
      return 'pnpm';
    }
    if (existsSync(resolve(workDir, 'yarn.lock'))) {
      return 'yarn';
    }
    if (existsSync(resolve(workDir, 'package-lock.json'))) {
      return 'npm';
    }
    // 默认使用 bun
    return 'bun';
  }

  /**
   * 配置环境变量
   */
  private async configureEnvVariables(variables: EnvVariable[], workDir: string): Promise<void> {
    const envPath = resolve(workDir, '.env');
    const envExamplePath = resolve(workDir, '.env.example');

    let envContent = '';
    let envExampleContent = '';

    // 读取现有内容
    if (existsSync(envPath)) {
      envContent = await readFile(envPath, 'utf-8');
    }

    if (existsSync(envExamplePath)) {
      envExampleContent = await readFile(envExamplePath, 'utf-8');
    }

    let addedCount = 0;

    for (const envVar of variables) {
      const line = `${envVar.name}=${envVar.default || ''}`;
      const exampleLine = `${envVar.name}=${envVar.default || ''}`;

      // 检查是否已存在
      if (!envContent.includes(`${envVar.name}=`)) {
        envContent += (envContent && !envContent.endsWith('\n') ? '\n' : '') + line + '\n';
        addedCount++;
      }

      if (!envExampleContent.includes(`${envVar.name}=`)) {
        envExampleContent += (envExampleContent && !envExampleContent.endsWith('\n') ? '\n' : '') + exampleLine + '\n';
      }

      logger.keyValue({
        ' ': envVar.name,
        '描述': envVar.description,
        '默认值': envVar.default || '(空)',
        '必需': envVar.required ? '是' : '否',
      });
    }

    // 写入文件
    await writeFile(envPath, envContent, 'utf-8');
    await writeFile(envExamplePath, envExampleContent, 'utf-8');

    if (addedCount > 0) {
      logger.success(`已添加 ${addedCount} 个环境变量到 .env`);
    }
  }

  /**
   * 自动注册（使用 ts-morph）
   */
  private async autoRegister(files: ModuleFile[]): Promise<void> {
    // 初始化 ts-morph 项目
    if (!this.tsProject) {
      this.tsProject = new Project({
        compilerOptions: {
          allowSyntheticDefaultImports: true,
          esModuleInterop: true,
        },
      });
    }

    // 按目标 app 分组
    const grouped = new Map<string, ModuleFile[]>();
    for (const file of files) {
      if (!file.autoRegister) continue;

      const targetApp = (file as any).__targetApp as AppConfig;
      if (!targetApp) continue;

      const targetFile = resolve(this.getInstallPath(targetApp), file.autoRegister.injectIn);
      const key = `${targetApp.name}:${targetFile}`;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(file);
    }

    // 处理每个目标文件
    for (const [key, files] of grouped.entries()) {
      const [appName, targetPath] = key.split(':');
      await this.registerToFile(targetPath, files, appName);
    }
  }

  /**
   * 注册到指定文件
   */
  private async registerToFile(targetPath: string, files: ModuleFile[], appName: string): Promise<void> {
    if (!this.tsProject) return;

    logger.info(`注册到: ${appName}/${relative(this.getInstallPath({ name: appName, type: 'backend', path: '' } as AppConfig), targetPath)}`);

    let sourceFile: SourceFile;

    // 添加或获取源文件
    if (existsSync(targetPath)) {
      sourceFile = this.tsProject.addSourceFileAtPath(targetPath);
    } else {
      // 创建新文件
      await mkdir(dirname(targetPath), { recursive: true });
      sourceFile = this.tsProject.createSourceFile(targetPath, '', { overwrite: true });
    }

    for (const file of files) {
      const config = file.autoRegister!;
      const relativePath = relative(dirname(targetPath), file.target);
      const importPath = relativePath.startsWith('.') ? relativePath : `./${relativePath}`;

      // 添加 import
      sourceFile.addImportDeclaration({
        defaultImport: config.importAs,
        moduleSpecifier: importPath.replace(/\.ts$/, ''),
      });

      // 查找注册点标记
      const markers = sourceFile.getDescendantsOfKind(SyntaxKind.SingleLineCommentTrivia)
        .filter(c => c.getText().includes(config.marker));

      if (markers.length > 0) {
        logger.success(`  已导入: ${config.importAs}`);
      } else {
        logger.warn(`未找到注册标记: ${config.marker}`);
      }
    }

    // 保存文件
    await sourceFile.save();
  }

  /**
   * 执行 hooks
   */
  private async executeHooks(hooks: Array<{ type: string; message?: string; variables?: string[] }>): Promise<void> {
    for (const hook of hooks) {
      switch (hook.type) {
        case 'log':
          if (hook.message) {
            logger.raw(hook.message);
          }
          break;
        case 'env':
          if (hook.variables) {
            logger.raw('\n📝 需要配置的环境变量:');
            for (const v of hook.variables) {
              logger.raw(`   ${v}=...`);
            }
          }
          break;
        case 'command':
          if (hook.message) {
            try {
              execSync(hook.message, { cwd: this.projectRoot, stdio: 'inherit' });
            } catch (error) {
              logger.warn(`命令执行失败: ${hook.message}`);
            }
          }
          break;
      }
    }
  }
}

/**
 * 读取文件内容的辅助函数
 */
function fsReadFileSync(path: string, encoding: BufferEncoding): string {
  const { readFileSync } = require('node:fs');
  return readFileSync(path, encoding);
}
