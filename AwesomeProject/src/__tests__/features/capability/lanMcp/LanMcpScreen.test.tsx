import React from 'react';
import {fireEvent, render, waitFor} from '@testing-library/react-native';
import {LanMcpScreen} from '../../../../features/capability/screens/LanMcpScreen';
import {lanMcpService} from '../../../../features/capability/services/lanMcp/LanMcpService';

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (cb: () => () => void) => require('react').useEffect(cb, []),
}));
jest.mock('@shared/components/PageLayout', () => ({
  PageLayout: ({children}: {children: React.ReactNode}) => children,
}));
jest.mock(
  '../../../../features/capability/services/lanMcp/LanMcpService',
  () => ({
    lanMcpService: {
      getStatus: jest.fn(),
      startService: jest.fn(),
      stopService: jest.fn(),
      setConnectionCode: jest.fn(),
      exportConnectionFile: jest.fn(),
    },
  }),
);
const service = lanMcpService as jest.Mocked<typeof lanMcpService>;
const stopped = {
  running: false,
  endpoint: null,
  codeConfigured: false,
  supported: true,
  preview: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  service.getStatus.mockResolvedValue(stopped);
});

it('requires a valid saved connection code before starting the service', async () => {
  const ui = render(<LanMcpScreen />);
  await waitFor(() => expect(ui.getByText('已关闭')).toBeTruthy());
  fireEvent(ui.getByLabelText('开启 MCP 服务'), 'valueChange', true);
  expect(ui.getByPlaceholderText('输入新的连接码')).toBeTruthy();
  expect(service.startService).not.toHaveBeenCalled();
  fireEvent.changeText(ui.getByPlaceholderText('输入新的连接码'), 'short');
  fireEvent.press(ui.getByText('保存'));
  expect(service.setConnectionCode).not.toHaveBeenCalled();
  service.setConnectionCode.mockResolvedValue({
    ...stopped,
    codeConfigured: true,
  });
  fireEvent.changeText(
    ui.getByPlaceholderText('输入新的连接码'),
    'Test-123456789',
  );
  fireEvent.press(ui.getByText('保存'));
  await waitFor(() =>
    expect(ui.queryByPlaceholderText('输入新的连接码')).toBeNull(),
  );
  expect(service.setConnectionCode).toHaveBeenCalledWith('Test-123456789');
  expect(ui.getByText('已设置 · 点击更换')).toBeTruthy();
  expect(service.startService).not.toHaveBeenCalled();
});

it('does not claim to be running when native startup fails', async () => {
  service.getStatus.mockResolvedValue({...stopped, codeConfigured: true});
  service.startService.mockRejectedValue(
    new Error('请连接 Wi-Fi 后再开启服务。'),
  );
  const ui = render(<LanMcpScreen />);
  await waitFor(() => expect(ui.getByText('已关闭')).toBeTruthy());
  fireEvent(ui.getByLabelText('开启 MCP 服务'), 'valueChange', true);
  await waitFor(() =>
    expect(ui.getByText('请连接 Wi-Fi 后再开启服务。')).toBeTruthy(),
  );
  expect(ui.getByLabelText('开启 MCP 服务').props.value).toBe(false);
});

it('stops a running service and clears its advertised address', async () => {
  service.getStatus.mockResolvedValue({
    ...stopped,
    codeConfigured: true,
    running: true,
    endpoint: 'http://192.168.1.8:8765/mcp',
  });
  service.stopService.mockResolvedValue({...stopped, codeConfigured: true});
  const ui = render(<LanMcpScreen />);
  await waitFor(() => expect(ui.getByText('已开启')).toBeTruthy());
  fireEvent(ui.getByLabelText('开启 MCP 服务'), 'valueChange', false);
  await waitFor(() => expect(ui.getByText('已关闭')).toBeTruthy());
  expect(ui.queryByText('http://192.168.1.8:8765/mcp')).toBeNull();
});

it('exports using fresh native status instead of a stale rendered address', async () => {
  service.getStatus.mockResolvedValueOnce({
    ...stopped,
    codeConfigured: true,
    running: true,
    endpoint: 'http://192.168.1.8:8765/mcp',
  });
  service.exportConnectionFile.mockResolvedValue('cancelled');
  const ui = render(<LanMcpScreen />);
  await waitFor(() => expect(ui.getByText('已开启')).toBeTruthy());
  fireEvent.press(ui.getByText('导出连接文件'));
  await waitFor(() => expect(service.exportConnectionFile).toHaveBeenCalled());
  const [contents, filename] = service.exportConnectionFile.mock.calls[0];
  expect(contents).toContain('导出时服务未开启');
  expect(contents).not.toContain('192.168.1.8');
  expect(filename).toBe('nono-mcp-connection.md');
});
