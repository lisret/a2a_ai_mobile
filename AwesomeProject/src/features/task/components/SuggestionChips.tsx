import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import {HOME_SUGGESTIONS, type SuggestionItem} from '@shared/constants';

interface SuggestionChipsProps {
  suggestions?: readonly SuggestionItem[];
  onSelect: (text: string) => void;
}

export const SuggestionChips: React.FC<SuggestionChipsProps> = ({
  suggestions = HOME_SUGGESTIONS,
  onSelect,
}) => {
  return (
    <View style={styles.container}>
      {suggestions.map((item, index) => (
        <TouchableOpacity
          key={index}
          onPress={() => onSelect(item.value)}
          style={styles.chip}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={item.label}>
          <Text style={styles.chipText}>{item.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    minHeight: 38,
    paddingHorizontal: 13,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e8e7ed',
    backgroundColor: 'rgba(255,255,255,0.8)',
    justifyContent: 'center',
  },
  chipText: {
    fontSize: 11,
    color: '#434552',
  },
});
