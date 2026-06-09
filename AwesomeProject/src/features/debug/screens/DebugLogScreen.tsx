import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  TextInput,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@shared/types/navigation';
import { PageLayout } from '@shared/components/PageLayout';
import { ConfirmModal } from '@shared/components/ConfirmModal';
import { COLORS } from '@shared/constants';
import { debugLogService, type DebugLogEntry } from '../services/DebugLogService';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export const DebugLogScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const [logs, setLogs] = useState<DebugLogEntry[]>([]);
  const [filter, setFilter] = useState<string>('');
  // 多选日志级别过滤，默认全部选中
  const [enabledLevels, setEnabledLevels] = useState<Set<DebugLogEntry['level']>>(
    new Set(['info', 'warn', 'error', 'debug'])
  );
  const [clearConfirmVisible, setClearConfirmVisible] = useState(false);

  const loadLogs = useCallback(() => {
    const allLogs = debugLogService.getLogs();
    setLogs(allLogs);
  }, []);

  useEffect(() => {
    loadLogs();
    
    // 定期刷新日志（每500ms）
    const interval = setInterval(() => {
      loadLogs();
    }, 500);

    return () => clearInterval(interval);
  }, [loadLogs]);

  const handleClear = () => {
    setClearConfirmVisible(true);
  };

  const confirmClear = async () => {
    setClearConfirmVisible(false);
    await debugLogService.clearLogs();
    loadLogs();
  };

  const formatTimestamp = (timestamp: number): string => {
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    const milliseconds = date.getMilliseconds().toString().padStart(3, '0');
    return `${hours}:${minutes}:${seconds}.${milliseconds}`;
  };

  const getLevelColor = (level: DebugLogEntry['level']): string => {
    switch (level) {
      case 'error':
        return '#ef4444';
      case 'warn':
        return '#f59e0b';
      case 'info':
        return '#3b82f6';
      case 'debug':
        return '#8b5cf6';
      default:
        return '#6b7280';
    }
  };

  const filteredLogs = logs.filter(log => {
    // 按级别过滤（多选）
    if (!enabledLevels.has(log.level)) {
      return false;
    }
    
    // 按关键词过滤
    if (filter) {
      const searchText = filter.toLowerCase();
      return (
        log.message.toLowerCase().includes(searchText) ||
        (log.data && JSON.stringify(log.data).toLowerCase().includes(searchText))
      );
    }
    
    return true;
  });

  const stats = debugLogService.getStats();

  // 渲染日志项
  const renderLogItem = useCallback(({ item, index }: { item: DebugLogEntry; index: number }) => {
    return (
      <View style={styles.logEntry}>
        <View style={styles.logHeader}>
          <Text style={styles.logTime}>{formatTimestamp(item.timestamp)}</Text>
          <View
            style={[
              styles.logLevelBadge,
              { backgroundColor: getLevelColor(item.level) },
            ]}>
            <Text style={styles.logLevelText}>{item.level.toUpperCase()}</Text>
          </View>
        </View>
        <Text style={styles.logMessage}>{item.message}</Text>
        {item.data && (
          <Text style={styles.logData}>
            {typeof item.data === 'object'
              ? JSON.stringify(item.data, null, 2)
              : String(item.data)}
          </Text>
        )}
      </View>
    );
  }, []);

  // 获取日志项的 key
  const getItemKey = useCallback((item: DebugLogEntry, index: number) => {
    return `${item.timestamp}-${index}`;
  }, []);


  return (
    <PageLayout 
      title="调试日志" 
      backgroundColor={COLORS.background.default}
      showBackButton={true}>
      <View style={styles.container}>
        {/* 统计信息和控制栏 */}
        <View style={styles.controlBar}>
          <View style={styles.stats}>
            <Text style={styles.statsText}>
              总计: {stats.total} | 
              错误: {stats.byLevel.error || 0} | 
              警告: {stats.byLevel.warn || 0}
            </Text>
          </View>
          <View style={styles.controls}>
            <TouchableOpacity
              style={[styles.button, styles.clearButton]}
              onPress={handleClear}>
              <Text style={styles.buttonText}>清空</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 过滤栏 */}
        <View style={styles.filterBar}>
          <TextInput
            style={styles.filterInput}
            placeholder="搜索日志..."
            placeholderTextColor="#9ca3af"
            value={filter}
            onChangeText={setFilter}
          />
          <View style={styles.levelFilter}>
            {(['info', 'warn', 'error', 'debug'] as const).map(level => {
              const isEnabled = enabledLevels.has(level);
              return (
                <TouchableOpacity
                  key={level}
                  style={[
                    styles.levelButton,
                    isEnabled && styles.levelButtonActive,
                  ]}
                  onPress={() => {
                    const newEnabledLevels = new Set(enabledLevels);
                    if (isEnabled) {
                      newEnabledLevels.delete(level);
                    } else {
                      newEnabledLevels.add(level);
                    }
                    setEnabledLevels(newEnabledLevels);
                  }}>
                  <Text
                    style={[
                      styles.levelButtonText,
                      isEnabled && styles.levelButtonTextActive,
                    ]}>
                    {level.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* 日志列表 */}
        {filteredLogs.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>暂无日志</Text>
          </View>
        ) : (
          <FlatList
            data={filteredLogs}
            renderItem={renderLogItem}
            keyExtractor={getItemKey}
            style={styles.logContainer}
            contentContainerStyle={styles.logContent}
            removeClippedSubviews={true}
            maxToRenderPerBatch={50}
            updateCellsBatchingPeriod={50}
            initialNumToRender={30}
            windowSize={10}
            inverted={false}
          />
        )}
      </View>

      <ConfirmModal
        visible={clearConfirmVisible}
        title="清空日志"
        message="确定要清空所有调试日志吗？此操作不可恢复。"
        confirmText="清空"
        cancelText="取消"
        onConfirm={confirmClear}
        onCancel={() => setClearConfirmVisible(false)}
        danger
      />
    </PageLayout>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  controlBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  stats: {
    flex: 1,
  },
  statsText: {
    fontSize: 12,
    color: '#6b7280',
  },
  controls: {
    flexDirection: 'row',
    gap: 8,
  },
  button: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#e5e7eb',
  },
  clearButton: {
    backgroundColor: '#ef4444',
  },
  activeButton: {
    backgroundColor: '#2563eb',
  },
  inactiveButton: {
    backgroundColor: '#e5e7eb',
  },
  buttonText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#ffffff',
  },
  filterBar: {
    padding: 12,
    backgroundColor: '#f9fafb',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  filterInput: {
    backgroundColor: '#ffffff',
    borderRadius: 6,
    padding: 8,
    fontSize: 14,
    color: '#111827',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  levelFilter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  levelButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  levelButtonActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  levelButtonText: {
    fontSize: 11,
    color: '#6b7280',
    fontWeight: '500',
  },
  levelButtonTextActive: {
    color: '#ffffff',
  },
  logContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  logContent: {
    padding: 12,
    paddingBottom: 20,
  },
  logEntry: {
    marginBottom: 12,
    padding: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#e5e7eb',
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  logTime: {
    fontSize: 11,
    color: '#6b7280',
    fontFamily: 'monospace',
  },
  logLevelBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  logLevelText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#ffffff',
  },
  logMessage: {
    fontSize: 13,
    color: '#111827',
    fontFamily: 'monospace',
    lineHeight: 18,
  },
  logData: {
    marginTop: 6,
    fontSize: 11,
    color: '#6b7280',
    fontFamily: 'monospace',
    backgroundColor: '#ffffff',
    padding: 8,
    borderRadius: 4,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 14,
    color: '#9ca3af',
  },
});

