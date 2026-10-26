/**
 * Academic Calendar & MSK Time Utilities for Humanities Student Terminal
 * Synchronized with device time and converted to Moscow Time (Europe/Moscow, UTC+3).
 *
 * Implements the official 18-week semester schedule:
 * Верхние недели (нечетные): 1, 3, 5, 7, 9, 11, 13, 15, 17
 * Нижние недели (четные): 2, 4, 6, 8, 10, 12, 14, 16, 18
 */

export interface AcademicWeekInfo {
  num: number;
  type: 'upper' | 'lower'; // upper = Верхняя (нечетная), lower = Нижняя (четная)
  typeName: 'Верхняя' | 'Нижняя';
  parityName: 'Нечетная' | 'Четная';
  fullLabel: string; // 'Верхняя (нечетная)' | 'Нижняя (четная)'
  startFormatted: string; // '01.09.2026'
  endFormatted: string; // '05.09.2026'
  label: string; // '01.09.2026 - 05.09.2026'
  startIso: string; // '2026-09-01'
  endIso: string; // '2026-09-05'
  endSunIso: string; // '2026-09-06' (includes Sunday for complete week coverage)
}

export const SEMESTER_WEEKS: AcademicWeekInfo[] = [
  {
    num: 1,
    type: 'upper',
    typeName: 'Верхняя',
    parityName: 'Нечетная',
    fullLabel: 'Верхняя (нечетная)',
    startFormatted: '01.09.2026',
    endFormatted: '05.09.2026',
    label: '01.09.2026 - 05.09.2026',
    startIso: '2026-09-01',
    endIso: '2026-09-05',
    endSunIso: '2026-09-06'
  },
  {
    num: 2,
    type: 'lower',
    typeName: 'Нижняя',
    parityName: 'Четная',
    fullLabel: 'Нижняя (четная)',
    startFormatted: '07.09.2026',
    endFormatted: '12.09.2026',
    label: '07.09.2026 - 12.09.2026',
    startIso: '2026-09-07',
    endIso: '2026-09-12',
    endSunIso: '2026-09-13'
  },
  {
    num: 3,
    type: 'upper',
    typeName: 'Верхняя',
    parityName: 'Нечетная',
    fullLabel: 'Верхняя (нечетная)',
    startFormatted: '14.09.2026',
    endFormatted: '19.09.2026',
    label: '14.09.2026 - 19.09.2026',
    startIso: '2026-09-14',
    endIso: '2026-09-19',
    endSunIso: '2026-09-20'
  },
  {
    num: 4,
    type: 'lower',
    typeName: 'Нижняя',
    parityName: 'Четная',
    fullLabel: 'Нижняя (четная)',
    startFormatted: '21.09.2026',
    endFormatted: '26.09.2026',
    label: '21.09.2026 - 26.09.2026',
    startIso: '2026-09-21',
    endIso: '2026-09-26',
    endSunIso: '2026-09-27'
  },
  {
    num: 5,
    type: 'upper',
    typeName: 'Верхняя',
    parityName: 'Нечетная',
    fullLabel: 'Верхняя (нечетная)',
    startFormatted: '28.09.2026',
    endFormatted: '03.10.2026',
    label: '28.09.2026 - 03.10.2026',
    startIso: '2026-09-28',
    endIso: '2026-10-03',
    endSunIso: '2026-10-04'
  },
  {
    num: 6,
    type: 'lower',
    typeName: 'Нижняя',
    parityName: 'Четная',
    fullLabel: 'Нижняя (четная)',
    startFormatted: '05.10.2026',
    endFormatted: '10.10.2026',
    label: '05.10.2026 - 10.10.2026',
    startIso: '2026-10-05',
    endIso: '2026-10-10',
    endSunIso: '2026-10-11'
  },
  {
    num: 7,
    type: 'upper',
    typeName: 'Верхняя',
    parityName: 'Нечетная',
    fullLabel: 'Верхняя (нечетная)',
    startFormatted: '12.10.2026',
    endFormatted: '17.10.2026',
    label: '12.10.2026 - 17.10.2026',
    startIso: '2026-10-12',
    endIso: '2026-10-17',
    endSunIso: '2026-10-18'
  },
  {
    num: 8,
    type: 'lower',
    typeName: 'Нижняя',
    parityName: 'Четная',
    fullLabel: 'Нижняя (четная)',
    startFormatted: '19.10.2026',
    endFormatted: '24.10.2026',
    label: '19.10.2026 - 24.10.2026',
    startIso: '2026-10-19',
    endIso: '2026-10-24',
    endSunIso: '2026-10-25'
  },
  {
    num: 9,
    type: 'upper',
    typeName: 'Верхняя',
    parityName: 'Нечетная',
    fullLabel: 'Верхняя (нечетная)',
    startFormatted: '26.10.2026',
    endFormatted: '31.10.2026',
    label: '26.10.2026 - 31.10.2026',
    startIso: '2026-10-26',
    endIso: '2026-10-31',
    endSunIso: '2026-11-01'
  },
  {
    num: 10,
    type: 'lower',
    typeName: 'Нижняя',
    parityName: 'Четная',
    fullLabel: 'Нижняя (четная)',
    startFormatted: '02.11.2026',
    endFormatted: '07.11.2026',
    label: '02.11.2026 - 07.11.2026',
    startIso: '2026-11-02',
    endIso: '2026-11-07',
    endSunIso: '2026-11-08'
  },
  {
    num: 11,
    type: 'upper',
    typeName: 'Верхняя',
    parityName: 'Нечетная',
    fullLabel: 'Верхняя (нечетная)',
    startFormatted: '09.11.2026',
    endFormatted: '14.11.2026',
    label: '09.11.2026 - 14.11.2026',
    startIso: '2026-11-09',
    endIso: '2026-11-14',
    endSunIso: '2026-11-15'
  },
  {
    num: 12,
    type: 'lower',
    typeName: 'Нижняя',
    parityName: 'Четная',
    fullLabel: 'Нижняя (четная)',
    startFormatted: '16.11.2026',
    endFormatted: '21.11.2026',
    label: '16.11.2026 - 21.11.2026',
    startIso: '2026-11-16',
    endIso: '2026-11-21',
    endSunIso: '2026-11-22'
  },
  {
    num: 13,
    type: 'upper',
    typeName: 'Верхняя',
    parityName: 'Нечетная',
    fullLabel: 'Верхняя (нечетная)',
    startFormatted: '23.11.2026',
    endFormatted: '28.11.2026',
    label: '23.11.2026 - 28.11.2026',
    startIso: '2026-11-23',
    endIso: '2026-11-28',
    endSunIso: '2026-11-29'
  },
  {
    num: 14,
    type: 'lower',
    typeName: 'Нижняя',
    parityName: 'Четная',
    fullLabel: 'Нижняя (четная)',
    startFormatted: '30.11.2026',
    endFormatted: '05.12.2026',
    label: '30.11.2026 - 05.12.2026',
    startIso: '2026-11-30',
    endIso: '2026-12-05',
    endSunIso: '2026-12-06'
  },
  {
    num: 15,
    type: 'upper',
    typeName: 'Верхняя',
    parityName: 'Нечетная',
    fullLabel: 'Верхняя (нечетная)',
    startFormatted: '07.12.2026',
    endFormatted: '12.12.2026',
    label: '07.12.2026 - 12.12.2026',
    startIso: '2026-12-07',
    endIso: '2026-12-12',
    endSunIso: '2026-12-13'
  },
  {
    num: 16,
    type: 'lower',
    typeName: 'Нижняя',
    parityName: 'Четная',
    fullLabel: 'Нижняя (четная)',
    startFormatted: '14.12.2026',
    endFormatted: '19.12.2026',
    label: '14.12.2026 - 19.12.2026',
    startIso: '2026-12-14',
    endIso: '2026-12-19',
    endSunIso: '2026-12-20'
  },
  {
    num: 17,
    type: 'upper',
    typeName: 'Верхняя',
    parityName: 'Нечетная',
    fullLabel: 'Верхняя (нечетная)',
    startFormatted: '21.12.2026',
    endFormatted: '26.12.2026',
    label: '21.12.2026 - 26.12.2026',
    startIso: '2026-12-21',
    endIso: '2026-12-26',
    endSunIso: '2026-12-27'
  },
  {
    num: 18,
    type: 'lower',
    typeName: 'Нижняя',
    parityName: 'Четная',
    fullLabel: 'Нижняя (четная)',
    startFormatted: '28.12.2026',
    endFormatted: '31.12.2026',
    label: '28.12.2026 - 31.12.2026',
    startIso: '2026-12-28',
    endIso: '2026-12-31',
    endSunIso: '2026-12-31'
  }
];

export interface MoscowTimeState {
  timeStr: string; // "22:15:30"
  hours: string; // "22"
  minutes: string; // "15"
  seconds: string; // "30"
  dateStr: string; // "12 октября 2026 г."
  dayNumber: string; // "12"
  monthName: string; // "октября"
  yearNumber: string; // "2026"
  weekdayFull: string; // "понедельник"
  weekdayShort: string; // "пн"
  isoDate: string; // "2026-10-12"
  currentWeek: AcademicWeekInfo | null;
  computedParity: {
    isOdd: boolean;
    typeName: 'Верхняя' | 'Нижняя';
    parityName: 'Нечетная' | 'Четная';
    fullLabel: string;
    sublabel: string;
    badgeColor: string;
  };
}

/**
 * Returns complete synchronized Moscow Time and Academic Week status.
 */
export function getMoscowTimeState(date: Date = new Date()): MoscowTimeState {
  // Format parts in Europe/Moscow timezone
  const parts = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(date);

  const map: Record<string, string> = {};
  for (const p of parts) {
    map[p.type] = p.value;
  }

  // Get ISO date in Moscow timezone
  const isoDate = date.toLocaleDateString('en-CA', { timeZone: 'Europe/Moscow' });
  
  // Find matching semester week
  const matchedWeek = SEMESTER_WEEKS.find(
    (w) => isoDate >= w.startIso && isoDate <= w.endSunIso
  ) || null;

  const hours = map.hour || '00';
  const minutes = map.minute || '00';
  const seconds = map.second || '00';
  const timeStr = `${hours}:${minutes}:${seconds}`;

  const dayNumber = map.day || '01';
  const monthName = map.month || '';
  const yearNumber = map.year || '2026';
  const weekdayFull = map.weekday || '';
  const weekdayShort = weekdayFull.slice(0, 2);

  // Capitalize weekday
  const capitalizedWeekday =
    weekdayFull.charAt(0).toUpperCase() + weekdayFull.slice(1);

  const dateStr = `${dayNumber} ${monthName} ${yearNumber} г.`;

  // Compute parity & labels
  let isOdd = true;
  let typeName: 'Верхняя' | 'Нижняя' = 'Верхняя';
  let parityName: 'Нечетная' | 'Четная' = 'Нечетная';
  let fullLabel = 'ВЕРХНЯЯ (НЕЧЕТНАЯ)';
  let sublabel = '';

  if (matchedWeek) {
    isOdd = matchedWeek.num % 2 !== 0;
    typeName = matchedWeek.typeName;
    parityName = matchedWeek.parityName;
    fullLabel = `${matchedWeek.typeName.toUpperCase()} (${matchedWeek.parityName.toUpperCase()})`;
    sublabel = `${matchedWeek.num}-я неделя семестра • ${matchedWeek.label}`;
  } else {
    // Projected fallback for dates outside Autumn 2026 semester
    // Standard Russian academic alternation based on Monday week counting
    const semesterStart = new Date('2026-09-01T00:00:00+03:00').getTime();
    const currentMskMs = date.getTime();
    const diffWeeks = Math.floor((currentMskMs - semesterStart) / (7 * 24 * 3600 * 1000));
    
    if (diffWeeks < 0) {
      sublabel = 'До начала осеннего семестра (Старт: 01.09.2026)';
      typeName = 'Верхняя';
      parityName = 'Нечетная';
      fullLabel = 'ВЕРХНЯЯ (1-Я СТАРТОВАЯ)';
      isOdd = true;
    } else if (diffWeeks >= 18) {
      sublabel = 'Зимняя зачетно-экзаменационная сессия';
      typeName = diffWeeks % 2 === 0 ? 'Верхняя' : 'Нижняя';
      parityName = diffWeeks % 2 === 0 ? 'Нечетная' : 'Четная';
      fullLabel = `${typeName.toUpperCase()} (СЕССИЯ)`;
      isOdd = diffWeeks % 2 === 0;
    } else {
      const projNum = diffWeeks + 1;
      isOdd = projNum % 2 !== 0;
      typeName = isOdd ? 'Верхняя' : 'Нижняя';
      parityName = isOdd ? 'Нечетная' : 'Четная';
      fullLabel = `${typeName.toUpperCase()} (${parityName.toUpperCase()})`;
      sublabel = `${projNum}-я неделя`;
    }
  }

  return {
    timeStr,
    hours,
    minutes,
    seconds,
    dateStr,
    dayNumber,
    monthName,
    yearNumber,
    weekdayFull: capitalizedWeekday,
    weekdayShort,
    isoDate,
    currentWeek: matchedWeek,
    computedParity: {
      isOdd,
      typeName,
      parityName,
      fullLabel,
      sublabel,
      badgeColor: isOdd ? 'text-emerald-400 border-emerald-500/50' : 'text-amber-400 border-amber-500/50'
    }
  };
}
