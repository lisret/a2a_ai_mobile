/**
 * 能力模块类型定义
 */

/**
 * 能力优先级
 */
export enum CapabilityPriority {
  LOW = 0,
  MEDIUM = 1,
  HIGH = 2,
}

/**
 * 能力状态
 */
export enum CapabilityStatus {
  UNAVAILABLE = 'unavailable',
  AVAILABLE = 'available',
  INITIALIZING = 'initializing',
  INITIALIZED = 'initialized',
}

/**
 * 能力元数据
 */
export interface CapabilityMetadata {
  name: string;
  description: string;
  priority: CapabilityPriority;
  enabled: boolean;
  status: CapabilityStatus;
}

/**
 * 能力接口
 */
export interface ICapability {
  /**
   * 获取能力元数据
   */
  getMetadata(): CapabilityMetadata;

  /**
   * 获取能力名称
   */
  getName(): string;

  /**
   * 检查能力是否可用
   */
  isAvailable(): Promise<boolean>;

  /**
   * 初始化能力
   */
  initialize(): Promise<void>;

  /**
   * 截图
   */
  captureScreen(): Promise<string>;

  /**
   * 点击
   */
  performClick(x: number, y: number): Promise<void>;

  /**
   * 长按
   */
  performLongPress(x: number, y: number): Promise<void>;

  /**
   * 双击
   */
  performDoubleTap(x: number, y: number): Promise<void>;

  /**
   * 滑动
   */
  performSwipe(
    startX: number,
    startY: number,
    endX: number,
    endY: number
  ): Promise<void>;

  /**
   * 文本输入
   */
  performTextInput(text: string): Promise<void>;

  /**
   * 返回
   */
  performBack(): Promise<void>;

  /**
   * 回到桌面
   */
  performHome(): Promise<void>;

  /**
   * 启动应用
   */
  launchApp(appIdentifier: string): Promise<void>;

  /**
   * 获取屏幕尺寸
   */
  getScreenSize(): Promise<{ width: number; height: number }>;
}

