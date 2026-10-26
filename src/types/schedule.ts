/**
 * Academic Schedule Types for Pip-Boy Student Edition
 * Supports Upper/Lower week parity, multimodal AI parsing, and notification schedules.
 */

export type WeekParityType = 'UPPER' | 'LOWER' | 'BOTH';
export type DayOfWeek = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT';
export type LessonType = 'LECTURE' | 'SEMINAR' | 'PRACTICE' | 'LAB' | 'EXAM' | 'COLLOQUIUM' | 'OTHER';

export interface ScheduleClass {
  id: string;
  day: DayOfWeek;
  weekParity: WeekParityType;
  lessonNumber: number; // 1, 2, 3...
  startTime: string; // '09:00'
  endTime: string; // '10:30'
  subject: string;
  lessonType: LessonType;
  subgroup?: string; // '1', '2', '3'
  weekFrom?: number; // e.g. 10 for "после 9 недели"
  weekTo?: number; // e.g. 9 for "до 9 недели"
  weekRangeLabel?: string; // e.g. 'до 9 нед.' or 'после 9 нед.'
  classroom?: string;
  teacher?: string;
  notes?: string;
  linkUrl?: string;
  notificationEnabled?: boolean;
}

/**
 * Extracts week range constraints ("до 9 недели", "после 9 недели", "с 3 по 9 неделю") from notes/comments.
 */
export function extractWeekRangeFromText(text?: string): {
  weekFrom?: number;
  weekTo?: number;
  weekRangeLabel?: string;
} {
  if (!text) return {};
  const norm = text.toLowerCase();

  let weekFrom: number | undefined;
  let weekTo: number | undefined;
  const labels: string[] = [];

  // Match "с X по Y нед"
  const rangeMatch = norm.match(/с\s*(\d{1,2})\s*по\s*(\d{1,2})\s*нед/i);
  if (rangeMatch) {
    weekFrom = Number(rangeMatch[1]);
    weekTo = Number(rangeMatch[2]);
    labels.push(`${weekFrom}–${weekTo} нед.`);
  } else {
    // Match "до N недели" (inclusive of week N)
    const upToMatch = norm.match(/до\s*(\d{1,2})\s*(?:-?й?\s*)?нед/i);
    if (upToMatch) {
      weekTo = Number(upToMatch[1]);
      labels.push(`до ${weekTo} нед.`);
    }

    // Match "после N недели" (starts from week N + 1)
    const afterMatch = norm.match(/после\s*(\d{1,2})\s*(?:-?й?\s*)?нед/i);
    if (afterMatch) {
      const afterWeek = Number(afterMatch[1]);
      weekFrom = afterWeek + 1;
      labels.push(`после ${afterWeek} нед.`);
    }

    // Match "с N недели"
    if (!weekFrom) {
      const fromWeekMatch = norm.match(/с\s*(\d{1,2})\s*(?:-?й?\s*)?нед/i);
      if (fromWeekMatch) {
        weekFrom = Number(fromWeekMatch[1]);
        labels.push(`с ${weekFrom} нед.`);
      }
    }
  }

  // Also check start date like "с 21.09." or "с 24.09."
  const dateStartMatch = norm.match(/с\s*(\d{1,2}\.\d{2})\.?/i);
  if (dateStartMatch && labels.length > 0) {
    labels.push(`с ${dateStartMatch[1]}`);
  }

  return {
    weekFrom,
    weekTo,
    weekRangeLabel: labels.length > 0 ? labels.join(', ') : undefined
  };
}

/**
 * Checks whether a class is active on the given academic week number (e.g. Week 9).
 */
export function isClassActiveOnAcademicWeek(
  cls: ScheduleClass,
  academicWeekNum: number | null | undefined
): boolean {
  if (!academicWeekNum || academicWeekNum <= 0) return true;

  // Use explicit weekFrom / weekTo or derive from notes
  const derived =
    cls.weekFrom !== undefined || cls.weekTo !== undefined
      ? { weekFrom: cls.weekFrom, weekTo: cls.weekTo }
      : extractWeekRangeFromText(cls.notes);

  if (derived.weekFrom !== undefined && academicWeekNum < derived.weekFrom) {
    return false;
  }
  if (derived.weekTo !== undefined && academicWeekNum > derived.weekTo) {
    return false;
  }
  return true;
}

export interface ScheduleNotificationConfig {
  enabled: boolean;
  minutesBefore: number;
  morningBriefing: boolean;
  soundEnabled: boolean;
}

export const DAYS_CONFIG: { id: DayOfWeek; label: string; shortLabel: string; dayIndex: number }[] = [
  { id: 'MON', label: 'Понедельник', shortLabel: 'ПН', dayIndex: 1 },
  { id: 'TUE', label: 'Вторник', shortLabel: 'ВТ', dayIndex: 2 },
  { id: 'WED', label: 'Среда', shortLabel: 'СР', dayIndex: 3 },
  { id: 'THU', label: 'Четверг', shortLabel: 'ЧТ', dayIndex: 4 },
  { id: 'FRI', label: 'Пятница', shortLabel: 'ПТ', dayIndex: 5 },
  { id: 'SAT', label: 'Суббота', shortLabel: 'СБ', dayIndex: 6 }
];

export const LESSON_TYPES_CONFIG: { id: LessonType; label: string; badgeColor: string }[] = [
  { id: 'LECTURE', label: 'Лекция', badgeColor: 'bg-emerald-950 text-emerald-300 border-emerald-500' },
  { id: 'SEMINAR', label: 'Семинар', badgeColor: 'bg-amber-950 text-amber-300 border-amber-500' },
  { id: 'PRACTICE', label: 'Практика', badgeColor: 'bg-cyan-950 text-cyan-300 border-cyan-500' },
  { id: 'LAB', label: 'Лабораторная', badgeColor: 'bg-purple-950 text-purple-300 border-purple-500' },
  { id: 'COLLOQUIUM', label: 'Коллоквиум', badgeColor: 'bg-rose-950 text-rose-300 border-rose-500' },
  { id: 'EXAM', label: 'Зачет / Экзамен', badgeColor: 'bg-red-950 text-red-300 border-red-500' },
  { id: 'OTHER', label: 'Занятие', badgeColor: 'bg-zinc-900 text-zinc-300 border-zinc-600' }
];

export const STANDARD_LESSON_TIMES = [
  { number: 1, start: '09:00', end: '10:30', label: '1 пара (09:00 – 10:30)' },
  { number: 2, start: '10:45', end: '12:15', label: '2 пара (10:45 – 12:15)' },
  { number: 3, start: '13:00', end: '14:30', label: '3 пара (13:00 – 14:30)' },
  { number: 4, start: '14:45', end: '16:15', label: '4 пара (14:45 – 16:15)' },
  { number: 5, start: '16:30', end: '18:00', label: '5 пара (16:30 – 18:00)' },
  { number: 6, start: '18:15', end: '19:45', label: '6 пара (18:15 – 19:45)' }
];
