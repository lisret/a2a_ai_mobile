import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Alert,
} from 'react-native';
import { COLORS, SHADOWS } from '@shared/constants';
import { DEFAULT_AVATAR } from '../../../assets/avatars';

export type AvatarMood = 'idle' | 'work' | 'done' | 'error';

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
  const float = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(float, { toValue: 1, duration: 1800, useNativeDriver: true }),
        Animated.timing(float, { toValue: 0, duration: 1800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [float]);

  const translateY = float.interpolate({
    inputRange: [0, 1],
    outputRange: [0, compact ? 0 : -8],
  });

  const handleLongPress = () => {
    Alert.alert(DEFAULT_AVATAR.name, DEFAULT_AVATAR.credit);
  };

  return (
    <View style={[styles.stage, compact && styles.stageCompact]}>
      {!compact && (
        <View style={styles.bubble}>
          <Text style={styles.bubbleText}>{bubble}</Text>
        </View>
      )}
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={compact ? undefined : onPress}
        onLongPress={handleLongPress}
        delayLongPress={450}
        disabled={compact}
        style={styles.hit}>
        <Animated.View
          style={[
            styles.avatarWrap,
            compact && styles.avatarWrapCompact,
            { transform: [{ translateY }] },
          ]}>
          <Image
            source={DEFAULT_AVATAR.bust}
            style={[styles.photo, mood === 'error' && styles.photoDim]}
            resizeMode="cover"
            accessibilityLabel={DEFAULT_AVATAR.name}
          />
        </Animated.View>
      </TouchableOpacity>
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
  hit: {
    alignItems: 'center',
  },
  avatarWrap: {
    width: 240,
    height: 300,
    borderRadius: 24,
    overflow: 'hidden',
    ...SHADOWS.default,
  },
  avatarWrapCompact: {
    width: 88,
    height: 110,
    borderRadius: 16,
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  photoDim: {
    opacity: 0.72,
  },
});
