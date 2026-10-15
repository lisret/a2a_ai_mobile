import {ASR_PINS} from '../../../../features/task/asr/AsrArtifactPins';

describe('ASR_PINS', () => {
  it('pins builtin and upgrade with sha256', () => {
    expect(ASR_PINS.builtin.id).toBe('builtin');
    expect(ASR_PINS.upgrade.id).toBe('upgrade');
    expect(ASR_PINS.builtin.archiveSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(ASR_PINS.upgrade.archiveSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(ASR_PINS.builtin.archiveBytes).toBeGreaterThan(1_000_000);
    expect(ASR_PINS.upgrade.archiveBytes).toBeGreaterThan(
      ASR_PINS.builtin.archiveBytes,
    );
    expect(ASR_PINS.builtin.files.some(f => f.name.endsWith('tokens.txt'))).toBe(
      true,
    );
  });

  it('does not use jsdelivr or unpkg', () => {
    const blob = JSON.stringify(ASR_PINS);
    expect(blob).not.toMatch(/jsdelivr|unpkg|cdnjs/);
  });
});
