import {nextDueAfter, parseErrandTime} from '@core/engine/errand/domain/parseErrandTime';

// Friday 2024-01-05 10:00 UTC+8 (Beijing offset = 480 minutes).
const CONTEXT = {nowMs: Date.UTC(2024, 0, 5, 2, 0, 0), timeZoneOffsetMinutes: 480};

describe('parseErrandTime', () => {
  it('parses explicit weekly time and rejects ambiguity', () => {
    expect(parseErrandTime('每周五 18:00', CONTEXT)).toEqual({
      kind: 'weekly',
      weekday: 5,
      hour: 18,
      minute: 0,
      timeZoneOffsetMinutes: 480,
    });
    expect(() => parseErrandTime('下班前', CONTEXT)).toThrow('errand_time_ambiguous');
  });

  it('parses 明天 HH:mm as the next local calendar day', () => {
    const schedule = parseErrandTime('明天 09:30', CONTEXT);
    expect(schedule).toEqual({
      kind: 'once',
      dueAtMs: Date.UTC(2024, 0, 6, 1, 30, 0),
      timeZoneOffsetMinutes: 480,
    });
  });

  it('parses 周X HH:mm as the next occurrence of that weekday, skipping an already-passed time today', () => {
    // Today is Friday; 周五 08:00 local has already passed (now is 10:00 local).
    const schedule = parseErrandTime('周五 08:00', CONTEXT);
    expect(schedule).toEqual({
      kind: 'once',
      dueAtMs: Date.UTC(2024, 0, 12, 0, 0, 0),
      timeZoneOffsetMinutes: 480,
    });
  });

  it('parses 周X HH:mm as today when the time has not passed yet', () => {
    const schedule = parseErrandTime('周五 20:00', CONTEXT);
    expect(schedule).toEqual({
      kind: 'once',
      dueAtMs: Date.UTC(2024, 0, 5, 12, 0, 0),
      timeZoneOffsetMinutes: 480,
    });
  });

  it('parses ISO-8601 with an explicit timezone and derives the offset', () => {
    expect(parseErrandTime('2024-03-01T09:00:00+02:00', CONTEXT)).toEqual({
      kind: 'once',
      dueAtMs: Date.parse('2024-03-01T09:00:00+02:00'),
      timeZoneOffsetMinutes: 120,
    });
    expect(parseErrandTime('2024-03-01T09:00:00Z', CONTEXT)).toEqual({
      kind: 'once',
      dueAtMs: Date.parse('2024-03-01T09:00:00Z'),
      timeZoneOffsetMinutes: 0,
    });
  });

  it('rejects ISO-8601 without a timezone designator', () => {
    expect(() => parseErrandTime('2024-03-01T09:00:00', CONTEXT)).toThrow('errand_time_ambiguous');
  });

  it('rejects an out-of-range time', () => {
    expect(() => parseErrandTime('每周五 24:00', CONTEXT)).toThrow('errand_time_ambiguous');
    expect(() => parseErrandTime('明天 09:60', CONTEXT)).toThrow('errand_time_ambiguous');
  });
});

describe('nextDueAfter', () => {
  it('returns the fixed due time for a once schedule regardless of the reference time', () => {
    const schedule = {kind: 'once' as const, dueAtMs: 1_700_000_000_000, timeZoneOffsetMinutes: 480};
    expect(nextDueAfter(schedule, 0)).toBe(1_700_000_000_000);
    expect(nextDueAfter(schedule, 1_800_000_000_000)).toBe(1_700_000_000_000);
  });

  it('advances a weekly schedule to next week once the current occurrence has passed', () => {
    const schedule = {kind: 'weekly' as const, weekday: 5, hour: 18, minute: 0, timeZoneOffsetMinutes: 480};
    const thisWeek = Date.UTC(2024, 0, 5, 10, 0, 0);
    const nextWeek = Date.UTC(2024, 0, 12, 10, 0, 0);
    expect(nextDueAfter(schedule, thisWeek)).toBe(nextWeek);
  });
});
