/**
 * API Key 获取指引页面
 *
 * 顺序与存在性由 `useAppFacades().modelConfig` 的 preset ViewState 决定，本地化步骤
 * 与官方控制台链接从 `apiProviders.ts` 的 `PROVIDER_CREDENTIAL_GUIDES` 读取。自定义
 * 模式只显示通用安全说明，未知 preset 显示固定 unsupported 文案，绝不猜测 URL。
 */
import React, {useCallback, useState} from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Linking,
} from 'react-native';
import {useRoute, useFocusEffect} from '@react-navigation/native';
import type {RouteProp} from '@react-navigation/native';
import type {RootStackParamList} from '@shared/types/navigation';
import type {ProviderPresetV1} from '@core/engine/operateRuntime/model/ModelProviderContracts';
import {AppIcon, IconNames} from '@shared/components/Icon';
import {PageLayout} from '@shared/components/PageLayout';
import {COLORS} from '@shared/constants';
import {
  PROVIDER_CREDENTIAL_GUIDES,
  GENERIC_CUSTOM_CREDENTIAL_GUIDANCE,
  UNSUPPORTED_CREDENTIAL_GUIDANCE,
  isAllowedGuideUrl,
} from '@shared/constants/apiProviders';
import {useAppFacades} from '../../../application/facades/AppFacadesContext';
import type {ProviderPresetId} from '../../../application/facades/UiRuntimeContracts';

type RoutePropType = RouteProp<RootStackParamList, 'APIKeyGuide'>;

export const APIKeyGuideScreen: React.FC = () => {
  const route = useRoute<RoutePropType>();
  const {modelConfig} = useAppFacades();
  const presetIdParam = route.params?.presetId;
  const mode = route.params?.mode;
  const [order, setOrder] = useState<readonly ProviderPresetId[]>([]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      modelConfig.getViewState({list: 'unified'}).then(next => {
        if (active) {
          setOrder(next.presets.map(preset => preset.id));
        }
      });
      return () => {
        active = false;
      };
    }, [modelConfig]),
  );

  const openConsole = async (preset: ProviderPresetV1, url: string) => {
    if (!isAllowedGuideUrl(preset, url)) {
      console.warn('guide_url_rejected');
      return;
    }
    try {
      await Linking.openURL(url);
    } catch {
      console.warn('guide_url_open_failed');
    }
  };

  const renderGuide = (preset: ProviderPresetId) => {
    const guide = PROVIDER_CREDENTIAL_GUIDES[preset];
    if (!guide) {
      return null;
    }
    return (
      <View key={preset} style={styles.guideCard}>
        <Text style={styles.cardTitle}>{guide.title}</Text>
        <View style={styles.stepsContainer}>
          {guide.steps.map((step, index) => (
            <View key={index} style={styles.stepItem}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>{index + 1}</Text>
              </View>
              <Text style={styles.stepText}>{step}</Text>
            </View>
          ))}
        </View>
        {guide.notes && guide.notes.length > 0 ? (
          <View style={styles.notesContainer}>
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
        ) : null}
        <TouchableOpacity
          style={styles.websiteButton}
          onPress={() => openConsole(preset, guide.consoleUrl)}>
          <AppIcon
            name={IconNames.arrowRight}
            size={16}
            color={COLORS.primary}
            style={styles.websiteIcon}
          />
          <Text style={styles.websiteButtonText}>访问 {guide.consoleName}</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const isCustom = mode === 'custom';
  const unknownPreset =
    !!presetIdParam && !PROVIDER_CREDENTIAL_GUIDES[presetIdParam];
  const guidesToRender: readonly ProviderPresetId[] = presetIdParam
    ? [presetIdParam]
    : order;

  return (
    <PageLayout
      title="API Key 获取指引"
      showBackButton
      backgroundColor={COLORS.background.default}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}>
        {isCustom ? (
          <View style={styles.introCard}>
            <AppIcon
              name={IconNames.info}
              size={24}
              color={COLORS.primary}
              style={styles.introIcon}
            />
            <Text style={styles.introTitle}>自定义服务商</Text>
            <Text style={styles.introText}>
              {GENERIC_CUSTOM_CREDENTIAL_GUIDANCE}
            </Text>
          </View>
        ) : unknownPreset ? (
          <View style={styles.introCard}>
            <Text style={styles.introText}>
              {UNSUPPORTED_CREDENTIAL_GUIDANCE}
            </Text>
          </View>
        ) : (
          <>
            {!presetIdParam ? (
              <View style={styles.introCard}>
                <AppIcon
                  name={IconNames.info}
                  size={24}
                  color={COLORS.primary}
                  style={styles.introIcon}
                />
                <Text style={styles.introTitle}>什么是 API Key？</Text>
                <Text style={styles.introText}>
                  API Key 是访问模型服务的密钥。每个服务商都有自己的获取方式，请按下方指引操作。密钥只保存在这台手机。
                </Text>
              </View>
            ) : null}
            {guidesToRender.map(renderGuide)}
          </>
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
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text.primary,
    marginBottom: 12,
  },
  stepsContainer: {
    marginBottom: 16,
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
});
