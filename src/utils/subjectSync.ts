import {
  ScheduleClass,
  DAYS_CONFIG,
  LESSON_TYPES_CONFIG
} from '../types/schedule';
import { SubjectItem, ScheduleSubjectStats } from '../types/grades';

export const SCHEDULE_STORAGE_KEY = 'pipboy_schedule_classes_v1';
export const GRADES_SUBJECTS_STORAGE_KEY = 'pipboy_grades_subjects_v1';

export const EVENT_GRADES_UPDATED = 'pipboy-grades-subjects-updated';
export const EVENT_SCHEDULE_UPDATED = 'pipboy-schedule-classes-updated';

/**
 * Cleans subject name from schedule prefixes like "(лек.)", "(пр.)", "(лек./пр.)"
 * and trailing date markers like ", с 10.09." so that lectures and practices merge cleanly.
 */
export function cleanSubjectDisplayName(rawSubject?: string): string {
  if (!rawSubject) return '';
  let s = rawSubject
    .replace(/^\s*\((?:лек\.?\/?пр\.?|лек\.?|пр\.?|сем\.?|лаб\.?)\)\s*/i, '')
    .replace(/^\s*(?:лек\.?\/?пр\.?|лек\.|пр\.|сем\.|лаб\.)\s+/i, '')
    .replace(/[,;\s]+с\s*\d{1,2}\.\d{2}\.?\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (s.length > 0) {
    s = s.charAt(0).toUpperCase() + s.slice(1);
  }
  return s;
}

/**
 * Produces a canonical comparison key for a subject name.
 */
export function normalizeSubjectKey(rawSubject?: string): string {
  const cleaned = cleanSubjectDisplayName(rawSubject);
  if (!cleaned) return '';
  return cleaned
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Cleans a teacher name, filtering out lone dots or dashes from empty table cells.
 */
export function cleanTeacherName(rawTeacher?: string): string {
  if (!rawTeacher) return '';
  const cleaned = rawTeacher
    .replace(/^[\s.,;—–-]+|[\s.,;—–-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length < 2 || /^[.\-—_]+$/.test(cleaned)) return '';
  return cleaned;
}

/**
 * Merges existing teacher string (possibly comma-separated) with incoming teacher names
 * from schedule rows, deduplicating case-insensitively.
 */
export function mergeUniqueTeachers(
  existingTeacherStr?: string,
  incomingTeachers: (string | undefined)[] = []
): string {
  const result: string[] = [];

  const addCandidate = (raw?: string) => {
    if (!raw) return;
    const parts = raw.split(/[,;]+/);
    for (const part of parts) {
      const clean = cleanTeacherName(part);
      if (!clean) continue;
      const normClean = clean.toLowerCase().replace(/ё/g, 'е');

      const existingIdx = result.findIndex((item) => {
        const normItem = item.toLowerCase().replace(/ё/g, 'е');
        return normItem === normClean || normItem.includes(normClean) || normClean.includes(normItem);
      });

      if (existingIdx === -1) {
        result.push(clean);
      } else if (clean.length > result[existingIdx].length) {
        // Prefer fuller name (e.g. "Самойлов Кирилл Глебович" over "Самойлов К. Г.")
        result[existingIdx] = clean;
      }
    }
  };

  addCandidate(existingTeacherStr);
  for (const t of incomingTeachers) {
    addCandidate(t);
  }

  return result.join(', ');
}

export function loadStoredScheduleClasses(): ScheduleClass[] {
  try {
    const raw = localStorage.getItem(SCHEDULE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

export function loadStoredGradeSubjects(): SubjectItem[] {
  try {
    const raw = localStorage.getItem(GRADES_SUBJECTS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

/**
 * Synchronizes unique subjects from Schedule classes into Grade Calculator subjects.
 * - Combines lectures, seminars, practices, and subgroups into 1 SubjectItem per discipline.
 * - Merges all teachers for that discipline.
 * - Never deletes existing subjects or resets earned points (currentScore / scale / target).
 */
export function syncScheduleClassesToGrades(
  classesInput?: ScheduleClass[],
  subjectsInput?: SubjectItem[],
  options?: { persist?: boolean; notifyEvent?: boolean }
): {
  subjects: SubjectItem[];
  addedCount: number;
  updatedCount: number;
  totalUniqueInSchedule: number;
} {
  const classes = classesInput ?? loadStoredScheduleClasses();
  const existingSubjects = subjectsInput ?? loadStoredGradeSubjects();
  const shouldPersist = options?.persist !== false;
  const shouldNotify = options?.notifyEvent !== false;

  // Group schedule classes by normalized subject key
  const grouped = new Map<
    string,
    {
      displayName: string;
      teachers: string[];
      lessonTypes: Set<string>;
      classrooms: Set<string>;
      subgroups: Set<string>;
      days: Set<string>;
      classesCount: number;
    }
  >();

  for (const cls of classes) {
    const cleanName = cleanSubjectDisplayName(cls.subject);
    const key = normalizeSubjectKey(cleanName);
    if (!key || key === 'дисциплина' || key === 'новое занятие') continue;

    let entry = grouped.get(key);
    if (!entry) {
      entry = {
        displayName: cleanName,
        teachers: [],
        lessonTypes: new Set<string>(),
        classrooms: new Set<string>(),
        subgroups: new Set<string>(),
        days: new Set<string>(),
        classesCount: 0
      };
      grouped.set(key, entry);
    } else if (cleanName.length > entry.displayName.length) {
      entry.displayName = cleanName;
    }

    entry.classesCount += 1;

    const cleanT = cleanTeacherName(cls.teacher);
    if (cleanT) entry.teachers.push(cleanT);

    const typeLabel = LESSON_TYPES_CONFIG.find((t) => t.id === cls.lessonType)?.label;
    if (typeLabel) entry.lessonTypes.add(typeLabel);

    const cleanRoom = cleanTeacherName(cls.classroom);
    if (cleanRoom) entry.classrooms.add(cleanRoom);

    if (cls.subgroup) entry.subgroups.add(cls.subgroup);

    const dayLabel = DAYS_CONFIG.find((d) => d.id === cls.day)?.shortLabel;
    if (dayLabel) entry.days.add(dayLabel);
  }

  let addedCount = 0;
  let updatedCount = 0;

  const updatedSubjects: SubjectItem[] = existingSubjects.map((sub) => ({ ...sub }));
  const matchedSubjectIds = new Set<string>();

  for (const [key, group] of grouped.entries()) {
    const stats: ScheduleSubjectStats = {
      classesCount: group.classesCount,
      lessonTypes: Array.from(group.lessonTypes),
      classrooms: Array.from(group.classrooms),
      subgroups: Array.from(group.subgroups).sort(),
      days: Array.from(group.days)
    };

    // Find matching subject in Grade Calculator
    const existingIdx = updatedSubjects.findIndex(
      (s) =>
        !matchedSubjectIds.has(s.id) &&
        ((s.scheduleKey && s.scheduleKey === key) || normalizeSubjectKey(s.name) === key)
    );

    if (existingIdx !== -1) {
      const current = updatedSubjects[existingIdx];
      matchedSubjectIds.add(current.id);

      const mergedTeachers = mergeUniqueTeachers(current.teacherName, group.teachers);
      const cleanedExistingName = cleanSubjectDisplayName(current.name) || group.displayName;

      const hasChanged =
        current.teacherName !== mergedTeachers ||
        current.name !== cleanedExistingName ||
        current.scheduleKey !== key ||
        JSON.stringify(current.scheduleStats) !== JSON.stringify(stats);

      if (hasChanged) {
        updatedSubjects[existingIdx] = {
          ...current,
          name: cleanedExistingName,
          teacherName: mergedTeachers,
          scheduleKey: key,
          scheduleStats: stats,
          updatedAt: Date.now()
        };
        updatedCount += 1;
      }
    } else {
      // Create a new SubjectItem for this schedule discipline
      const mergedTeachers = mergeUniqueTeachers('', group.teachers);
      const now = Date.now();
      const newSubject: SubjectItem = {
        id: `sub-sync-${now}-${Math.random().toString(36).slice(2, 7)}`,
        name: group.displayName,
        teacherName: mergedTeachers,
        maxScore: 100,
        currentScore: 0,
        scale: [
          { id: `th-1-${now}`, label: 'Отлично', minScore: 85 },
          { id: `th-2-${now}`, label: 'Хорошо', minScore: 70 },
          { id: `th-3-${now}`, label: 'Удовлетворительно', minScore: 50 }
        ],
        targetScaleId: null,
        scheduleKey: key,
        scheduleStats: stats,
        createdAt: now,
        updatedAt: now
      };
      updatedSubjects.push(newSubject);
      matchedSubjectIds.add(newSubject.id);
      addedCount += 1;
    }
  }

  if (shouldPersist && (addedCount > 0 || updatedCount > 0)) {
    try {
      localStorage.setItem(GRADES_SUBJECTS_STORAGE_KEY, JSON.stringify(updatedSubjects));
    } catch {}
    if (shouldNotify && typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent<SubjectItem[]>(EVENT_GRADES_UPDATED, { detail: updatedSubjects })
      );
    }
  }

  return {
    subjects: updatedSubjects,
    addedCount,
    updatedCount,
    totalUniqueInSchedule: grouped.size
  };
}

/**
 * Propagates subject name or teacher edits made in the Grade Calculator back to matching Schedule classes.
 * Preserves all schedule slots while keeping subject title and teacher names consistent.
 */
export function propagateGradeSubjectToSchedule(
  prevSubject: SubjectItem,
  updatedSubject: SubjectItem
): {
  updatedClassesCount: number;
  newScheduleKey: string;
} {
  const oldKey = prevSubject.scheduleKey || normalizeSubjectKey(prevSubject.name);
  const newCleanName = cleanSubjectDisplayName(updatedSubject.name);
  const newKey = normalizeSubjectKey(newCleanName);

  const nameChanged =
    Boolean(newCleanName) &&
    cleanSubjectDisplayName(prevSubject.name) !== newCleanName;
  const teacherChanged =
    (prevSubject.teacherName || '').trim() !== (updatedSubject.teacherName || '').trim();

  if (!oldKey || (!nameChanged && !teacherChanged)) {
    return { updatedClassesCount: 0, newScheduleKey: newKey || oldKey };
  }

  const classes = loadStoredScheduleClasses();
  if (classes.length === 0) {
    return { updatedClassesCount: 0, newScheduleKey: newKey || oldKey };
  }

  let updatedClassesCount = 0;
  const newTeacherTrimmed = (updatedSubject.teacherName || '').trim();
  const oldTeacherTrimmed = (prevSubject.teacherName || '').trim();
  const isSingleTeacher = !newTeacherTrimmed.includes(',');

  const nextClasses = classes.map((cls) => {
    const clsKey = normalizeSubjectKey(cls.subject);
    if (clsKey !== oldKey && clsKey !== newKey) return cls;

    let modified = false;
    const nextCls = { ...cls };

    if (nameChanged && newCleanName && nextCls.subject !== newCleanName) {
      nextCls.subject = newCleanName;
      modified = true;
    }

    if (teacherChanged && newTeacherTrimmed) {
      const currentClsTeacher = cleanTeacherName(nextCls.teacher);
      if (
        isSingleTeacher ||
        !currentClsTeacher ||
        currentClsTeacher === oldTeacherTrimmed
      ) {
        nextCls.teacher = newTeacherTrimmed;
        modified = true;
      }
    }

    if (modified) {
      updatedClassesCount += 1;
      return nextCls;
    }
    return cls;
  });

  if (updatedClassesCount > 0) {
    try {
      localStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify(nextClasses));
    } catch {}
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent<ScheduleClass[]>(EVENT_SCHEDULE_UPDATED, { detail: nextClasses })
      );
    }
  }

  return {
    updatedClassesCount,
    newScheduleKey: newKey || oldKey
  };
}
