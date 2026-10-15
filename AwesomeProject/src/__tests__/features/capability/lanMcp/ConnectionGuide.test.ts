import {buildConnectionGuide} from '../../../../features/capability/services/lanMcp/buildConnectionGuide';
import {validateConnectionCode} from '../../../../features/capability/services/lanMcp/LanMcpContracts';

it('exports the live address and discoverable protocol without carrying the connection code', () => {
  const status = {
    running: true,
    endpoint: 'http://192.168.1.35:8765/mcp',
    preview: false,
    connectionCode: 'private-secret-code',
  };
  const guide = buildConnectionGuide(status);
  expect(guide).toContain(status.endpoint);
  expect(guide).not.toContain(status.connectionCode);
  expect(guide).toContain('Bearer <服务连接码>');
  expect(guide).toContain('notifications/initialized');
  expect(guide).toContain('tools/list');
  expect(guide).toContain('phone_screenshot');
  expect(guide).toContain('phone_key');
});

it('does not advertise an old address when the server is stopped', () => {
  const guide = buildConnectionGuide({
    running: false,
    endpoint: 'http://192.168.1.99:8765/mcp',
    preview: false,
  });
  expect(guide).not.toContain('192.168.1.99');
  expect(guide).toContain('导出时服务未开启');
  expect(guide).toContain('<手机局域网IP>');
});

it('exports explicit demo guidance instead of a falsely usable browser endpoint', () => {
  const guide = buildConnectionGuide({
    running: true,
    endpoint: 'http://192.0.2.10:8765/mcp',
    preview: true,
  });
  expect(guide).toContain('没有启动真实 MCP 服务');
  expect(guide).not.toContain('192.0.2.10');
});

it('explains that a running service without an address cannot yet be connected', () => {
  const guide = buildConnectionGuide({
    running: true,
    endpoint: null,
    preview: false,
  });
  expect(guide).toContain('暂时无法获取服务地址');
  expect(guide).not.toContain('导出时服务已开启');
  expect(guide).toContain('<手机局域网IP>');
});

it.each([
  'short',
  'has spaces 12345',
  'abc\n123456789',
  '中文连接码123456789',
  'x'.repeat(129),
])('rejects unsafe or out-of-range connection codes', code => {
  expect(validateConnectionCode(code)).not.toBeNull();
});

it.each(['Alpha_1234567', 'x'.repeat(128)])(
  'accepts codes matching native validation',
  code => {
    expect(validateConnectionCode(code)).toBeNull();
  },
);
