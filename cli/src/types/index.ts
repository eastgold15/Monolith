/**
 * 模块文件配置
 */
export interface ModuleFile {
  /** 源文件路径（相对于 templates/） */
  path: string;
  /** 目标文件路径（相对于项目根目录） */
  target: string;
  /** 文件类型 */
  type: 'schema' | 'model' | 'service' | 'controller' | 'routes' | 'component' | 'config';
  /** 自动注册配置 */
  autoRegister?: {
    /** 注册类型：plugin 或 routes */
    type: 'plugin' | 'routes';
    /** 注入到的目标文件 */
    injectIn: string;
    /** 导入的变量名 */
    importAs: string;
    /** 注入标记注释 */
    marker: string;
  };
}

/**
 * 环境变量配置
 */
export interface EnvVariable {
  /** 变量名 */
  name: string;
  /** 变量描述 */
  description: string;
  /** 默认值 */
  default?: string;
  /** 是否必需 */
  required: boolean;
}

/**
 * 依赖配置
 */
export interface Dependency {
  /** 依赖包名 */
  name: string;
  /** 版本范围 */
  version: string;
}

/**
 * Hook 动作
 */
export interface HookAction {
  /** 动作类型 */
  type: 'log' | 'env' | 'command' | 'confirm';
  /** 日志消息 */
  message?: string;
  /** 涉及的环境变量 */
  variables?: string[];
  /** 要执行的命令 */
  command?: string;
}

/**
 * 模块配置
 */
export interface ModuleConfig {
  /** 模块显示名称 */
  name: string;
  /** 模块描述 */
  description: string;
  /** 模块版本 */
  version: string;
  /** 作者 */
  author?: string;
  /** 标签 */
  tags?: string[];
  /** 分类 */
  category?: 'core' | 'security' | 'database' | 'api' | 'ui' | 'utility';
  /** 生产依赖 */
  dependencies?: Dependency[];
  /** 开发依赖 */
  devDependencies?: Dependency[];
  /** 依赖的其他模块 */
  requires?: string[];
  /** 环境变量 */
  envVariables?: EnvVariable[];
  /** 包含的文件 */
  files: ModuleFile[];
  /** 安装钩子 */
  hooks?: {
    beforeInstall?: HookAction[];
    afterInstall?: HookAction[];
  };
}

/**
 * Registry 配置
 */
export interface RegistryConfig {
  /** Registry 版本 */
  version: string;
  /** Registry 远程 URL */
  registryUrl?: string;
  /** 所有模块 */
  modules: Record<string, ModuleConfig>;
}

/**
 * CLI 选项
 */
export interface CliOptions {
  /** 项目根目录 */
  cwd: string;
  /** Registry URL */
  registryUrl?: string;
  /** 是否跳过确认 */
  yes?: boolean;
  /** 是否调试模式 */
  debug?: boolean;
  /** 使用本地模板 */
  local?: boolean;
}

/**
 * 安装上下文
 */
export interface InstallContext {
  /** 模块名 */
  moduleName: string;
  /** 模块配置 */
  moduleConfig: ModuleConfig;
  /** 项目根目录 */
  projectRoot: string;
  /** 已安装的文件 */
  installedFiles: string[];
  /** 需要安装的依赖 */
  dependencies: Dependency[];
  /** 需要配置的环境变量 */
  envVariables: EnvVariable[];
  /** 需要自动注册的文件 */
  autoRegistrations: ModuleFile[];
}

/**
 * 更新检查结果
 */
export interface UpdateCheckResult {
  /** 是否有更新 */
  hasUpdate: boolean;
  /** 当前版本 */
  currentVersion?: string;
  /** 最新版本 */
  latestVersion?: string;
  /** 有差异的文件 */
  changedFiles: DiffFile[];
}

/**
 * 文件差异信息
 */
export interface DiffFile {
  /** 文件路径 */
  path: string;
  /** 是否本地有修改 */
  isModified: boolean;
  /** 是否被删除 */
  isDeleted: boolean;
  /** 远程 hash */
  remoteHash?: string;
  /** 本地 hash */
  localHash?: string;
}
