import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { AppIcon, IconNames } from '@shared/components/Icon';
import { modelService } from '../services/ModelService';
import { COLORS, SHADOWS } from '@shared/constants';
import type { AIModel } from '@shared/types/Model';

interface ModelItemProps {
  model: AIModel;
  isActive: boolean; // 新增 prop
  onPress?: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export const ModelItem: React.FC<ModelItemProps> = ({
  model,
  isActive, // 使用 prop
  onPress,
  onEdit,
  onDelete,
}) => {
  // 移除内部状态和 useEffect

  const getProviderName = (provider: string) => {
    if (provider === 'openai') return 'OpenAI';
    if (provider === 'zhipu') return '智谱 AI';
    if (provider === 'modelscope') return '魔搭';
    if (provider === 'huggingface') return 'HuggingFace';
    return '自定义';
  };

  return (
    <TouchableOpacity 
      style={[styles.container, isActive && styles.containerActive]}
      onPress={onPress}
      activeOpacity={0.95}>
      
      <View style={styles.header}>
        <Text style={styles.name}>{model.name}</Text>
        <View style={[styles.tag, isActive ? styles.tagPrimary : styles.tagGray]}>
          <Text style={[styles.tagText, isActive ? styles.tagTextPrimary : styles.tagTextGray]}>
            {isActive ? '当前使用' : '未激活'}
          </Text>
        </View>
      </View>

      <View style={styles.infoRow}>
        <AppIcon name={IconNames.info} size={14} color={COLORS.text.secondary} />
        <Text style={styles.providerText}>
          {getProviderName(model.provider || 'custom')}
        </Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={(e) => {
            e.stopPropagation();
            onDelete();
          }}>
          <AppIcon name={IconNames.delete} size={20} color={COLORS.error} />
        </TouchableOpacity>
        
        <TouchableOpacity
          style={styles.actionButton}
          onPress={(e) => {
            e.stopPropagation();
            onEdit();
          }}>
          <AppIcon name={IconNames.edit} size={20} color={COLORS.text.primary} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.background.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'transparent',
    ...SHADOWS.default,
  },
  containerActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.background.blue,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  name: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text.primary,
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  tagPrimary: {
    backgroundColor: COLORS.primary,
  },
  tagGray: {
    backgroundColor: COLORS.border.medium,
  },
  tagText: {
    fontSize: 11,
    fontWeight: '500',
  },
  tagTextPrimary: {
    color: '#FFFFFF',
  },
  tagTextGray: {
    color: COLORS.text.secondary,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  providerText: {
    fontSize: 13,
    color: COLORS.text.secondary,
  },
  actions: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    opacity: 0.6,
    padding: 4,
  },
});

