import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Alert,
} from 'react-native';
import {COLORS} from '@shared/constants';
import {NONO_COLORS, NONO_RADII} from '@shared/ui/nono';
import {DEFAULT_AVATAR} from '../../../assets/avatars';
import {AvatarVrmView} from './AvatarVrmView';
import type {AvatarMood} from './avatarTypes';

export type {AvatarMood} from './avatarTypes';

interface AvatarStageProps {
  bubble: string;
  mood?: AvatarMood;
  compact?: boolean;
  /** UI 对齐阶段默认关 3D，确认布局后再打开。 */
  enable3d?: boolean;
  onPress?: () => void;
}

export const AvatarStage: React.FC<AvatarStageProps> = ({
  bubble,
  mood = 'idle',
  compact = false,
  enable3d = false,
  onPress,
}) => {
  const [use3d, setUse3d] = useState(enable3d);
  const [ready3d, setReady3d] = useState(false);
  const float = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    setUse3d(enable3d);
    if (!enable3d) {
      setReady3d(false);
    }
  }, [enable3d]);

  useEffect(() => {
    if (process.env.JEST_WORKER_ID) {
      return;
    }
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

  const handleVrmError = useCallback(() => {
    setUse3d(false);
    setReady3d(false);
  }, []);

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
            compact={compact}
            onReady={() => setReady3d(true)}
            onError={handleVrmError}
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
              style={styles.hit}
              accessibilityRole="button"
              accessibilityLabel={DEFAULT_AVATAR.name}>
              <Image
                source={DEFAULT_AVATAR.bust}
                style={[styles.photo, mood === 'error' && styles.photoDim]}
                resizeMode="cover"
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
    minHeight: 200,
    paddingHorizontal: 18,
  },
  stageCompact: {
    flex: 0,
    flexGrow: 0,
    flexShrink: 0,
    minHeight: 0,
    height: 108,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: 18,
    paddingTop: 4,
  },
  bubble: {
    maxWidth: 300,
    backgroundColor: 'rgba(255,255,255,0.84)',
    borderRadius: NONO_RADII.md,
    borderBottomLeftRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.92)',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 8,
    shadowColor: '#1e1f32',
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 22,
    color: COLORS.text.primary,
  },
  avatarWrap: {
    width: 240,
    height: 292,
    borderRadius: NONO_RADII.lg,
    overflow: 'hidden',
    backgroundColor: NONO_COLORS.pearl,
  },
  avatarWrapCompact: {
    width: 84,
    height: 100,
    borderRadius: NONO_RADII.sm,
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
