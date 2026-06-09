/**
 * 统一的页面布局组件
 * 提供统一的顶部header和底部样式，确保所有页面布局一致
 */

import React, { ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ViewStyle,
  TextStyle,
  StatusBar,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { AppIcon, IconNames } from './Icon';
import { PageTransitionWrapper } from './PageTransitionWrapper';
import { COLORS, FONT_SIZES, FONT_WEIGHTS, SPACING } from '../constants';

export interface PageLayoutProps {
  /** 页面标题 */
  title: string;
  /** 是否显示返回按钮 */
  showBackButton?: boolean;
  /** 自定义返回按钮点击事件 */
  onBackPress?: () => void;
  /** 右侧操作按钮（ReactNode） */
  rightAction?: ReactNode;
  /** 页面内容 */
  children: ReactNode;
  /** 是否使用安全区域（状态栏） */
  safeArea?: boolean;
  /** 背景颜色 */
  backgroundColor?: string;
  /** 内容区域样式 */
  contentStyle?: ViewStyle;
  /** 是否显示底部边框 */
  showBottomBorder?: boolean;
}

export const PageLayout: React.FC<PageLayoutProps> = ({
  title,
  showBackButton = false,
  onBackPress,
  rightAction,
  children,
  safeArea = true,
  backgroundColor = COLORS.background.default,
  contentStyle,
  showBottomBorder = false,
}) => {
  const navigation = useNavigation();

  const handleBackPress = () => {
    if (onBackPress) {
      onBackPress();
    } else {
      navigation.goBack();
    }
  };

  return (
    <View style={[styles.container, { backgroundColor }]}>
      {safeArea && Platform.OS === 'ios' && (
        <StatusBar barStyle="dark-content" />
      )}
      {Platform.OS === 'android' && (
        <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent={true} />
      )}
      
      {/* 统一的顶部Header */}
      <View style={[styles.header, showBottomBorder && styles.headerBorder]}>
        {showBackButton ? (
          <>
            <View style={styles.headerLeft}>
              <TouchableOpacity
                style={styles.backButton}
                onPress={handleBackPress}
                activeOpacity={0.7}>
                <AppIcon name={IconNames.arrowLeft} size={20} color={COLORS.text.primary} />
              </TouchableOpacity>
              <Text style={styles.headerTitle} numberOfLines={1}>
                {title}
              </Text>
            </View>
            
            {rightAction ? (
              <View style={styles.headerRight}>
                {rightAction}
              </View>
            ) : (
              <View style={styles.headerRightPlaceholder} />
            )}
          </>
        ) : (
          <>
            <View style={styles.headerCenter}>
              <Text style={[styles.headerTitle, styles.headerTitleCenter]} numberOfLines={1}>
                {title}
              </Text>
            </View>
            
            {rightAction && (
              <View style={styles.headerRight}>
                {rightAction}
              </View>
            )}
          </>
        )}
      </View>

      {/* 页面内容 */}
      <PageTransitionWrapper style={[styles.content, contentStyle]}>
        {children}
      </PageTransitionWrapper>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background.default,
  },
  header: {
    backgroundColor: '#FFFFFF',
    paddingTop: Platform.OS === 'ios' ? 50 : (StatusBar.currentHeight || 24) + 12,
    paddingBottom: SPACING.md,
    paddingHorizontal: SPACING.base,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: Platform.OS === 'ios' ? 66 : 56,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    zIndex: 99,
  },
  headerBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    height: 32,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 32,
  },
  backButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.sm,
  },
  headerTitle: {
    fontSize: 18, // Demo: 18px
    fontWeight: '700', // Demo: 700
    color: COLORS.text.primary, // Demo: text-main (#111827)
    flex: 1,
  },
  headerTitleCenter: {
    flex: 0,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  headerRightPlaceholder: {
    width: 36,
  },
  content: {
    flex: 1,
  },
});

