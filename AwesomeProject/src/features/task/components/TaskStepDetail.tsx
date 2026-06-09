import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { COLORS, SHADOWS } from '@shared/constants';
import { AppIcon, IconNames } from '@shared/components/Icon';
import { getActionDescription } from '@shared/utils/taskHelpers';
import type { TaskStep, TaskAction } from '@core/engine/taskEngine';

/**
 * 从模型响应中提取原始坐标（0-999坐标系）
 * 例如：do(action="Tap", element=[499,499]) -> {x: 499, y: 499}
 */
function extractOriginalCoordinates(modelResponse: string): { x: number; y: number } | null {
  if (!modelResponse) return null;
  
  // 匹配 do(action="Tap", element=[x,y]) 格式
  const tapMatch = modelResponse.match(/do\s*\(\s*action\s*=\s*"Tap"\s*,\s*element\s*=\s*\[\s*(\d+)\s*,\s*(\d+)\s*\]/i);
  if (tapMatch) {
    return {
      x: parseInt(tapMatch[1], 10),
      y: parseInt(tapMatch[2], 10),
    };
  }
  
  // 匹配 do(action="Long Press", element=[x,y]) 格式
  const longPressMatch = modelResponse.match(/do\s*\(\s*action\s*=\s*"Long Press"\s*,\s*element\s*=\s*\[\s*(\d+)\s*,\s*(\d+)\s*\]/i);
  if (longPressMatch) {
    return {
      x: parseInt(longPressMatch[1], 10),
      y: parseInt(longPressMatch[2], 10),
    };
  }
  
  // 匹配 do(action="Double Tap", element=[x,y]) 格式
  const doubleTapMatch = modelResponse.match(/do\s*\(\s*action\s*=\s*"Double Tap"\s*,\s*element\s*=\s*\[\s*(\d+)\s*,\s*(\d+)\s*\]/i);
  if (doubleTapMatch) {
    return {
      x: parseInt(doubleTapMatch[1], 10),
      y: parseInt(doubleTapMatch[2], 10),
    };
  }
  
  return null;
}

interface TaskStepDetailProps {
  step: TaskStep;
  isExpanded: boolean;
  onToggle: () => void;
  isLast: boolean;
}

export const TaskStepDetail: React.FC<TaskStepDetailProps> = ({
  step,
  isExpanded,
  onToggle,
  isLast,
}) => {
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const getStepIcon = () => {
    if (step.action.includes('错误') || step.action.includes('失败')) {
      return IconNames.error;
    }
    if (step.action.includes('完成')) {
      return IconNames.success;
    }
    return IconNames.info;
  };

  const getStepIconColor = () => {
    if (step.action.includes('错误') || step.action.includes('失败')) {
      return COLORS.error;
    }
    if (step.action.includes('完成')) {
      return COLORS.success;
    }
    return COLORS.primary;
  };

  return (
    <View style={styles.container}>
      {/* 时间轴线条 */}
      {!isLast && <View style={styles.timelineLine} />}

      {/* 步骤内容 */}
      <View style={styles.stepContent}>
        {/* 步骤头部 */}
        <TouchableOpacity
          style={styles.stepHeader}
          onPress={onToggle}
          activeOpacity={0.7}>
          <View style={[styles.stepIcon, { backgroundColor: getStepIconColor() + '20' }]}>
            <AppIcon
              name={getStepIcon()}
              size={16}
              color={getStepIconColor()}
            />
          </View>
          <View style={styles.stepHeaderContent}>
            <Text style={styles.stepTitle}>步骤 {step.step}</Text>
            <Text style={styles.stepAction}>{step.action}</Text>
            <Text style={styles.stepTime}>{formatTime(step.timestamp)}</Text>
          </View>
          <AppIcon
            name={isExpanded ? IconNames.chevronUp : IconNames.chevronDown}
            size={18}
            color={COLORS.text.secondary}
          />
        </TouchableOpacity>

        {/* 展开的详细信息 */}
        {isExpanded && (
          <View style={styles.expandedContent}>
            {/* 执行动作详情 */}
            {step.actionDetails && (
              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>执行动作</Text>
                <View style={styles.actionCard}>
                  <Text style={styles.actionType}>类型：{step.actionDetails.type}</Text>
                  {step.actionDetails.x !== undefined && step.actionDetails.y !== undefined && (
                    <View>
                      <Text style={styles.actionDetail}>
                        执行坐标：({step.actionDetails.x}, {step.actionDetails.y})
                      </Text>
                      {(() => {
                        // 尝试从modelResponse中提取原始坐标（0-999坐标系）
                        const originalCoords = extractOriginalCoordinates(step.modelResponse || '');
                        if (originalCoords) {
                          return (
                            <Text style={[styles.actionDetail, styles.originalCoords]}>
                              模型坐标：({originalCoords.x}, {originalCoords.y}) [0-999坐标系，已映射到屏幕分辨率]
                            </Text>
                          );
                        }
                        return null;
                      })()}
                    </View>
                  )}
                  {step.actionDetails.text && (
                    <Text style={styles.actionDetail}>输入内容：{step.actionDetails.text}</Text>
                  )}
                  {step.actionDetails.app && (
                    <Text style={styles.actionDetail}>应用：{step.actionDetails.app}</Text>
                  )}
                  {step.actionDetails.startX !== undefined && (
                    <Text style={styles.actionDetail}>
                      滑动：({step.actionDetails.startX}, {step.actionDetails.startY}) → ({step.actionDetails.endX}, {step.actionDetails.endY})
                    </Text>
                  )}
                  {step.actionDetails.duration && (
                    <Text style={styles.actionDetail}>等待时长：{step.actionDetails.duration}ms</Text>
                  )}
                  {step.actionDetails.requiresConfirmation && (
                    <View style={styles.warningBadge}>
                      <Text style={styles.warningText}>⚠️ 需要用户确认</Text>
                    </View>
                  )}
                </View>
              </View>
            )}

            {/* 模型思考过程 */}
            {step.modelResponse && (
              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>思考过程</Text>
                <View style={styles.thinkingCard}>
                  <Text style={styles.thinkingText}>{step.modelResponse}</Text>
                </View>
              </View>
            )}

            {/* 如果没有详细信息 */}
            {!step.actionDetails && !step.modelResponse && (
              <View style={styles.noDetailBox}>
                <Text style={styles.noDetailText}>暂无详细信息</Text>
              </View>
            )}
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    marginBottom: 16,
    paddingLeft: 20,
  },
  timelineLine: {
    position: 'absolute',
    left: 7,
    top: 24,
    bottom: -16,
    width: 2,
    backgroundColor: COLORS.border.medium,
  },
  stepContent: {
    backgroundColor: COLORS.background.card,
    borderRadius: 12,
    overflow: 'hidden',
    ...SHADOWS.sm,
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  stepIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepHeaderContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text.secondary,
    marginBottom: 2,
  },
  stepAction: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text.primary,
    marginBottom: 4,
  },
  stepTime: {
    fontSize: 11,
    color: COLORS.text.secondary,
  },
  expandedContent: {
    padding: 16,
    paddingTop: 0,
    borderTopWidth: 1,
    borderTopColor: COLORS.border.light,
  },
  detailSection: {
    marginBottom: 16,
  },
  detailSectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text.secondary,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  actionCard: {
    backgroundColor: COLORS.background.light,
    borderRadius: 8,
    padding: 12,
  },
  actionType: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text.primary,
    marginBottom: 6,
  },
  actionDetail: {
    fontSize: 12,
    color: COLORS.text.secondary,
    marginTop: 4,
    lineHeight: 18,
  },
  originalCoords: {
    fontSize: 11,
    color: COLORS.text.disabled,
    fontStyle: 'italic',
    marginTop: 2,
  },
  warningBadge: {
    backgroundColor: COLORS.background.red,
    borderRadius: 6,
    padding: 6,
    marginTop: 8,
  },
  warningText: {
    fontSize: 11,
    color: COLORS.error,
    fontWeight: '500',
  },
  thinkingCard: {
    backgroundColor: COLORS.background.blue,
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary,
  },
  thinkingText: {
    fontSize: 13,
    color: COLORS.text.primary,
    lineHeight: 20,
  },
  noDetailBox: {
    padding: 20,
    alignItems: 'center',
  },
  noDetailText: {
    fontSize: 12,
    color: COLORS.text.secondary,
  },
});

