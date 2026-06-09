import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, ViewProps } from 'react-native';
import { useIsFocused } from '@react-navigation/native';

interface PageTransitionWrapperProps extends ViewProps {
  children: React.ReactNode;
}

export const PageTransitionWrapper: React.FC<PageTransitionWrapperProps> = ({ children, style, ...props }) => {
  const isFocused = useIsFocused();
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.98)).current;

  useEffect(() => {
    if (isFocused) {
      // Reset values before animating in (optional, but good for cleanliness)
      opacity.setValue(0);
      scale.setValue(0.98);

      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
          easing: undefined, // default ease
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
          // Cubic-bezier(0.25, 0.8, 0.25, 1) approximation
          // In RN, we can use Easing.bezier(0.25, 0.8, 0.25, 1) if imported, or just standard easing
        }),
      ]).start();
    } else {
      // Optional: Animate out? The demo only shows active page animating in. 
      // Non-active pages are opacity: 0 in CSS.
      opacity.setValue(0);
    }
  }, [isFocused]);

  return (
    <Animated.View
      style={[
        styles.container,
        style,
        {
          opacity,
          transform: [{ scale }],
        },
      ]}
      {...props}
    >
      {children}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6', // Match --bg-page in demo
  },
});

