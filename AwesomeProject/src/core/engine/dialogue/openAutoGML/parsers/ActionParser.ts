/**
 * AutoGLM 操作指令解析器
 * 解析 do(action="...", ...) 格式的操作指令
 */

import type { TaskAction } from '../../../taskEngine/types/Task';

/**
 * 解析 message 参数，支持嵌套引号
 * @param paramsStr 参数字符串，如 'element=[100,200], message="重要操作"'
 * @param paramName 参数名称，如 'message'
 * @returns 解析出的 message 值，如果不存在则返回 null
 */
export function parseMessageParam(paramsStr: string, paramName: string = 'message'): string | null {
  // 方案1: 标准匹配（处理转义字符）
  const pattern1 = new RegExp(`${paramName}\\s*=\\s*"((?:[^"\\\\]|\\\\.)*)"`);
  const match1 = paramsStr.match(pattern1);
  if (match1) {
    return match1[1]
      .replace(/\\"/g, '"')
      .replace(/\\n/g, '\n')
      .replace(/\\\\/g, '\\');
  }

  // 方案2: 手动解析，处理消息中包含未转义引号的情况
  // 例如: message="用户要求打开"QQ"应用"
  const paramPattern = new RegExp(`${paramName}\\s*=\\s*"`, 'i');
  const paramIndex = paramsStr.search(paramPattern);
  if (paramIndex !== -1) {
    const messageStart = paramIndex + paramsStr.match(paramPattern)![0].length;
    // 从后往前查找最后一个 "，确保是参数的结束
    // 需要找到下一个参数或右括号之前
    let messageEnd = -1;
    // 查找下一个参数或右括号的位置
    const nextParamMatch = paramsStr.substring(messageStart).match(/,\s*\w+\s*=|\)/);
    const searchEnd = nextParamMatch
      ? messageStart + nextParamMatch.index!
      : paramsStr.length;

    // 从后往前查找最后一个 "
    for (let i = searchEnd - 1; i >= messageStart; i--) {
      if (paramsStr[i] === '"') {
        messageEnd = i;
        break;
      }
    }

    if (messageEnd !== -1) {
      return paramsStr.substring(messageStart, messageEnd);
    }
  }

  // 方案3: 非贪婪匹配（作为最后的备选方案）
  const pattern3 = new RegExp(`${paramName}\\s*=\\s*"([\\s\\S]*?)"`);
  const match3 = paramsStr.match(pattern3);
  if (match3) {
    return match3[1];
  }

  return null;
}

/**
 * 解析 do(action="...", ...) 格式的操作指令
 * 参考：https://raw.githubusercontent.com/zai-org/Open-AutoGLM/main/phone_agent/config/prompts_zh.py
 * 坐标系统：从 (0,0) 到 (999,999)，需要映射到实际屏幕分辨率
 * @param text 包含操作指令的文本
 * @param getScreenSize 获取屏幕尺寸的函数
 */
export async function parseDoAction(
  text: string,
  getScreenSize: () => Promise<{ width: number; height: number }>
): Promise<TaskAction> {
  // 提取 do(action="...", ...) 或 finish(message="...")
  // 先尝试匹配 finish，因为它可能包含复杂的消息内容（如嵌套引号）

  // 方案1: 使用非贪婪匹配，匹配到最后一个引号前的所有内容
  // 这样可以处理消息中包含引号的情况，如 finish(message="用户要求打开"QQ"应用")
  const finishMatch1 = text.match(/finish\s*\(\s*message\s*=\s*"([^"]*(?:"[^")]*)*)"\s*\)/);
  if (finishMatch1) {
    const message = finishMatch1[1] || '任务执行完成';
    return { type: 'complete', message };
  }

  // 方案2: 更宽松的匹配，使用非贪婪匹配到右括号
  const finishMatch2 = text.match(/finish\s*\(\s*message\s*=\s*"([\s\S]*?)"\s*\)/);
  if (finishMatch2) {
    const message = finishMatch2[1] || '任务执行完成';
    return { type: 'complete', message };
  }

  // 方案3: 如果消息中包含未转义的引号，尝试手动解析
  // 从后往前查找最后一个 ")，这样可以正确提取包含引号的消息
  // 例如: finish(message="用户要求打开"QQ"应用")
  const finishPattern = /finish\s*\(\s*message\s*=\s*"/i;
  const finishMatch = text.match(finishPattern);
  if (finishMatch) {
    const finishIndex = finishMatch.index!;
    const messageStart = finishIndex + finishMatch[0].length;
    // 从后往前查找最后一个 ")，确保是 finish 的结束
    let messageEnd = -1;
    for (let i = text.length - 1; i >= messageStart; i--) {
      if (text.substring(i, i + 2) === '")') {
        messageEnd = i;
        break;
      }
    }

    if (messageEnd !== -1) {
      const message = text.substring(messageStart, messageEnd);
      return { type: 'complete', message };
    }
  }

  const doMatch = text.match(/do\s*\(\s*action\s*=\s*"([^"]+)"\s*(?:,\s*([^)]+))?\s*\)/);

  if (!doMatch || !doMatch[1]) {
    throw new Error('未找到有效的 do() 操作指令');
  }

  const actionType = doMatch[1];
  const paramsStr = doMatch[2] || '';

  switch (actionType) {
    case 'Tap': {
      // do(action="Tap", element=[x,y])
      const elementMatch = paramsStr.match(/element\s*=\s*\[\s*(\d+)\s*,\s*(\d+)\s*\]/);

      if (elementMatch) {
        const x = parseInt(elementMatch[1], 10);
        const y = parseInt(elementMatch[2], 10);
        // 坐标映射：从 (0-999) 映射到实际分辨率
        const screenSize = await getScreenSize();
        const mappedX = Math.round((x / 1000) * screenSize.width);
        const mappedY = Math.round((y / 1000) * screenSize.height);

        // 添加坐标映射日志（仅在开发模式下）
        if (__DEV__) {
          console.info(
            `[坐标映射] 模型坐标: (${x}, ${y}) -> 屏幕坐标: (${mappedX}, ${mappedY}), ` +
            `屏幕分辨率: ${screenSize.width}x${screenSize.height}`
          );
        }

        return {
          type: 'click',
          x: mappedX,
          y: mappedY,
        };
      }
      throw new Error(`Tap 操作缺少 element 参数: ${paramsStr}`);
    }

    case 'Long Press': {
      // do(action="Long Press", element=[x,y])
      const elementMatch = paramsStr.match(/element\s*=\s*\[\s*(\d+)\s*,\s*(\d+)\s*\]/);

      if (elementMatch) {
        const x = parseInt(elementMatch[1], 10);
        const y = parseInt(elementMatch[2], 10);
        // 坐标映射：从 (0-999) 映射到实际分辨率
        const screenSize = await getScreenSize();
        const mappedX = Math.round((x / 1000) * screenSize.width);
        const mappedY = Math.round((y / 1000) * screenSize.height);

        if (__DEV__) {
          console.info(
            `[坐标映射] 模型坐标: (${x}, ${y}) -> 屏幕坐标: (${mappedX}, ${mappedY}), ` +
            `屏幕分辨率: ${screenSize.width}x${screenSize.height}`
          );
        }

        return {
          type: 'longPress',
          x: mappedX,
          y: mappedY,
        };
      }
      throw new Error(`Long Press 操作缺少 element 参数: ${paramsStr}`);
    }

    case 'Double Tap': {
      // do(action="Double Tap", element=[x,y])
      const elementMatch = paramsStr.match(/element\s*=\s*\[\s*(\d+)\s*,\s*(\d+)\s*\]/);

      if (elementMatch) {
        const x = parseInt(elementMatch[1], 10);
        const y = parseInt(elementMatch[2], 10);
        // 坐标映射：从 (0-999) 映射到实际分辨率
        const screenSize = await getScreenSize();
        const mappedX = Math.round((x / 1000) * screenSize.width);
        const mappedY = Math.round((y / 1000) * screenSize.height);

        if (__DEV__) {
          console.info(
            `[坐标映射] 模型坐标: (${x}, ${y}) -> 屏幕坐标: (${mappedX}, ${mappedY}), ` +
            `屏幕分辨率: ${screenSize.width}x${screenSize.height}`
          );
        }

        return {
          type: 'doubleTap',
          x: mappedX,
          y: mappedY,
        };
      }
      throw new Error(`Double Tap 操作缺少 element 参数: ${paramsStr}`);
    }

    case 'Swipe': {
      // do(action="Swipe", start=[x1,y1], end=[x2,y2])
      const startMatch = paramsStr.match(/start\s*=\s*\[\s*(\d+)\s*,\s*(\d+)\s*\]/);
      const endMatch = paramsStr.match(/end\s*=\s*\[\s*(\d+)\s*,\s*(\d+)\s*\]/);
      if (startMatch && endMatch) {
        const startX = parseInt(startMatch[1], 10);
        const startY = parseInt(startMatch[2], 10);
        const endX = parseInt(endMatch[1], 10);
        const endY = parseInt(endMatch[2], 10);
        // 坐标映射：使用实际屏幕分辨率
        const screenSize = await getScreenSize();
        const mappedStartX = Math.round((startX / 1000) * screenSize.width);
        const mappedStartY = Math.round((startY / 1000) * screenSize.height);
        const mappedEndX = Math.round((endX / 1000) * screenSize.width);
        const mappedEndY = Math.round((endY / 1000) * screenSize.height);

        if (__DEV__) {
          console.info(
            `[坐标映射] Swipe 模型坐标: (${startX}, ${startY}) -> (${endX}, ${endY}) ` +
            `-> 屏幕坐标: (${mappedStartX}, ${mappedStartY}) -> (${mappedEndX}, ${mappedEndY}), ` +
            `屏幕分辨率: ${screenSize.width}x${screenSize.height}`
          );
        }

        return {
          type: 'swipe',
          startX: mappedStartX,
          startY: mappedStartY,
          endX: mappedEndX,
          endY: mappedEndY,
        };
      }
      throw new Error(`Swipe 操作缺少 start 或 end 参数: ${paramsStr}`);
    }

    case 'Type':
    case 'Type_Name': {
      // do(action="Type", text="xxx")
      const textMatch = paramsStr.match(/text\s*=\s*"([^"]*)"/);
      if (textMatch) {
        return {
          type: 'input',
          text: textMatch[1],
        };
      }
      throw new Error(`Type 操作缺少 text 参数: ${paramsStr}`);
    }

    case 'Back': {
      return { type: 'back' };
    }

    case 'Home': {
      // Home 操作：回到系统桌面
      return { type: 'home' };
    }

    case 'Wait': {
      // do(action="Wait", duration="x seconds")
      const durationMatch = paramsStr.match(/duration\s*=\s*"(\d+)\s*seconds?"/);
      if (durationMatch) {
        const seconds = parseInt(durationMatch[1], 10);
        return {
          type: 'wait',
          duration: seconds * 1000, // 转换为毫秒
        };
      }
      return { type: 'wait', duration: 500 };
    }

    case 'Launch': {
      // do(action="Launch", app="xxx")
      const appMatch = paramsStr.match(/app\s*=\s*"([^"]+)"/);
      if (appMatch) {
        return {
          type: 'launch',
          app: appMatch[1],
        };
      }
      throw new Error(`Launch 操作缺少 app 参数: ${paramsStr}`);
    }

    case 'Take_over': {
      // do(action="Take_over", message="xxx")
      const messageValue = parseMessageParam(paramsStr, 'message');
      return {
        type: 'take_over',
        takeOverMessage: messageValue || '需要用户协助完成登录或验证',
      };
    }

    case 'Record_Search_Box': {
      // do(action="Record_Search_Box", position="xxx")
      const positionValue = parseMessageParam(paramsStr, 'position');
      if (!positionValue) {
        throw new Error(`Record_Search_Box 操作缺少 position 参数: ${paramsStr}`);
      }
      return {
        type: 'record_search_box',
        searchBoxPosition: positionValue,
      };
    }

    default:
      throw new Error(`未知的操作类型: ${actionType}`);
  }
}

