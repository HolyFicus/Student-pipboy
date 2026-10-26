import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  ScheduleClass,
  WeekParityType,
  DayOfWeek,
  LessonType,
  DAYS_CONFIG,
  LESSON_TYPES_CONFIG,
  STANDARD_LESSON_TIMES,
  ScheduleNotificationConfig,
  extractWeekRangeFromText,
  isClassActiveOnAcademicWeek
} from '../types/schedule';
import { getMoscowTimeState, MoscowTimeState } from '../utils/academicCalendar';
import { pipAudio } from '../utils/audio';
import { sendNativeNotification } from '../utils/notifications';
import { useModalScrollLock } from '../utils/useModalScrollLock';
import {
  resolveApiUrl,
  isGitHubPagesHost,
  parseScheduleClientFallback,
  prewarmScheduleOcrWorker
} from '../utils/staticHostFallback';
import {
  Calendar,
  Clock,
  Plus,
  Sparkles,
  Bell,
  BellOff,
  Trash2,
  Edit2,
  Upload,
  Link as LinkIcon,
  FileText,
  Check,
  X,
  ArrowUpRight,
  ArrowDownRight,
  Send,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  Copy,
  ExternalLink,
  MapPin,
  UserCheck,
  Layers,
  HelpCircle,
  Eye,
  Sliders
} from 'lucide-react';

const STORAGE_KEYS = {
  CLASSES: 'pipboy_schedule_classes_v1',
  CONFIG: 'pipboy_schedule_config_v1'
};

const DEFAULT_CONFIG: ScheduleNotificationConfig = {
  enabled: true,
  minutesBefore: 15,
  morningBriefing: true,
  soundEnabled: true
};

// Invented mock subjects that should never be injected when there is no source
const INVENTED_MOCK_SUBJECT_NAMES = new Set([
  'История отечественной культуры',
  'Латинский язык (Семинар)',
  'Сравнительное языкознание',
  'Философия и методология науки',
  'Источниковедение и архивоведение',
  'История литературы',
  'Культурология и семиотика'
]);

export function filterOutInventedMockClasses(items: ScheduleClass[]): ScheduleClass[] {
  return items.filter((c) => {
    if (c.id && c.id.startsWith('class-') && INVENTED_MOCK_SUBJECT_NAMES.has(c.subject)) {
      return false;
    }
    return true;
  });
}

// Clean initial academic schedule: 0 invented subjects! User inputs their own or parses from source
export const INITIAL_CLASSES: ScheduleClass[] = [];

interface TabScheduleProps {
  onSendNotification: (title: string, message: string) => void;
}

export const TabSchedule: React.FC<TabScheduleProps> = ({ onSendNotification }) => {
  const [classes, setClasses] = useState<ScheduleClass[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.CLASSES);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return filterOutInventedMockClasses(parsed);
        }
      }
    } catch {}
    return INITIAL_CLASSES;
  });

  const [config, setConfig] = useState<ScheduleNotificationConfig>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.CONFIG);
      if (saved) return JSON.parse(saved);
    } catch {}
    return DEFAULT_CONFIG;
  });

  // Real-time MSK calendar state
  const [moscowTime, setMoscowTime] = useState<MoscowTimeState>(() => getMoscowTimeState());

  useEffect(() => {
    const timer = setInterval(() => {
      setMoscowTime(getMoscowTimeState());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Save changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.CLASSES, JSON.stringify(classes));
    } catch {}
  }, [classes]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(config));
    } catch {}
  }, [config]);

  // Selected Parity Filter: 'CURRENT' (synced with MSK calendar), 'UPPER', 'LOWER', 'ALL'
  const [selectedParityFilter, setSelectedParityFilter] = useState<'CURRENT' | 'UPPER' | 'LOWER' | 'ALL'>('CURRENT');
  const [selectedDayFilter, setSelectedDayFilter] = useState<DayOfWeek | 'ALL'>('ALL');
  // Academic Week Number Filter: 'AUTO' (synced with top-right calendar, e.g. Week 9 on 26.10), 'ALL', or 1..18
  const [selectedWeekNumFilter, setSelectedWeekNumFilter] = useState<'AUTO' | 'ALL' | number>('AUTO');
  const [selectedSubgroupFilter, setSelectedSubgroupFilter] = useState<'ALL' | '1' | '2' | '3'>('ALL');

  // Modal States
  const [isAddEditModalOpen, setIsAddEditModalOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<ScheduleClass | null>(null);

  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  useModalScrollLock(isAddEditModalOpen || isAIModalOpen || isConfigModalOpen);

  // Pre-warm Russian OCR worker as soon as AI modal opens so zero time is wasted on click
  useEffect(() => {
    if (isAIModalOpen) {
      prewarmScheduleOcrWorker().catch(() => {});
    }
  }, [isAIModalOpen]);

  // Active parity and week number derived from real calendar:
  const liveActiveParity: 'UPPER' | 'LOWER' = moscowTime.computedParity.isOdd ? 'UPPER' : 'LOWER';
  const liveAcademicWeekNum: number = moscowTime.currentWeek?.num ?? 9;

  // Effective parity for filtering:
  const effectiveParity = selectedParityFilter === 'CURRENT' ? liveActiveParity : selectedParityFilter;

  // Effective academic week number for filtering ("до 9 недели" / "после 9 недели"):
  const effectiveWeekNum: number | null = useMemo(() => {
    if (selectedWeekNumFilter === 'ALL') return null;
    if (typeof selectedWeekNumFilter === 'number') return selectedWeekNumFilter;
    // When 'AUTO' is selected: if viewing 'ALL' parities ("ОБЕ НЕДЕЛИ"), show all weeks; otherwise sync with live week (Week 9)
    return selectedParityFilter === 'ALL' ? null : liveAcademicWeekNum;
  }, [selectedWeekNumFilter, selectedParityFilter, liveAcademicWeekNum]);

  // Filtered classes
  const filteredClasses = useMemo(() => {
    return classes
      .filter((c) => {
        // Parity filter
        if (effectiveParity !== 'ALL') {
          if (c.weekParity !== 'BOTH' && c.weekParity !== effectiveParity) {
            return false;
          }
        }

        // Academic week range filter ("до 9 недели" / "после 9 недели")
        if (effectiveWeekNum !== null) {
          if (!isClassActiveOnAcademicWeek(c, effectiveWeekNum)) {
            return false;
          }
        }

        // Subgroup filter
        if (selectedSubgroupFilter !== 'ALL') {
          if (c.subgroup && c.subgroup !== selectedSubgroupFilter) {
            return false;
          }
        }

        // Day filter
        if (selectedDayFilter !== 'ALL' && c.day !== selectedDayFilter) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        const dayOrder = { MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 };
        if (dayOrder[a.day] !== dayOrder[b.day]) {
          return dayOrder[a.day] - dayOrder[b.day];
        }
        return (
          a.startTime.localeCompare(b.startTime) ||
          a.lessonNumber - b.lessonNumber ||
          (a.subgroup || '').localeCompare(b.subgroup || '')
        );
      });
  }, [classes, effectiveParity, effectiveWeekNum, selectedSubgroupFilter, selectedDayFilter]);

  // Today's classes based on calendar day & current academic week:
  const todayDayCode: DayOfWeek | null = useMemo(() => {
    const short = (moscowTime.weekdayShort || '').toLowerCase();
    if (short.startsWith('пн')) return 'MON';
    if (short.startsWith('вт')) return 'TUE';
    if (short.startsWith('ср')) return 'WED';
    if (short.startsWith('чт')) return 'THU';
    if (short.startsWith('пт')) return 'FRI';
    if (short.startsWith('сб')) return 'SAT';
    return null; // Sunday
  }, [moscowTime.weekdayShort]);

  const todayClasses = useMemo(() => {
    if (!todayDayCode) return [];
    return classes
      .filter(
        (c) =>
          c.day === todayDayCode &&
          (c.weekParity === 'BOTH' || c.weekParity === liveActiveParity) &&
          isClassActiveOnAcademicWeek(c, liveAcademicWeekNum)
      )
      .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.lessonNumber - b.lessonNumber);
  }, [classes, todayDayCode, liveActiveParity, liveAcademicWeekNum]);

  // Form State for Manual Add/Edit
  const [formDay, setFormDay] = useState<DayOfWeek>('MON');
  const [formParity, setFormParity] = useState<WeekParityType>('BOTH');
  const [formLessonNumber, setFormLessonNumber] = useState<number>(1);
  const [formStartTime, setFormStartTime] = useState('09:00');
  const [formEndTime, setFormEndTime] = useState('10:30');
  const [formSubject, setFormSubject] = useState('');
  const [formLessonType, setFormLessonType] = useState<LessonType>('SEMINAR');
  const [formSubgroup, setFormSubgroup] = useState<string>('');
  const [formWeekFrom, setFormWeekFrom] = useState<string>('');
  const [formWeekTo, setFormWeekTo] = useState<string>('');
  const [formClassroom, setFormClassroom] = useState('');
  const [formTeacher, setFormTeacher] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formNotify, setFormNotify] = useState(true);

  const openAddModal = (presetDay?: DayOfWeek) => {
    pipAudio.playClick();
    setEditingClass(null);
    setFormDay(presetDay || (todayDayCode || 'MON'));
    setFormParity(selectedParityFilter === 'UPPER' ? 'UPPER' : selectedParityFilter === 'LOWER' ? 'LOWER' : 'BOTH');
    setFormLessonNumber(1);
    setFormStartTime('09:00');
    setFormEndTime('10:30');
    setFormSubject('');
    setFormLessonType('LECTURE');
    setFormSubgroup('');
    setFormWeekFrom('');
    setFormWeekTo('');
    setFormClassroom('');
    setFormTeacher('');
    setFormNotes('');
    setFormNotify(true);
    setIsAddEditModalOpen(true);
  };

  const openEditModal = (c: ScheduleClass) => {
    pipAudio.playClick();
    setEditingClass(c);
    setFormDay(c.day);
    setFormParity(c.weekParity);
    setFormLessonNumber(c.lessonNumber);
    setFormStartTime(c.startTime);
    setFormEndTime(c.endTime);
    setFormSubject(c.subject);
    setFormLessonType(c.lessonType);
    setFormSubgroup(c.subgroup || '');
    const derived =
      c.weekFrom !== undefined || c.weekTo !== undefined
        ? { weekFrom: c.weekFrom, weekTo: c.weekTo }
        : extractWeekRangeFromText(c.notes);
    setFormWeekFrom(derived.weekFrom !== undefined ? String(derived.weekFrom) : '');
    setFormWeekTo(derived.weekTo !== undefined ? String(derived.weekTo) : '');
    setFormClassroom(c.classroom || '');
    setFormTeacher(c.teacher || '');
    setFormNotes(c.notes || '');
    setFormNotify(c.notificationEnabled ?? true);
    setIsAddEditModalOpen(true);
  };

  const handleSaveClass = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formSubject.trim()) return;

    pipAudio.playSuccess();

    const parsedFrom = formWeekFrom.trim() ? Number(formWeekFrom.trim()) : undefined;
    const parsedTo = formWeekTo.trim() ? Number(formWeekTo.trim()) : undefined;
    const derivedFromNotes = extractWeekRangeFromText(formNotes);
    const finalWeekFrom = parsedFrom && !isNaN(parsedFrom) ? parsedFrom : derivedFromNotes.weekFrom;
    const finalWeekTo = parsedTo && !isNaN(parsedTo) ? parsedTo : derivedFromNotes.weekTo;
    const finalWeekLabel =
      finalWeekFrom && finalWeekTo
        ? `${finalWeekFrom}–${finalWeekTo} нед.`
        : finalWeekTo
        ? `до ${finalWeekTo} нед.`
        : finalWeekFrom
        ? `после ${finalWeekFrom - 1} нед.`
        : derivedFromNotes.weekRangeLabel;

    const payload: Omit<ScheduleClass, 'id'> = {
      day: formDay,
      weekParity: formParity,
      lessonNumber: Number(formLessonNumber) || 1,
      startTime: formStartTime,
      endTime: formEndTime,
      subject: formSubject.trim(),
      lessonType: formLessonType,
      subgroup: formSubgroup.trim() || undefined,
      weekFrom: finalWeekFrom,
      weekTo: finalWeekTo,
      weekRangeLabel: finalWeekLabel,
      classroom: formClassroom.trim() || undefined,
      teacher: formTeacher.trim() || undefined,
      notes: formNotes.trim() || undefined,
      notificationEnabled: formNotify
    };

    if (editingClass) {
      setClasses((prev) => prev.map((c) => (c.id === editingClass.id ? { ...c, ...payload } : c)));
    } else {
      const newClass: ScheduleClass = {
        id: 'class-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
        ...payload
      };
      setClasses((prev) => [...prev, newClass]);
    }

    setIsAddEditModalOpen(false);
  };

  const handleDeleteClass = (id: string) => {
    pipAudio.playClick();
    setClasses((prev) => prev.filter((c) => c.id !== id));
  };

  const handleToggleClassNotification = (id: string) => {
    pipAudio.playClick();
    setClasses((prev) =>
      prev.map((c) => (c.id === id ? { ...c, notificationEnabled: !c.notificationEnabled } : c))
    );
  };

  // Test native push notification
  const handleTestNotification = () => {
    pipAudio.playAlert();
    const targetClass = todayClasses[0] || classes[0];
    const title = targetClass ? `🔔 Напоминание: ${targetClass.subject}` : '🔔 Напоминание о расписании Pip-Boy';
    const body = targetClass
      ? `${targetClass.lessonNumber} пара начинается в ${targetClass.startTime} (${targetClass.classroom || 'аудитория не указана'}). Преподаватель: ${targetClass.teacher || '—'}`
      : 'Уведомления о расписании активны! Занятия синхронизированы с текущей неделей.';

    sendNativeNotification({
      title,
      body,
      icon: './icon-192.svg'
    });

    onSendNotification(title, body);
  };

  // Check schedule notifications timer: every 30 seconds
  const lastNotifiedRef = useRef<string>('');
  useEffect(() => {
    if (!config.enabled) return;

    const checkScheduleAlarm = () => {
      const now = new Date();
      const currentHours = now.getHours();
      const currentMinutes = now.getMinutes();
      const nowTotalMin = currentHours * 60 + currentMinutes;

      todayClasses.forEach((cls) => {
        if (!cls.notificationEnabled) return;
        const [clsH, clsM] = cls.startTime.split(':').map(Number);
        if (isNaN(clsH) || isNaN(clsM)) return;

        const classTotalMin = clsH * 60 + clsM;
        const diff = classTotalMin - nowTotalMin;

        // Check if class starts within configured minutes (e.g. 15 min)
        if (diff > 0 && diff <= config.minutesBefore) {
          const alarmKey = `${cls.id}-${now.toDateString()}-${cls.startTime}`;
          if (lastNotifiedRef.current !== alarmKey) {
            lastNotifiedRef.current = alarmKey;

            const title = `⚡ Пара через ${diff} мин: ${cls.subject}`;
            const body = `${cls.lessonNumber}-я пара (${cls.startTime}–${cls.endTime}), ${cls.classroom || 'ауд. не указана'}. ${cls.teacher ? `Преп.: ${cls.teacher}` : ''}`;

            sendNativeNotification({
              title,
              body,
              icon: './icon-192.svg'
            });

            onSendNotification(title, body);
            if (config.soundEnabled) {
              pipAudio.playAlert();
            }
          }
        }
      });
    };

    checkScheduleAlarm();
    const interval = setInterval(checkScheduleAlarm, 30000);
    return () => clearInterval(interval);
  }, [config, todayClasses, onSendNotification]);

  // AI Modal States
  const [aiMode, setAiMode] = useState<'image' | 'url' | 'text'>('image');
  const [aiImageBase64, setAiImageBase64] = useState<string | null>(null);
  const [aiImageName, setAiImageName] = useState<string>('');
  const [aiUrl, setAiUrl] = useState('');
  const [aiText, setAiText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiProgress, setAiProgress] = useState<{ stage: string; pct: number } | null>(null);
  const [aiParsedResults, setAiParsedResults] = useState<{ classes: ScheduleClass[]; summary: string } | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAiImageName(file.name);
    setAiParsedResults(null);
    setAiError(null);
    // Pre-warm worker immediately when user selects screenshot
    prewarmScheduleOcrWorker().catch(() => {});

    const reader = new FileReader();
    reader.onload = (event) => {
      const rawDataUrl = event.target?.result as string;
      const img = new Image();
      img.onload = () => {
        // Keep up to 2800px and lossless PNG so 1px table grid borders and small Cyrillic text stay razor-sharp
        const maxDim = 2800;
        let width = img.width;
        let height = img.height;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, width, height);
          const losslessPng = canvas.toDataURL('image/png');
          setAiImageBase64(losslessPng);
        } else {
          setAiImageBase64(rawDataUrl);
        }
      };
      img.onerror = () => {
        setAiImageBase64(rawDataUrl);
      };
      img.src = rawDataUrl;
      pipAudio.playClick();
    };
    reader.readAsDataURL(file);
  };

  const handleRunAIParser = async () => {
    if (aiMode === 'image' && !aiImageBase64) return;
    if (aiMode === 'url' && !aiUrl.trim()) return;
    if (aiMode === 'text' && !aiText.trim()) return;

    setAiLoading(true);
    setAiProgress({ stage: 'Инициализация табличного анализатора...', pct: 5 });
    setAiError(null);
    pipAudio.playGeiger(4);

    try {
      let data: any = null;
      const hasCustomBackend = Boolean((import.meta as any).env?.VITE_API_BASE_URL);

      // Skip network request immediately on GitHub Pages unless a custom backend URL is configured
      if (!isGitHubPagesHost() || hasCustomBackend) {
        try {
          setAiProgress({ stage: 'Анализ таблицы расписания через ИИ...', pct: 25 });
          const res = await fetch(resolveApiUrl('/api/ai/parse-schedule'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              image: aiMode === 'image' ? aiImageBase64 : undefined,
              mimeType: 'image/png',
              url: aiMode === 'url' ? aiUrl.trim() : undefined,
              text: aiMode === 'text' ? aiText.trim() : undefined
            })
          });

          if (res.ok) {
            data = await res.json();
          }
        } catch {
          // Proceed to client-side table grid OCR fallback
        }
      }

      if (!data || !Array.isArray(data.classes) || data.classes.length === 0) {
        data = await parseScheduleClientFallback({
          imageBase64: aiMode === 'image' && aiImageBase64 ? aiImageBase64 : undefined,
          text: aiMode === 'text' ? aiText.trim() : undefined,
          url: aiMode === 'url' ? aiUrl.trim() : undefined,
          onProgress: (stage, pct) => setAiProgress({ stage, pct })
        });
      }

      if (!data.classes || data.classes.length === 0) {
        throw new Error(
          data.error ||
            'В предоставленном источнике не обнаружено учебных занятий. Загрузите чёткий скриншот расписания или вставьте текст.'
        );
      }

      // Normalize all fields including subgroup and week ranges ("до 9 недели", "после 9 недели")
      const formatted: ScheduleClass[] = data.classes.map((c: any, idx: number) => {
        const derivedWeek = extractWeekRangeFromText(`${c.notes || ''} ${c.subject || ''}`);
        const weekFrom = c.weekFrom !== undefined ? Number(c.weekFrom) : derivedWeek.weekFrom;
        const weekTo = c.weekTo !== undefined ? Number(c.weekTo) : derivedWeek.weekTo;
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
          id: 'ai-class-' + Date.now() + '-' + idx,
          day: c.day || 'MON',
          weekParity: c.weekParity || 'BOTH',
          lessonNumber: Number(c.lessonNumber) || ((idx % 6) + 1),
          startTime: c.startTime || '09:00',
          endTime: c.endTime || '10:30',
          subject: c.subject || 'Дисциплина',
          lessonType: c.lessonType || 'SEMINAR',
          subgroup: rawSubgroup || undefined,
          weekFrom: weekFrom && !isNaN(weekFrom) ? weekFrom : undefined,
          weekTo: weekTo && !isNaN(weekTo) ? weekTo : undefined,
          weekRangeLabel,
          classroom: c.classroom,
          teacher: c.teacher,
          notes: c.notes,
          linkUrl: c.linkUrl,
          notificationEnabled: true
        };
      });

      setAiParsedResults({ classes: formatted, summary: data.summary });
      pipAudio.playSuccess();
    } catch (err: any) {
      setAiError(err.message || 'Произошла ошибка при анализе.');
      pipAudio.playAlert();
    } finally {
      setAiLoading(false);
      setAiProgress(null);
    }
  };

  // Interactive preview table editors
  const handleUpdatePreviewClass = (id: string, patch: Partial<ScheduleClass>) => {
    setAiParsedResults((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        classes: prev.classes.map((cls) => {
          if (cls.id !== id) return cls;
          const updated = { ...cls, ...patch };
          if ('weekFrom' in patch || 'weekTo' in patch || 'notes' in patch) {
            const wf = updated.weekFrom;
            const wt = updated.weekTo;
            updated.weekRangeLabel =
              wf && wt
                ? `${wf}–${wt} нед.`
                : wt
                ? `до ${wt} нед.`
                : wf
                ? `после ${wf - 1} нед.`
                : extractWeekRangeFromText(updated.notes).weekRangeLabel;
          }
          return updated;
        })
      };
    });
  };

  const handleDeletePreviewClass = (id: string) => {
    pipAudio.playClick();
    setAiParsedResults((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        classes: prev.classes.filter((cls) => cls.id !== id)
      };
    });
  };

  const handleAddPreviewClass = () => {
    pipAudio.playClick();
    setAiParsedResults((prev) => {
      if (!prev) return prev;
      const newRow: ScheduleClass = {
        id: 'ai-class-manual-' + Date.now(),
        day: 'MON',
        weekParity: 'BOTH',
        lessonNumber: 1,
        startTime: '09:00',
        endTime: '10:30',
        subject: 'Новое занятие',
        lessonType: 'LECTURE',
        notificationEnabled: true
      };
      return {
        ...prev,
        classes: [...prev.classes, newRow]
      };
    });
  };

  const handleApplyAIParsed = (replace: boolean) => {
    if (!aiParsedResults) return;
    pipAudio.playSuccess();

    if (replace) {
      setClasses(aiParsedResults.classes);
    } else {
      setClasses((prev) => [...prev, ...aiParsedResults.classes]);
    }

    onSendNotification(
      'РАСПИСАНИЕ ОБНОВЛЕНО ИИ',
      `Успешно загружено ${aiParsedResults.classes.length} пар (синхронизировано с ${liveAcademicWeekNum}-й учебной неделей и подгруппами).`
    );

    setIsAIModalOpen(false);
    setAiParsedResults(null);
    setAiImageBase64(null);
    setAiUrl('');
    setAiText('');
  };

  return (
    <div className="space-y-4 font-mono">
      {/* Top Header & Academic Parity Banner */}
      <div className="border border-[var(--crt-phosphor-dim)] bg-[#071309] p-3.5 rounded-lg space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 border border-[var(--crt-phosphor)] bg-[var(--crt-phosphor)]/15 rounded-lg shrink-0">
              <Calendar size={22} className="text-[var(--crt-phosphor-bright)]" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-extrabold text-[var(--crt-phosphor-bright)] tracking-wider uppercase">
                  РАСПИСАНИЕ ЗАНЯТИЙ
                </h2>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded font-black border uppercase flex items-center gap-1 ${
                    moscowTime.computedParity.isOdd
                      ? 'bg-emerald-950 text-emerald-300 border-emerald-500'
                      : 'bg-amber-950 text-amber-300 border-amber-500'
                  }`}
                >
                  {moscowTime.computedParity.isOdd ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
                  <span>СЕЙЧАС: {moscowTime.computedParity.typeName} неделя</span>
                </span>
              </div>
              <p className="text-xs text-[var(--crt-phosphor)]/80 mt-0.5">
                Интеллектуальное расписание студента: верхняя и нижняя недели, ручной ввод или мгновенное распознавание по скриншоту/ссылке через нейросеть.
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {/* AI Recognizer Button */}
            <button
              onClick={() => {
                pipAudio.playSuccess();
                setIsAIModalOpen(true);
              }}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-amber-400 bg-amber-950/60 text-amber-300 hover:bg-amber-400 hover:text-black transition-colors rounded cursor-pointer font-bold shadow-[0_0_10px_rgba(251,191,36,0.25)]"
              title="Загрузить скриншот расписания или ссылку на сайт для распознавания нейросетью"
            >
              <Sparkles size={14} className="text-amber-400" />
              <span>РАСПОЗНАТЬ ЧЕРЕЗ ИИ</span>
            </button>

            {/* Manual Add Button */}
            <button
              onClick={() => openAddModal()}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-[var(--crt-phosphor)] bg-[var(--crt-phosphor)] text-black hover:bg-[var(--crt-phosphor-bright)] transition-colors rounded cursor-pointer font-extrabold"
            >
              <Plus size={14} />
              <span>ДОБАВИТЬ ПАРУ</span>
            </button>

            {/* Clear All Schedule Button */}
            {classes.length > 0 && (
              <button
                onClick={() => {
                  pipAudio.playClick();
                  setClasses([]);
                  try {
                    localStorage.removeItem(STORAGE_KEYS.CLASSES);
                  } catch {}
                  pipAudio.playSuccess();
                }}
                className="p-1.5 border border-red-900/60 hover:border-red-500 text-red-400 rounded cursor-pointer transition-colors"
                title="Очистить всё расписание"
              >
                <Trash2 size={14} />
              </button>
            )}

            {/* Test Notification Button */}
            <button
              onClick={handleTestNotification}
              className="p-1.5 border border-[var(--crt-phosphor-dim)] hover:border-[var(--crt-phosphor)] rounded cursor-pointer text-[var(--crt-phosphor)] transition-colors"
              title="Проверить звуковое и системное уведомление о начале пары"
            >
              <Bell size={14} />
            </button>

            {/* Notification Settings Button */}
            <button
              onClick={() => {
                pipAudio.playClick();
                setIsConfigModalOpen(true);
              }}
              className="p-1.5 border border-[var(--crt-phosphor-dim)] hover:border-[var(--crt-phosphor)] rounded cursor-pointer text-[var(--crt-phosphor)] transition-colors"
              title="Настройки уведомлений и напоминаний о парах"
            >
              <Sliders size={14} />
            </button>
          </div>
        </div>

        {/* Live Today's Schedule Quick Status */}
        {todayDayCode && (
          <div className="bg-[#0b170e] border border-[var(--crt-phosphor-dim)]/60 rounded p-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <Clock size={13} className="text-amber-400 shrink-0" />
              <span>
                СЕГОДНЯ: <strong>{moscowTime.weekdayFull}</strong> ({moscowTime.timeStr} МСК) •
                Пар на сегодня: <strong className="text-[var(--crt-phosphor-bright)]">{todayClasses.length}</strong>
              </span>
            </div>

            {todayClasses.length > 0 && (
              <div className="flex items-center gap-2 text-[11px] text-[var(--crt-phosphor-bright)]">
                <span>Ближайшая:</span>
                <span className="font-bold underline">
                  {todayClasses[0].subject} ({todayClasses[0].startTime})
                </span>
                {todayClasses[0].classroom && (
                  <span className="opacity-75">[{todayClasses[0].classroom}]</span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Parity, Academic Week Number, Subgroup & Day Filter Controls */}
        <div className="space-y-2.5 pt-1 border-t border-[var(--crt-phosphor-dim)]/40 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Parity Selector */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="opacity-60 text-[10px] uppercase">Неделя:</span>
              <div className="flex items-center border border-[var(--crt-phosphor-dim)] rounded overflow-hidden">
                <button
                  onClick={() => {
                    pipAudio.playClick();
                    setSelectedParityFilter('CURRENT');
                  }}
                  className={`px-2.5 py-1 text-xs cursor-pointer transition-colors flex items-center gap-1 whitespace-nowrap shrink-0 ${
                    selectedParityFilter === 'CURRENT'
                      ? 'bg-[var(--crt-phosphor)] text-black font-extrabold'
                      : 'bg-black/60 text-[var(--crt-phosphor)]/80 hover:text-[var(--crt-phosphor)]'
                  }`}
                  title="Автоматически отображать расписание текущей учебной недели по календарю"
                >
                  <span>
                    СЕЙЧАС ({liveAcademicWeekNum} нед. · {moscowTime.computedParity.typeName.slice(0, 4)}.)
                  </span>
                </button>

                <button
                  onClick={() => {
                    pipAudio.playClick();
                    setSelectedParityFilter('UPPER');
                  }}
                  className={`px-2.5 py-1 text-xs cursor-pointer transition-colors flex items-center gap-1 whitespace-nowrap shrink-0 ${
                    selectedParityFilter === 'UPPER'
                      ? 'bg-[var(--crt-phosphor)] text-black font-extrabold'
                      : 'bg-black/60 text-[var(--crt-phosphor)]/80 hover:text-[var(--crt-phosphor)]'
                  }`}
                >
                  <ArrowUpRight size={11} />
                  <span>ВЕРХНЯЯ</span>
                </button>

                <button
                  onClick={() => {
                    pipAudio.playClick();
                    setSelectedParityFilter('LOWER');
                  }}
                  className={`px-2.5 py-1 text-xs cursor-pointer transition-colors flex items-center gap-1 whitespace-nowrap shrink-0 ${
                    selectedParityFilter === 'LOWER'
                      ? 'bg-[var(--crt-phosphor)] text-black font-extrabold'
                      : 'bg-black/60 text-[var(--crt-phosphor)]/80 hover:text-[var(--crt-phosphor)]'
                  }`}
                >
                  <ArrowDownRight size={11} />
                  <span>НИЖНЯЯ</span>
                </button>

                <button
                  onClick={() => {
                    pipAudio.playClick();
                    setSelectedParityFilter('ALL');
                  }}
                  className={`px-2.5 py-1 text-xs cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
                    selectedParityFilter === 'ALL'
                      ? 'bg-[var(--crt-phosphor)] text-black font-extrabold'
                      : 'bg-black/60 text-[var(--crt-phosphor)]/80 hover:text-[var(--crt-phosphor)]'
                  }`}
                >
                  <span>ОБЕ НЕДЕЛИ</span>
                </button>
              </div>
            </div>

            {/* Academic Week Number Synchronizer & Subgroup Filter */}
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Academic Week Selector ("до 9 недели" / "после 9 недели") */}
              <div className="flex items-center gap-1.5">
                <span className="opacity-60 text-[10px] uppercase">Уч. неделя:</span>
                <select
                  value={selectedWeekNumFilter === 'AUTO' ? 'AUTO' : selectedWeekNumFilter === 'ALL' ? 'ALL' : String(selectedWeekNumFilter)}
                  onChange={(e) => {
                    pipAudio.playClick();
                    const v = e.target.value;
                    if (v === 'AUTO') setSelectedWeekNumFilter('AUTO');
                    else if (v === 'ALL') setSelectedWeekNumFilter('ALL');
                    else {
                      const num = Number(v);
                      setSelectedWeekNumFilter(num);
                      // Also sync parity automatically if user picks a specific week number (odd = UPPER, even = LOWER)
                      setSelectedParityFilter(num % 2 === 1 ? 'UPPER' : 'LOWER');
                    }
                  }}
                  className="bg-black border border-[var(--crt-phosphor-dim)] hover:border-[var(--crt-phosphor)] px-2 py-1 rounded text-[11px] text-[var(--crt-phosphor-bright)] font-mono cursor-pointer outline-none"
                  title="Синхронизация расписания с номером учебной недели (например, до 9 недели / после 9 недели)"
                >
                  <option value="AUTO">Авто ({liveAcademicWeekNum} нед. · текущая)</option>
                  <option value="ALL">Все недели семестра (без фильтра до/после)</option>
                  {Array.from({ length: 18 }, (_, i) => i + 1).map((w) => (
                    <option key={w} value={w}>
                      {w} учебная неделя ({w % 2 === 1 ? 'верхняя' : 'нижняя'})
                      {w === liveAcademicWeekNum ? ' ★ сейчас' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Subgroup Filter */}
              <div className="flex items-center gap-1">
                <span className="opacity-60 text-[10px] uppercase">Подгр.:</span>
                <div className="flex items-center border border-[var(--crt-phosphor-dim)] rounded overflow-hidden">
                  {(['ALL', '1', '2', '3'] as const).map((sg) => (
                    <button
                      key={sg}
                      onClick={() => {
                        pipAudio.playClick();
                        setSelectedSubgroupFilter(sg);
                      }}
                      className={`px-2 py-0.5 text-[11px] cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
                        selectedSubgroupFilter === sg
                          ? 'bg-[var(--crt-phosphor)] text-black font-extrabold'
                          : 'bg-black/60 text-[var(--crt-phosphor)]/80 hover:text-[var(--crt-phosphor)]'
                      }`}
                    >
                      {sg === 'ALL' ? 'Все' : `${sg})`}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Days Filter Buttons */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
              <button
                onClick={() => {
                  pipAudio.playClick();
                  setSelectedDayFilter('ALL');
                }}
                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  selectedDayFilter === 'ALL'
                    ? 'bg-[var(--crt-phosphor)] text-black'
                    : 'border border-[var(--crt-phosphor-dim)]/50 text-[var(--crt-phosphor)]/80'
                }`}
              >
                ВСЯ НЕДЕЛЯ
              </button>
              {DAYS_CONFIG.map((d) => {
                const isToday = d.id === todayDayCode;
                const isSelected = selectedDayFilter === d.id;
                const count = classes.filter((c) => {
                  if (c.day !== d.id) return false;
                  if (effectiveParity !== 'ALL') {
                    if (c.weekParity !== 'BOTH' && c.weekParity !== effectiveParity) return false;
                  }
                  if (effectiveWeekNum !== null && !isClassActiveOnAcademicWeek(c, effectiveWeekNum)) {
                    return false;
                  }
                  if (selectedSubgroupFilter !== 'ALL' && c.subgroup && c.subgroup !== selectedSubgroupFilter) {
                    return false;
                  }
                  return true;
                }).length;

                return (
                  <button
                    key={d.id}
                    onClick={() => {
                      pipAudio.playClick();
                      setSelectedDayFilter(d.id);
                    }}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase transition-colors cursor-pointer flex items-center gap-1 whitespace-nowrap shrink-0 ${
                      isSelected
                        ? 'bg-[var(--crt-phosphor)] text-black'
                        : 'border border-[var(--crt-phosphor-dim)]/50 text-[var(--crt-phosphor)]/80 hover:border-[var(--crt-phosphor)]'
                    }`}
                  >
                    <span>{d.shortLabel}</span>
                    {count > 0 && <span className="text-[9px] opacity-75">({count})</span>}
                    {isToday && <span className="text-amber-400 font-extrabold">•</span>}
                  </button>
                );
              })}
            </div>

            {effectiveWeekNum !== null && (
              <div className="text-[10px] text-amber-300/90 flex items-center gap-1.5">
                <span>
                  Активен фильтр <strong>{effectiveWeekNum}-й учебной недели</strong> (показаны пары «до {effectiveWeekNum} нед.» и активные на {effectiveWeekNum} нед.)
                </span>
                <button
                  onClick={() => {
                    pipAudio.playClick();
                    setSelectedWeekNumFilter('ALL');
                    setSelectedParityFilter('ALL');
                  }}
                  className="underline hover:text-amber-200 cursor-pointer"
                >
                  Показать все недели
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Classes Grid or Grouped List */}
      {filteredClasses.length === 0 ? (
        <div className="border border-dashed border-[var(--crt-phosphor-dim)] p-8 text-center rounded-lg bg-black/40 space-y-3">
          <Calendar className="mx-auto opacity-50" size={36} />
          <div className="font-bold text-sm text-[var(--crt-phosphor-bright)]">
            Занятий не найдено
          </div>
          <p className="text-xs opacity-75 max-w-md mx-auto leading-relaxed">
            На выбранный период ({selectedParityFilter === 'CURRENT' ? `${liveAcademicWeekNum}-я (${moscowTime.computedParity.typeName}) неделя` : selectedParityFilter}) пары не внесены.
            Вы можете внести пары вручную или распознать расписание по скриншоту.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
            <button
              onClick={() => openAddModal()}
              className="px-4 py-2 bg-[var(--crt-phosphor)] text-black font-extrabold text-xs uppercase rounded cursor-pointer hover:bg-[var(--crt-phosphor-bright)] transition-colors inline-flex items-center gap-1.5"
            >
              <Plus size={14} /> ВНЕСТИ ЗАНЯТИЕ
            </button>
            <button
              onClick={() => setIsAIModalOpen(true)}
              className="px-4 py-2 border border-amber-400 bg-amber-950/40 text-amber-300 font-bold text-xs uppercase rounded cursor-pointer hover:bg-amber-400 hover:text-black transition-colors inline-flex items-center gap-1.5"
            >
              <Sparkles size={14} /> РАСПОЗНАТЬ ПО СКРИНШОТУ
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {DAYS_CONFIG.filter((d) => selectedDayFilter === 'ALL' || selectedDayFilter === d.id).map((dayConfig) => {
            const dayClasses = filteredClasses.filter((c) => c.day === dayConfig.id);
            if (dayClasses.length === 0 && selectedDayFilter === 'ALL') return null;

            const isToday = dayConfig.id === todayDayCode;

            return (
              <div
                key={dayConfig.id}
                className="border border-[var(--crt-phosphor-dim)]/70 bg-[#071309] rounded-lg p-3 space-y-2.5"
              >
                {/* Day Header */}
                <div className="flex items-center justify-between border-b border-[var(--crt-phosphor-dim)]/40 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-sm text-[var(--crt-phosphor-bright)] uppercase tracking-wider">
                      {dayConfig.label}
                    </span>
                    {isToday && (
                      <span className="text-[10px] px-2 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-500 font-bold uppercase">
                        СЕГОДНЯ
                      </span>
                    )}
                    <span className="text-[10px] opacity-60">
                      ({dayClasses.length} {dayClasses.length === 1 ? 'пара' : dayClasses.length < 5 ? 'пары' : 'пар'})
                    </span>
                  </div>

                  <button
                    onClick={() => openAddModal(dayConfig.id)}
                    className="text-[10px] px-2 py-0.5 border border-[var(--crt-phosphor-dim)] hover:border-[var(--crt-phosphor)] rounded flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <Plus size={10} /> Добавить в {dayConfig.shortLabel}
                  </button>
                </div>

                {/* Day Classes */}
                {dayClasses.length === 0 ? (
                  <div className="text-xs opacity-50 py-2 italic text-center">
                    В этот день занятий нет
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {dayClasses.map((cls) => {
                      const typeConfig = LESSON_TYPES_CONFIG.find((t) => t.id === cls.lessonType) || LESSON_TYPES_CONFIG[0];
                      const isNotifOn = cls.notificationEnabled ?? true;
                      const derivedWeek =
                        cls.weekRangeLabel ||
                        extractWeekRangeFromText(cls.notes).weekRangeLabel ||
                        (cls.weekTo ? `до ${cls.weekTo} нед.` : cls.weekFrom ? `после ${cls.weekFrom - 1} нед.` : undefined);

                      return (
                        <div
                          key={cls.id}
                          className="bg-black/70 border border-[var(--crt-phosphor-dim)]/50 hover:border-[var(--crt-phosphor)] p-3 rounded-lg space-y-2 transition-all"
                        >
                          {/* Card Top: Number, Time, Subgroup, Week Range, Parity Badge */}
                          <div className="flex items-center justify-between text-xs gap-2 flex-wrap">
                            <div className="flex items-center gap-1.5 font-bold flex-wrap">
                              <span className="px-1.5 py-0.5 bg-[var(--crt-phosphor)]/20 text-[var(--crt-phosphor-bright)] border border-[var(--crt-phosphor-dim)] rounded text-[10px] tabular-nums">
                                {cls.lessonNumber} пара
                              </span>
                              <span className="text-[11px] text-[var(--crt-phosphor-bright)] tabular-nums">
                                {cls.startTime} – {cls.endTime}
                              </span>
                              {cls.subgroup && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-950/80 text-cyan-200 border border-cyan-400 font-extrabold">
                                  {cls.subgroup} подгр.
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-1 flex-wrap">
                              {derivedWeek && (
                                <span className="text-[9px] px-1.5 py-0.2 rounded font-bold border bg-purple-950/70 text-purple-200 border-purple-400">
                                  {derivedWeek}
                                </span>
                              )}

                              {/* Week Parity Badge */}
                              <span
                                className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase border ${
                                  cls.weekParity === 'UPPER'
                                    ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500'
                                    : cls.weekParity === 'LOWER'
                                    ? 'bg-amber-950/60 text-amber-300 border-amber-500'
                                    : 'bg-zinc-900 text-zinc-300 border-zinc-700'
                                }`}
                              >
                                {cls.weekParity === 'UPPER'
                                  ? 'ВЕРХНЯЯ'
                                  : cls.weekParity === 'LOWER'
                                  ? 'НИЖНЯЯ'
                                  : 'ОБЕ НЕДЕЛИ'}
                              </span>

                              {/* Lesson Type */}
                              <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase border ${typeConfig.badgeColor}`}>
                                {typeConfig.label}
                              </span>
                            </div>
                          </div>

                          {/* Subject Name */}
                          <div className="font-extrabold text-sm text-[var(--crt-phosphor-bright)] leading-snug">
                            {cls.subject}
                          </div>

                          {/* Classroom & Teacher */}
                          <div className="space-y-1 text-xs opacity-85">
                            {cls.classroom && (
                              <div className="flex items-center gap-1.5 text-[11px]">
                                <MapPin size={11} className="text-amber-400 shrink-0" />
                                <span>{cls.classroom}</span>
                              </div>
                            )}
                            {cls.teacher && (
                              <div className="flex items-center gap-1.5 text-[11px]">
                                <UserCheck size={11} className="text-[var(--crt-phosphor)] shrink-0" />
                                <span>{cls.teacher}</span>
                              </div>
                            )}
                            {cls.notes && (
                              <div className="text-[10px] opacity-75 bg-black/40 p-1.5 rounded font-sans italic border border-[var(--crt-phosphor-dim)]/40">
                                {cls.notes}
                              </div>
                            )}
                          </div>

                          {/* Card Footer Actions */}
                          <div className="flex items-center justify-between pt-1 border-t border-[var(--crt-phosphor-dim)]/30 text-xs">
                            <button
                              onClick={() => handleToggleClassNotification(cls.id)}
                              className={`text-[10px] px-2 py-0.5 rounded border flex items-center gap-1 cursor-pointer transition-colors ${
                                isNotifOn
                                  ? 'border-[var(--crt-phosphor)] text-[var(--crt-phosphor)] bg-[var(--crt-phosphor)]/15'
                                  : 'border-zinc-700 text-zinc-500 hover:text-zinc-300'
                              }`}
                              title={isNotifOn ? 'Уведомления о паре активны' : 'Уведомления выключены'}
                            >
                              {isNotifOn ? <Bell size={10} /> : <BellOff size={10} />}
                              <span>{isNotifOn ? 'Напоминать' : 'Без звука'}</span>
                            </button>

                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => openEditModal(cls)}
                                className="p-1 text-[var(--crt-phosphor)]/80 hover:text-[var(--crt-phosphor)] cursor-pointer"
                                title="Редактировать"
                              >
                                <Edit2 size={12} />
                              </button>
                              <button
                                onClick={() => handleDeleteClass(cls.id)}
                                className="p-1 text-red-400 hover:text-red-300 cursor-pointer"
                                title="Удалить"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL 1: MANUAL ADD / EDIT CLASS */}
      {isAddEditModalOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 bg-black/95 flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto">
          <div className="border-2 border-[var(--crt-phosphor)] bg-[#050d06] p-4 sm:p-5 rounded-xl max-w-lg w-full text-[var(--crt-phosphor)] space-y-4 shadow-2xl font-mono">
            <div className="text-sm font-bold tracking-wider uppercase flex items-center justify-between border-b border-[var(--crt-phosphor-dim)] pb-2.5">
              <span className="flex items-center gap-2 text-[var(--crt-phosphor-bright)]">
                <Calendar size={16} />
                {editingClass ? 'РЕДАКТИРОВАТЬ ЗАНЯТИЕ' : 'ДОБАВИТЬ ЗАНЯТИЕ В РАСПИСАНИЕ'}
              </span>
              <button
                onClick={() => setIsAddEditModalOpen(false)}
                className="cursor-pointer text-xs p-1 hover:bg-[var(--crt-phosphor)]/20 rounded"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveClass} className="space-y-3.5 text-xs">
              {/* Day of Week & Week Parity */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider mb-1">
                    День недели:
                  </label>
                  <select
                    value={formDay}
                    onChange={(e) => setFormDay(e.target.value as DayOfWeek)}
                    className="w-full bg-black border border-[var(--crt-phosphor)] px-2.5 py-1.5 rounded text-[var(--crt-phosphor)] outline-none font-mono uppercase cursor-pointer"
                  >
                    {DAYS_CONFIG.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.label} ({d.shortLabel})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider mb-1">
                    Четность недели:
                  </label>
                  <select
                    value={formParity}
                    onChange={(e) => setFormParity(e.target.value as WeekParityType)}
                    className="w-full bg-black border border-[var(--crt-phosphor)] px-2.5 py-1.5 rounded text-[var(--crt-phosphor)] outline-none font-mono uppercase cursor-pointer"
                  >
                    <option value="BOTH">Обе недели (каждую неделю)</option>
                    <option value="UPPER">Верхняя (нечетная / числитель)</option>
                    <option value="LOWER">Нижняя (четная / знаменатель)</option>
                  </select>
                </div>
              </div>

              {/* Subgroup & Week Range ("до 9 недели" / "после 9 недели") */}
              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider mb-1">
                    Подгруппа:
                  </label>
                  <select
                    value={formSubgroup}
                    onChange={(e) => setFormSubgroup(e.target.value)}
                    className="w-full bg-black border border-[var(--crt-phosphor)] px-2 py-1.5 rounded text-[var(--crt-phosphor)] outline-none font-mono cursor-pointer"
                  >
                    <option value="">Весь поток</option>
                    <option value="1">1 подгруппа</option>
                    <option value="2">2 подгруппа</option>
                    <option value="3">3 подгруппа</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider mb-1">
                    С уч. недели:
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={22}
                    placeholder="Напр. 10"
                    value={formWeekFrom}
                    onChange={(e) => setFormWeekFrom(e.target.value)}
                    className="w-full bg-black border border-[var(--crt-phosphor)] px-2.5 py-1.5 rounded text-[var(--crt-phosphor)] outline-none font-mono"
                    title="Например: 10 (для пар «после 9 недели»)"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider mb-1">
                    До уч. недели:
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={22}
                    placeholder="Напр. 9"
                    value={formWeekTo}
                    onChange={(e) => setFormWeekTo(e.target.value)}
                    className="w-full bg-black border border-[var(--crt-phosphor)] px-2.5 py-1.5 rounded text-[var(--crt-phosphor)] outline-none font-mono"
                    title="Например: 9 (для пар «до 9 недели»)"
                  />
                </div>
              </div>

              {/* Lesson Number & Quick Time Presets */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider mb-1">
                  Номер пары:
                </label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {[1, 2, 3, 4, 5, 6].map((num) => {
                    const preset = STANDARD_LESSON_TIMES.find((p) => p.number === num);
                    const isSelected = formLessonNumber === num;
                    return (
                      <button
                        key={num}
                        type="button"
                        onClick={() => {
                          pipAudio.playClick();
                          setFormLessonNumber(num);
                          if (preset) {
                            setFormStartTime(preset.start);
                            setFormEndTime(preset.end);
                          }
                        }}
                        className={`px-3 py-1 text-xs rounded border cursor-pointer font-bold transition-colors ${
                          isSelected
                            ? 'bg-[var(--crt-phosphor)] text-black border-[var(--crt-phosphor)]'
                            : 'border-[var(--crt-phosphor-dim)] text-[var(--crt-phosphor)]/80 hover:border-[var(--crt-phosphor)]'
                        }`}
                      >
                        {num} пара
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Time Start & End */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider mb-1">
                    Начало пары:
                  </label>
                  <input
                    type="time"
                    required
                    value={formStartTime}
                    onChange={(e) => setFormStartTime(e.target.value)}
                    className="w-full bg-black border border-[var(--crt-phosphor)] px-2.5 py-1.5 rounded text-[var(--crt-phosphor)] outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider mb-1">
                    Окончание пары:
                  </label>
                  <input
                    type="time"
                    required
                    value={formEndTime}
                    onChange={(e) => setFormEndTime(e.target.value)}
                    className="w-full bg-black border border-[var(--crt-phosphor)] px-2.5 py-1.5 rounded text-[var(--crt-phosphor)] outline-none font-mono"
                  />
                </div>
              </div>

              {/* Subject & Lesson Type */}
              <div className="space-y-2">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider mb-1">
                    Название предмета:
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Например: Первобытное общество, Классические языки..."
                    value={formSubject}
                    onChange={(e) => setFormSubject(e.target.value)}
                    className="w-full bg-black border border-[var(--crt-phosphor)] px-3 py-2 rounded text-[var(--crt-phosphor)] outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider mb-1">
                    Тип занятия:
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {LESSON_TYPES_CONFIG.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          pipAudio.playClick();
                          setFormLessonType(t.id);
                        }}
                        className={`px-2.5 py-1 rounded text-[11px] border cursor-pointer transition-colors ${
                          formLessonType === t.id
                            ? 'bg-[var(--crt-phosphor)] text-black font-extrabold border-[var(--crt-phosphor)]'
                            : 'border-[var(--crt-phosphor-dim)]/60 text-[var(--crt-phosphor)]/80 hover:border-[var(--crt-phosphor)]'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Classroom & Teacher */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider mb-1">
                    Аудитория / Кабинет:
                  </label>
                  <input
                    type="text"
                    placeholder="1201, Спортзал или ДОТ"
                    value={formClassroom}
                    onChange={(e) => setFormClassroom(e.target.value)}
                    className="w-full bg-black border border-[var(--crt-phosphor)] px-2.5 py-1.5 rounded text-[var(--crt-phosphor)] outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider mb-1">
                    Преподаватель (ФИО):
                  </label>
                  <input
                    type="text"
                    placeholder="Самойлов Кирилл Глебович"
                    value={formTeacher}
                    onChange={(e) => setFormTeacher(e.target.value)}
                    className="w-full bg-black border border-[var(--crt-phosphor)] px-2.5 py-1.5 rounded text-[var(--crt-phosphor)] outline-none font-mono"
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider mb-1">
                  Комментарий / Примечание (напр. до 9 недели, ИГУМ):
                </label>
                <input
                  type="text"
                  placeholder="по верхней неделе, до 9 недели, ИГУМ, Антоново..."
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full bg-black border border-[var(--crt-phosphor)] px-2.5 py-1.5 rounded text-[var(--crt-phosphor)] outline-none font-mono"
                />
              </div>

              {/* Notification toggle */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="formNotifyCheck"
                  checked={formNotify}
                  onChange={(e) => setFormNotify(e.target.checked)}
                  className="accent-[var(--crt-phosphor)] w-4 h-4 cursor-pointer"
                />
                <label htmlFor="formNotifyCheck" className="text-xs cursor-pointer select-none">
                  Включить push-напоминание перед началом этой пары
                </label>
              </div>

              {/* Modal Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--crt-phosphor-dim)]">
                <button
                  type="button"
                  onClick={() => setIsAddEditModalOpen(false)}
                  className="px-4 py-2 border border-zinc-700 hover:border-zinc-500 rounded text-xs cursor-pointer"
                >
                  ОТМЕНА
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[var(--crt-phosphor)] text-black font-extrabold rounded text-xs uppercase cursor-pointer hover:bg-[var(--crt-phosphor-bright)] transition-colors shadow-md"
                >
                  {editingClass ? 'СОХРАНИТЬ ИЗМЕНЕНИЯ' : 'ДОБАВИТЬ В РАСПИСАНИЕ'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL 2: AI SCHEDULE PARSER (SCREENSHOT / URL / TEXT) WITH INTERACTIVE EDITABLE TABLE PREVIEW */}
      {isAIModalOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 bg-black/95 flex items-center justify-center p-2 sm:p-4 z-50 overflow-y-auto">
          <div
            className={`border-2 border-amber-400 bg-[#071109] p-4 sm:p-5 rounded-xl w-full text-[var(--crt-phosphor)] space-y-4 shadow-[0_0_30px_rgba(251,191,36,0.3)] font-mono max-h-[94vh] flex flex-col transition-all ${
              aiParsedResults ? 'max-w-6xl' : 'max-w-2xl'
            }`}
          >
            <div className="text-sm font-bold tracking-wider uppercase flex items-center justify-between border-b border-amber-400/50 pb-2.5 shrink-0">
              <span className="flex items-center gap-2 text-amber-300">
                <Sparkles size={18} />
                <span>ИИ-РАСПОЗНАВАНИЕ ТАБЛИЦЫ РАСПИСАНИЯ (7 КОЛОНОК · ПОДГРУППЫ · НЕДЕЛИ)</span>
              </span>
              <button
                onClick={() => setIsAIModalOpen(false)}
                className="cursor-pointer text-xs p-1 hover:bg-amber-400/20 text-amber-300 rounded"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              <p className="text-xs text-[var(--crt-phosphor)]/85 leading-relaxed font-sans">
                Загрузите <strong>отдалённый скриншот всей таблицы расписания</strong> (PNG/JPG), ссылку или текст.
                Табличный анализатор автоматически выделяет 7 колонок (<em>дата, время, подгр., предмет, преподаватель, ауд., комм.</em>),
                распознаёт подгруппы (1, 2, 3) и синхронизирует пометки «до 9 недели» / «после 9 недели» с текущей <strong>{liveAcademicWeekNum}-й учебной неделей</strong>.
              </p>

              {/* Source Mode Switcher */}
              <div className="flex items-center border border-[var(--crt-phosphor-dim)] rounded overflow-hidden text-xs">
                <button
                  onClick={() => {
                    pipAudio.playClick();
                    setAiMode('image');
                  }}
                  className={`flex-1 py-2 flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    aiMode === 'image'
                      ? 'bg-amber-400 text-black font-extrabold'
                      : 'bg-black/60 text-[var(--crt-phosphor)]/80 hover:text-[var(--crt-phosphor)]'
                  }`}
                >
                  <Upload size={13} />
                  <span>СКРИНШОТ / ФОТО</span>
                </button>
                <button
                  onClick={() => {
                    pipAudio.playClick();
                    setAiMode('url');
                  }}
                  className={`flex-1 py-2 flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    aiMode === 'url'
                      ? 'bg-amber-400 text-black font-extrabold'
                      : 'bg-black/60 text-[var(--crt-phosphor)]/80 hover:text-[var(--crt-phosphor)]'
                  }`}
                >
                  <LinkIcon size={13} />
                  <span>ССЫЛКА НА САЙТ</span>
                </button>
                <button
                  onClick={() => {
                    pipAudio.playClick();
                    setAiMode('text');
                  }}
                  className={`flex-1 py-2 flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    aiMode === 'text'
                      ? 'bg-amber-400 text-black font-extrabold'
                      : 'bg-black/60 text-[var(--crt-phosphor)]/80 hover:text-[var(--crt-phosphor)]'
                  }`}
                >
                  <FileText size={13} />
                  <span>ТЕКСТ / ТАБЛИЦА</span>
                </button>
              </div>

              {/* Mode Inputs */}
              {aiMode === 'image' && (
                <div className="space-y-3">
                  <div className="border-2 border-dashed border-amber-400/60 rounded-xl p-4 text-center bg-black/50 space-y-2 hover:border-amber-400 transition-colors">
                    <input
                      type="file"
                      id="aiScheduleFileInput"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                    <label
                      htmlFor="aiScheduleFileInput"
                      className="cursor-pointer block space-y-1.5"
                    >
                      <Upload className="mx-auto text-amber-400" size={28} />
                      <div className="font-bold text-xs text-amber-200">
                        {aiImageName ? `Выбран файл: ${aiImageName}` : 'Нажмите для выбора скриншота расписания (PNG, JPG, WEBP)'}
                      </div>
                      <div className="text-[10px] opacity-70">
                        Поддерживаются отдалённые полные скриншоты таблиц на всю неделю без потери чёткости мелкого шрифта
                      </div>
                    </label>
                  </div>

                  {aiImageBase64 && (
                    <div className="p-2 border border-zinc-700 bg-black/70 rounded flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 truncate">
                        <img
                          src={aiImageBase64}
                          alt="Скриншот расписания"
                          referrerPolicy="no-referrer"
                          className="w-12 h-12 object-cover rounded border border-zinc-600 shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="text-xs truncate font-bold text-amber-200">
                            {aiImageName || 'Скриншот готов к табличному анализу'}
                          </div>
                          <div className="text-[10px] opacity-70">
                            Режим повышенной чёткости PNG + 2.25x контраст ячеек
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {aiParsedResults && (
                          <button
                            onClick={handleRunAIParser}
                            disabled={aiLoading}
                            className="text-xs px-2.5 py-1 border border-amber-400 text-amber-300 hover:bg-amber-400 hover:text-black rounded cursor-pointer font-bold"
                          >
                            Пересканировать
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setAiImageBase64(null);
                            setAiImageName('');
                            setAiParsedResults(null);
                          }}
                          className="text-xs text-red-400 hover:underline cursor-pointer"
                        >
                          Удалить
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {aiMode === 'url' && (
                <div className="space-y-2">
                  <label className="block text-xs font-bold uppercase tracking-wider">
                    URL адрес страницы расписания:
                  </label>
                  <input
                    type="text"
                    value={aiUrl}
                    onChange={(e) => setAiUrl(e.target.value)}
                    placeholder="https://portal.novsu.ru/... или страница расписания вуза"
                    className="w-full bg-black border border-amber-400/80 px-3 py-2 rounded text-xs text-[var(--crt-phosphor)] outline-none font-mono"
                  />
                </div>
              )}

              {aiMode === 'text' && (
                <div className="space-y-2">
                  <label className="block text-xs font-bold uppercase tracking-wider">
                    Вставьте текст или скопированные строки таблицы расписания:
                  </label>
                  <textarea
                    rows={5}
                    value={aiText}
                    onChange={(e) => setAiText(e.target.value)}
                    placeholder="Пн 8:00 9:00 (лек./пр.) Физическая культура и спорт Ефимова Елена Васильевна Спортзал..."
                    className="w-full bg-black border border-amber-400/80 p-3 rounded text-xs text-[var(--crt-phosphor)] outline-none font-mono leading-relaxed"
                  />
                </div>
              )}

              {/* Live Progress Bar during OCR / AI Analysis */}
              {aiLoading && aiProgress && (
                <div className="p-3 bg-amber-950/30 border border-amber-400/60 rounded-lg space-y-2">
                  <div className="flex items-center justify-between text-xs text-amber-200 font-bold">
                    <span className="flex items-center gap-2">
                      <span className="w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin inline-block" />
                      {aiProgress.stage}
                    </span>
                    <span className="tabular-nums">{aiProgress.pct}%</span>
                  </div>
                  <div className="w-full h-2 bg-black rounded-full overflow-hidden border border-amber-400/40">
                    <div
                      className="h-full bg-amber-400 transition-all duration-200"
                      style={{ width: `${Math.max(5, Math.min(100, aiProgress.pct))}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Error Banner */}
              {aiError && (
                <div className="p-3 bg-red-950/60 border border-red-500 rounded text-xs text-red-200 flex items-start gap-2">
                  <AlertTriangle size={15} className="shrink-0 mt-0.5 text-red-400" />
                  <span>{aiError}</span>
                </div>
              )}

              {/* Interactive Editable Preview Table */}
              {aiParsedResults && (
                <div className="space-y-3 pt-2 border-t border-amber-400/40">
                  <div className="p-3 bg-emerald-950/40 border border-emerald-500 rounded flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="space-y-0.5">
                      <div className="font-bold text-emerald-300 flex items-center gap-1.5">
                        <CheckCircle2 size={15} />
                        <span>
                          ТАБЛИЦА ПРЕДПРОСМОТРА: РАСПОЗНАНО {aiParsedResults.classes.length} СТРОК (ТЕКУЩАЯ НЕДЕЛЯ: {liveAcademicWeekNum}-я)
                        </span>
                      </div>
                      <p className="text-[11px] text-emerald-200/90 font-sans">
                        {aiParsedResults.summary} Вы можете прямо в таблице ниже исправить любой предмет, время, подгруппу или недели перед сохранением.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddPreviewClass}
                      className="px-2.5 py-1.5 border border-emerald-400 bg-emerald-950/80 hover:bg-emerald-400 hover:text-black text-emerald-200 font-bold rounded text-xs cursor-pointer flex items-center gap-1 shrink-0"
                    >
                      <Plus size={13} /> Добавить строку
                    </button>
                  </div>

                  {/* Editable 7-column schedule table */}
                  <div className="border border-zinc-700 bg-black/90 rounded-lg overflow-x-auto max-h-[46vh] overflow-y-auto">
                    <table className="w-full text-left border-collapse text-[11px]">
                      <thead className="bg-zinc-900/95 text-amber-300 uppercase sticky top-0 z-10 border-b border-zinc-700">
                        <tr>
                          <th className="p-2 w-16">День</th>
                          <th className="p-2 w-28">Время</th>
                          <th className="p-2 w-16">Подгр.</th>
                          <th className="p-2 min-w-[210px]">Тип и Предмет</th>
                          <th className="p-2 min-w-[160px]">Преподаватель</th>
                          <th className="p-2 w-24">Ауд.</th>
                          <th className="p-2 min-w-[200px]">Чётность / Недели / Комм.</th>
                          <th className="p-2 w-8 text-center">✕</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/80">
                        {aiParsedResults.classes.map((cls) => {
                          const isActiveNow =
                            (cls.weekParity === 'BOTH' || cls.weekParity === liveActiveParity) &&
                            isClassActiveOnAcademicWeek(cls, liveAcademicWeekNum);

                          return (
                            <tr key={cls.id} className="hover:bg-zinc-900/50 transition-colors align-top">
                              {/* Col 1: Day */}
                              <td className="p-1.5">
                                <select
                                  value={cls.day}
                                  onChange={(e) =>
                                    handleUpdatePreviewClass(cls.id, { day: e.target.value as DayOfWeek })
                                  }
                                  className="w-full bg-black border border-zinc-700 focus:border-amber-400 px-1.5 py-1 rounded text-xs font-bold text-[var(--crt-phosphor-bright)] outline-none cursor-pointer"
                                >
                                  {DAYS_CONFIG.map((d) => (
                                    <option key={d.id} value={d.id}>
                                      {d.shortLabel}
                                    </option>
                                  ))}
                                </select>
                              </td>

                              {/* Col 2: Start & End Time */}
                              <td className="p-1.5 space-y-1">
                                <input
                                  type="text"
                                  value={cls.startTime}
                                  onChange={(e) => handleUpdatePreviewClass(cls.id, { startTime: e.target.value })}
                                  className="w-full bg-black border border-zinc-700 focus:border-amber-400 px-1.5 py-0.5 rounded text-[11px] tabular-nums text-center outline-none"
                                  title="Время начала (ЧЧ:ММ)"
                                />
                                <input
                                  type="text"
                                  value={cls.endTime}
                                  onChange={(e) => handleUpdatePreviewClass(cls.id, { endTime: e.target.value })}
                                  className="w-full bg-black border border-zinc-700 focus:border-amber-400 px-1.5 py-0.5 rounded text-[11px] tabular-nums text-center outline-none"
                                  title="Время окончания (ЧЧ:ММ)"
                                />
                              </td>

                              {/* Col 3: Subgroup */}
                              <td className="p-1.5">
                                <select
                                  value={cls.subgroup || ''}
                                  onChange={(e) =>
                                    handleUpdatePreviewClass(cls.id, {
                                      subgroup: e.target.value || undefined
                                    })
                                  }
                                  className="w-full bg-black border border-zinc-700 focus:border-cyan-400 px-1 py-1 rounded text-[11px] text-cyan-200 font-bold outline-none cursor-pointer"
                                >
                                  <option value="">—</option>
                                  <option value="1">1)</option>
                                  <option value="2">2)</option>
                                  <option value="3">3)</option>
                                  <option value="4">4)</option>
                                </select>
                              </td>

                              {/* Col 4: LessonType & Subject */}
                              <td className="p-1.5 space-y-1">
                                <div className="flex items-center gap-1">
                                  <select
                                    value={cls.lessonType}
                                    onChange={(e) =>
                                      handleUpdatePreviewClass(cls.id, {
                                        lessonType: e.target.value as LessonType
                                      })
                                    }
                                    className="bg-black border border-zinc-700 focus:border-amber-400 px-1.5 py-0.5 rounded text-[10px] text-amber-200 outline-none cursor-pointer"
                                  >
                                    {LESSON_TYPES_CONFIG.map((t) => (
                                      <option key={t.id} value={t.id}>
                                        {t.label}
                                      </option>
                                    ))}
                                  </select>
                                  <span
                                    className={`text-[9px] px-1.5 py-0.2 rounded font-bold border ${
                                      isActiveNow
                                        ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/60'
                                        : 'bg-zinc-900 text-zinc-400 border-zinc-700'
                                    }`}
                                    title={
                                      isActiveNow
                                        ? `Активно на текущей ${liveAcademicWeekNum}-й учебной неделе`
                                        : `Не активно на текущей ${liveAcademicWeekNum}-й неделе (другая чётность или диапазон недель)`
                                    }
                                  >
                                    {isActiveNow ? `Активно (${liveAcademicWeekNum} нед.)` : `Вне ${liveAcademicWeekNum} нед.`}
                                  </span>
                                </div>
                                <input
                                  type="text"
                                  value={cls.subject}
                                  onChange={(e) => handleUpdatePreviewClass(cls.id, { subject: e.target.value })}
                                  className="w-full bg-black border border-zinc-700 focus:border-amber-400 px-2 py-1 rounded text-xs font-bold text-[var(--crt-phosphor-bright)] outline-none"
                                />
                              </td>

                              {/* Col 5: Teacher */}
                              <td className="p-1.5">
                                <input
                                  type="text"
                                  placeholder="ФИО преподавателя"
                                  value={cls.teacher || ''}
                                  onChange={(e) =>
                                    handleUpdatePreviewClass(cls.id, { teacher: e.target.value || undefined })
                                  }
                                  className="w-full bg-black border border-zinc-700 focus:border-amber-400 px-2 py-1 rounded text-[11px] outline-none"
                                />
                              </td>

                              {/* Col 6: Classroom */}
                              <td className="p-1.5">
                                <input
                                  type="text"
                                  placeholder="Ауд."
                                  value={cls.classroom || ''}
                                  onChange={(e) =>
                                    handleUpdatePreviewClass(cls.id, { classroom: e.target.value || undefined })
                                  }
                                  className="w-full bg-black border border-zinc-700 focus:border-amber-400 px-1.5 py-1 rounded text-[11px] text-amber-200 outline-none"
                                />
                              </td>

                              {/* Col 7: Parity, WeekFrom/WeekTo, Notes */}
                              <td className="p-1.5 space-y-1">
                                <div className="flex items-center gap-1">
                                  <select
                                    value={cls.weekParity}
                                    onChange={(e) =>
                                      handleUpdatePreviewClass(cls.id, {
                                        weekParity: e.target.value as WeekParityType
                                      })
                                    }
                                    className="bg-black border border-zinc-700 focus:border-amber-400 px-1.5 py-0.5 rounded text-[10px] outline-none cursor-pointer"
                                  >
                                    <option value="BOTH">Обе нед.</option>
                                    <option value="UPPER">Верхняя</option>
                                    <option value="LOWER">Нижняя</option>
                                  </select>
                                  <input
                                    type="number"
                                    min={1}
                                    max={22}
                                    placeholder="с нед."
                                    value={cls.weekFrom ?? ''}
                                    onChange={(e) =>
                                      handleUpdatePreviewClass(cls.id, {
                                        weekFrom: e.target.value ? Number(e.target.value) : undefined
                                      })
                                    }
                                    className="w-14 bg-black border border-zinc-700 focus:border-purple-400 px-1 py-0.5 rounded text-[10px] text-purple-200 tabular-nums outline-none"
                                    title="Начиная с какой учебной недели (напр. 10 для «после 9 недели»)"
                                  />
                                  <input
                                    type="number"
                                    min={1}
                                    max={22}
                                    placeholder="до нед."
                                    value={cls.weekTo ?? ''}
                                    onChange={(e) =>
                                      handleUpdatePreviewClass(cls.id, {
                                        weekTo: e.target.value ? Number(e.target.value) : undefined
                                      })
                                    }
                                    className="w-14 bg-black border border-zinc-700 focus:border-purple-400 px-1 py-0.5 rounded text-[10px] text-purple-200 tabular-nums outline-none"
                                    title="До какой учебной недели включительно (напр. 9 для «до 9 недели»)"
                                  />
                                </div>
                                <input
                                  type="text"
                                  placeholder="Комментарий (ИГУМ, до 9 недели...)"
                                  value={cls.notes || ''}
                                  onChange={(e) =>
                                    handleUpdatePreviewClass(cls.id, { notes: e.target.value || undefined })
                                  }
                                  className="w-full bg-black border border-zinc-700 focus:border-amber-400 px-1.5 py-0.5 rounded text-[10px] opacity-85 outline-none"
                                />
                              </td>

                              {/* Col 8: Delete row */}
                              <td className="p-1.5 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleDeletePreviewClass(cls.id)}
                                  className="p-1 text-red-400 hover:text-red-300 cursor-pointer"
                                  title="Удалить эту строку из импорта"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Confirm Options */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setAiParsedResults(null)}
                      className="px-3 py-2 border border-zinc-700 hover:border-zinc-500 text-zinc-300 rounded text-xs cursor-pointer"
                    >
                      НАЗАД К ВЫБОРУ ФАЙЛА
                    </button>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => handleApplyAIParsed(false)}
                        className="px-4 py-2 border border-emerald-500 hover:bg-emerald-950/60 text-emerald-300 font-bold rounded text-xs uppercase cursor-pointer"
                      >
                        ДОБАВИТЬ К ТЕКУЩИМ ({aiParsedResults.classes.length})
                      </button>
                      <button
                        onClick={() => handleApplyAIParsed(true)}
                        className="px-5 py-2 bg-amber-400 hover:bg-amber-300 text-black font-extrabold rounded text-xs uppercase cursor-pointer shadow-lg"
                      >
                        ЗАМЕНИТЬ РАСПИСАНИЕ ({aiParsedResults.classes.length})
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Actions if not yet parsed */}
            {!aiParsedResults && (
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-amber-400/40 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsAIModalOpen(false)}
                  className="px-4 py-2 border border-zinc-700 hover:border-zinc-500 rounded text-xs cursor-pointer"
                >
                  ОТМЕНА
                </button>
                <button
                  type="button"
                  onClick={handleRunAIParser}
                  disabled={aiLoading}
                  className="px-5 py-2 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-black font-extrabold rounded text-xs uppercase cursor-pointer transition-all flex items-center gap-2 shadow-lg"
                >
                  {aiLoading ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                      <span>АНАЛИЗ ТАБЛИЦЫ...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={14} />
                      <span>РАСПОЗНАТЬ РАСПИСАНИЕ</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* MODAL 3: NOTIFICATION SETTINGS */}
      {isConfigModalOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 bg-black/95 flex items-center justify-center p-3 sm:p-4 z-50">
          <div className="border-2 border-[var(--crt-phosphor)] bg-[#050d06] p-4 sm:p-5 rounded-xl max-w-md w-full text-[var(--crt-phosphor)] space-y-4 shadow-2xl font-mono">
            <div className="text-sm font-bold tracking-wider uppercase flex items-center justify-between border-b border-[var(--crt-phosphor-dim)] pb-2.5">
              <span className="flex items-center gap-2 text-[var(--crt-phosphor-bright)]">
                <Bell size={16} /> НАСТРОЙКИ УВЕДОМЛЕНИЙ О ЗАНЯТИЯХ
              </span>
              <button
                onClick={() => setIsConfigModalOpen(false)}
                className="cursor-pointer text-xs p-1 hover:bg-[var(--crt-phosphor)]/20 rounded"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <div className="flex items-center justify-between p-2.5 bg-black/60 border border-[var(--crt-phosphor-dim)]/50 rounded">
                <div>
                  <div className="font-bold">Напоминания о парах:</div>
                  <div className="text-[10px] opacity-70">Push-уведомления в терминале и браузере</div>
                </div>
                <input
                  type="checkbox"
                  checked={config.enabled}
                  onChange={(e) => setConfig((prev) => ({ ...prev, enabled: e.target.checked }))}
                  className="accent-[var(--crt-phosphor)] w-4 h-4 cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider mb-1">
                  Напоминать за сколько минут до пары:
                </label>
                <select
                  value={config.minutesBefore}
                  onChange={(e) => setConfig((prev) => ({ ...prev, minutesBefore: Number(e.target.value) }))}
                  className="w-full bg-black border border-[var(--crt-phosphor)] px-3 py-2 rounded text-[var(--crt-phosphor)] outline-none font-mono cursor-pointer"
                >
                  <option value={10}>За 10 минут</option>
                  <option value={15}>За 15 минут (рекомендуется)</option>
                  <option value={30}>За 30 минут</option>
                  <option value={45}>За 45 минут</option>
                  <option value={60}>За 1 час</option>
                </select>
              </div>

              <div className="flex items-center justify-between p-2.5 bg-black/60 border border-[var(--crt-phosphor-dim)]/50 rounded">
                <div>
                  <div className="font-bold">Звуковой сигнал терминала:</div>
                  <div className="text-[10px] opacity-70">Воспроизводить тактический Pip-Boy звук</div>
                </div>
                <input
                  type="checkbox"
                  checked={config.soundEnabled}
                  onChange={(e) => setConfig((prev) => ({ ...prev, soundEnabled: e.target.checked }))}
                  className="accent-[var(--crt-phosphor)] w-4 h-4 cursor-pointer"
                />
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleTestNotification}
                  className="w-full py-2 border border-amber-400 bg-amber-950/40 text-amber-300 font-bold rounded text-xs uppercase cursor-pointer hover:bg-amber-400 hover:text-black transition-colors"
                >
                  🔔 ОТПРАВИТЬ ТЕСТОВОЕ УВЕДОМЛЕНИЕ
                </button>
              </div>

              <div className="flex justify-end pt-2 border-t border-[var(--crt-phosphor-dim)]">
                <button
                  type="button"
                  onClick={() => setIsConfigModalOpen(false)}
                  className="px-5 py-1.5 bg-[var(--crt-phosphor)] text-black font-extrabold rounded text-xs uppercase cursor-pointer"
                >
                  ГОТОВО
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
