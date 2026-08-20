import React, {useCallback, useState} from 'react';
import {
  ScrollView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import {useNavigation, useRoute} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import type {RouteProp} from '@react-navigation/native';
import type {RootStackParamList} from '@shared/types/navigation';
import {PageLayout} from '@shared/components/PageLayout';
import {COLORS} from '@shared/constants';
import {nonoConfigService} from '@features/capability/services/NonoConfigService';
import type {MemoryItem} from '@features/capability/types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type ScreenRoute = RouteProp<RootStackParamList, 'ErrandDetail'>;

export const ErrandDetailScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const {errandId} = useRoute<ScreenRoute>().params;
  const [item, setItem] = useState<MemoryItem | null>(null);

  React.useEffect(() => {
    nonoConfigService.getMemories().then(items => {
      setItem(items.find(entry => entry.id === errandId) || null);
    });
  }, [errandId]);

  const save = useCallback(async () => {
    if (!item) return;
    const title = item.title.trim();
    if (!title) {
      Alert.alert('请写下要办的事');
      return;
    }
    if (item.errandType === 'schedule' && !item.when?.trim()) {
      Alert.alert('定时需要写下时间');
      return;
    }
    await nonoConfigService.updateMemory({...item, title});
    navigation.goBack();
  }, [item, navigation]);

  if (!item) return null;

  return (
    <PageLayout title="交代详情" showBackButton>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.label}>要办的事</Text>
        <TextInput
          style={styles.input}
          value={item.title}
          onChangeText={title => setItem({...item, title})}
        />
        <Text style={styles.label}>类型</Text>
        <View style={styles.seg}>
          {(
            [
              ['once', '单次'],
              ['schedule', '定时'],
            ] as const
          ).map(([key, label]) => (
            <TouchableOpacity
              key={key}
              style={[
                styles.segBtn,
                item.errandType === key && styles.segBtnOn,
              ]}
              onPress={() =>
                setItem({
                  ...item,
                  errandType: key,
                  when: key === 'schedule' ? item.when : '',
                })
              }>
              <Text
                style={[
                  styles.segText,
                  item.errandType === key && styles.segTextOn,
                ]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.caption}>
          {item.errandType === 'schedule'
            ? '到点再办。这一次办完仍留在交代里，直到取消。'
            : '说一次，记着去办。办完进入「做过的事」。'}
        </Text>
        {item.errandType === 'schedule' ? (
          <>
            <Text style={styles.label}>时间</Text>
            <TextInput
              style={styles.input}
              value={item.when || ''}
              onChangeText={when => setItem({...item, when})}
              placeholder="例如 周五 18:00"
            />
          </>
        ) : null}
        <TouchableOpacity style={styles.primary} onPress={save}>
          <Text style={styles.primaryText}>保存</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.danger}
          onPress={() =>
            Alert.alert('取消这件交代？', '已经做过的记录仍留在「做过的事」。', [
              {text: '返回', style: 'cancel'},
              {
                text: '取消交代',
                style: 'destructive',
                onPress: async () => {
                  await nonoConfigService.deleteMemory(item.id);
                  navigation.goBack();
                },
              },
            ])
          }>
          <Text style={styles.dangerText}>取消这件交代</Text>
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
  label: {
    marginBottom: 8,
    color: COLORS.text.secondary,
    fontSize: 11,
    fontWeight: '700',
  },
  input: {
    minHeight: 48,
    marginBottom: 16,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    color: COLORS.text.primary,
  },
  caption: {
    marginTop: -8,
    marginBottom: 16,
    color: COLORS.text.secondary,
    fontSize: 11,
    lineHeight: 16,
  },
  seg: {
    marginBottom: 16,
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.74)',
  },
  segBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segBtnOn: {
    backgroundColor: COLORS.violet,
  },
  segText: {
    color: '#5d6070',
    fontSize: 12,
    fontWeight: '700',
  },
  segTextOn: {
    color: '#ffffff',
  },
  primary: {
    minHeight: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.violet,
  },
  primaryText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  danger: {
    minHeight: 52,
    marginTop: 10,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff0ec',
  },
  dangerText: {
    color: COLORS.error,
    fontSize: 14,
    fontWeight: '700',
  },
});
