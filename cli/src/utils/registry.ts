import type { RegistryConfig, ModuleConfig, CliOptions } from '../types/index.js';
import { logger } from './logger.js';

/**
 * Registry 管理类
 */
export class RegistryManager {
  private cachedRegistry: RegistryConfig | null = null;
  private options: CliOptions;

  constructor(options: CliOptions) {
    this.options = options;
  }

  /**
   * 获取 Registry 配置
   */
  async getRegistry(): Promise<RegistryConfig> {
    if (this.cachedRegistry) {
      return this.cachedRegistry;
    }

    // 本地模式：直接读取本地文件
    if (this.options.local) {
      return this.getLocalRegistry();
    }

    // 远程模式：从 GitHub 下载
    const registryUrl = this.options.registryUrl ||
      'https://raw.githubusercontent.com/eastgold15/Monolith/main/registry.json';

    logger.debug('正在下载 registry...', { url: registryUrl });

    try {
      const response = await fetch(registryUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const registry = await response.json() as RegistryConfig;
      this.cachedRegistry = registry;
      return registry;
    } catch (error) {
      logger.warn('远程 registry 下载失败，尝试使用本地缓存');
      return this.getLocalRegistry();
    }
  }

  /**
   * 获取本地 Registry
   */
  private async getLocalRegistry(): Promise<RegistryConfig> {
    const { resolve, dirname } = await import('node:path');
    const { readFile } = await import('node:fs/promises');
    const { fileURLToPath } = await import('node:url');

    // 优先级：项目根目录 > CLI 包目录
    const possiblePaths = [
      resolve(this.options.cwd, 'registry.json'),
      // 获取 CLI 包内的 registry.json（从编译后的 JS 文件位置推导）
      resolve(dirname(fileURLToPath(import.meta.url)), '../../registry.json'),
    ];

    for (const registryPath of possiblePaths) {
      try {
        const content = await readFile(registryPath, 'utf-8');
        const registry = JSON.parse(content) as RegistryConfig;
        this.cachedRegistry = registry;
        logger.debug('使用本地 registry:', { path: registryPath });
        return registry;
      } catch {
        // 继续尝试下一个路径
        continue;
      }
    }

    throw new Error('无法找到 registry.json 文件');
  }

  /**
   * 获取所有可用模块
   */
  async listModules(): Promise<Record<string, ModuleConfig>> {
    const registry = await this.getRegistry();
    return registry.modules;
  }

  /**
   * 获取单个模块配置
   */
  async getModule(moduleName: string): Promise<ModuleConfig | null> {
    const modules = await this.listModules();
    return modules[moduleName] || null;
  }

  /**
   * 搜索模块
   */
  async searchModules(query: string): Promise<Record<string, ModuleConfig>> {
    const modules = await this.listModules();
    const results: Record<string, ModuleConfig> = {};
    const lowerQuery = query.toLowerCase();

    for (const [name, config] of Object.entries(modules)) {
      const matchName = name.toLowerCase().includes(lowerQuery);
      const matchDesc = config.description.toLowerCase().includes(lowerQuery);
      const matchTags = config.tags?.some(tag => tag.toLowerCase().includes(lowerQuery));

      if (matchName || matchDesc || matchTags) {
        results[name] = config;
      }
    }

    return results;
  }

  /**
   * 按分类获取模块
   */
  async getModulesByCategory(category: string): Promise<Record<string, ModuleConfig>> {
    const modules = await this.listModules();
    const results: Record<string, ModuleConfig> = {};

    for (const [name, config] of Object.entries(modules)) {
      if (config.category === category) {
        results[name] = config;
      }
    }

    return results;
  }

  /**
   * 检查模块依赖
   */
  async checkDependencies(moduleName: string): Promise<{
    satisfied: string[];
    missing: string[];
    circular: string[];
  }> {
    const modules = await this.listModules();
    const satisfied: string[] = [];
    const missing: string[] = [];
    const circular: string[] = [];
    const visited = new Set<string>();

    const check = (name: string, path: string[] = []): void => {
      if (path.includes(name)) {
        circular.push(name);
        return;
      }

      if (visited.has(name)) {
        return;
      }

      visited.add(name);

      if (modules[name]) {
        satisfied.push(name);
        const requires = modules[name].requires || [];
        for (const req of requires) {
          check(req, [...path, name]);
        }
      } else {
        missing.push(name);
      }
    };

    const module = modules[moduleName];
    if (module) {
      satisfied.push(moduleName);
      const requires = module.requires || [];
      for (const req of requires) {
        check(req, [moduleName]);
      }
    }

    return { satisfied, missing, circular };
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cachedRegistry = null;
  }
}
