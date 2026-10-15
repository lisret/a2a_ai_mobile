// Deterministic Chinese/ISO errand time parser. Pure arithmetic over epoch
// milliseconds; never touches host Date/Intl timezone behavior.
import {CapabilityError} from '@core/engine/capabilities/shared/CapabilityError';
import type {ErrandSchedule} from './Errand';

export interface ParseErrandTimeContext {
  readonly nowMs: number;
  readonly timeZoneOffsetMinutes: number;
}

const MINUTE_MS = 60_000;

const WEEKDAY_CHARS: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  日: 7,
  天: 7,
};

const ISO_WITH_TZ = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)(Z|[+-]\d{2}:\d{2})$/;
const TOMORROW = /^明天\s*(\d{1,2}):(\d{2})$/;
const WEEKLY = /^每周([一二三四五六日天])\s*(\d{1,2}):(\d{2})$/;
const ONCE_WEEKDAY = /^周([一二三四五六日天])\s*(\d{1,2}):(\d{2})$/;

function assertValidTime(hour: number, minute: number): void {
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new CapabilityError('errand_time_ambiguous');
  }
}

function toLocalParts(epochMs: number, offsetMinutes: number) {
  const local = new Date(epochMs + offsetMinutes * MINUTE_MS);
  const day = local.getUTCDay();
  return {
    year: local.getUTCFullYear(),
    month: local.getUTCMonth(),
    date: local.getUTCDate(),
    isoWeekday: day === 0 ? 7 : day,
  };
}

function fromLocalParts(
  year: number,
  month: number,
  date: number,
  hour: number,
  minute: number,
  offsetMinutes: number,
): number {
  return Date.UTC(year, month, date, hour, minute, 0, 0) - offsetMinutes * MINUTE_MS;
}

function nextWeeklyOccurrenceStrictlyAfter(
  weekday: number,
  hour: number,
  minute: number,
  afterMs: number,
  offsetMinutes: number,
): number {
  const parts = toLocalParts(afterMs, offsetMinutes);
  const dayDelta = (weekday - parts.isoWeekday + 7) % 7;
  let candidate = fromLocalParts(parts.year, parts.month, parts.date + dayDelta, hour, minute, offsetMinutes);
  if (candidate <= afterMs) {
    candidate = fromLocalParts(parts.year, parts.month, parts.date + dayDelta + 7, hour, minute, offsetMinutes);
  }
  return candidate;
}

function parseNumericOffset(tz: string): number {
  const sign = tz.startsWith('-') ? -1 : 1;
  const hh = Number(tz.slice(1, 3));
  const mm = Number(tz.slice(4, 6));
  return sign * (hh * 60 + mm);
}

function parseIsoWithTimezone(input: string): ErrandSchedule | null {
  const match = input.match(ISO_WITH_TZ);
  if (!match) {
    return null;
  }
  const dueAtMs = Date.parse(input);
  if (Number.isNaN(dueAtMs)) {
    throw new CapabilityError('errand_time_ambiguous');
  }
  const tz = match[2];
  const timeZoneOffsetMinutes = tz === 'Z' ? 0 : parseNumericOffset(tz);
  return {kind: 'once', dueAtMs, timeZoneOffsetMinutes};
}

export function parseErrandTime(input: string, context: ParseErrandTimeContext): ErrandSchedule {
  const trimmed = input.trim();

  const iso = parseIsoWithTimezone(trimmed);
  if (iso) {
    return iso;
  }

  const tomorrow = trimmed.match(TOMORROW);
  if (tomorrow) {
    const hour = Number(tomorrow[1]);
    const minute = Number(tomorrow[2]);
    assertValidTime(hour, minute);
    const parts = toLocalParts(context.nowMs, context.timeZoneOffsetMinutes);
    const dueAtMs = fromLocalParts(
      parts.year,
      parts.month,
      parts.date + 1,
      hour,
      minute,
      context.timeZoneOffsetMinutes,
    );
    return {kind: 'once', dueAtMs, timeZoneOffsetMinutes: context.timeZoneOffsetMinutes};
  }

  const weekly = trimmed.match(WEEKLY);
  if (weekly) {
    const weekday = WEEKDAY_CHARS[weekly[1]];
    const hour = Number(weekly[2]);
    const minute = Number(weekly[3]);
    assertValidTime(hour, minute);
    return {kind: 'weekly', weekday, hour, minute, timeZoneOffsetMinutes: context.timeZoneOffsetMinutes};
  }

  const once = trimmed.match(ONCE_WEEKDAY);
  if (once) {
    const weekday = WEEKDAY_CHARS[once[1]];
    const hour = Number(once[2]);
    const minute = Number(once[3]);
    assertValidTime(hour, minute);
    const dueAtMs = nextWeeklyOccurrenceStrictlyAfter(
      weekday,
      hour,
      minute,
      context.nowMs,
      context.timeZoneOffsetMinutes,
    );
    return {kind: 'once', dueAtMs, timeZoneOffsetMinutes: context.timeZoneOffsetMinutes};
  }

  throw new CapabilityError('errand_time_ambiguous');
}

export function nextDueAfter(schedule: ErrandSchedule, afterMs: number): number {
  if (schedule.kind === 'once') {
    return schedule.dueAtMs;
  }
  return nextWeeklyOccurrenceStrictlyAfter(
    schedule.weekday,
    schedule.hour,
    schedule.minute,
    afterMs,
    schedule.timeZoneOffsetMinutes,
  );
}
