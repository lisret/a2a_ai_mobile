/**
 * 统一的页面布局组件
 * 对齐 NoNo 原型：珍珠底、kicker + 标题、右侧品牌标
 */

import React, {ReactNode} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ViewStyle,
  StatusBar,
  Platform,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {AppIcon, IconNames} from './Icon';
import {PageTransitionWrapper} from './PageTransitionWrapper';
import {COLORS, FONT_WEIGHTS, SPACING} from '../constants';

export interface PageLayoutProps {
  title: string;
  kicker?: string;
  headerAccessory?: ReactNode;
  showBackButton?: boolean;
  onBackPress?: () => void;
  rightAction?: ReactNode;
  children: ReactNode;
  safeArea?: boolean;
  backgroundColor?: string;
  contentStyle?: ViewStyle;
  showBottomBorder?: boolean;
}

export const PageLayout: React.FC<PageLayoutProps> = ({
  title,
  kicker,
  headerAccessory,
  showBackButton = false,
  onBackPress,
  rightAction,
  children,
  safeArea = true,
  backgroundColor = COLORS.background.default,
  contentStyle,
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
    <View style={[styles.container, {backgroundColor}]}>
      {safeArea && Platform.OS === 'ios' && (
        <StatusBar barStyle="dark-content" />
      )}
      {Platform.OS === 'android' && (
        <StatusBar
          barStyle="dark-content"
          backgroundColor="transparent"
          translucent
        />
      )}

      {showBackButton ? (
        <View style={styles.subpageHeader}>
          <TouchableOpacity
            style={styles.roundButton}
            onPress={handleBackPress}
            activeOpacity={0.8}>
            <AppIcon
              name={IconNames.arrowLeft}
              size={18}
              color={COLORS.text.primary}
            />
          </TouchableOpacity>
          <Text style={styles.subpageTitle} numberOfLines={1}>
            {title}
          </Text>
          {rightAction ? (
            <View style={styles.subpageRight}>{rightAction}</View>
          ) : (
            <View style={styles.roundButtonPlaceholder} />
          )}
        </View>
      ) : (
        <View style={styles.pageHeader}>
          <View style={styles.pageHeaderCopy}>
            {kicker ? <Text style={styles.kicker}>{kicker}</Text> : null}
            <Text style={styles.pageTitle} numberOfLines={1}>
              {title}
            </Text>
          </View>
          <View style={styles.headerActions}>
            {rightAction}
            {headerAccessory}
          </View>
        </View>
      )}

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
  pageHeader: {
    minHeight: 74,
    paddingTop: Platform.OS === 'ios' ? 50 : (StatusBar.currentHeight || 24) + 8,
    paddingHorizontal: 18,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
  },
  pageHeaderCopy: {
    flex: 1,
  },
  kicker: {
    marginBottom: 4,
    color: COLORS.text.secondary,
    fontSize: 11,
    fontWeight: FONT_WEIGHTS.medium,
    letterSpacing: 0.4,
  },
  pageTitle: {
    color: COLORS.text.primary,
    fontSize: 22,
    lineHeight: 24,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  subpageHeader: {
    minHeight: 58,
    paddingTop: Platform.OS === 'ios' ? 50 : (StatusBar.currentHeight || 24) + 8,
    paddingHorizontal: 18,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  subpageTitle: {
    flex: 1,
    textAlign: 'center',
    color: COLORS.text.primary,
    fontSize: 17,
    fontWeight: '700',
  },
  roundButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.82)',
    shadowColor: '#1e1f32',
    shadowOffset: {width: 0, height: 7},
    shadowOpacity: 0.07,
    shadowRadius: 9,
    elevation: 2,
  },
  roundButtonPlaceholder: {
    width: 38,
    height: 38,
  },
  subpageRight: {
    minWidth: 38,
    alignItems: 'flex-end',
  },
  content: {
    flex: 1,
  },
});
