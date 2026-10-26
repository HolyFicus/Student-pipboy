import React, { useState, useEffect } from 'react';
import { SubjectItem, GradeScalePreset } from '../types/grades';
import { MonitoredLink, AIDataMode } from '../types/pipboy';
import { SubjectCard } from './grades/SubjectCard';
import { getLocalDeterministicAnalysis } from '../utils/gradeCalculations';
import { pipAudio } from '../utils/audio';
import {
  collectAppInternalDataSnapshot,
  getStoredAIDataMode,
  setStoredAIDataMode,
  subscribeToAIDataMode
} from '../utils/appDataContext';
import { AIModeSwitch } from './AIModeSwitch';
import {
  Calculator,
  Plus,
  Bookmark,
  Sparkles,
  Layers,
  HelpCircle,
  RotateCcw,
  BookOpen,
  Award,
  BarChart3,
  CheckCircle2,
  AlertCircle,
  GraduationCap,
  Lock,
  Globe
} from 'lucide-react';

interface TabGradesProps {
  links?: MonitoredLink[];
}

const STORAGE_KEYS = {
  SUBJECTS: 'pipboy_grades_subjects_v1',
  PRESETS: 'pipboy_grades_presets_v1'
};

const DEFAULT_PRESETS: GradeScalePreset[] = [
  {
    id: 'preset-100-brs',
    name: '100-балльная система (БРС)',
    description: 'Отлично: 85+, Хорошо: 70+, Удовл.: 50+',
    defaultMaxScore: 100,
    scale: [
      { label: 'Отлично', minScore: 85 },
      { label: 'Хорошо', minScore: 70 },
      { label: 'Удовлетворительно', minScore: 50 }
    ]
  },
  {
    id: 'preset-pass-fail',
    name: 'Зачёт / Незачёт (60 б.)',
    description: 'Зачёт: от 60 баллов при максимуме 100',
    defaultMaxScore: 100,
    scale: [
      { label: 'Зачёт', minScore: 60 }
    ]
  },
  {
    id: 'preset-ects',
    name: 'Международная ECTS (A/B/C/D/E)',
    description: 'A: 90+, B: 82+, C: 75+, D: 67+, E: 60+',
    defaultMaxScore: 100,
    scale: [
      { label: 'A (Excellent)', minScore: 90 },
      { label: 'B (Very Good)', minScore: 82 },
      { label: 'C (Good)', minScore: 75 },
      { label: 'D (Satisfactory)', minScore: 67 },
      { label: 'E (Sufficient)', minScore: 60 }
    ]
  },
  {
    id: 'preset-5-scale',
    name: '5-балльная шкала',
    description: '5 (Отл): 4.5+, 4 (Хор): 3.5+, 3 (Удовл): 2.5+',
    defaultMaxScore: 5,
    scale: [
      { label: '5 (Отлично)', minScore: 4.5 },
      { label: '4 (Хорошо)', minScore: 3.5 },
      { label: '3 (Удовлетворительно)', minScore: 2.5 }
    ]
  }
];

export const TabGrades: React.FC<TabGradesProps> = ({ links = [] }) => {
  const [aiMode, setAiMode] = useState<AIDataMode>(() => getStoredAIDataMode());

  useEffect(() => {
    return subscribeToAIDataMode((updated) => {
      setAiMode(updated);
    });
  }, []);

  const handleModeChange = (newMode: AIDataMode) => {
    setAiMode(newMode);
    setStoredAIDataMode(newMode);
  };

  // STRICT REQUIREMENT: Initial subjects list is absolutely empty upon first launch
  const [subjects, setSubjects] = useState<SubjectItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SUBJECTS);
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });

  const [presets, setPresets] = useState<GradeScalePreset[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.PRESETS);
      if (saved) return JSON.parse(saved);
    } catch {}
    return DEFAULT_PRESETS;
  });

  const [activeSubjectId, setActiveSubjectId] = useState<string | null>(null);
  const [aiLoadingSubjectId, setAiLoadingSubjectId] = useState<string | null>(null);
  const [aiAdviceMap, setAiAdviceMap] = useState<Record<string, string>>({});
  const [aiModeUsedMap, setAiModeUsedMap] = useState<Record<string, AIDataMode>>({});

  // Global AI Summary state
  const [isGlobalAiLoading, setIsGlobalAiLoading] = useState(false);
  const [globalAiSummary, setGlobalAiSummary] = useState<string | null>(null);
  const [globalAiModeUsed, setGlobalAiModeUsed] = useState<AIDataMode>('local');

  // Sync to local storage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.SUBJECTS, JSON.stringify(subjects));
    } catch {}
  }, [subjects]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.PRESETS, JSON.stringify(presets));
    } catch {}
  }, [presets]);

  // If activeSubjectId is deleted, select the first available or null
  useEffect(() => {
    if (subjects.length > 0 && (!activeSubjectId || !subjects.some((s) => s.id === activeSubjectId))) {
      setActiveSubjectId(subjects[0].id);
    } else if (subjects.length === 0) {
      setActiveSubjectId(null);
    }
  }, [subjects, activeSubjectId]);

  // Explicit Add Subject action
  const handleAddNewSubject = () => {
    pipAudio.playClick();
    const newSubject: SubjectItem = {
      id: 'sub-' + Date.now() + Math.random().toString(36).substring(2, 6),
      name: '',
      teacherName: '',
      maxScore: 100, // clean default numeric maximum
      currentScore: 0,
      scale: [
        { id: 'th-1', label: 'Отлично', minScore: 85 },
        { id: 'th-2', label: 'Хорошо', minScore: 70 },
        { id: 'th-3', label: 'Удовлетворительно', minScore: 50 }
      ],
      targetScaleId: null, // No target pre-selected
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    setSubjects((prev) => [newSubject, ...prev]);
    setActiveSubjectId(newSubject.id);
  };

  const handleUpdateSubject = (updated: SubjectItem) => {
    setSubjects((prev) => prev.map((s) => (s.id === updated.id ? { ...updated, updatedAt: Date.now() } : s)));
  };

  const handleDeleteSubject = (id: string) => {
    pipAudio.playClick();
    setSubjects((prev) => prev.filter((s) => s.id !== id));
    setAiAdviceMap((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  };

  const handleSaveAsPreset = (name: string, subject: SubjectItem) => {
    const newPreset: GradeScalePreset = {
      id: 'preset-' + Date.now(),
      name,
      description: `Пользовательский шаблон (${subject.scale.map((s) => `${s.label}: ${s.minScore}`).join(', ')})`,
      defaultMaxScore: subject.maxScore,
      scale: subject.scale.map((s) => ({ label: s.label, minScore: s.minScore }))
    };
    setPresets((prev) => [newPreset, ...prev]);
  };

  // Call Gemini AI for Single Subject
  const handleAskAiForSubject = async (subject: SubjectItem) => {
    pipAudio.playClick();
    setAiLoadingSubjectId(subject.id);

    const target = subject.scale.find((s) => s.id === subject.targetScaleId) || null;
    const current = Math.max(0, subject.currentScore || 0);
    const max = Math.max(1, subject.maxScore || 100);
    const remaining = Math.max(0, max - current);
    const needed = target ? Math.max(0, target.minScore - current) : 0;
    const rate = remaining > 0 && target ? Math.min(100, Math.round((needed / remaining) * 100)) : 0;

    const appSnapshot = collectAppInternalDataSnapshot(links);

    try {
      const response = await fetch('/api/ai/grade-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject,
          targetThreshold: target,
          currentScore: current,
          maxScore: max,
          remainingMax: remaining,
          pointsNeeded: needed,
          requiredRatePercent: rate,
          aiMode,
          appData: appSnapshot
        })
      });

      if (!response.ok) throw new Error('Network error');
      const data = await response.json();

      if (data.advice) {
        setAiAdviceMap((prev) => ({ ...prev, [subject.id]: data.advice }));
        setAiModeUsedMap((prev) => ({ ...prev, [subject.id]: data.aiMode || aiMode }));
      }
    } catch {
      // Deterministic math fallback
      const local = getLocalDeterministicAnalysis(subject);
      setAiAdviceMap((prev) => ({ ...prev, [subject.id]: local.advice }));
      setAiModeUsedMap((prev) => ({ ...prev, [subject.id]: aiMode }));
    } finally {
      setAiLoadingSubjectId(null);
    }
  };

  // Call Global AI Analysis across all subjects
  const handleAskGlobalAiAnalysis = async () => {
    if (subjects.length === 0) return;
    pipAudio.playClick();
    setIsGlobalAiLoading(true);

    const appSnapshot = collectAppInternalDataSnapshot(links);

    try {
      const summaryPayload = subjects.map((s) => {
        const target = s.scale.find((th) => th.id === s.targetScaleId);
        const rem = Math.max(0, s.maxScore - s.currentScore);
        const def = target ? Math.max(0, target.minScore - s.currentScore) : 0;
        return {
          name: s.name || 'Без названия',
          teacher: s.teacherName || 'Не указан',
          current: s.currentScore,
          max: s.maxScore,
          target: target ? target.label : 'Не выбрана',
          targetScore: target ? target.minScore : null,
          remainingMax: rem,
          deficit: def
        };
      });

      const prompt = `Проанализируй сводку успеваемости студента по всем его дисциплинам в связке с его расписанием:
${JSON.stringify(summaryPayload, null, 2)}

ТРЕБОВАНИЯ:
- Составь четкий, емкий прогноз сессии на русском языке.
- Выдели предметы в зоне риска (где дефицит близок к оставшемуся максимуму) и дисциплины, где цель уже гарантирована.
- Дай конкретный пошаговый план приоритетов на ближайшие недели.`;

      const res = await fetch('/api/ai/site-qa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: prompt,
          aiMode,
          appData: appSnapshot,
          selectedSites: links.map((l) => ({
            id: l.id,
            title: l.title,
            url: l.url,
            category: l.category,
            writtenContent: l.writtenContent,
            contentSnippet: l.contentSnippet,
            diffHistory: l.diffHistory
          }))
        })
      });

      if (!res.ok) throw new Error('API error');
      const data = await res.json();
      setGlobalAiSummary(data.answer);
      setGlobalAiModeUsed(data.aiMode || aiMode);
    } catch {
      // Deterministic global overview fallback
      const totalCur = subjects.reduce((acc, s) => acc + (s.currentScore || 0), 0);
      const totalMax = subjects.reduce((acc, s) => acc + (s.maxScore || 100), 0);
      const withTarget = subjects.filter((s) => s.targetScaleId);

      setGlobalAiSummary(
        `📊 Сводный аудит успеваемости (${subjects.length} дисциплин):\n` +
          `• Суммарный балл: ${totalCur} из ${totalMax} б. (${Math.round((totalCur / totalMax) * 100)}% от общего фонда баллов).\n` +
          `• Предметов с зафиксированной целевой оценкой: ${withTarget.length} из ${subjects.length}.\n` +
          `• Стратегический совет: сфокусируйтесь на дисциплинах с наибольшим коэффициентом дефицита к оставшемуся максимуму. Своевременная сдача текущих рубежных контролей позволяет сохранить до 100% оставшихся баллов.`
      );
      setGlobalAiModeUsed(aiMode);
    } finally {
      setIsGlobalAiLoading(false);
    }
  };

  const activeSubject = subjects.find((s) => s.id === activeSubjectId) || subjects[0] || null;

  return (
    <div className="space-y-4 pb-12 font-sans select-none">
      {/* Top Banner / Tab Intro */}
      <div className="bg-[#071309] border-2 border-[var(--crt-phosphor-dim)] rounded-xl p-3 sm:p-4 space-y-3 shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-[var(--crt-phosphor)]/15 border border-[var(--crt-phosphor)] flex items-center justify-center text-[var(--crt-phosphor-bright)] shrink-0">
              <Calculator size={20} />
            </div>
            <div>
              <h2 className="font-extrabold text-sm sm:text-base text-[var(--crt-phosphor-bright)] uppercase tracking-wider font-mono">
                Умный калькулятор оценок
              </h2>
              <p className="text-[11px] text-[var(--crt-phosphor-dim)] font-mono">
                Индивидуальный расчет БРС, прогнозирование сценариев и AI-консультант Gemini
              </p>
            </div>
          </div>

          {/* Action Button: Add Subject */}
          <button
            type="button"
            onClick={handleAddNewSubject}
            className="px-3.5 py-2 bg-[var(--crt-phosphor)] text-black font-extrabold text-xs font-mono rounded-lg flex items-center gap-1.5 shadow hover:opacity-90 active:scale-95 transition-transform cursor-pointer"
          >
            <Plus size={15} className="stroke-[3]" />
            <span>Добавить предмет</span>
          </button>
        </div>

        {/* AI Mode Switcher for Grade Strategy Analysis */}
        <AIModeSwitch mode={aiMode} onChange={handleModeChange} showDescription={true} />
      </div>

      {/* Empty State: Strictly Empty list on first launch */}
      {subjects.length === 0 ? (
        <div className="bg-[#071309] border-2 border-dashed border-[var(--crt-phosphor-dim)]/60 rounded-xl p-8 sm:p-12 text-center space-y-4 max-w-xl mx-auto my-6 font-mono">
          <div className="w-14 h-14 rounded-full bg-[var(--crt-phosphor)]/10 border border-[var(--crt-phosphor-dim)] mx-auto flex items-center justify-center text-[var(--crt-phosphor)]">
            <Calculator size={28} />
          </div>

          <div className="space-y-1.5">
            <h3 className="font-bold text-base text-[var(--crt-phosphor-bright)] uppercase tracking-wide">
              Список дисциплин пуст
            </h3>
            <p className="text-xs text-[var(--crt-phosphor-dim)] leading-relaxed max-w-md mx-auto">
              Никаких предзаполненных или демонстрационных предметов. Добавьте свои реальные учебные дисциплины семестра, чтобы настроить индивидуальные шкалы баллов и рассчитывать дефицит до целевой оценки.
            </p>
          </div>

          <button
            type="button"
            onClick={handleAddNewSubject}
            className="px-4 py-2.5 bg-[var(--crt-phosphor)] text-black font-extrabold text-xs rounded-lg inline-flex items-center gap-2 cursor-pointer shadow hover:opacity-90 active:scale-95 transition-transform"
          >
            <Plus size={16} className="stroke-[3]" />
            <span>Добавить первую дисциплину</span>
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Quick Subject Switcher Tabs (Mobile-friendly horizontal scroll) */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1 font-mono text-xs">
            <span className="text-[11px] text-[var(--crt-phosphor-dim)] uppercase font-bold shrink-0">
              Предметы ({subjects.length}):
            </span>
            {subjects.map((sub, idx) => {
              const isActive = sub.id === activeSubjectId;
              const hasTarget = Boolean(sub.targetScaleId);
              return (
                <button
                  key={sub.id}
                  onClick={() => {
                    pipAudio.playClick();
                    setActiveSubjectId(sub.id);
                  }}
                  className={`px-3 py-1.5 rounded-lg whitespace-nowrap shrink-0 flex items-center gap-1.5 font-bold transition-all cursor-pointer border ${
                    isActive
                      ? 'bg-[var(--crt-phosphor)] text-black border-[var(--crt-phosphor)] shadow-md'
                      : 'bg-black/50 border-[var(--crt-phosphor-dim)]/60 text-[var(--crt-phosphor)]/80 hover:text-[var(--crt-phosphor)] hover:border-[var(--crt-phosphor)]'
                  }`}
                >
                  <div className="flex flex-col items-start text-left leading-tight">
                    <span>{sub.name.trim() || `Предмет #${idx + 1}`}</span>
                    {sub.teacherName && (
                      <span className={`text-[9.5px] font-normal truncate max-w-[130px] flex items-center gap-0.5 mt-0.5 ${isActive ? 'text-black/80' : 'text-[var(--crt-phosphor-dim)]'}`}>
                        <GraduationCap size={10} className="shrink-0" />
                        <span>{sub.teacherName}</span>
                      </span>
                    )}
                  </div>
                  <span className={`text-[10px] ml-1 ${isActive ? 'text-black/90 font-mono font-bold' : 'text-emerald-400 font-mono'}`}>
                    {sub.currentScore}/{sub.maxScore}
                  </span>
                  {hasTarget && (
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-black' : 'bg-amber-400'}`}
                      title="Цель установлена"
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* Active Subject Main Card */}
          {activeSubject && (
            <SubjectCard
              key={activeSubject.id}
              subject={activeSubject}
              presets={presets}
              onUpdateSubject={handleUpdateSubject}
              onDeleteSubject={handleDeleteSubject}
              onSaveAsPreset={handleSaveAsPreset}
              onAskAi={handleAskAiForSubject}
              isAiLoading={aiLoadingSubjectId === activeSubject.id}
              aiAdviceResult={aiAdviceMap[activeSubject.id] || null}
              aiModeUsed={aiModeUsedMap[activeSubject.id] || aiMode}
            />
          )}

          {/* Compact Overview Table of all disciplines */}
          {subjects.length > 1 && (
            <div className="bg-[#071309] border border-[var(--crt-phosphor-dim)] rounded-xl p-3 sm:p-4 space-y-3 font-mono">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-[var(--crt-phosphor-bright)] uppercase tracking-wider">
                  <BarChart3 size={15} />
                  <span>Сводная таблица дисциплин ({subjects.length})</span>
                </div>

                <button
                  type="button"
                  onClick={handleAskGlobalAiAnalysis}
                  disabled={isGlobalAiLoading}
                  className="px-2.5 py-1 text-[11px] bg-amber-950/40 hover:bg-amber-900/60 border border-amber-600/80 text-amber-300 rounded flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Sparkles size={12} className={isGlobalAiLoading ? 'animate-spin' : ''} />
                  <span>{isGlobalAiLoading ? 'Анализ...' : 'AI-прогноз всей сессии'}</span>
                </button>
              </div>

              {/* Table Body */}
              <div className="overflow-x-auto no-scrollbar">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--crt-phosphor-dim)]/40 text-[var(--crt-phosphor-dim)] text-[10.5px]">
                      <th className="py-2 px-2">Дисциплина</th>
                      <th className="py-2 px-2 text-center">Баллы</th>
                      <th className="py-2 px-2 text-center">Осталось</th>
                      <th className="py-2 px-2 text-center">Целевой рубеж</th>
                      <th className="py-2 px-2 text-right">Статус</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--crt-phosphor-dim)]/20">
                    {subjects.map((sub) => {
                      const target = sub.scale.find((th) => th.id === sub.targetScaleId);
                      const rem = Math.max(0, sub.maxScore - sub.currentScore);
                      const def = target ? Math.max(0, target.minScore - sub.currentScore) : null;
                      const isAchieved = target && sub.currentScore >= target.minScore;
                      const isFailed = target && def !== null && def > rem;

                      return (
                        <tr
                          key={sub.id}
                          onClick={() => {
                            pipAudio.playClick();
                            setActiveSubjectId(sub.id);
                          }}
                          className={`hover:bg-black/40 cursor-pointer transition-colors ${
                            sub.id === activeSubjectId ? 'bg-black/60 font-bold' : ''
                          }`}
                        >
                          <td className="py-2 px-2 text-[var(--crt-phosphor-bright)]">
                            <div className="font-semibold">{sub.name || 'Без названия'}</div>
                            {sub.teacherName && (
                              <div className="text-[10px] text-[var(--crt-phosphor-dim)] flex items-center gap-1 font-normal mt-0.5">
                                <GraduationCap size={11} className="shrink-0 text-amber-400/90" />
                                <span className="truncate max-w-[170px]">{sub.teacherName}</span>
                              </div>
                            )}
                          </td>
                          <td className="py-2 px-2 text-center text-emerald-400">
                            {sub.currentScore} / {sub.maxScore}
                          </td>
                          <td className="py-2 px-2 text-center text-[var(--crt-phosphor-dim)]">
                            {rem} б.
                          </td>
                          <td className="py-2 px-2 text-center">
                            {target ? (
                              <span className="text-amber-300">
                                {target.label} (≥{target.minScore})
                              </span>
                            ) : (
                              <span className="text-zinc-500">—</span>
                            )}
                          </td>
                          <td className="py-2 px-2 text-right">
                            {isAchieved ? (
                              <span className="text-emerald-400 font-bold">Достигнуто</span>
                            ) : isFailed ? (
                              <span className="text-red-400 font-bold">Дефицит</span>
                            ) : target ? (
                              <span className="text-amber-300">Осталось {def} б.</span>
                            ) : (
                              <span className="text-zinc-500">Без цели</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Global AI Summary Box */}
              {globalAiSummary && (
                <div className="mt-3 p-3 bg-black/80 border border-amber-500/60 rounded-lg text-xs space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-amber-400 font-bold border-b border-amber-500/20 pb-1.5">
                    <div className="flex items-center gap-1.5">
                      <Sparkles size={14} />
                      <span>Сводный прогноз успеваемости от Gemini</span>
                    </div>
                    {globalAiModeUsed === 'web' ? (
                      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-amber-950/60 border border-amber-500/50 text-amber-300">
                        <Globe size={11} />
                        <span>Режим 2: + Интернет</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-500/50 text-emerald-300">
                        <Lock size={11} />
                        <span>Режим 1: Локально (Приложение)</span>
                      </span>
                    )}
                  </div>
                  <div className="text-[var(--crt-phosphor-bright)] whitespace-pre-wrap leading-relaxed">
                    {globalAiSummary}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
