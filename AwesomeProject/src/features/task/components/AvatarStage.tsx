import React, {useEffect, useRef, useState} from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Alert,
} from 'react-native';
import {COLORS, SHADOWS} from '@shared/constants';
import {DEFAULT_AVATAR} from '../../../assets/avatars';
import {AvatarVrmView} from './AvatarVrmView';
import type {AvatarMood} from './avatarTypes';

export type {AvatarMood} from './avatarTypes';

interface AvatarStageProps {
  bubble: string;
  mood?: AvatarMood;
  compact?: boolean;
  onPress?: () => void;
}

export const AvatarStage: React.FC<AvatarStageProps> = ({
  bubble,
  mood = 'idle',
  compact = false,
  onPress,
}) => {
  const [use3d, setUse3d] = useState(true);
  const [ready3d, setReady3d] = useState(false);
  const float = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(float, {toValue: 1, duration: 1800, useNativeDriver: true}),
        Animated.timing(float, {toValue: 0, duration: 1800, useNativeDriver: true}),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [float]);

  const translateY = float.interpolate({
    inputRange: [0, 1],
    outputRange: [0, compact || ready3d ? 0 : -8],
  });

  const handleLongPress = () => {
    Alert.alert(DEFAULT_AVATAR.name, DEFAULT_AVATAR.credit);
  };

  const showFallback = !use3d;
  const showPlaceholder = use3d && !ready3d;

  return (
    <View style={[styles.stage, compact && styles.stageCompact]}>
      {!compact && (
        <View style={styles.bubble}>
          <Text style={styles.bubbleText}>{bubble}</Text>
        </View>
      )}
      <View style={[styles.avatarWrap, compact && styles.avatarWrapCompact]}>
        {use3d && (
          <AvatarVrmView
            mood={mood}
            onReady={() => setReady3d(true)}
            onError={() => {
              setUse3d(false);
              setReady3d(false);
            }}
            onPress={compact ? undefined : onPress}
            onLongPress={handleLongPress}
          />
        )}
        {(showFallback || showPlaceholder) && (
          <Animated.View
            pointerEvents={showFallback ? 'auto' : 'none'}
            style={[styles.fallback, {transform: [{translateY}]}]}>
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={compact || !showFallback ? undefined : onPress}
              onLongPress={handleLongPress}
              delayLongPress={450}
              disabled={compact || !showFallback}
              style={styles.hit}>
              <Image
                source={DEFAULT_AVATAR.bust}
                style={[styles.photo, mood === 'error' && styles.photoDim]}
                resizeMode="cover"
                accessibilityLabel={DEFAULT_AVATAR.name}
              />
            </TouchableOpacity>
          </Animated.View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    minHeight: 220,
    paddingHorizontal: 16,
  },
  stageCompact: {
    flex: 0,
    flexGrow: 0,
    flexShrink: 0,
    minHeight: 0,
    height: 120,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: 12,
    paddingTop: 4,
  },
  bubble: {
    maxWidth: 300,
    backgroundColor: COLORS.background.card,
    borderRadius: 18,
    borderBottomLeftRadius: 6,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 8,
    ...SHADOWS.sm,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 22,
    color: COLORS.text.primary,
  },
  avatarWrap: {
    width: 260,
    height: 320,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  avatarWrapCompact: {
    width: 96,
    height: 118,
    borderRadius: 16,
  },
  fallback: {
    ...StyleSheet.absoluteFillObject,
  },
  hit: {
    flex: 1,
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  photoDim: {
    opacity: 0.72,
  },
});
