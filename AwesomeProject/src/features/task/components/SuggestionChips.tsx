import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS, SHADOWS, HOME_SUGGESTIONS, type SuggestionItem } from '@shared/constants';

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
          activeOpacity={0.7}>
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
    gap: 10,
  },
  chip: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  chipText: {
    fontSize: 13,
    color: '#111827',
    fontWeight: '400',
  },
});
