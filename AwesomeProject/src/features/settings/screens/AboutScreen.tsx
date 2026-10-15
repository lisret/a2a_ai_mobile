import React from 'react';
import {ScrollView, View, Text, StyleSheet} from 'react-native';
import {PageLayout} from '@shared/components/PageLayout';
import {AppMark} from '@shared/components/AppMark';
import {InfoCard, LinkCard} from '@features/capability/components/CapabilityCards';
import {COLORS} from '@shared/constants';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import type {RootStackParamList} from '@shared/types/navigation';

export const AboutScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <PageLayout title="关于 NoNo" showBackButton>
      <ScrollView contentContainerStyle={styles.content}>
        <AppMark size={84} />
        <Text style={styles.name}>NoNo</Text>
        <Text style={styles.meta}>陪伴助手 · 替你操作手机</Text>
        <View style={styles.details}>
          <InfoCard
            title="两套大脑"
            body="设置里的陪伴模型负责说话；能力里的操作模型负责看屏和点应用。"
          />
          <LinkCard
            title="隐私"
            body="管理截图、记忆与数据的使用范围。"
            meta="查看与管理 ›"
            onPress={() => navigation.navigate('Privacy')}
          />
        </View>
      </ScrollView>
    </PageLayout>
  );
};

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 18,
    paddingBottom: 40,
    alignItems: 'center',
  },
  details: {
    alignSelf: 'stretch',
  },
  name: {
    marginTop: 12,
    color: COLORS.text.primary,
    fontSize: 22,
    fontWeight: '800',
  },
  meta: {
    marginTop: 6,
    marginBottom: 18,
    color: COLORS.text.secondary,
    fontSize: 12,
  },
});
