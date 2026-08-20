import React, {useCallback, useState} from 'react';
import {ScrollView, StyleSheet} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {PageLayout} from '@shared/components/PageLayout';
import {nonoConfigService} from '../services/NonoConfigService';
import {SettingToggle, InfoCard} from '../components/CapabilityCards';
import type {CapabilityFlags} from '../types';

export const ErrandsScreen: React.FC = () => {
  const [flags, setFlags] = useState<CapabilityFlags | null>(null);

  useFocusEffect(
    useCallback(() => {
      nonoConfigService.getCapabilities().then(setFlags);
    }, []),
  );

  if (!flags) return null;

  return (
    <PageLayout title="交代的事" showBackButton>
      <ScrollView contentContainerStyle={styles.content}>
        <SettingToggle
          title="接下交代"
          body="首页说话就可以交代。内容在活动 · 它还记得。"
          value={flags.errands}
          onValueChange={async value => {
            setFlags(await nonoConfigService.setCapability('errands', value));
          }}
        />
        <InfoCard
          title="单次"
          body="说一次，记着去办。办完从交代里拿掉，进入「做过的事」。"
        />
        <InfoCard
          title="定时"
          body="到点再办。这一次办完仍留在交代里，直到你取消。"
        />
        <InfoCard
          title="用手，不用另一颗大脑"
          body="到点后走已开启的「替我操作手机」或 OpenClaw。风险操作仍要确认。"
        />
      </ScrollView>
    </PageLayout>
  );
};

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 18,
    paddingBottom: 40,
  },
});
