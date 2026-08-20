import React, {useEffect, useRef, useState} from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Text,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {BottomTabBarProps} from '@react-navigation/bottom-tabs';
import {
  HomeIcon,
  CapabilitiesIcon,
  HistoryIcon,
  SettingsIcon,
} from '../shared/components/TabIcons';

const TAB_COUNT = 4;
const BAR_PADDING = 7;

const TabIcon = ({
  name,
  color,
  size,
}: {
  name: string;
  color: string;
  size: number;
}) => {
  switch (name) {
    case 'Home':
      return <HomeIcon color={color} size={size} />;
    case 'Capabilities':
      return <CapabilitiesIcon color={color} size={size} />;
    case 'History':
      return <HistoryIcon color={color} size={size} />;
    case 'Settings':
      return <SettingsIcon color={color} size={size} />;
    default:
      return null;
  }
};

export const CustomTabBar: React.FC<BottomTabBarProps> = ({
  state,
  descriptors,
  navigation,
}) => {
  const insets = useSafeAreaInsets();
  const indexAnim = useRef(new Animated.Value(state.index)).current;
  const [barWidth, setBarWidth] = useState(0);

  useEffect(() => {
    Animated.timing(indexAnim, {
      toValue: state.index,
      duration: 280,
      useNativeDriver: true,
    }).start();
  }, [indexAnim, state.index]);

  const tabWidth = barWidth > 0 ? (barWidth - BAR_PADDING * 2) / TAB_COUNT : 0;
  const bottomInset = Math.max(insets.bottom, 8);

  return (
    <View style={[styles.wrap, {paddingBottom: bottomInset}]}>
      <View
        style={styles.bar}
        onLayout={event => setBarWidth(event.nativeEvent.layout.width)}>
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
                      inputRange: [0, TAB_COUNT - 1],
                      outputRange: [0, tabWidth * (TAB_COUNT - 1)],
                    }),
                  },
                ],
              },
            ]}
          />
        ) : null}
        {state.routes.map((route, index) => {
          const {options} = descriptors[route.key];
          const label = options.tabBarLabel as string;
          const isFocused = state.index === index;
          const isDisabled = options.tabBarButton !== undefined;
          const color = isFocused ? '#FFFFFF' : '#858896';

          const onPress = () => {
            if (isDisabled) {
              navigation.navigate('Capabilities');
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
              activeOpacity={0.85}>
              <View style={isFocused ? styles.iconActive : undefined}>
                <TabIcon name={route.name} color={color} size={20} />
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
