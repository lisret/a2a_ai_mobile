import {
  sanitizeLog,
  sanitizeLogText,
  sanitizeLogValue,
} from '../../../../core/engine/privacy/sanitizeLog';

describe('sanitizeLogText', () => {
  it('redacts Authorization headers and secret assignments', () => {
    expect(sanitizeLogText('Authorization: Bearer sk-abc123')).toContain(
      '[REDACTED]',
    );
    expect(sanitizeLogText('Authorization: Bearer sk-abc123')).not.toContain(
      'sk-abc123',
    );
    expect(sanitizeLogText('apiKey=super-secret-value')).toContain(
      '[REDACTED]',
    );
    expect(sanitizeLogText('apiKey=super-secret-value')).not.toContain(
      'super-secret-value',
    );
  });

  it('redacts base64 image data URIs', () => {
    const text =
      'shot data:image/jpeg;base64,/9j/4AAQSkZJRgABAgAAAQABAAD/2wBD end';
    const result = sanitizeLogText(text);
    expect(result).toContain('[CONTENT_REDACTED]');
    expect(result).not.toContain('/9j/4AAQSkZJRgABAgAAAQABAAD');
  });

  it('truncates an oversized individual string', () => {
    const result = sanitizeLogText('a'.repeat(2000));
    expect(result.length).toBeLessThanOrEqual(512 + '[Truncated]'.length);
    expect(result).toContain('[Truncated]');
  });
});

describe('sanitizeLogValue', () => {
  it('redacts credential keys and content keys distinctly', () => {
    const result = sanitizeLogValue({
      apiKey: 'sk-live-1',
      token: 'tok',
      screenshot: 'data:image/png;base64,AAAA',
      instruction: 'open the settings app',
      response: 'model said things',
      conversationHistory: [{role: 'user'}],
      keep: 'visible',
    }) as Record<string, unknown>;
    expect(result.apiKey).toBe('[REDACTED]');
    expect(result.token).toBe('[REDACTED]');
    expect(result.screenshot).toBe('[CONTENT_REDACTED]');
    expect(result.instruction).toBe('[CONTENT_REDACTED]');
    expect(result.response).toBe('[CONTENT_REDACTED]');
    expect(result.conversationHistory).toBe('[CONTENT_REDACTED]');
    expect(result.keep).toBe('visible');
  });

  it('redacts nested content keys', () => {
    const result = sanitizeLogValue({
      outer: {inner: {screenshot: 'x', ok: 1}},
    }) as Record<string, Record<string, Record<string, unknown>>>;
    expect(result.outer.inner.screenshot).toBe('[CONTENT_REDACTED]');
    expect(result.outer.inner.ok).toBe(1);
  });

  it('reduces Error objects to name and sanitized message with no stack', () => {
    const error = new Error('Authorization: Bearer sk-secret failed');
    const result = sanitizeLogValue(error) as Record<string, unknown>;
    expect(result.name).toBe('Error');
    expect(result.message).toContain('[REDACTED]');
    expect(result).not.toHaveProperty('stack');
    expect(JSON.stringify(result)).not.toContain('sk-secret');
  });

  it('marks cyclic references without throwing', () => {
    const cyclic: Record<string, unknown> = {a: 1};
    cyclic.self = cyclic;
    const result = sanitizeLogValue(cyclic) as Record<string, unknown>;
    expect(result.a).toBe(1);
    expect(result.self).toBe('[Circular]');
  });

  it('bounds deep structures at depth 6', () => {
    let node: Record<string, unknown> = {leaf: 'deep'};
    for (let i = 0; i < 12; i += 1) {
      node = {child: node};
    }
    const serialized = JSON.stringify(sanitizeLogValue(node));
    expect(serialized).toContain('[Truncated]');
  });

  it('bounds large arrays at 50 entries', () => {
    const result = sanitizeLogValue(
      Array.from({length: 200}, (_, i) => i),
    ) as unknown[];
    expect(result.length).toBeLessThanOrEqual(51);
    expect(result[result.length - 1]).toBe('[Truncated]');
  });

  it('does not mutate the original object', () => {
    const original = {apiKey: 'sk-1', nested: {screenshot: 'x'}};
    sanitizeLogValue(original);
    expect(original.apiKey).toBe('sk-1');
    expect(original.nested.screenshot).toBe('x');
  });
});

describe('sanitizeLog', () => {
  it('returns a sanitized message and data pair', () => {
    const entry = sanitizeLog('user prompt', {apiKey: 'sk', instruction: 'go'});
    expect(entry.message).toBe('user prompt');
    expect(entry.data).toEqual({
      apiKey: '[REDACTED]',
      instruction: '[CONTENT_REDACTED]',
    });
  });

  it('omits data when none is provided', () => {
    expect(sanitizeLog('hi')).toEqual({message: 'hi'});
  });

  it('caps the final serialized entry at 16 KiB', () => {
    const big = {blob: 'x'.repeat(64 * 1024)};
    const entry = sanitizeLog('big', big);
    expect(JSON.stringify(entry).length).toBeLessThanOrEqual(16 * 1024 + 64);
  });
});
