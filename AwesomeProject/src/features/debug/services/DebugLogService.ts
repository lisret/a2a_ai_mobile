import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '@shared/constants';
import { sanitizeLog, sanitizeLogValue } from '@core/engine/privacy/sanitizeLog';

const DEBUG_LOG_KEY = STORAGE_KEYS.DEBUG_LOG;
const MAX_LOG_LINES = 10000; // 调试日志最大行数，可考虑移到配置中

export interface DebugLogEntry {
  timestamp: number;
  level: 'log' | 'info' | 'warn' | 'error' | 'debug';
  message: string;
  data?: any;
}

/**
 * 调试日志服务
 * 管理应用调试日志，最大记录10000行
 */
class DebugLogService {
  private logs: DebugLogEntry[] = [];
  private initialized = false;
  // Rejection-safe write queue so concurrent additions never overwrite newer logs.
  private saveQueue: Promise<void> = Promise.resolve();
  private originalConsole: {
    log: typeof console.log;
    info: typeof console.info;
    warn: typeof console.warn;
    error: typeof console.error;
    debug: typeof console.debug;
  } | null = null;

  /**
   * 初始化日志服务
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // 加载已保存的日志
      await this.loadLogs();
      
      // 拦截 console 方法
      this.interceptConsole();
      
      this.initialized = true;
      this.addLog('info', '调试日志服务已初始化');
    } catch (error) {
      console.error('初始化调试日志服务失败:', error);
    }
  }

  /**
   * 拦截 console 方法
   */
  private interceptConsole(): void {
    if (this.originalConsole) {
      return; // 已经拦截过了
    }

    // 保存原始 console 方法
    this.originalConsole = {
      log: console.log,
      info: console.info,
      warn: console.warn,
      error: console.error,
      debug: console.debug,
    };

    // 重写 console 方法：在写入平台 console 与内存日志前先脱敏
    console.log = (...args: any[]) => {
      const safe = args.map(sanitizeLogValue);
      this.originalConsole!.log(...safe);
      this.addLog('log', this.formatMessage(safe));
    };

    console.info = (...args: any[]) => {
      const safe = args.map(sanitizeLogValue);
      this.originalConsole!.info(...safe);
      this.addLog('info', this.formatMessage(safe));
    };

    console.warn = (...args: any[]) => {
      const safe = args.map(sanitizeLogValue);
      this.originalConsole!.warn(...safe);
      this.addLog('warn', this.formatMessage(safe));
    };

    console.error = (...args: any[]) => {
      const safe = args.map(sanitizeLogValue);
      this.originalConsole!.error(...safe);
      this.addLog('error', this.formatMessage(safe));
    };

    console.debug = (...args: any[]) => {
      const safe = args.map(sanitizeLogValue);
      this.originalConsole!.debug(...safe);
      this.addLog('debug', this.formatMessage(safe));
    };
  }

  /**
   * 格式化消息
   */
  private formatMessage(args: any[]): string {
    return args
      .map(arg => {
        if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg, null, 2);
          } catch {
            return String(arg);
          }
        }
        return String(arg);
      })
      .join(' ');
  }

  /**
   * 添加日志
   */
  addLog(level: DebugLogEntry['level'], message: string, data?: any): void {
    const sanitized = sanitizeLog(message, data);
    const entry: DebugLogEntry = {
      timestamp: Date.now(),
      level,
      message: sanitized.message,
      data: sanitized.data,
    };

    // 新日志添加到开头
    this.logs.unshift(entry);

    // 如果超过最大行数，删除最早的行（末尾）
    if (this.logs.length > MAX_LOG_LINES) {
      this.logs.pop();
    }

    // 异步保存日志（不阻塞）
    this.saveLogs().catch(error => {
      // 使用原始 console 避免循环
      if (this.originalConsole) {
        this.originalConsole.error('保存调试日志失败:', error);
      }
    });
  }

  /**
   * 获取所有日志
   */
  getLogs(): DebugLogEntry[] {
    return [...this.logs];
  }

  /**
   * 获取指定数量的最新日志
   */
  getRecentLogs(count: number = 100): DebugLogEntry[] {
    // 数组已经是倒序（最新在前），直接切片
    return this.logs.slice(0, count);
  }

  /**
   * 清空日志
   */
  async clearLogs(): Promise<void> {
    this.logs = [];
    await AsyncStorage.removeItem(DEBUG_LOG_KEY);
    this.addLog('info', '调试日志已清空');
  }

  /**
   * 加载日志
   */
  private async loadLogs(): Promise<void> {
    try {
      const jsonValue = await AsyncStorage.getItem(DEBUG_LOG_KEY);
      if (jsonValue) {
        const loadedLogs = JSON.parse(jsonValue) as DebugLogEntry[];

        // 迁移/脱敏旧数据：对每条历史日志重新执行脱敏，避免旧明文残留
        const sanitizedLogs = loadedLogs.map(entry => {
          const sanitized = sanitizeLog(entry.message, entry.data);
          return {
            timestamp: entry.timestamp,
            level: entry.level,
            message: sanitized.message,
            data: sanitized.data,
          } as DebugLogEntry;
        });

        // 确保按照时间倒序排序（最新在前）
        // 这兼容了旧数据的顺序（如果有的话）
        sanitizedLogs.sort((a, b) => b.timestamp - a.timestamp);

        // 确保不超过最大行数
        this.logs =
          sanitizedLogs.length > MAX_LOG_LINES
            ? sanitizedLogs.slice(0, MAX_LOG_LINES)
            : sanitizedLogs;

        // 将脱敏后的数据回写，替换 AsyncStorage 中可能包含明文的旧记录
        await this.saveLogs();
      }
    } catch (error) {
      console.error('加载调试日志失败:', error);
      this.logs = [];
    }
  }

  /**
   * 保存日志
   */
  private saveLogs(): Promise<void> {
    // 串行化写入：即使某次写入失败，也不会阻断后续更新的落盘
    const run = this.saveQueue.then(async () => {
      try {
        const jsonValue = JSON.stringify(this.logs);
        await AsyncStorage.setItem(DEBUG_LOG_KEY, jsonValue);
      } catch (error) {
        if (this.originalConsole) {
          this.originalConsole.error('保存调试日志失败:', error);
        }
      }
    });
    this.saveQueue = run.catch(() => undefined);
    return run;
  }

  /**
   * 获取日志统计信息
   */
  getStats(): { total: number; byLevel: Record<string, number> } {
    const byLevel: Record<string, number> = {};
    this.logs.forEach(log => {
      byLevel[log.level] = (byLevel[log.level] || 0) + 1;
    });
    return {
      total: this.logs.length,
      byLevel,
    };
  }
}

export const debugLogService = new DebugLogService();

