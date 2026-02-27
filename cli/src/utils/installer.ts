import type { ModuleConfig, ModuleFile, Dependency, EnvVariable } from '../types/index.js';
import type { RegistryManager } from './registry.js';
import { logger } from './logger.js';
import { resolve, join, dirname, relative } from 'node:path';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { Project, SyntaxKind, SourceFile } from 'ts-morph';
import { existsSync } from 'node:fs';

/**
 * 文件操作结果
 */
interface FileOperationResult {
  path: string;
  action: 'created' | 'skipped' | 'merged' | 'error';
  error?: string;
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

  constructor(
    registryManager: RegistryManager,
    projectRoot: string,
    isLocal: boolean = false
  ) {
    this.registryManager = registryManager;
    this.projectRoot = projectRoot;
    this.isLocal = isLocal;
    // 本地模式：从项目根目录的 templates 读取
    // 远程模式：从 GitHub 下载（后续实现）
    this.templateRoot = isLocal
      ? resolve(projectRoot, 'templates')
      : resolve(projectRoot, '.monolith-cache');
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
      // 1. 获取模块配置
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

      // 2. 检查依赖模块
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

      // 3. 处理文件
      logger.info('\n开始安装文件...');
      const totalSteps = module.files.length;

      for (let i = 0; i < module.files.length; i++) {
        const fileConfig = module.files[i];
        logger.step(i + 1, totalSteps, fileConfig.target);

        const result = await this.installFile(fileConfig, module);
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
          autoRegistrations.push(fileConfig);
        }
      }

      // 4. 安装依赖
      if (!skipDeps && (module.dependencies?.length ?? 0) > 0) {
        logger.info('\n安装 npm 依赖...');
        const deps = await this.installDependencies(module.dependencies || []);
        installedDeps.push(...deps);
      }

      // 5. 配置环境变量
      if (module.envVariables && module.envVariables.length > 0) {
        await this.configureEnvVariables(module.envVariables);
      }

      // 6. 自动注册
      if (autoRegistrations.length > 0) {
        logger.info('\n自动注册模块...');
        await this.autoRegister(autoRegistrations);
      }

      // 7. 执行 afterInstall hooks
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
    module: ModuleConfig
  ): Promise<FileOperationResult> {
    const targetPath = resolve(this.projectRoot, fileConfig.target);

    // 检查文件是否已存在
    if (existsSync(targetPath)) {
      // TODO: 可以实现 diff 和合并逻辑
      return {
        path: fileConfig.target,
        action: 'skipped',
      };
    }

    // 获取源文件内容
    let content: string;
    try {
      content = await this.getSourceFileContent(fileConfig.path);
    } catch (error) {
      return {
        path: fileConfig.target,
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
      path: fileConfig.target,
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
      // TODO: 从 GitHub 下载
      throw new Error('远程下载暂未实现，请使用 --local 模式');
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
// Source: https://github.com/your-org/Monolith`;
  }

  /**
   * 获取项目名称
   */
  private getProjectName(): string {
    try {
      const pkgPath = resolve(this.projectRoot, 'package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      return pkg.name || 'my-project';
    } catch {
      return 'my-project';
    }
  }

  /**
   * 安装 npm 依赖
   */
  private async installDependencies(dependencies: Dependency[]): Promise<string[]> {
    const installed: string[] = [];

    // 检测包管理器
    const packageManager = this.detectPackageManager();

    for (const dep of dependencies) {
      try {
        logger.debug(`安装 ${dep.name}@${dep.version}...`);
        execSync(
          `${packageManager} add ${dep.name}@${dep.version}`,
          { cwd: this.projectRoot, stdio: 'pipe' }
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
  private detectPackageManager(): string {
    // 优先使用 bun（根据用户配置）
    if (existsSync(resolve(this.projectRoot, 'bun.lockb'))) {
      return 'bun';
    }
    if (existsSync(resolve(this.projectRoot, 'pnpm-lock.yaml'))) {
      return 'pnpm';
    }
    if (existsSync(resolve(this.projectRoot, 'yarn.lock'))) {
      return 'yarn';
    }
    if (existsSync(resolve(this.projectRoot, 'package-lock.json'))) {
      return 'npm';
    }
    // 默认使用 bun（根据用户配置）
    return 'bun';
  }

  /**
   * 配置环境变量
   */
  private async configureEnvVariables(variables: EnvVariable[]): Promise<void> {
    const envPath = resolve(this.projectRoot, '.env');
    const envExamplePath = resolve(this.projectRoot, '.env.example');

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

    // 按目标文件分组
    const grouped = new Map<string, ModuleFile[]>();
    for (const file of files) {
      if (!file.autoRegister) continue;

      const targetFile = resolve(this.projectRoot, file.autoRegister.injectIn);
      if (!grouped.has(targetFile)) {
        grouped.set(targetFile, []);
      }
      grouped.get(targetFile)!.push(file);
    }

    // 处理每个目标文件
    for (const [targetPath, files] of grouped.entries()) {
      await this.registerToFile(targetPath, files);
    }
  }

  /**
   * 注册到指定文件
   */
  private async registerToFile(targetPath: string, files: ModuleFile[]): Promise<void> {
    if (!this.tsProject) return;

    logger.info(`注册到: ${relative(this.projectRoot, targetPath)}`);

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
      const importDeclaration = sourceFile.addImportDeclaration({
        defaultImport: config.importAs,
        moduleSpecifier: importPath.replace(/\.ts$/, ''),
      });

      // 查找注册点标记
      const markers = sourceFile.getDescendantsOfKind(SyntaxKind.SingleLineCommentTrivia)
        .filter(c => c.getText().includes(config.marker));

      if (markers.length > 0) {
        const marker = markers[0];
        const line = marker.getStartLineNumber();

        // 查找该行的表达式语句
        const statements = sourceFile.getStatements();
        for (const stmt of statements) {
          if (stmt.getStartLineNumber() === line) {
            if (config.type === 'plugin') {
              // 插入 .use(config.importAs)
              const stmtText = stmt.getText();
              if (stmtText.includes('.use(')) {
                const newStmtText = stmtText.replace(
                  /(\.use\([^)]*\))/,
                  `$1\n  .use(${config.importAs})`
                );
                stmt.remove();
                sourceFile.insertStatements(line, newStmtText);
              }
            } else if (config.type === 'routes') {
              // 路由注册
              const newStmtText = `app.group(${config.importAs}, { prefix: '/${config.importAs.replace('Routes', '')}' });`;
              sourceFile.insertStatements(line + 1, newStmtText);
            }
            break;
          }
        }
      } else {
        logger.warn(`未找到注册标记: ${config.marker}`);
      }

      logger.success(`  已导入: ${config.importAs}`);
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
function readFileSync(path: string, encoding: BufferEncoding): string {
  const { readFileSync } = require('node:fs');
  return readFileSync(path, encoding);
}
