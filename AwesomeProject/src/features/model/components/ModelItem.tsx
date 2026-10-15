import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import {COLORS} from '@shared/constants';
import type {ModelConfigListItemViewState} from '../../../application/facades/UiRuntimeContracts';

interface ModelItemProps {
  item: ModelConfigListItemViewState;
  onPress?: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export const ModelItem: React.FC<ModelItemProps> = ({
  item,
  onPress,
  onEdit,
  onDelete,
}) => {
  const isActive = item.selected;
  return (
    <View style={[styles.container, isActive && styles.containerActive]}>
      <View style={styles.topline}>
        <TouchableOpacity style={styles.copy} onPress={onPress} activeOpacity={0.8}>
          <Text style={styles.name}>{item.displayName}</Text>
          <Text style={styles.meta}>
            {item.providerLabel} · {item.modelId}
          </Text>
        </TouchableOpacity>
        {isActive ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>使用中</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.actions}>
        {!isActive && onPress ? (
          <TouchableOpacity style={styles.useButton} onPress={onPress}>
            <Text style={styles.useText}>使用</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity style={styles.miniButton} onPress={onEdit}>
          <Text style={styles.miniText}>编辑</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.miniButton, styles.miniDanger]}
          onPress={onDelete}>
          <Text style={[styles.miniText, styles.miniDangerText]}>删除</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 15,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.92)',
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.84)',
  },
  containerActive: {
    borderColor: 'rgba(117,107,240,0.38)',
    shadowColor: '#534bbc',
    shadowOffset: {width: 0, height: 13},
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 3,
  },
  topline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  copy: {
    flex: 1,
  },
  name: {
    color: COLORS.text.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  meta: {
    marginTop: 4,
    color: COLORS.text.secondary,
    fontSize: 10,
    lineHeight: 14,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: '#e9e6ff',
  },
  badgeText: {
    color: '#5d55cb',
    fontSize: 8,
    fontWeight: '800',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  useButton: {
    width: '100%',
    minHeight: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.violet,
  },
  useText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  miniButton: {
    minHeight: 32,
    paddingHorizontal: 11,
    borderRadius: 11,
    backgroundColor: '#f1f0f7',
    justifyContent: 'center',
  },
  miniText: {
    color: '#575967',
    fontSize: 9,
    fontWeight: '700',
  },
  miniDanger: {
    backgroundColor: '#fff0ec',
  },
  miniDangerText: {
    color: COLORS.error,
  },
});
