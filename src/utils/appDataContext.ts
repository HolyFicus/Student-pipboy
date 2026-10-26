import { MonitoredLink, StudentProfile, AIDataMode } from '../types/pipboy';
import { ScheduleClass, DAYS_CONFIG, LESSON_TYPES_CONFIG } from '../types/schedule';
import { SubjectItem } from '../types/grades';

export const AI_MODE_STORAGE_KEY = 'pipboy_ai_data_mode_v1';
const AI_MODE_EVENT = 'pipboy-ai-mode-change';

export interface AppInternalDataSnapshot {
  profile: StudentProfile | null;
  schedule: Array<{
    dayLabel: string;
    weekParityLabel: string;
    lessonNumber: number;
    time: string;
    subject: string;
    typeLabel: string;
    classroom: string;
    teacher: string;
    notes?: string;
  }>;
  grades: Array<{
    name: string;
    teacherName?: string;
    currentScore: number;
    maxScore: number;
    remainingScore: number;
    targetLabel: string | null;
    targetMinScore: number | null;
    pointsNeededForTarget: number | null;
    scaleSummary: string;
  }>;
  library: Array<{
    title: string;
    fileType: string;
    subjectName: string;
    totalPages: number;
    currentPage: number;
  }>;
  allAttachedSitesCount: number;
}

export function getStoredAIDataMode(): AIDataMode {
  try {
    const saved = localStorage.getItem(AI_MODE_STORAGE_KEY);
    if (saved === 'web' || saved === 'local') {
      return saved;
    }
    const settingsRaw = localStorage.getItem('pipboy_clean_settings_v4');
    if (settingsRaw) {
      const parsed = JSON.parse(settingsRaw);
      if (parsed?.aiDataMode === 'web' || parsed?.aiDataMode === 'local') {
        return parsed.aiDataMode;
      }
    }
  } catch {}
  return 'local';
}

export function setStoredAIDataMode(mode: AIDataMode): void {
  try {
    localStorage.setItem(AI_MODE_STORAGE_KEY, mode);
    const settingsRaw = localStorage.getItem('pipboy_clean_settings_v4');
    if (settingsRaw) {
      const parsed = JSON.parse(settingsRaw);
      parsed.aiDataMode = mode;
      localStorage.setItem('pipboy_clean_settings_v4', JSON.stringify(parsed));
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(AI_MODE_EVENT, { detail: mode }));
    }
  } catch {}
}

export function subscribeToAIDataMode(callback: (mode: AIDataMode) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (e: Event) => {
    const custom = e as CustomEvent<AIDataMode>;
    if (custom.detail === 'local' || custom.detail === 'web') {
      callback(custom.detail);
    }
  };
  window.addEventListener(AI_MODE_EVENT, handler);
  return () => window.removeEventListener(AI_MODE_EVENT, handler);
}

/**
 * Collects a complete snapshot of internal Pip-Boy application state
 * (student profile, upper/lower week schedule, grades/BRS calculator, and attached links count)
 */
export function collectAppInternalDataSnapshot(linksOverride?: MonitoredLink[]): AppInternalDataSnapshot {
  let profile: StudentProfile | null = null;
  let rawSchedule: ScheduleClass[] = [];
  let rawSubjects: SubjectItem[] = [];
  let allLinksCount = linksOverride ? linksOverride.length : 0;

  try {
    const profStr = localStorage.getItem('pipboy_clean_profile_v4');
    if (profStr) {
      profile = JSON.parse(profStr);
    }
  } catch {}

  try {
    const schedStr = localStorage.getItem('pipboy_schedule_classes_v1');
    if (schedStr) {
      const parsed = JSON.parse(schedStr);
      if (Array.isArray(parsed)) {
        const mockNames = new Set([
          'История отечественной культуры',
          'Латинский язык (Семинар)',
          'Сравнительное языкознание',
          'Философия и методология науки',
          'Источниковедение и архивоведение',
          'История литературы',
          'Культурология и семиотика'
        ]);
        rawSchedule = parsed.filter(
          (c) => !(c.id?.startsWith('class-') && mockNames.has(c.subject))
        );
      }
    }
  } catch {}

  try {
    const gradesStr = localStorage.getItem('pipboy_grades_subjects_v1');
    if (gradesStr) {
      const parsed = JSON.parse(gradesStr);
      if (Array.isArray(parsed)) rawSubjects = parsed;
    }
  } catch {}

  if (!linksOverride) {
    try {
      const linksStr = localStorage.getItem('pipboy_clean_links_v4');
      if (linksStr) {
        const parsed = JSON.parse(linksStr);
        if (Array.isArray(parsed)) allLinksCount = parsed.length;
      }
    } catch {}
  }

  const schedule = rawSchedule.map((cls) => {
    const dayInfo = DAYS_CONFIG.find((d) => d.id === cls.day);
    const typeInfo = LESSON_TYPES_CONFIG.find((t) => t.id === cls.lessonType);
    const parityLabel =
      cls.weekParity === 'UPPER'
        ? 'Верхняя (нечетная) неделя'
        : cls.weekParity === 'LOWER'
        ? 'Нижняя (четная) неделя'
        : 'Каждую неделю (обе)';

    return {
      dayLabel: dayInfo ? dayInfo.label : cls.day,
      weekParityLabel: parityLabel,
      lessonNumber: cls.lessonNumber,
      time: `${cls.startTime}–${cls.endTime}`,
      subject: cls.subject,
      typeLabel: typeInfo ? typeInfo.label : cls.lessonType,
      classroom: cls.classroom || 'Не указана',
      teacher: cls.teacher || 'Не указан',
      notes: cls.notes || undefined
    };
  });

  const grades = rawSubjects.map((sub) => {
    const target = sub.scale.find((th) => th.id === sub.targetScaleId) || null;
    const current = Number(sub.currentScore) || 0;
    const max = Number(sub.maxScore) || 100;
    const remaining = Math.max(0, max - current);
    const needed = target ? Math.max(0, target.minScore - current) : null;

    return {
      name: sub.name || 'Предмет без названия',
      teacherName: sub.teacherName || undefined,
      currentScore: current,
      maxScore: max,
      remainingScore: remaining,
      targetLabel: target ? target.label : null,
      targetMinScore: target ? target.minScore : null,
      pointsNeededForTarget: needed,
      scaleSummary: sub.scale.map((s) => `${s.label}: от ${s.minScore} б.`).join(', ')
    };
  });

  let library: AppInternalDataSnapshot['library'] = [];
  try {
    const docsRaw = localStorage.getItem('pipboy_library_docs_v1');
    const subsRaw = localStorage.getItem('pipboy_library_subjects_v1');
    const subsList: Array<{ id: string; name: string }> = subsRaw ? JSON.parse(subsRaw) : [];
    const subMap = new Map(subsList.map((s) => [s.id, s.name]));

    if (docsRaw) {
      const parsedDocs = JSON.parse(docsRaw);
      if (Array.isArray(parsedDocs)) {
        library = parsedDocs.map((d: any) => ({
          title: String(d.title || d.fileName || 'Документ'),
          fileType: String(d.fileType || 'txt'),
          subjectName: subMap.get(d.subjectId) || 'Без предмета',
          totalPages: Number(d.totalPages) || 1,
          currentPage: Number(d.currentPage) || 1
        }));
      }
    }
  } catch {}

  return {
    profile,
    schedule,
    grades,
    library,
    allAttachedSitesCount: allLinksCount
  };
}
