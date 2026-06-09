import React, { useEffect, useRef } from 'react';
import { View, TouchableOpacity, StyleSheet, Dimensions, Animated, Text, Platform } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { HomeIcon, ModelsIcon, HistoryIcon, SettingsIcon } from '../shared/components/TabIcons';

const { width } = Dimensions.get('window');
const TAB_COUNT = 4;
const TAB_WIDTH = width / TAB_COUNT;
const WAVE_WIDTH = TAB_WIDTH * 3; // 300% width
const WAVE_HEIGHT = 110; // Matched with design_demo.html

// SVG Path from design_demo.html (Latest accepted version)
// M0,80 L30,80 C40,80 35,5 50,5 C65,5 60,80 70,80 L100,80 Z
const WAVE_PATH = "M0,80 C25,80 25,20 50,20 C75,20 75,80 100,80 Z";

const TabIcon = ({ name, color, size }: { name: string; color: string; size: number }) => {
  switch (name) {
    case 'Home': return <HomeIcon color={color} size={size} />;
    case 'Models': return <ModelsIcon color={color} size={size} />;
    case 'History': return <HistoryIcon color={color} size={size} />;
    case 'Settings': return <SettingsIcon color={color} size={size} />;
    default: return null;
  }
};

const TabItem = ({ 
  label, 
  routeName, 
  isFocused, 
  onPress, 
  disabled,
  options 
}: { 
  label: string; 
  routeName: string; 
  isFocused: boolean; 
  onPress: () => void; 
  disabled: boolean;
  options: any;
}) => {
  const scale = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isFocused) {
      // Icon Bounce Animation
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale, { toValue: 1.2, duration: 200, useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1, duration: 200, useNativeDriver: true }),
        ]),
        Animated.spring(translateY, { toValue: -4, useNativeDriver: true, stiffness: 100 })
      ]).start();
    } else {
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
      scale.setValue(1);
    }
  }, [isFocused]);

  const activeColor = '#FFFFFF';
  const inactiveColor = '#6B7280';
  const color = isFocused ? activeColor : inactiveColor;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.tabItem, 
        disabled && { opacity: 0.4 }
      ]}
      activeOpacity={0.8}
    >
      <Animated.View style={{ transform: [{ scale }, { translateY }] }}>
        <TabIcon name={routeName} color={color} size={24} />
      </Animated.View>
      <Text style={[styles.tabLabel, { color }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
};

export const CustomTabBar: React.FC<BottomTabBarProps> = ({ state, descriptors, navigation }) => {
  const translateX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(translateX, {
      toValue: state.index * TAB_WIDTH,
      useNativeDriver: true,
      damping: 15,
      mass: 1,
      stiffness: 120,
    }).start();
  }, [state.index]);

  return (
    <View style={styles.container}>
      {/* Background Wave Indicator */}
      <Animated.View
        style={[
          styles.indicator,
          {
            transform: [{ translateX }],
          },
        ]}
      >
        <Svg 
          width={WAVE_WIDTH} 
          height={WAVE_HEIGHT} 
          viewBox="0 0 100 80" 
          preserveAspectRatio="none" 
          style={styles.waveSvg}
        >
           <Path d={WAVE_PATH} fill="#0EA5E9" />
        </Svg>
      </Animated.View>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const label = options.tabBarLabel as string;
          const isFocused = state.index === index;

          // Check if disabled (based on AppNavigator logic where tabBarButton is set if disabled)
          const isDisabled = options.tabBarButton !== undefined;

          const onPress = () => {
            // 如果点击的是首页或历史页，且当前没有激活模型（被禁用），则自动跳转到模型页
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
            <TabItem
              key={index}
              label={label}
              routeName={route.name}
              isFocused={isFocused}
              onPress={onPress}
              disabled={isDisabled}
              options={options}
            />
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    height: 70, // Tab bar height
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    // Shadow
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 5,
  },
  tabsContainer: {
    flexDirection: 'row',
    flex: 1,
    zIndex: 1, // Ensure tabs are above the wave
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 10, // Match design
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 4,
  },
  indicator: {
    position: 'absolute',
    top: -30, // Matched with design_demo.html
    left: 0,
    width: TAB_WIDTH,
    height: 110, // Matched with design_demo.html
    alignItems: 'center',
    justifyContent: 'flex-end',
    zIndex: 0, // Behind tabs
  },
  waveSvg: {
    // Removed negative margin which was causing misalignment
    marginBottom: -2, // Fix bottom gap
  },
});

