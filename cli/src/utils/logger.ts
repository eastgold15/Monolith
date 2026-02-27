import pc from 'picocolors';

/**
 * 日志级别
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SUCCESS = 4,
}

/**
 * Logger 类
 */
export class Logger {
  private level: LogLevel = LogLevel.INFO;
  private debugMode: boolean = false;

  constructor(debugMode: boolean = false) {
    this.debugMode = debugMode;
    if (debugMode) {
      this.level = LogLevel.DEBUG;
    }
  }

  /**
   * 设置调试模式
   */
  setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;
    this.level = enabled ? LogLevel.DEBUG : LogLevel.INFO;
  }

  /**
   * 调试日志
   */
  debug(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.DEBUG) {
      console.log(pc.gray('DEBUG'), pc.dim(message), ...args);
    }
  }

  /**
   * 信息日志
   */
  info(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.INFO) {
      console.log(pc.cyan('INFO'), message, ...args);
    }
  }

  /**
   * 警告日志
   */
  warn(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.WARN) {
      console.log(pc.yellow('WARN'), message, ...args);
    }
  }

  /**
   * 错误日志
   */
  error(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.ERROR) {
      console.error(pc.red('ERROR'), message, ...args);
    }
  }

  /**
   * 成功日志
   */
  success(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.SUCCESS) {
      console.log(pc.green('✓'), message, ...args);
    }
  }

  /**
   * 原始输出
   */
  raw(message: string): void {
    console.log(message);
  }

  /**
   * 分隔线
   */
  separator(char: string = '─', length: number = 50): void {
    console.log(pc.dim(char.repeat(length)));
  }

  /**
   * 标题
   */
  title(title: string): void {
    this.separator();
    console.log(pc.bold(pc.cyan(` ${title} `)));
    this.separator();
  }

  /**
   * 步骤开始
   */
  step(step: number, total: number, message: string): void {
    const stepStr = pc.dim(`[${step}/${total}]`);
    console.log(stepStr, pc.cyan(message));
  }

  /**
   * 进度条（简化版）
   */
  progress(current: number, total: number, message: string): void {
    const percentage = Math.round((current / total) * 100);
    const bar = '█'.repeat(Math.floor(percentage / 5)) + '░'.repeat(20 - Math.floor(percentage / 5));
    console.log(pc.cyan(`[${bar}] ${percentage}%`), pc.dim(message));
  }

  /**
   * 显示文件列表
   */
  fileList(files: string[], title: string = 'Files:'): void {
    if (files.length === 0) {
      this.info(pc.dim('  No files'));
      return;
    }
    console.log(pc.cyan(title));
    files.forEach(file => {
      console.log(pc.dim('  •'), pc.white(file));
    });
  }

  /**
   * 显示代码差异
   */
  showDiff(filePath: string, diff: string): void {
    console.log(pc.cyan(`\n📄 ${filePath}`));
    console.log(pc.dim('─'.repeat(50)));

    const lines = diff.split('\n');
    for (const line of lines) {
      if (line.startsWith('+')) {
        console.log(pc.green(line));
      } else if (line.startsWith('-')) {
        console.log(pc.red(line));
      } else if (line.startsWith('@@')) {
        console.log(pc.cyan(line));
      } else {
        console.log(pc.dim(line));
      }
    }
  }

  /**
   * 显示键值对
   */
  keyValue(pairs: Record<string, string>): void {
    const maxKeyLength = Math.max(...Object.keys(pairs).map(k => k.length));
    for (const [key, value] of Object.entries(pairs)) {
      const paddedKey = key.padEnd(maxKeyLength);
      console.log(pc.dim(`${paddedKey} :`), pc.white(value));
    }
  }
}

// 默认 logger 实例
export const logger = new Logger();
