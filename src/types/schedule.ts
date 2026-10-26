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
  classroom?: string;
  teacher?: string;
  notes?: string;
  linkUrl?: string;
  notificationEnabled?: boolean;
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
