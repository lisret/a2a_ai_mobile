import React from 'react';
import {ScrollView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {ConfirmModal} from '@shared/components/ConfirmModal';
import {PageLayout} from '@shared/components/PageLayout';
import {NoNoMascot} from '@shared/components/NoNoMascot';
import {AppMark} from '@shared/components/AppMark';
import {SectionHeading} from '@shared/ui/nono';
import {COLORS, type SuggestionItem} from '@shared/constants';
import {TaskInputCard} from './TaskInputCard';
import {ExecutionCard} from './ExecutionCard';
import {SuggestionChips} from './SuggestionChips';
import type {TaskStep} from '@core/engine/taskEngine';

const QUICK_TASK_COLORS = ['#ddd9ff', '#ffe0d6', '#d9efeb', '#efe4ff'];

export type TaskStepViewModel = {id: string; label: string; completed: boolean};

export type NoNoHomeViewProps = {
  input: string;
  executing: boolean;
  displayInstruction: string;
  steps: readonly TaskStep[];
  currentStep?: number;
  suggestions: readonly SuggestionItem[];
  quickTasks: readonly SuggestionItem[];
  stopConfirmVisible: boolean;
  onInputChange(value: string): void;
  onClear(): void;
  onStart(): void;
  onRequestStop(): void;
  onConfirmStop(): void;
  onCancelStop(): void;
  onSuggestionSelect(value: string): void;
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
  onInputChange,
  onClear,
  onStart,
  onRequestStop,
  onConfirmStop,
  onCancelStop,
  onSuggestionSelect,
}) => {
  return (
    <PageLayout
      title={executing ? '任务执行' : 'NoNo'}
      kicker={executing ? 'LIVE TASK' : 'YOUR AI COMPANION'}
      headerAccessory={executing ? <AppMark size={48} /> : <NoNoMascot size={54} />}
      backgroundColor={COLORS.background.default}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        {!executing && (
          <View style={styles.greetingSection}>
            <Text style={styles.greetingTitle}>
              今天想让手机{'\n'}替你完成什么？
            </Text>
            <Text style={styles.greetingSubtitle}>
              NoNo 会先理解目标，再在关键操作前向你确认。
            </Text>
          </View>
        )}

        {executing ? (
          <ExecutionCard
            instruction={displayInstruction || input || '执行中...'}
            steps={steps as TaskStep[]}
            currentStep={currentStep}
            onStop={onRequestStop}
          />
        ) : (
          <TaskInputCard
            value={input}
            onChangeText={onInputChange}
            onClear={onClear}
            onStart={onStart}
            disabled={executing}
          />
        )}

        {!executing && (
          <>
            <SectionHeading title="试试这样说" hint="点击即可填入" />
            <SuggestionChips suggestions={suggestions} onSelect={onSuggestionSelect} />
            <SectionHeading title="快捷任务" hint="安全演示" />
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
        )}
      </ScrollView>

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
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 120,
  },
  greetingSection: {
    paddingTop: 10,
  },
  greetingTitle: {
    maxWidth: 310,
    fontSize: 31,
    fontWeight: '800',
    color: COLORS.text.primary,
    lineHeight: 34,
    letterSpacing: -1,
  },
  greetingSubtitle: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 20,
    color: COLORS.text.secondary,
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  quickTask: {
    width: '48%',
    minHeight: 86,
    padding: 14,
    overflow: 'hidden',
    borderRadius: 19,
  },
  quickTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text.primary,
  },
  quickBody: {
    marginTop: 7,
    fontSize: 10,
    color: '#676a78',
  },
});
