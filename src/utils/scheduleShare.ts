import {
  ScheduleClass,
  DayOfWeek,
  WeekParityType,
  LessonType,
  DAYS_CONFIG,
  LESSON_TYPES_CONFIG,
  extractWeekRangeFromText
} from '../types/schedule';

export interface ScheduleExportBundle {
  format: 'PIPBOY_SCHEDULE_V1';
  version: 1;
  exportedAt: string;
  groupName?: string;
  authorNote?: string;
  classesCount: number;
  classes: ScheduleClass[];
}

const VALID_DAYS = new Set<DayOfWeek>(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']);
const VALID_PARITIES = new Set<WeekParityType>(['UPPER', 'LOWER', 'BOTH']);
const VALID_LESSON_TYPES = new Set<LessonType>([
  'LECTURE',
  'SEMINAR',
  'PRACTICE',
  'LAB',
  'EXAM',
  'COLLOQUIUM',
  'OTHER'
]);

const DAY_LIST: DayOfWeek[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const PARITY_LIST: WeekParityType[] = ['BOTH', 'UPPER', 'LOWER'];
const TYPE_LIST: LessonType[] = [
  'LECTURE',
  'SEMINAR',
  'PRACTICE',
  'LAB',
  'EXAM',
  'COLLOQUIUM',
  'OTHER'
];

function toBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(b64url: string): string {
  const padded = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  const base64 = padded + '='.repeat(padLen);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

/**
 * Normalizes and validates any raw array or bundle into clean ScheduleClass items.
 */
export function normalizeImportedClasses(rawItems: any[]): ScheduleClass[] {
  if (!Array.isArray(rawItems)) return [];

  return rawItems
    .filter((item) => item && typeof item === 'object')
    .map((c: any, idx: number): ScheduleClass => {
      const day: DayOfWeek = VALID_DAYS.has(c.day) ? c.day : 'MON';
      const weekParity: WeekParityType = VALID_PARITIES.has(c.weekParity) ? c.weekParity : 'BOTH';
      const lessonType: LessonType = VALID_LESSON_TYPES.has(c.lessonType) ? c.lessonType : 'LECTURE';

      const startTime = typeof c.startTime === 'string' && /^\d{1,2}:\d{2}$/.test(c.startTime.trim())
        ? c.startTime.trim().padStart(5, '0')
        : '09:00';
      const endTime = typeof c.endTime === 'string' && /^\d{1,2}:\d{2}$/.test(c.endTime.trim())
        ? c.endTime.trim().padStart(5, '0')
        : '10:30';

      const derivedWeek = extractWeekRangeFromText(`${c.notes || ''} ${c.subject || ''}`);
      const weekFrom =
        c.weekFrom !== undefined && c.weekFrom !== null && c.weekFrom !== ''
          ? Number(c.weekFrom)
          : derivedWeek.weekFrom;
      const weekTo =
        c.weekTo !== undefined && c.weekTo !== null && c.weekTo !== ''
          ? Number(c.weekTo)
          : derivedWeek.weekTo;

      const weekRangeLabel =
        c.weekRangeLabel ||
        derivedWeek.weekRangeLabel ||
        (weekFrom && weekTo
          ? `${weekFrom}–${weekTo} нед.`
          : weekTo
          ? `до ${weekTo} нед.`
          : weekFrom
          ? `после ${weekFrom - 1} нед.`
          : undefined);

      const rawSubgroup = c.subgroup ? String(c.subgroup).replace(/[^1-4]/g, '') : '';

      return {
        id: `shared-class-${Date.now()}-${idx}`,
        day,
        weekParity,
        lessonNumber: Number(c.lessonNumber) || ((idx % 6) + 1),
        startTime,
        endTime,
        subject: String(c.subject || 'Дисциплина').trim(),
        lessonType,
        subgroup: rawSubgroup || undefined,
        weekFrom: weekFrom && !isNaN(weekFrom) ? weekFrom : undefined,
        weekTo: weekTo && !isNaN(weekTo) ? weekTo : undefined,
        weekRangeLabel: weekRangeLabel || undefined,
        classroom: c.classroom ? String(c.classroom).trim() : undefined,
        teacher: c.teacher ? String(c.teacher).trim() : undefined,
        notes: c.notes ? String(c.notes).trim() : undefined,
        linkUrl: c.linkUrl ? String(c.linkUrl).trim() : undefined,
        notificationEnabled: c.notificationEnabled !== false
      };
    });
}

/**
 * Creates a JSON export bundle object.
 */
export function createScheduleExportBundle(
  classes: ScheduleClass[],
  options?: { groupName?: string; authorNote?: string }
): ScheduleExportBundle {
  return {
    format: 'PIPBOY_SCHEDULE_V1',
    version: 1,
    exportedAt: new Date().toISOString(),
    groupName: options?.groupName?.trim() || undefined,
    authorNote: options?.authorNote?.trim() || undefined,
    classesCount: classes.length,
    classes
  };
}

/**
 * Compresses schedule classes into a compact share code ("PIP1:...") suitable for messengers and URLs.
 */
export function encodeScheduleShareCode(
  classes: ScheduleClass[],
  options?: { groupName?: string; authorNote?: string }
): string {
  const compactRows = classes.map((c) => [
    DAY_LIST.indexOf(c.day),
    PARITY_LIST.indexOf(c.weekParity),
    c.lessonNumber || 1,
    c.startTime || '09:00',
    c.endTime || '10:30',
    c.subject || '',
    TYPE_LIST.indexOf(c.lessonType),
    c.subgroup || '',
    c.classroom || '',
    c.teacher || '',
    c.notes || '',
    c.linkUrl || '',
    c.weekFrom ?? '',
    c.weekTo ?? ''
  ]);

  const payload = {
    v: 1,
    g: options?.groupName?.trim() || '',
    n: options?.authorNote?.trim() || '',
    t: Math.floor(Date.now() / 1000),
    r: compactRows
  };

  return 'PIP1:' + toBase64Url(JSON.stringify(payload));
}

/**
 * Builds a direct shareable URL that opens the schedule import preview for another user.
 */
export function buildScheduleShareUrl(
  classes: ScheduleClass[],
  options?: { groupName?: string; authorNote?: string }
): string {
  const code = encodeScheduleShareCode(classes, options);
  const rawToken = code.replace(/^PIP1:/, '');
  if (typeof window === 'undefined') return code;
  const url = new URL(window.location.href);
  url.searchParams.set('import_schedule', rawToken);
  return url.toString();
}

/**
 * Parses either:
 * - A shareable URL (?import_schedule=...)
 * - A compact share code (PIP1:... or raw base64url)
 * - A JSON string (ScheduleExportBundle or ScheduleClass[])
 */
export function parseScheduleImportInput(input: string): {
  classes: ScheduleClass[];
  groupName?: string;
  authorNote?: string;
  exportedAt?: string;
} {
  const trimmed = (input || '').trim();
  if (!trimmed) {
    throw new Error('Введите код расписания, ссылку или выберите JSON-файл.');
  }

  // 1. Check if input is a URL with ?import_schedule=
  let tokenCandidate = trimmed;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.includes('import_schedule=')) {
    try {
      const url = new URL(trimmed.startsWith('http') ? trimmed : `https://example.com/${trimmed}`);
      const param = url.searchParams.get('import_schedule');
      if (param) {
        tokenCandidate = 'PIP1:' + param;
      }
    } catch {
      const match = trimmed.match(/[?&]import_schedule=([^&#\s]+)/);
      if (match) {
        tokenCandidate = 'PIP1:' + decodeURIComponent(match[1]);
      }
    }
  }

  // 2. Check if input is JSON object or array
  if (tokenCandidate.startsWith('{') || tokenCandidate.startsWith('[')) {
    try {
      const parsed = JSON.parse(tokenCandidate);
      if (Array.isArray(parsed)) {
        const classes = normalizeImportedClasses(parsed);
        if (classes.length === 0) {
          throw new Error('В JSON-файле не найдено ни одного занятия.');
        }
        return { classes };
      }
      if (parsed && Array.isArray(parsed.classes)) {
        const classes = normalizeImportedClasses(parsed.classes);
        if (classes.length === 0) {
          throw new Error('В файле расписания список занятий пуст.');
        }
        return {
          classes,
          groupName: parsed.groupName,
          authorNote: parsed.authorNote,
          exportedAt: parsed.exportedAt
        };
      }
    } catch (err: any) {
      throw new Error(err.message || 'Некорректный формат JSON-файла расписания.');
    }
  }

  // 3. Parse PIP1:... compact share code
  const rawB64 = tokenCandidate.startsWith('PIP1:')
    ? tokenCandidate.slice(5).trim()
    : tokenCandidate;

  try {
    const jsonStr = fromBase64Url(rawB64);
    const decoded = JSON.parse(jsonStr);

    if (decoded && Array.isArray(decoded.r)) {
      const rawObjects = decoded.r.map((row: any[], idx: number) => ({
        day: DAY_LIST[Number(row[0])] || 'MON',
        weekParity: PARITY_LIST[Number(row[1])] || 'BOTH',
        lessonNumber: Number(row[2]) || ((idx % 6) + 1),
        startTime: row[3] || '09:00',
        endTime: row[4] || '10:30',
        subject: row[5] || 'Дисциплина',
        lessonType: TYPE_LIST[Number(row[6])] || 'LECTURE',
        subgroup: row[7] || undefined,
        classroom: row[8] || undefined,
        teacher: row[9] || undefined,
        notes: row[10] || undefined,
        linkUrl: row[11] || undefined,
        weekFrom: row[12] !== '' && row[12] !== undefined ? Number(row[12]) : undefined,
        weekTo: row[13] !== '' && row[13] !== undefined ? Number(row[13]) : undefined
      }));

      const classes = normalizeImportedClasses(rawObjects);
      if (classes.length === 0) {
        throw new Error('В коде расписания нет занятий.');
      }

      return {
        classes,
        groupName: decoded.g || undefined,
        authorNote: decoded.n || undefined,
        exportedAt: decoded.t ? new Date(decoded.t * 1000).toISOString() : undefined
      };
    }
  } catch (err: any) {
    if (err?.message?.includes('нет занятий')) throw err;
  }

  throw new Error('Не удалось распознать код или ссылку расписания. Проверьте, что код скопирован полностью.');
}

/**
 * Formats schedule into a clean human-readable text for Telegram / VK / Messenger chats.
 */
export function formatScheduleAsTextSummary(
  classes: ScheduleClass[],
  groupName?: string
): string {
  const header = groupName
    ? `📅 РАСПИСАНИЕ ЗАНЯТИЙ — ${groupName.toUpperCase()}`
    : '📅 РАСПИСАНИЕ ЗАНЯТИЙ (PIP-BOY STUDENT)';

  const lines: string[] = [header, '══════════════════════════════'];

  for (const dayCfg of DAYS_CONFIG) {
    const dayClasses = classes
      .filter((c) => c.day === dayCfg.id)
      .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.lessonNumber - b.lessonNumber);

    if (dayClasses.length === 0) continue;

    lines.push(`\n▶ ${dayCfg.label.toUpperCase()}:`);
    for (const c of dayClasses) {
      const typeLabel = LESSON_TYPES_CONFIG.find((t) => t.id === c.lessonType)?.label || 'Занятие';
      const parityTag =
        c.weekParity === 'UPPER'
          ? ' [Верхняя нед.]'
          : c.weekParity === 'LOWER'
          ? ' [Нижняя нед.]'
          : '';
      const subTag = c.subgroup ? ` [${c.subgroup} подгр.]` : '';
      const weekTag = c.weekRangeLabel ? ` [${c.weekRangeLabel}]` : '';
      const roomTag = c.classroom ? ` • ауд. ${c.classroom}` : '';
      const teacherTag = c.teacher ? ` • ${c.teacher}` : '';

      lines.push(
        `  • ${c.startTime}–${c.endTime}${subTag} — (${typeLabel}) ${c.subject}${roomTag}${teacherTag}${parityTag}${weekTag}`
      );
    }
  }

  return lines.join('\n');
}
