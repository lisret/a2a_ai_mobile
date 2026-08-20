import React from 'react';
import {ScrollView, Text, StyleSheet, TouchableOpacity} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import type {RootStackParamList} from '@shared/types/navigation';
import {PageLayout} from '@shared/components/PageLayout';
import {ModelListPanel} from '@features/model/components/ModelListPanel';
import {COLORS} from '@shared/constants';

export const CompanionConfigScreen: React.FC = () => {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <PageLayout title="陪伴模型" showBackButton>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.caption}>
          只用于首页说话和人设。和「替我操作手机」的视觉 / 编排模型不是同一份配置。
        </Text>
        <ModelListPanel title="对话模型" listKey="companion" />
        <TouchableOpacity
          style={styles.guide}
          onPress={() => navigation.navigate('APIKeyGuide')}>
          <Text style={styles.guideText}>API Key 获取指南</Text>
          <Text style={styles.guideChevron}>›</Text>
        </TouchableOpacity>
      </ScrollView>
    </PageLayout>
  );
};

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 18,
    paddingBottom: 40,
  },
  caption: {
    marginBottom: 16,
    color: COLORS.text.secondary,
    fontSize: 11,
    lineHeight: 16,
  },
  guide: {
    minHeight: 62,
    marginTop: 8,
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
