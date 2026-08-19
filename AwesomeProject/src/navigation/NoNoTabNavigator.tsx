import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Animated, Easing, StyleSheet, View} from 'react-native';
import {
  createNavigatorFactory,
  TabRouter,
  useNavigationBuilder,
} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useReducedMotion} from '@shared/ui/nono';
import {
  beginTabTransition,
  createInitialTabTransition,
  finishTabTransition,
  TAB_TRANSITION,
  type NoNoTabTransitionState,
} from './NoNoTabTransition';

type NoNoTabNavigatorProps = {
  id?: string;
  initialRouteName?: string;
  children: React.ReactNode;
  screenOptions?: object;
  disabledRoutes?: readonly string[];
  tabBar?: (props: Record<string, unknown>) => React.ReactNode;
};

function NoNoTabNavigator({
  id,
  initialRouteName,
  children,
  screenOptions,
  disabledRoutes = [],
  tabBar,
}: NoNoTabNavigatorProps) {
  const {state, navigation, descriptors, NavigationContent} = useNavigationBuilder(
    TabRouter,
    {
      id,
      children,
      screenOptions,
      initialRouteName,
    },
  );
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const [sceneWidth, setSceneWidth] = useState(0);
  const [loadedKeys, setLoadedKeys] = useState(
    () => new Set<string>([state.routes[state.index]?.key].filter(Boolean) as string[]),
  );
  const progress = useRef(new Animated.Value(1)).current;
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);
  const transitionRef = useRef<NoNoTabTransitionState>(
    createInitialTabTransition(state.index),
  );
  const [transition, setTransition] = useState(() =>
    createInitialTabTransition(state.index),
  );

  useEffect(() => {
    const targetKey = state.routes[state.index]?.key;
    if (!targetKey) {
      return;
    }
    setLoadedKeys(prev => {
      if (prev.has(targetKey)) {
        return prev;
      }
      const next = new Set(prev);
      next.add(targetKey);
      return next;
    });
  }, [state.index, state.routes]);

  useEffect(() => {
    const targetIndex = state.index;
    const current = transitionRef.current;
    const alreadySettled =
      current.activeIndex === targetIndex && !current.transitioning;

    if (alreadySettled) {
      return;
    }

    const snap = () => {
      animationRef.current?.stop();
      const settled = {
        ...createInitialTabTransition(targetIndex),
        generation: current.generation + 1,
      };
      transitionRef.current = settled;
      setTransition(settled);
      progress.setValue(1);
    };

    if (reducedMotion || sceneWidth === 0) {
      snap();
      return;
    }

    animationRef.current?.stop();
    const next = beginTabTransition(current, targetIndex);
    transitionRef.current = next;
    setTransition(next);

    if (!next.transitioning) {
      progress.setValue(1);
      return;
    }

    progress.setValue(0);
    const generation = next.generation;
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: TAB_TRANSITION.durationMs,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
      useNativeDriver: true,
    });
    animationRef.current = animation;
    animation.start(({finished}) => {
      if (!finished) {
        return;
      }
      const committed = finishTabTransition(transitionRef.current, generation);
      transitionRef.current = committed;
      setTransition(committed);
    });
  }, [progress, reducedMotion, sceneWidth, state.index]);

  useEffect(() => {
    return () => {
      animationRef.current?.stop();
    };
  }, []);

  const onRoutePress = useCallback((routeKey: string) => {
    const event = navigation.emit({
      type: 'tabPress',
      target: routeKey,
      canPreventDefault: true,
    });
    if (event.defaultPrevented) {
      return;
    }
    const route = state.routes.find(item => item.key === routeKey);
    if (!route) {
      return;
    }
    const targetName = disabledRoutes.includes(route.name) ? 'Models' : route.name;
    const focused = state.routes[state.index];
    if (focused?.name !== targetName) {
      navigation.navigate(targetName);
    }
  }, [disabledRoutes, navigation, state.index, state.routes]);

  const direction = transition.direction || 1;
  const incomingX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [sceneWidth * (TAB_TRANSITION.incomingPercent / 100) * direction, 0],
  });
  const outgoingX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, sceneWidth * -(TAB_TRANSITION.outgoingPercent / 100) * direction],
  });
  const incomingOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.55, 1],
  });
  const outgoingOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.48],
  });
  const incomingScale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.99, 1],
  });
  const outgoingScale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.985],
  });

  const tabBarNode = useMemo(() => {
    if (!tabBar) {
      return null;
    }
    return tabBar({
      state,
      descriptors,
      navigation,
      insets,
      onRoutePress,
      disabledRoutes,
      reducedMotion,
    });
  }, [descriptors, disabledRoutes, insets, navigation, onRoutePress, reducedMotion, state, tabBar]);

  return (
    <NavigationContent>
      <View style={styles.root}>
        <View
          testID="nono-scene-host"
          style={styles.host}
          onLayout={event => setSceneWidth(event.nativeEvent.layout.width)}>
          {state.routes.map((route, index) => {
            if (!loadedKeys.has(route.key)) {
              return null;
            }
            const focused = state.index === index;
            const isIncoming = transition.transitioning && transition.toIndex === index;
            const isOutgoing = transition.transitioning && transition.fromIndex === index;
            const isActiveLayer = isIncoming || (!transition.transitioning && focused);
            const hidden = reducedMotion ? !focused : !isIncoming && !isOutgoing && !focused;

            let layerStyle = {};
            if (!reducedMotion && sceneWidth > 0) {
              if (isIncoming) {
                layerStyle = {
                  opacity: incomingOpacity,
                  transform: [{translateX: incomingX}, {scale: incomingScale}],
                };
              } else if (isOutgoing) {
                layerStyle = {
                  opacity: outgoingOpacity,
                  transform: [{translateX: outgoingX}, {scale: outgoingScale}],
                };
              }
            }

            return (
              <Animated.View
                key={route.key}
                testID={`nono-scene-${route.name}`}
                pointerEvents={transition.transitioning || !focused ? 'none' : 'auto'}
                accessibilityElementsHidden={!isActiveLayer}
                importantForAccessibility={
                  isActiveLayer ? 'auto' : 'no-hide-descendants'
                }
                style={[
                  styles.scene,
                  reducedMotion && hidden ? styles.hidden : null,
                  !reducedMotion && hidden ? styles.parked : null,
                  layerStyle,
                ]}>
                {descriptors[route.key]?.render()}
              </Animated.View>
            );
          })}
        </View>
        {tabBarNode}
      </View>
    </NavigationContent>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  host: {
    flex: 1,
    overflow: 'hidden',
  },
  scene: {
    ...StyleSheet.absoluteFillObject,
  },
  parked: {
    opacity: 0,
  },
  hidden: {
    display: 'none',
  },
});

export const createNoNoTabNavigator = createNavigatorFactory(NoNoTabNavigator);
