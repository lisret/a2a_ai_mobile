import React from 'react';
import {ScrollView, Text, StyleSheet, TouchableOpacity} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import type {RootStackParamList} from '@shared/types/navigation';
import {ModelListPanel} from '../components/ModelListPanel';
import {PageLayout} from '@shared/components/PageLayout';
import {AppMark} from '@shared/components/AppMark';
import {COLORS} from '@shared/constants';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export const ModelListScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();

  return (
    <PageLayout
      title="模型"
      kicker="NONO INTELLIGENCE"
      headerAccessory={<AppMark size={48} />}
      backgroundColor={COLORS.background.default}>
      <ScrollView contentContainerStyle={styles.listContent}>
        <ModelListPanel title="模型配置" listKey="unified" />
        <TouchableOpacity
          style={styles.guideLink}
          onPress={() => navigation.navigate('APIKeyGuide')}>
          <Text style={styles.guideText}>API Key 获取指南</Text>
          <Text style={styles.guideChevron}>›</Text>
        </TouchableOpacity>
      </ScrollView>
    </PageLayout>
  );
};

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: 18,
    paddingBottom: 120,
    paddingTop: 7,
  },
  guideLink: {
    minHeight: 62,
    marginTop: 18,
    paddingHorizontal: 15,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.84)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  guideText: {
    color: COLORS.text.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  guideChevron: {
    color: '#9a9ca7',
    fontSize: 18,
  },
});
