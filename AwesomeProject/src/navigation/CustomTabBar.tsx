import React, {useEffect, useRef, useState} from 'react';
import {View, TouchableOpacity, StyleSheet, Animated, Text} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import type {BottomTabBarProps} from '@react-navigation/bottom-tabs';
import {useReducedMotion} from '@shared/ui/nono';
import {HomeIcon, ModelsIcon, HistoryIcon, SettingsIcon} from '../shared/components/TabIcons';

const BAR_PADDING = 7;

export type NoNoTabBarProps = BottomTabBarProps & {
  onRoutePress?: (routeKey: string) => void;
  disabledRoutes?: readonly string[];
  reducedMotion?: boolean;
};

const FallbackIcon = ({name, color, size}: {name: string; color: string; size: number}) => {
  switch (name) {
    case 'Home':
      return <HomeIcon color={color} size={size} />;
    case 'Models':
      return <ModelsIcon color={color} size={size} />;
    case 'History':
      return <HistoryIcon color={color} size={size} />;
    case 'Settings':
      return <SettingsIcon color={color} size={size} />;
    default:
      return null;
  }
};

export const CustomTabBar: React.FC<NoNoTabBarProps> = ({
  state,
  descriptors,
  navigation,
  insets: insetsProp,
  onRoutePress,
  disabledRoutes = [],
  reducedMotion: reducedMotionProp,
}) => {
  const hookInsets = useSafeAreaInsets();
  const insets = insetsProp ?? hookInsets;
  const reducedMotionFromSystem = useReducedMotion();
  const reducedMotion = reducedMotionProp ?? reducedMotionFromSystem;
  const indexAnim = useRef(new Animated.Value(state.index)).current;
  const [barWidth, setBarWidth] = useState(0);

  useEffect(() => {
    if (reducedMotion) {
      indexAnim.setValue(state.index);
      return;
    }
    Animated.timing(indexAnim, {
      toValue: state.index,
      duration: 280,
      useNativeDriver: true,
    }).start();
  }, [indexAnim, reducedMotion, state.index]);

  const tabWidth = barWidth > 0 ? (barWidth - BAR_PADDING * 2) / state.routes.length : 0;
  const bottomInset = Math.max(insets.bottom, 8);

  return (
    <View style={[styles.wrap, {paddingBottom: bottomInset}]}>
      <View style={styles.bar} onLayout={event => setBarWidth(event.nativeEvent.layout.width)}>
        {tabWidth > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.indicator,
              {
                width: tabWidth,
                transform: [
                  {
                    translateX: indexAnim.interpolate({
                      inputRange: [0, Math.max(state.routes.length - 1, 1)],
                      outputRange: [0, tabWidth * Math.max(state.routes.length - 1, 0)],
                    }),
                  },
                ],
              },
            ]}
          />
        ) : null}
        {state.routes.map((route, index) => {
          const {options} = descriptors[route.key];
          const label = (options.tabBarLabel as string) || route.name;
          const isFocused = state.index === index;
          const isDisabled = disabledRoutes.includes(route.name);
          const color = isFocused ? '#FFFFFF' : '#858896';
          const icon = options.tabBarIcon
            ? options.tabBarIcon({focused: isFocused, color, size: 20})
            : <FallbackIcon name={route.name} color={color} size={20} />;

          const onPress = () => {
            if (onRoutePress) {
              onRoutePress(route.key);
              return;
            }
            if (isDisabled) {
              navigation.navigate('Models');
              return;
            }
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          return (
            <TouchableOpacity
              key={route.key}
              onPress={onPress}
              style={[styles.tab, isDisabled && {opacity: 0.4}]}
              activeOpacity={0.85}
              accessibilityRole="tab"
              accessibilityState={{selected: isFocused, disabled: isDisabled}}
              accessibilityLabel={label}>
              <View style={!reducedMotion && isFocused ? styles.iconActive : undefined}>
                {icon}
              </View>
              <Text style={[styles.label, {color}]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 12,
    backgroundColor: 'transparent',
  },
  bar: {
    height: 76,
    flexDirection: 'row',
    alignItems: 'center',
    padding: BAR_PADDING,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 24,
    backgroundColor: 'rgba(27,29,48,0.95)',
    shadowColor: '#141524',
    shadowOffset: {width: 0, height: 16},
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 12,
  },
  indicator: {
    position: 'absolute',
    left: BAR_PADDING,
    top: BAR_PADDING,
    bottom: BAR_PADDING,
    borderRadius: 18,
    backgroundColor: '#8178f5',
  },
  tab: {
    flex: 1,
    height: 62,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    zIndex: 1,
  },
  iconActive: {
    transform: [{translateY: -2}, {scale: 1.08}],
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
  },
});
