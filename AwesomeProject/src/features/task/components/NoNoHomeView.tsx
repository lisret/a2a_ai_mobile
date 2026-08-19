import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type TextInput,
} from 'react-native';
import {ConfirmModal} from '@shared/components/ConfirmModal';
import {PageLayout} from '@shared/components/PageLayout';
import {AppMark} from '@shared/components/AppMark';
import {SectionHeading} from '@shared/ui/nono';
import {COLORS, type SuggestionItem} from '@shared/constants';
import {AvatarStage, type AvatarMood} from './AvatarStage';
import {AvatarInputDock} from './AvatarInputDock';
import {ExecutionCard} from './ExecutionCard';
import {SuggestionChips} from './SuggestionChips';
import type {TaskStep} from '@core/engine/taskEngine';

const QUICK_TASK_COLORS = ['#ddd9ff', '#ffe0d6', '#d9efeb', '#efe4ff'];

export type NoNoHomeViewProps = {
  input: string;
  executing: boolean;
  displayInstruction: string;
  steps: readonly TaskStep[];
  currentStep?: number;
  suggestions: readonly SuggestionItem[];
  quickTasks: readonly SuggestionItem[];
  stopConfirmVisible: boolean;
  bubble?: string;
  mood?: AvatarMood;
  inputRef?: React.Ref<TextInput>;
  onInputChange(value: string): void;
  onClear(): void;
  onStart(): void;
  onRequestStop(): void;
  onConfirmStop(): void;
  onCancelStop(): void;
  onSuggestionSelect(value: string): void;
  onAvatarPress?: () => void;
};

export const NoNoHomeView: React.FC<NoNoHomeViewProps> = ({
  input,
  executing,
  displayInstruction,
  steps,
  currentStep,
  suggestions,
  quickTasks,
  stopConfirmVisible,
  bubble = '点我，或在下面打字，剩下的交给我。',
  mood = 'idle',
  inputRef,
  onInputChange,
  onClear,
  onStart,
  onRequestStop,
  onConfirmStop,
  onCancelStop,
  onSuggestionSelect,
  onAvatarPress,
}) => {
  return (
    <PageLayout
      title={executing ? '任务执行' : 'NoNo'}
      kicker={executing ? 'LIVE TASK' : 'YOUR AI COMPANION'}
      headerAccessory={executing ? <AppMark size={48} /> : null}
      backgroundColor={COLORS.background.default}
      contentStyle={styles.pageContent}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <AvatarStage
          bubble={bubble}
          mood={mood}
          compact={executing}
          enable3d={false}
          onPress={executing ? undefined : onAvatarPress}
        />

        {executing ? (
          <ScrollView
            style={styles.execScroll}
            contentContainerStyle={styles.execContent}
            showsVerticalScrollIndicator={false}>
            <ExecutionCard
              instruction={displayInstruction || input || '执行中...'}
              steps={steps as TaskStep[]}
              currentStep={currentStep}
              onStop={onRequestStop}
            />
          </ScrollView>
        ) : (
          <View style={styles.bottomBlock}>
            <SectionHeading title="试试这样说" hint="点击即可填入" style={styles.heading} />
            <SuggestionChips suggestions={suggestions} onSelect={onSuggestionSelect} />
            {quickTasks.length > 0 ? (
              <>
                <SectionHeading title="快捷任务" hint="安全演示" style={styles.heading} />
                <View style={styles.quickGrid}>
                  {quickTasks.map((item, index) => (
                    <TouchableOpacity
                      key={item.label}
                      style={[styles.quickTask, {backgroundColor: QUICK_TASK_COLORS[index]}]}
                      onPress={() => onSuggestionSelect(item.value)}
                      activeOpacity={0.85}
                      accessibilityRole="button"
                      accessibilityLabel={item.label}>
                      <Text style={styles.quickTitle}>{item.label}</Text>
                      <Text style={styles.quickBody}>{item.value.split('：')[1]}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            ) : null}
            <AvatarInputDock
              ref={inputRef}
              value={input}
              onChangeText={onInputChange}
              onStart={onStart}
              onClear={onClear}
              disabled={executing}
            />
          </View>
        )}
      </KeyboardAvoidingView>

      <ConfirmModal
        visible={stopConfirmVisible}
        title="确定终止当前任务？"
        message="NoNo 会停止后续操作；已经在其他应用中完成的操作无法自动撤销。"
        confirmText="确认终止"
        cancelText="取消"
        onConfirm={onConfirmStop}
        onCancel={onCancelStop}
        danger
      />
    </PageLayout>
  );
};

const styles = StyleSheet.create({
  pageContent: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  execScroll: {
    flex: 1,
  },
  execContent: {
    paddingHorizontal: 18,
    paddingBottom: 120,
  },
  bottomBlock: {
    paddingHorizontal: 18,
    paddingBottom: 120,
    paddingTop: 4,
    gap: 8,
  },
  heading: {
    marginTop: 6,
    marginBottom: 6,
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  quickTask: {
    width: '48%',
    minHeight: 72,
    padding: 12,
    overflow: 'hidden',
    borderRadius: 19,
  },
  quickTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text.primary,
  },
  quickBody: {
    marginTop: 6,
    fontSize: 10,
    color: '#676a78',
  },
});
