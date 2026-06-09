import type { PromptProvider } from './types/PromptProvider';
import type { DialogueParser } from './types/Parser';
import type { AIModel } from '@shared/types/Model';
import { OpenAutoGLMPromptProvider } from './openAutoGML/prompts';
import { OpenAutoGLMParser } from './openAutoGML/parsers';

export type DialogueProviderType = 'openAutoGML' | 'claude' | 'gpt4';

/**
 * 对话工厂
 * 根据模型类型创建对应的提示词提供者和解析器
 */
export class DialogueFactory {
  private static promptProviders: Map<DialogueProviderType, PromptProvider> = new Map();
  private static parsers: Map<DialogueProviderType, DialogueParser> = new Map();

  /**
   * 根据模型参数获取提示词提供者
   * @param model 模型配置
   * @returns 提示词提供者实例
   */
  static getPromptProvider(model: AIModel): PromptProvider {
    const providerType = this.getProviderType(model);
    
    if (!this.promptProviders.has(providerType)) {
      switch (providerType) {
        case 'openAutoGML':
          this.promptProviders.set(providerType, new OpenAutoGLMPromptProvider());
          break;
        default:
          this.promptProviders.set(providerType, new OpenAutoGLMPromptProvider());
      }
    }
    return this.promptProviders.get(providerType)!;
  }

  /**
   * 根据模型参数获取解析器
   * @param model 模型配置
   * @returns 解析器实例
   */
  static getParser(model: AIModel): DialogueParser {
    const providerType = this.getProviderType(model);
    
    if (!this.parsers.has(providerType)) {
      switch (providerType) {
        case 'openAutoGML':
          this.parsers.set(providerType, new OpenAutoGLMParser());
          break;
        default:
          this.parsers.set(providerType, new OpenAutoGLMParser());
      }
    }
    return this.parsers.get(providerType)!;
  }

  /**
   * 根据模型配置推断提供者类型
   */
  private static getProviderType(model: AIModel): DialogueProviderType {
    // 优先使用 model.provider
    if (model.provider) {
      return model.provider as DialogueProviderType;
    }
    
    // 根据 modelName 推断
    if (model.modelName?.includes('AutoGLM') || model.modelName?.includes('ZhipuAI')) {
      return 'openAutoGML';
    }
    if (model.modelName?.includes('Claude')) {
      return 'claude';
    }
    
    // 默认使用 openAutoGML
    return 'openAutoGML';
  }
}

