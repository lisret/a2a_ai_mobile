import React, {useCallback, useRef, useState} from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {PageLayout} from '@shared/components/PageLayout';
import {COLORS} from '@shared/constants';
import {lanMcpService} from '../services/lanMcp/LanMcpService';
import {
  validateConnectionCode,
  type LanMcpStatus,
} from '../services/lanMcp/LanMcpContracts';
import {
  buildConnectionGuide,
  CONNECTION_GUIDE_FILENAME,
} from '../services/lanMcp/buildConnectionGuide';

export const LanMcpScreen: React.FC = () => {
  const [status, setStatus] = useState<LanMcpStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editingCode, setEditingCode] = useState(false);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const working = useRef(false);
  const focused = useRef(false);
  const revision = useRef(0);

  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      let active = true;
      const refresh = async () => {
        if (working.current) return;
        const currentRevision = revision.current;
        try {
          const next = await lanMcpService.getStatus();
          if (
            active &&
            currentRevision === revision.current &&
            !working.current
          ) {
            setStatus(next);
            setError(previous =>
              previous === '暂时无法读取服务状态，将自动重试。' ? '' : previous,
            );
          }
        } catch {
          if (
            active &&
            currentRevision === revision.current &&
            !working.current
          ) {
            setStatus(null);
            setError('暂时无法读取服务状态，将自动重试。');
          }
        }
      };
      void refresh();
      const interval = setInterval(refresh, 3000);
      return () => {
        active = false;
        focused.current = false;
        clearInterval(interval);
        setCode('');
        setEditingCode(false);
      };
    }, []),
  );

  const closeEditor = () => {
    if (working.current) return;
    setEditingCode(false);
    setCode('');
    setCodeError('');
  };
  const openEditor = () => {
    setCode('');
    setCodeError('');
    setEditingCode(true);
  };
  const run = async (action: () => Promise<void>) => {
    if (working.current) return;
    working.current = true;
    revision.current += 1;
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (failure) {
      if (focused.current) {
        const message =
          failure instanceof Error ? failure.message : '操作未完成，请重试。';
        setError(message);
      }
    } finally {
      working.current = false;
      setBusy(false);
    }
  };
  const toggleService = (enabled: boolean) => {
    if (enabled && !status?.codeConfigured) {
      openEditor();
      return;
    }
    void run(async () => {
      const next = await (enabled
        ? lanMcpService.startService()
        : lanMcpService.stopService());
      if (focused.current) setStatus(next);
    });
  };
  const saveCode = () => {
    const validation = validateConnectionCode(code);
    if (validation) {
      setCodeError(validation);
      return;
    }
    void run(async () => {
      const next = await lanMcpService.setConnectionCode(code);
      setCode('');
      if (focused.current) {
        setStatus(next);
        setEditingCode(false);
        setCodeError('');
      }
    });
  };
  const exportFile = () =>
    void run(async () => {
      // Always obtain a fresh endpoint: the phone may have changed Wi-Fi since render.
      const current = await lanMcpService.getStatus();
      if (focused.current) setStatus(current);
      const result = await lanMcpService.exportConnectionFile(
        buildConnectionGuide(current),
        CONNECTION_GUIDE_FILENAME,
      );
      if (result === 'saved' && focused.current)
        Alert.alert(
          '已导出连接文件',
          '文件包含 MCP 连接配置与调用说明，不包含服务连接码。',
        );
    });
  const unavailable = !status?.supported;

  return (
    <PageLayout title="局域网模式" showBackButton>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        {status?.preview && (
          <Text style={styles.preview}>交互演示 · 不会启动真实服务</Text>
        )}
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.copy}>
              <Text style={styles.title}>开启服务</Text>
              <Text accessibilityLiveRegion="polite" style={styles.hint}>
                {busy
                  ? '处理中…'
                  : !status
                  ? '正在读取状态'
                  : status.running
                  ? status.preview
                    ? '已开启（演示）'
                    : '已开启'
                  : '已关闭'}
              </Text>
            </View>
            <Switch
              accessibilityLabel="开启 MCP 服务"
              value={status?.running ?? false}
              disabled={busy || unavailable}
              onValueChange={toggleService}
              trackColor={{false: '#d8d7df', true: COLORS.violet}}
              thumbColor="#ffffff"
            />
          </View>
          {status?.running && status.endpoint && (
            <View style={styles.endpoint}>
              <Text style={styles.hint}>
                {status.preview ? '示例地址' : 'MCP 服务地址'}
              </Text>
              <Text selectable style={styles.address}>
                {status.endpoint}
              </Text>
            </View>
          )}
          <Text style={styles.hint}>
            {status?.message || '手机与智能体需处于同一 Wi-Fi 网络。'}
          </Text>
        </View>

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="设置服务连接码"
          style={[
            styles.card,
            styles.row,
            (busy || unavailable || status?.running) && styles.disabled,
          ]}
          disabled={busy || unavailable || status?.running}
          onPress={openEditor}
          activeOpacity={0.85}>
          <View style={styles.copy}>
            <Text style={styles.title}>服务连接码</Text>
            <Text style={styles.hint}>
              {status?.running
                ? '关闭服务后可更换'
                : status?.codeConfigured
                ? '已设置 · 点击更换'
                : '未设置 · 开启前请先设置'}
            </Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>
        <Text style={styles.footnote}>
          连接码用于验证调用方。仅在可信 Wi-Fi 使用；局域网 HTTP 不加密。
        </Text>

        <TouchableOpacity
          accessibilityRole="button"
          style={[styles.export, (busy || unavailable) && styles.disabled]}
          disabled={busy || unavailable}
          onPress={exportFile}
          activeOpacity={0.85}>
          <Text style={styles.exportText}>导出连接文件</Text>
        </TouchableOpacity>
        <Text style={styles.footnote}>
          包含 MCP 连接配置、工具说明与调用示例，不包含连接码。
        </Text>
        {status?.supported && !status.running && (
          <Text style={styles.footnote}>
            服务开启后导出可获得实际地址，关闭时导出说明模板。
          </Text>
        )}
        {!!error && (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        )}
      </ScrollView>

      <Modal
        visible={editingCode}
        transparent
        animationType="fade"
        onRequestClose={closeEditor}>
        <KeyboardAvoidingView
          style={styles.overlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>设置服务连接码</Text>
            <Text style={styles.hint}>
              12–128 位字母、数字、短横线或下划线。请勿复用账号密码。
            </Text>
            <TextInput
              accessibilityLabel="服务连接码"
              placeholder="输入新的连接码"
              value={code}
              onChangeText={value => {
                setCode(value);
                setCodeError('');
              }}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="none"
              maxLength={128}
              editable={!busy}
              style={styles.input}
            />
            {!!codeError && (
              <Text accessibilityRole="alert" style={styles.error}>
                {codeError}
              </Text>
            )}
            {!!error && (
              <Text accessibilityRole="alert" style={styles.error}>
                {error}
              </Text>
            )}
            <View style={styles.actions}>
              <TouchableOpacity
                accessibilityRole="button"
                disabled={busy}
                onPress={closeEditor}
                style={styles.cancel}>
                <Text style={styles.title}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                disabled={busy || !code}
                onPress={saveCode}
                style={[styles.save, (busy || !code) && styles.disabled]}>
                <Text style={styles.exportText}>
                  {busy ? '保存中…' : '保存'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </PageLayout>
  );
};

const styles = StyleSheet.create({
  content: {paddingHorizontal: 18, paddingTop: 8, paddingBottom: 40},
  preview: {fontSize: 10, color: COLORS.violet, marginBottom: 12},
  card: {
    padding: 18,
    marginBottom: 12,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.84)',
  },
  row: {flexDirection: 'row', alignItems: 'center', gap: 12},
  copy: {flex: 1},
  title: {fontSize: 14, fontWeight: '700', color: COLORS.text.primary},
  hint: {
    marginTop: 6,
    fontSize: 11,
    lineHeight: 17,
    color: COLORS.text.secondary,
  },
  footnote: {
    fontSize: 10,
    lineHeight: 16,
    color: COLORS.text.secondary,
    marginHorizontal: 3,
    marginBottom: 12,
  },
  endpoint: {
    marginVertical: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#f2f0fa',
  },
  address: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 18,
    color: COLORS.text.primary,
  },
  chevron: {fontSize: 24, color: COLORS.text.secondary},
  export: {
    padding: 16,
    marginTop: 8,
    marginBottom: 10,
    borderRadius: 16,
    alignItems: 'center',
    backgroundColor: COLORS.violet,
  },
  exportText: {fontSize: 13, fontWeight: '700', color: '#ffffff'},
  disabled: {opacity: 0.45},
  error: {fontSize: 11, lineHeight: 17, color: COLORS.error, marginVertical: 8},
  overlay: {
    flex: 1,
    justifyContent: 'center',
    padding: 22,
    backgroundColor: 'rgba(30,28,48,0.3)',
  },
  dialog: {padding: 22, borderRadius: 24, backgroundColor: '#f8f7f3'},
  dialogTitle: {fontSize: 17, fontWeight: '700', color: COLORS.text.primary},
  input: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#dedbe9',
    borderRadius: 12,
    padding: 12,
    minHeight: 46,
    fontSize: 14,
    color: COLORS.text.primary,
    backgroundColor: '#fff',
  },
  actions: {marginTop: 20, flexDirection: 'row', gap: 10},
  cancel: {
    flex: 1,
    padding: 13,
    borderRadius: 12,
    backgroundColor: '#eeecf4',
    alignItems: 'center',
  },
  save: {
    flex: 1,
    padding: 13,
    borderRadius: 12,
    backgroundColor: COLORS.violet,
    alignItems: 'center',
  },
});
