import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '@shared/constants';

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

    // 重写 console.log
    console.log = (...args: any[]) => {
      this.originalConsole!.log(...args);
      this.addLog('log', this.formatMessage(args));
    };

    // 重写 console.info
    console.info = (...args: any[]) => {
      this.originalConsole!.info(...args);
      this.addLog('info', this.formatMessage(args));
    };

    // 重写 console.warn
    console.warn = (...args: any[]) => {
      this.originalConsole!.warn(...args);
      this.addLog('warn', this.formatMessage(args));
    };

    // 重写 console.error
    console.error = (...args: any[]) => {
      this.originalConsole!.error(...args);
      this.addLog('error', this.formatMessage(args));
    };

    // 重写 console.debug
    console.debug = (...args: any[]) => {
      this.originalConsole!.debug(...args);
      this.addLog('debug', this.formatMessage(args));
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
    const entry: DebugLogEntry = {
      timestamp: Date.now(),
      level,
      message,
      data,
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
        
        // 确保按照时间倒序排序（最新在前）
        // 这兼容了旧数据的顺序（如果有的话）
        loadedLogs.sort((a, b) => b.timestamp - a.timestamp);

        // 确保不超过最大行数
        if (loadedLogs.length > MAX_LOG_LINES) {
          this.logs = loadedLogs.slice(0, MAX_LOG_LINES);
        } else {
          this.logs = loadedLogs;
        }
      }
    } catch (error) {
      console.error('加载调试日志失败:', error);
      this.logs = [];
    }
  }

  /**
   * 保存日志
   */
  private async saveLogs(): Promise<void> {
    try {
      const jsonValue = JSON.stringify(this.logs);
      await AsyncStorage.setItem(DEBUG_LOG_KEY, jsonValue);
    } catch (error) {
      // 如果保存失败，只记录错误，不影响应用运行
      if (this.originalConsole) {
        this.originalConsole.error('保存调试日志失败:', error);
      }
    }
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

