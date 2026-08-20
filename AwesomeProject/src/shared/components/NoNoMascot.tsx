import React from 'react';
import {View, StyleSheet} from 'react-native';

export type NoNoMood = 'idle' | 'thinking' | 'success' | 'error' | 'confirm' | 'listen';

interface NoNoMascotProps {
  size?: number;
  mood?: NoNoMood;
}

export const NoNoMascot: React.FC<NoNoMascotProps> = ({
  size = 54,
  mood = 'idle',
}) => {
  const height = size * 0.91;
  const attention = mood === 'confirm' || mood === 'error';
  const listening = mood === 'listen';
  const eyeColor = attention ? '#ff9b79' : '#8df4e2';

  return (
    <View
      style={[
        styles.body,
        {
          width: size,
          height,
          borderRadius: size * 0.48,
        },
        attention && styles.attention,
        listening && styles.listening,
      ]}>
      <View
        style={[
          styles.ear,
          {left: -3, height: size * 0.29, top: height * 0.42},
        ]}
      />
      <View
        style={[
          styles.ear,
          {right: -3, height: size * 0.29, top: height * 0.42},
        ]}
      />
      <View
        style={[
          styles.visor,
          {
            width: size * 0.66,
            height: height * 0.42,
            borderRadius: size * 0.22,
          },
        ]}>
        <View
          style={[
            styles.eye,
            mood === 'thinking' && styles.eyeThinking,
            mood === 'success' && styles.eyeSuccess,
            {
              backgroundColor: mood === 'success' ? 'transparent' : eyeColor,
              shadowColor: eyeColor,
            },
          ]}
        />
        <View
          style={[
            styles.eye,
            mood === 'thinking' && styles.eyeThinking,
            mood === 'success' && styles.eyeSuccess,
            {
              backgroundColor: mood === 'success' ? 'transparent' : eyeColor,
              shadowColor: eyeColor,
            },
          ]}
        />
      </View>
      <View
        style={[
          styles.statusLight,
          {width: size * 0.18, backgroundColor: eyeColor, shadowColor: eyeColor},
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  body: {
    position: 'relative',
    flexShrink: 0,
    backgroundColor: '#8a80ed',
    shadowColor: '#41398f',
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 6,
  },
  attention: {
    shadowColor: '#ff9b79',
    shadowOpacity: 0.55,
  },
  listening: {
    shadowColor: '#8df4e2',
    shadowOpacity: 0.7,
    shadowRadius: 22,
  },
  ear: {
    position: 'absolute',
    width: 7,
    borderRadius: 7,
    backgroundColor: '#8076df',
    zIndex: -1,
  },
  visor: {
    position: 'absolute',
    left: '17%',
    top: '32%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#11121c',
  },
  eye: {
    width: 3,
    height: 10,
    borderRadius: 3,
    shadowOffset: {width: 0, height: 0},
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  eyeThinking: {
    width: 6,
    height: 5,
  },
  eyeSuccess: {
    width: 6,
    height: 5,
    borderBottomWidth: 2,
    borderBottomColor: '#8df4e2',
    borderRadius: 0,
  },
  statusLight: {
    height: 2,
    position: 'absolute',
    left: '41%',
    bottom: '13%',
    borderRadius: 99,
  },
});
