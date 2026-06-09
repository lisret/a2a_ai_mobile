/**
 * API Key 获取指引页面
 * 提供各模型厂商的 API Key 获取步骤说明
 */

import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '@shared/types/navigation';
import { AppIcon, IconNames } from '@shared/components/Icon';
import { PageLayout } from '@shared/components/PageLayout';
import { COLORS } from '@shared/constants';
import { API_PROVIDERS } from '@shared/constants/apiProviders';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type RoutePropType = RouteProp<RootStackParamList, 'APIKeyGuide'>;

interface GuideItem {
  providerId: string;
  title: string;
  steps: string[];
  websiteUrl: string;
  websiteName: string;
  notes?: string[];
}

const GUIDE_DATA: GuideItem[] = [
  {
    providerId: 'zhipu',
    title: '智谱AI (GLM)',
    websiteUrl: 'https://open.bigmodel.cn',
    websiteName: '智谱AI开放平台',
    steps: [
      '访问智谱AI开放平台官网',
      '注册并登录账号',
      '进入"控制台" -> "API Keys"',
      '点击"创建新的API Key"',
      '复制生成的 API Key（格式类似：your-api-key-here）',
      '注意：API Key 只显示一次，请妥善保管',
    ],
    notes: [
      '智谱AI提供免费额度，适合个人开发者使用',
      '支持 GLM-4、GLM-4V 等模型',
    ],
  },
  {
    providerId: 'modelscope',
    title: '魔塔社区 (ModelScope)',
    websiteUrl: 'https://modelscope.cn',
    websiteName: '魔塔社区',
    steps: [
      '访问魔塔社区官网',
      '注册并登录账号（可使用阿里云账号）',
      '进入"个人中心" -> "API Keys"',
      '创建新的 API Key',
      '复制生成的 API Key',
    ],
    notes: [
      '魔塔社区由阿里云提供，支持通义千问等模型',
      '需要实名认证后才能使用 API',
    ],
  },
  {
    providerId: 'openai',
    title: 'OpenAI',
    websiteUrl: 'https://platform.openai.com',
    websiteName: 'OpenAI Platform',
    steps: [
      '访问 OpenAI Platform 官网',
      '注册并登录账号（需要国外手机号）',
      '进入"API Keys"页面',
      '点击"Create new secret key"',
      '复制生成的 API Key（格式：sk-...）',
      '注意：API Key 只显示一次，请妥善保管',
    ],
    notes: [
      'OpenAI 需要绑定信用卡才能使用',
      '支持 GPT-4、GPT-3.5 等模型',
      '国内用户可能需要使用代理访问',
    ],
  },
  {
    providerId: 'anthropic',
    title: 'Anthropic (Claude)',
    websiteUrl: 'https://console.anthropic.com',
    websiteName: 'Anthropic Console',
    steps: [
      '访问 Anthropic Console 官网',
      '注册并登录账号',
      '进入"API Keys"页面',
      '点击"Create Key"',
      '复制生成的 API Key（格式：sk-ant-...）',
    ],
    notes: [
      'Anthropic 提供 Claude 系列模型',
      '需要绑定信用卡才能使用',
    ],
  },
  {
    providerId: 'deepseek',
    title: 'DeepSeek',
    websiteUrl: 'https://platform.deepseek.com',
    websiteName: 'DeepSeek Platform',
    steps: [
      '访问 DeepSeek Platform 官网',
      '注册并登录账号',
      '进入"API Keys"页面',
      '创建新的 API Key',
      '复制生成的 API Key（格式：sk-...）',
    ],
    notes: [
      'DeepSeek 提供高性价比的 AI 模型',
      '支持中文场景优化',
    ],
  },
  {
    providerId: 'moonshot',
    title: 'Moonshot AI',
    websiteUrl: 'https://platform.moonshot.cn',
    websiteName: 'Moonshot Platform',
    steps: [
      '访问 Moonshot Platform 官网',
      '注册并登录账号',
      '进入"API Keys"页面',
      '创建新的 API Key',
      '复制生成的 API Key（格式：sk-...）',
    ],
    notes: [
      'Moonshot AI 提供长文本处理能力',
      '支持 128K 上下文长度',
    ],
  },
];

export const APIKeyGuideScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RoutePropType>();
  const providerId = route.params?.providerId;

  // 根据 providerId 过滤要显示的指引
  const displayGuides = providerId
    ? GUIDE_DATA.filter(guide => guide.providerId === providerId)
    : GUIDE_DATA;

  const handleOpenWebsite = async (url: string) => {
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        console.warn('无法打开链接:', url);
      }
    } catch (error) {
      console.error('打开链接失败:', error);
    }
  };

  const renderGuideItem = (guide: GuideItem, index: number) => {
    const provider = API_PROVIDERS.find(p => p.id === guide.providerId);
    
    return (
      <View
        key={guide.providerId}
        style={styles.guideCard}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>{guide.title}</Text>
          {provider && (
            <Text style={styles.cardDescription}>{provider.description}</Text>
          )}
        </View>

        <View style={styles.stepsContainer}>
          <Text style={styles.stepsTitle}>获取步骤：</Text>
          {guide.steps.map((step, index) => (
            <View key={index} style={styles.stepItem}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>{index + 1}</Text>
              </View>
              <Text style={styles.stepText}>{step}</Text>
            </View>
          ))}
        </View>

        {guide.notes && guide.notes.length > 0 && (
          <View style={styles.notesContainer}>
            <Text style={styles.notesTitle}>注意事项：</Text>
            {guide.notes.map((note, index) => (
              <View key={index} style={styles.noteItem}>
                <AppIcon
                  name={IconNames.info}
                  size={14}
                  color={COLORS.warning}
                  style={styles.noteIcon}
                />
                <Text style={styles.noteText}>{note}</Text>
              </View>
            ))}
          </View>
        )}

        <TouchableOpacity
          style={styles.websiteButton}
          onPress={() => handleOpenWebsite(guide.websiteUrl)}>
          <AppIcon
            name={IconNames.arrowRight}
            size={16}
            color={COLORS.primary}
            style={styles.websiteIcon}
          />
          <Text style={styles.websiteButtonText}>
            访问 {guide.websiteName}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <PageLayout
      title="API Key 获取指引"
      showBackButton
      backgroundColor={COLORS.background.default}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}>
        {!providerId && (
          <View style={styles.introCard}>
            <AppIcon
              name={IconNames.info}
              size={24}
              color={COLORS.primary}
              style={styles.introIcon}
            />
            <Text style={styles.introTitle}>什么是 API Key？</Text>
            <Text style={styles.introText}>
              API Key 是访问 AI 模型服务的密钥，类似于账号密码。
              每个模型厂商都有自己的 API Key 获取方式，请按照下方指引操作。
            </Text>
          </View>
        )}

        {displayGuides.length > 0 ? (
          displayGuides.map((guide, index) => renderGuideItem(guide, index))
        ) : (
          <View style={styles.emptyCard}>
            <AppIcon
              name={IconNames.info}
              size={24}
              color={COLORS.text.secondary}
              style={styles.emptyIcon}
            />
            <Text style={styles.emptyTitle}>暂无指引</Text>
            <Text style={styles.emptyText}>
              该提供商暂无获取指引，请查看官方文档或联系客服。
            </Text>
          </View>
        )}

        {!providerId && (
          <View style={styles.footerCard}>
            <Text style={styles.footerTitle}>需要帮助？</Text>
            <Text style={styles.footerText}>
              如果遇到问题，可以查看各厂商的官方文档或联系客服。
            </Text>
          </View>
        )}
      </ScrollView>
    </PageLayout>
  );
};

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  introCard: {
    backgroundColor: COLORS.background.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
  },
  introIcon: {
    marginBottom: 8,
  },
  introTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text.primary,
    marginBottom: 8,
  },
  introText: {
    fontSize: 14,
    color: COLORS.text.secondary,
    lineHeight: 20,
  },
  guideCard: {
    backgroundColor: COLORS.background.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border.medium,
  },
  emptyCard: {
    backgroundColor: COLORS.background.card,
    borderRadius: 12,
    padding: 32,
    marginBottom: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIcon: {
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text.primary,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.text.secondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  cardHeader: {
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.light,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text.primary,
    marginBottom: 4,
  },
  cardDescription: {
    fontSize: 14,
    color: COLORS.text.secondary,
  },
  stepsContainer: {
    marginBottom: 16,
  },
  stepsTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text.primary,
    marginBottom: 12,
  },
  stepItem: {
    flexDirection: 'row',
    marginBottom: 12,
    alignItems: 'flex-start',
  },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  stepNumberText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  },
  stepText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text.primary,
    lineHeight: 20,
  },
  notesContainer: {
    backgroundColor: COLORS.background.blue,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  notesTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text.primary,
    marginBottom: 8,
  },
  noteItem: {
    flexDirection: 'row',
    marginBottom: 6,
    alignItems: 'flex-start',
  },
  noteIcon: {
    marginRight: 8,
    marginTop: 2,
  },
  noteText: {
    flex: 1,
    fontSize: 13,
    color: COLORS.text.secondary,
    lineHeight: 18,
  },
  websiteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background.blue,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  websiteIcon: {
    marginRight: 6,
  },
  websiteButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
  },
  footerCard: {
    backgroundColor: COLORS.background.light,
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    marginBottom: 32,
  },
  footerTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text.primary,
    marginBottom: 8,
  },
  footerText: {
    fontSize: 14,
    color: COLORS.text.secondary,
    lineHeight: 20,
  },
});

