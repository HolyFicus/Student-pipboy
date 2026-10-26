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
  ScheduleNotificationConfig
} from '../types/schedule';
import { getMoscowTimeState, MoscowTimeState } from '../utils/academicCalendar';
import { pipAudio } from '../utils/audio';
import { sendNativeNotification } from '../utils/notifications';
import { useModalScrollLock } from '../utils/useModalScrollLock';
import { resolveApiUrl, parseScheduleClientFallback } from '../utils/staticHostFallback';
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

  // Modal States
  const [isAddEditModalOpen, setIsAddEditModalOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<ScheduleClass | null>(null);

  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  useModalScrollLock(isAddEditModalOpen || isAIModalOpen || isConfigModalOpen);

  // Active parity derived from real calendar:
  const liveActiveParity: 'UPPER' | 'LOWER' = moscowTime.computedParity.isOdd ? 'UPPER' : 'LOWER';

  // Effective parity for filtering:
  const effectiveParity = selectedParityFilter === 'CURRENT' ? liveActiveParity : selectedParityFilter;

  // Filtered classes
  const filteredClasses = useMemo(() => {
    return classes.filter((c) => {
      // Parity filter
      if (effectiveParity !== 'ALL') {
        if (c.weekParity !== 'BOTH' && c.weekParity !== effectiveParity) {
          return false;
        }
      }

      // Day filter
      if (selectedDayFilter !== 'ALL' && c.day !== selectedDayFilter) {
        return false;
      }

      return true;
    }).sort((a, b) => {
      // Sort by day index, then by lesson number / startTime
      const dayOrder = { MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 };
      if (dayOrder[a.day] !== dayOrder[b.day]) {
        return dayOrder[a.day] - dayOrder[b.day];
      }
      return a.lessonNumber - b.lessonNumber || a.startTime.localeCompare(b.startTime);
    });
  }, [classes, effectiveParity, selectedDayFilter]);

  // Today's classes based on calendar day:
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
      .filter((c) => c.day === todayDayCode && (c.weekParity === 'BOTH' || c.weekParity === liveActiveParity))
      .sort((a, b) => a.lessonNumber - b.lessonNumber || a.startTime.localeCompare(b.startTime));
  }, [classes, todayDayCode, liveActiveParity]);

  // Form State for Manual Add/Edit
  const [formDay, setFormDay] = useState<DayOfWeek>('MON');
  const [formParity, setFormParity] = useState<WeekParityType>('BOTH');
  const [formLessonNumber, setFormLessonNumber] = useState<number>(1);
  const [formStartTime, setFormStartTime] = useState('09:00');
  const [formEndTime, setFormEndTime] = useState('10:30');
  const [formSubject, setFormSubject] = useState('');
  const [formLessonType, setFormLessonType] = useState<LessonType>('SEMINAR');
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

    if (editingClass) {
      setClasses((prev) =>
        prev.map((c) =>
          c.id === editingClass.id
            ? {
                ...c,
                day: formDay,
                weekParity: formParity,
                lessonNumber: Number(formLessonNumber) || 1,
                startTime: formStartTime,
                endTime: formEndTime,
                subject: formSubject.trim(),
                lessonType: formLessonType,
                classroom: formClassroom.trim() || undefined,
                teacher: formTeacher.trim() || undefined,
                notes: formNotes.trim() || undefined,
                notificationEnabled: formNotify
              }
            : c
        )
      );
    } else {
      const newClass: ScheduleClass = {
        id: 'class-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
        day: formDay,
        weekParity: formParity,
        lessonNumber: Number(formLessonNumber) || 1,
        startTime: formStartTime,
        endTime: formEndTime,
        subject: formSubject.trim(),
        lessonType: formLessonType,
        classroom: formClassroom.trim() || undefined,
        teacher: formTeacher.trim() || undefined,
        notes: formNotes.trim() || undefined,
        notificationEnabled: formNotify
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
  const [aiParsedResults, setAiParsedResults] = useState<{ classes: ScheduleClass[]; summary: string } | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAiImageName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const rawDataUrl = event.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const maxDim = 1600;
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
          ctx.drawImage(img, 0, 0, width, height);
          const optimized = canvas.toDataURL('image/jpeg', 0.85);
          setAiImageBase64(optimized);
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
    setAiError(null);
    pipAudio.playGeiger(4);

    try {
      let data: any = null;
      try {
        const res = await fetch(resolveApiUrl('/api/ai/parse-schedule'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image: aiMode === 'image' ? aiImageBase64 : undefined,
            mimeType: 'image/jpeg',
            url: aiMode === 'url' ? aiUrl.trim() : undefined,
            text: aiMode === 'text' ? aiText.trim() : undefined
          })
        });

        if (res.ok) {
          data = await res.json();
        }
      } catch {
        // Static host fallback (GitHub Pages)
      }

      if (!data || !Array.isArray(data.classes) || data.classes.length === 0) {
        data = await parseScheduleClientFallback({
          imageBase64: aiMode === 'image' && aiImageBase64 ? aiImageBase64 : undefined,
          text: aiMode === 'text' ? aiText.trim() : undefined,
          url: aiMode === 'url' ? aiUrl.trim() : undefined
        });
      }

      if (!data.classes || data.classes.length === 0) {
        throw new Error(data.error || 'В предоставленном источнике не обнаружено учебных занятий. Загрузите чёткий скриншот расписания или вставьте текст.');
      }

      // Assign IDs if missing
      const formatted: ScheduleClass[] = data.classes.map((c: any, idx: number) => ({
        id: 'ai-class-' + Date.now() + '-' + idx,
        day: c.day || 'MON',
        weekParity: c.weekParity || 'BOTH',
        lessonNumber: Number(c.lessonNumber) || (idx + 1),
        startTime: c.startTime || '09:00',
        endTime: c.endTime || '10:30',
        subject: c.subject || 'Дисциплина',
        lessonType: c.lessonType || 'SEMINAR',
        classroom: c.classroom,
        teacher: c.teacher,
        notes: c.notes,
        notificationEnabled: true
      }));

      setAiParsedResults({ classes: formatted, summary: data.summary });
      pipAudio.playSuccess();
    } catch (err: any) {
      setAiError(err.message || 'Произошла ошибка при анализе.');
      pipAudio.playAlert();
    } finally {
      setAiLoading(false);
    }
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
      `Успешно загружено ${aiParsedResults.classes.length} пар с разделением на верхнюю и нижнюю недели.`
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

        {/* Parity & Day Filter Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-[var(--crt-phosphor-dim)]/40 text-xs">
          {/* Parity Selector */}
          <div className="flex items-center gap-1.5">
            <span className="opacity-60 text-[10px] uppercase">Неделя:</span>
            <div className="flex items-center border border-[var(--crt-phosphor-dim)] rounded overflow-hidden">
              <button
                onClick={() => {
                  pipAudio.playClick();
                  setSelectedParityFilter('CURRENT');
                }}
                className={`px-2.5 py-1 text-xs cursor-pointer transition-colors flex items-center gap-1 ${
                  selectedParityFilter === 'CURRENT'
                    ? 'bg-[var(--crt-phosphor)] text-black font-extrabold'
                    : 'bg-black/60 text-[var(--crt-phosphor)]/80 hover:text-[var(--crt-phosphor)]'
                }`}
                title="Автоматически отображать расписание текущей недели по календарю"
              >
                <span>СЕЙЧАС ({moscowTime.computedParity.typeName.slice(0, 4)}.)</span>
              </button>

              <button
                onClick={() => {
                  pipAudio.playClick();
                  setSelectedParityFilter('UPPER');
                }}
                className={`px-2.5 py-1 text-xs cursor-pointer transition-colors flex items-center gap-1 ${
                  selectedParityFilter === 'UPPER'
                    ? 'bg-[var(--crt-phosphor)] text-black font-extrabold'
                    : 'bg-black/60 text-[var(--crt-phosphor)]/80 hover:text-[var(--crt-phosphor)]'
                }`}
              >
                <ArrowUpRight size={11} />
                <span>ВЕРХНЯЯ (НЕЧЕТ)</span>
              </button>

              <button
                onClick={() => {
                  pipAudio.playClick();
                  setSelectedParityFilter('LOWER');
                }}
                className={`px-2.5 py-1 text-xs cursor-pointer transition-colors flex items-center gap-1 ${
                  selectedParityFilter === 'LOWER'
                    ? 'bg-[var(--crt-phosphor)] text-black font-extrabold'
                    : 'bg-black/60 text-[var(--crt-phosphor)]/80 hover:text-[var(--crt-phosphor)]'
                }`}
              >
                <ArrowDownRight size={11} />
                <span>НИЖНЯЯ (ЧЕТ)</span>
              </button>

              <button
                onClick={() => {
                  pipAudio.playClick();
                  setSelectedParityFilter('ALL');
                }}
                className={`px-2.5 py-1 text-xs cursor-pointer transition-colors ${
                  selectedParityFilter === 'ALL'
                    ? 'bg-[var(--crt-phosphor)] text-black font-extrabold'
                    : 'bg-black/60 text-[var(--crt-phosphor)]/80 hover:text-[var(--crt-phosphor)]'
                }`}
              >
                <span>ОБЕ НЕДЕЛИ</span>
              </button>
            </div>
          </div>

          {/* Days Filter Buttons */}
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
            <button
              onClick={() => {
                pipAudio.playClick();
                setSelectedDayFilter('ALL');
              }}
              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase transition-colors cursor-pointer ${
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
                return true;
              }).length;

              return (
                <button
                  key={d.id}
                  onClick={() => {
                    pipAudio.playClick();
                    setSelectedDayFilter(d.id);
                  }}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase transition-colors cursor-pointer flex items-center gap-1 ${
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
            На выбранный период ({selectedParityFilter === 'CURRENT' ? `${moscowTime.computedParity.typeName} неделя` : selectedParityFilter}) пары не внесены.
            Вы можете внести пары вручную или попросить нейросеть распознать расписание по скриншоту.
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
                      <span className="text-[10px] px-2 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-500 font-bold uppercase animate-pulse">
                        ● СЕГОДНЯ
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

                      return (
                        <div
                          key={cls.id}
                          className="bg-black/70 border border-[var(--crt-phosphor-dim)]/50 hover:border-[var(--crt-phosphor)] p-3 rounded-lg space-y-2 transition-all"
                        >
                          {/* Card Top: Number, Time, Parity Badge */}
                          <div className="flex items-center justify-between text-xs gap-2">
                            <div className="flex items-center gap-1.5 font-bold">
                              <span className="px-1.5 py-0.5 bg-[var(--crt-phosphor)]/20 text-[var(--crt-phosphor-bright)] border border-[var(--crt-phosphor-dim)] rounded text-[10px]">
                                {cls.lessonNumber} пара
                              </span>
                              <span className="text-[11px] text-[var(--crt-phosphor-bright)]">
                                {cls.startTime} – {cls.endTime}
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5">
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
                              <div className="text-[10px] opacity-75 bg-black/40 p-1 rounded font-sans italic border-l-2 border-[var(--crt-phosphor-dim)]">
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
                    placeholder="Например: История философии, Латинский язык..."
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
                    placeholder="ауд. 312 или Zoom"
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
                    placeholder="проф. Иванов А.В."
                    value={formTeacher}
                    onChange={(e) => setFormTeacher(e.target.value)}
                    className="w-full bg-black border border-[var(--crt-phosphor)] px-2.5 py-1.5 rounded text-[var(--crt-phosphor)] outline-none font-mono"
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider mb-1">
                  Заметки или ссылка:
                </label>
                <input
                  type="text"
                  placeholder="Доклад, эссе или ссылка на конференцию..."
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

      {/* MODAL 2: AI SCHEDULE PARSER (SCREENSHOT / URL / TEXT) */}
      {isAIModalOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 bg-black/95 flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto">
          <div className="border-2 border-amber-400 bg-[#071109] p-4 sm:p-5 rounded-xl max-w-2xl w-full text-[var(--crt-phosphor)] space-y-4 shadow-[0_0_30px_rgba(251,191,36,0.3)] font-mono max-h-[92vh] flex flex-col">
            <div className="text-sm font-bold tracking-wider uppercase flex items-center justify-between border-b border-amber-400/50 pb-2.5 shrink-0">
              <span className="flex items-center gap-2 text-amber-300">
                <Sparkles size={18} />
                <span>ИИ-РАСПОЗНАВАНИЕ РАСПИСАНИЯ (ВЕРХНЯЯ / НИЖНЯЯ НЕДЕЛИ)</span>
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
                Загрузите <strong>скриншот расписания</strong>, вставьте <strong>ссылку на страницу расписания вуза</strong> или <strong>скопируйте текст</strong>.
                Нейросеть Gemini автоматически распознает пары, выделит верхнюю и нижнюю недели, аудитории и имена преподавателей.
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
                  <div className="border-2 border-dashed border-amber-400/60 rounded-xl p-5 text-center bg-black/50 space-y-2 hover:border-amber-400 transition-colors">
                    <input
                      type="file"
                      id="aiScheduleFileInput"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                    <label
                      htmlFor="aiScheduleFileInput"
                      className="cursor-pointer block space-y-2"
                    >
                      <Upload className="mx-auto text-amber-400" size={32} />
                      <div className="font-bold text-xs text-amber-200">
                        {aiImageName ? `Выбран файл: ${aiImageName}` : 'Нажмите для выбора скриншота расписания (PNG, JPG, WEBP)'}
                      </div>
                      <div className="text-[10px] opacity-70">
                        Подойдет скриншот таблицы, фото с доски объявлений или фото из приложения вуза
                      </div>
                    </label>
                  </div>

                  {aiImageBase64 && (
                    <div className="p-2 border border-zinc-700 bg-black/70 rounded flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 truncate">
                        <img
                          src={aiImageBase64}
                          alt="Скриншот расписания"
                          className="w-12 h-12 object-cover rounded border border-zinc-600 shrink-0"
                        />
                        <span className="text-xs truncate">{aiImageName || 'Скриншот готов к отправке'}</span>
                      </div>
                      <button
                        onClick={() => {
                          setAiImageBase64(null);
                          setAiImageName('');
                        }}
                        className="text-xs text-red-400 hover:underline cursor-pointer"
                      >
                        Удалить
                      </button>
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
                    placeholder="https://timetable.spbu.ru/... или https://my.university.ru/schedule"
                    className="w-full bg-black border border-amber-400/80 px-3 py-2 rounded text-xs text-[var(--crt-phosphor)] outline-none font-mono"
                  />
                  <p className="text-[11px] opacity-70">
                    Нейросеть подключится к сайту, извлечет структуру учебной сетки и определит дни и недели.
                  </p>
                </div>
              )}

              {aiMode === 'text' && (
                <div className="space-y-2">
                  <label className="block text-xs font-bold uppercase tracking-wider">
                    Вставьте текст или таблицу расписания:
                  </label>
                  <textarea
                    rows={6}
                    value={aiText}
                    onChange={(e) => setAiText(e.target.value)}
                    placeholder="Пн: 1 пара 09:00 История (верхняя нед.), 2 пара 10:45 Философия...&#10;Вт: 10:45 Латынь (обе недели)..."
                    className="w-full bg-black border border-amber-400/80 p-3 rounded text-xs text-[var(--crt-phosphor)] outline-none font-mono leading-relaxed"
                  />
                </div>
              )}

              {/* Error Banner */}
              {aiError && (
                <div className="p-3 bg-red-950/60 border border-red-500 rounded text-xs text-red-200 flex items-start gap-2">
                  <AlertTriangle size={15} className="shrink-0 mt-0.5 text-red-400" />
                  <span>{aiError}</span>
                </div>
              )}

              {/* Parsed Preview Table */}
              {aiParsedResults && (
                <div className="space-y-3 pt-3 border-t border-amber-400/40 animate-fade-in">
                  <div className="p-3 bg-emerald-950/40 border border-emerald-500 rounded text-xs space-y-1">
                    <div className="font-bold text-emerald-300 flex items-center gap-1.5">
                      <CheckCircle2 size={14} /> РАСПОЗНАНО {aiParsedResults.classes.length} ЗАНЯТИЙ!
                    </div>
                    <p className="text-[11px] text-emerald-200/90 leading-relaxed font-sans">
                      {aiParsedResults.summary}
                    </p>
                  </div>

                  {/* Summary preview table */}
                  <div className="border border-zinc-700 bg-black/80 rounded max-h-56 overflow-y-auto text-xs divide-y divide-zinc-800">
                    {aiParsedResults.classes.map((cls, idx) => (
                      <div key={idx} className="p-2 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-[var(--crt-phosphor-bright)]">
                              {cls.day} {cls.startTime}–{cls.endTime}
                            </span>
                            <span
                              className={`text-[9px] px-1 rounded uppercase font-bold ${
                                cls.weekParity === 'UPPER'
                                  ? 'bg-emerald-950 text-emerald-300'
                                  : cls.weekParity === 'LOWER'
                                  ? 'bg-amber-950 text-amber-300'
                                  : 'bg-zinc-800 text-zinc-300'
                              }`}
                            >
                              {cls.weekParity === 'UPPER' ? 'Верх' : cls.weekParity === 'LOWER' ? 'Низ' : 'Обе'}
                            </span>
                          </div>
                          <div className="truncate text-zinc-300">{cls.subject}</div>
                        </div>
                        <div className="text-[10px] opacity-75 shrink-0 text-right">
                          {cls.classroom && <div>{cls.classroom}</div>}
                          {cls.teacher && <div>{cls.teacher}</div>}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Confirm Options */}
                  <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
                    <button
                      onClick={() => handleApplyAIParsed(false)}
                      className="px-4 py-2 border border-emerald-500 hover:bg-emerald-950/60 text-emerald-300 font-bold rounded text-xs uppercase cursor-pointer"
                    >
                      ДОБАВИТЬ К ТЕКУЩИМ
                    </button>
                    <button
                      onClick={() => handleApplyAIParsed(true)}
                      className="px-5 py-2 bg-amber-400 hover:bg-amber-300 text-black font-extrabold rounded text-xs uppercase cursor-pointer shadow-lg"
                    >
                      ЗАМЕНИТЬ РАСПИСАНИЕ
                    </button>
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
                      <span>НЕЙРОСЕТЬ АНАЛИЗИРУЕТ...</span>
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
