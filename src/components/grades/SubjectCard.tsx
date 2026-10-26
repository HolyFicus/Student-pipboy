import React, { useState } from 'react';
import { SubjectItem, GradeScaleThreshold, GradeScalePreset } from '../../types/grades';
import { AIDataMode } from '../../types/pipboy';
import { calculateSubjectMetrics } from '../../utils/gradeCalculations';
import { pipAudio } from '../../utils/audio';
import {
  Sparkles,
  Plus,
  Trash2,
  X,
  Target,
  Bookmark,
  Check,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Percent,
  Sliders,
  RotateCcw,
  GraduationCap,
  Lock,
  Globe
} from 'lucide-react';

interface SubjectCardProps {
  subject: SubjectItem;
  presets: GradeScalePreset[];
  onUpdateSubject: (updated: SubjectItem) => void;
  onDeleteSubject: (id: string) => void;
  onSaveAsPreset: (name: string, subject: SubjectItem) => void;
  onAskAi: (subject: SubjectItem) => void;
  isAiLoading: boolean;
  aiAdviceResult?: string | null;
  aiModeUsed?: AIDataMode;
}

export const SubjectCard: React.FC<SubjectCardProps> = ({
  subject,
  presets,
  onUpdateSubject,
  onDeleteSubject,
  onSaveAsPreset,
  onAskAi,
  isAiLoading,
  aiAdviceResult,
  aiModeUsed = 'local'
}) => {
  const [isEditingScale, setIsEditingScale] = useState(false);
  const [showPresetDropdown, setShowPresetDropdown] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [showSavePresetInput, setShowSavePresetInput] = useState(false);

  // New grade threshold state for adding to scale
  const [newThresholdLabel, setNewThresholdLabel] = useState('');
  const [newThresholdMin, setNewThresholdMin] = useState<string>('');

  const metrics = calculateSubjectMetrics(subject);

  // Handle Score Input changes without forced "0" value requirement
  const handleCurrentScoreChange = (raw: string) => {
    if (raw === '') {
      onUpdateSubject({ ...subject, currentScore: 0 });
      return;
    }
    const parsed = parseFloat(raw.replace(',', '.'));
    if (!isNaN(parsed)) {
      onUpdateSubject({ ...subject, currentScore: parsed });
    }
  };

  const handleMaxScoreChange = (raw: string) => {
    if (raw === '') {
      onUpdateSubject({ ...subject, maxScore: 0 });
      return;
    }
    const parsed = parseFloat(raw.replace(',', '.'));
    if (!isNaN(parsed)) {
      onUpdateSubject({ ...subject, maxScore: parsed });
    }
  };

  // Add new threshold to scale
  const handleAddThreshold = () => {
    if (!newThresholdLabel.trim() || newThresholdMin === '') return;
    const minVal = parseFloat(newThresholdMin.replace(',', '.'));
    if (isNaN(minVal)) return;

    pipAudio.playClick();
    const newEntry: GradeScaleThreshold = {
      id: 'th-' + Date.now() + Math.random().toString(36).substring(2, 6),
      label: newThresholdLabel.trim(),
      minScore: minVal
    };

    const updatedScale = [...subject.scale, newEntry].sort((a, b) => b.minScore - a.minScore);
    onUpdateSubject({ ...subject, scale: updatedScale });
    setNewThresholdLabel('');
    setNewThresholdMin('');
  };

  const handleDeleteThreshold = (thId: string) => {
    pipAudio.playClick();
    const updatedScale = subject.scale.filter((s) => s.id !== thId);
    let updatedTargetId = subject.targetScaleId;
    if (updatedTargetId === thId) {
      updatedTargetId = null;
    }
    onUpdateSubject({ ...subject, scale: updatedScale, targetScaleId: updatedTargetId });
  };

  const handleUpdateThresholdScore = (thId: string, rawVal: string) => {
    const val = rawVal === '' ? 0 : parseFloat(rawVal.replace(',', '.'));
    if (isNaN(val)) return;
    const updatedScale = subject.scale
      .map((s) => (s.id === thId ? { ...s, minScore: val } : s))
      .sort((a, b) => b.minScore - a.minScore);
    onUpdateSubject({ ...subject, scale: updatedScale });
  };

  const handleUpdateThresholdLabel = (thId: string, label: string) => {
    const updatedScale = subject.scale.map((s) => (s.id === thId ? { ...s, label } : s));
    onUpdateSubject({ ...subject, scale: updatedScale });
  };

  // Explicit Target Selection & Reset mechanics
  const handleSelectTarget = (thId: string) => {
    pipAudio.playClick();
    onUpdateSubject({ ...subject, targetScaleId: thId });
  };

  const handleResetTarget = (e: React.MouseEvent) => {
    e.stopPropagation();
    pipAudio.playClick();
    onUpdateSubject({ ...subject, targetScaleId: null });
  };

  // Apply template/preset
  const handleApplyPreset = (preset: GradeScalePreset) => {
    pipAudio.playClick();
    const convertedScale: GradeScaleThreshold[] = preset.scale.map((item, idx) => ({
      id: `th-${Date.now()}-${idx}`,
      label: item.label,
      minScore: item.minScore
    }));

    onUpdateSubject({
      ...subject,
      maxScore: preset.defaultMaxScore,
      scale: convertedScale,
      targetScaleId: convertedScale[0]?.id || null
    });
    setShowPresetDropdown(false);
  };

  const handleConfirmSavePreset = () => {
    if (!newPresetName.trim()) return;
    pipAudio.playClick();
    onSaveAsPreset(newPresetName.trim(), subject);
    setNewPresetName('');
    setShowSavePresetInput(false);
  };

  return (
    <div className="bg-[#071309] border-2 border-[var(--crt-phosphor-dim)] rounded-xl p-3.5 sm:p-4.5 space-y-4 shadow-md transition-all">
      {/* Header: Subject Name, Teacher Name & Actions */}
      <div className="space-y-2 border-b border-[var(--crt-phosphor-dim)]/40 pb-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1 min-w-0">
            <input
              type="text"
              value={subject.name}
              onChange={(e) => onUpdateSubject({ ...subject, name: e.target.value })}
              placeholder="Название предмета (например, История)"
              className="w-full bg-black/60 border border-[var(--crt-phosphor-dim)] focus:border-[var(--crt-phosphor)] rounded px-2.5 py-1.5 font-bold text-sm sm:text-base text-[var(--crt-phosphor-bright)] placeholder:text-[var(--crt-phosphor-dim)]/60 focus:outline-none"
            />
          </div>

          <button
            onClick={() => onDeleteSubject(subject.id)}
            className="p-2 text-red-400 hover:text-red-300 hover:bg-red-950/40 border border-red-900/60 rounded cursor-pointer transition-colors shrink-0"
            title="Удалить предмет"
            aria-label="Удалить предмет"
          >
            <Trash2 size={16} />
          </button>
        </div>

        {/* Teacher Field (ФИО преподавателя) */}
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-[var(--crt-phosphor-dim)]">
              <GraduationCap size={14} />
            </div>
            <input
              type="text"
              value={subject.teacherName || ''}
              onChange={(e) => onUpdateSubject({ ...subject, teacherName: e.target.value })}
              placeholder="ФИО преподавателя (например: Иванов Иван Иванович)"
              className="w-full bg-black/40 border border-[var(--crt-phosphor-dim)]/50 focus:border-[var(--crt-phosphor)] rounded pl-8 pr-2.5 py-1.5 text-xs text-[var(--crt-phosphor-bright)] placeholder:text-[var(--crt-phosphor-dim)]/50 focus:outline-none transition-colors"
            />
          </div>
          {subject.teacherName && (
            <button
              type="button"
              onClick={() => onUpdateSubject({ ...subject, teacherName: '' })}
              className="p-1.5 text-[var(--crt-phosphor-dim)] hover:text-red-400 border border-[var(--crt-phosphor-dim)]/30 rounded cursor-pointer transition-colors shrink-0"
              title="Очистить ФИО преподавателя"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Main Points Row: Strict Mobile Inputs with inputmode="numeric" and placeholder instead of value="0" */}
      <div className="grid grid-cols-2 gap-3 font-mono">
        {/* Current Score */}
        <div className="bg-black/50 border border-[var(--crt-phosphor-dim)]/70 rounded-lg p-2.5 flex flex-col justify-between">
          <label className="text-[11px] text-[var(--crt-phosphor-dim)] uppercase font-bold tracking-wider mb-1">
            Текущий балл
          </label>
          <div className="flex items-baseline gap-1">
            <input
              type="text"
              inputMode="decimal"
              pattern="[0-9]*[.,]?[0-9]*"
              value={subject.currentScore === 0 ? '' : subject.currentScore}
              onChange={(e) => handleCurrentScoreChange(e.target.value)}
              placeholder="0"
              className="w-full bg-transparent font-extrabold text-xl sm:text-2xl text-[var(--crt-phosphor-bright)] focus:outline-none placeholder:text-[var(--crt-phosphor-dim)]/40"
            />
            <span className="text-xs text-[var(--crt-phosphor-dim)] font-bold">б.</span>
          </div>
          <span className="text-[10px] text-[var(--crt-phosphor-dim)]/80 mt-1">
            Накоплено сейчас
          </span>
        </div>

        {/* Max Score */}
        <div className="bg-black/50 border border-[var(--crt-phosphor-dim)]/70 rounded-lg p-2.5 flex flex-col justify-between">
          <label className="text-[11px] text-[var(--crt-phosphor-dim)] uppercase font-bold tracking-wider mb-1">
            Макс. балл предмета
          </label>
          <div className="flex items-baseline gap-1">
            <input
              type="text"
              inputMode="decimal"
              pattern="[0-9]*[.,]?[0-9]*"
              value={subject.maxScore === 0 ? '' : subject.maxScore}
              onChange={(e) => handleMaxScoreChange(e.target.value)}
              placeholder="100"
              className="w-full bg-transparent font-extrabold text-xl sm:text-2xl text-[var(--crt-phosphor-bright)] focus:outline-none placeholder:text-[var(--crt-phosphor-dim)]/40"
            />
            <span className="text-xs text-[var(--crt-phosphor-dim)] font-bold">б.</span>
          </div>
          <span className="text-[10px] text-[var(--crt-phosphor-dim)]/80 mt-1">
            Осталось: <span className="text-emerald-400 font-bold">{metrics.remainingScore} б.</span>
          </span>
        </div>
      </div>

      {/* Progress Bar & Status Metric */}
      <div className="space-y-1.5 font-mono">
        <div className="flex justify-between text-xs">
          <span className="text-[var(--crt-phosphor-dim)]">Прогресс дисциплины:</span>
          <span className="font-bold text-[var(--crt-phosphor-bright)]">
            {metrics.currentScore} / {metrics.maxScore} б. ({metrics.completionPercent}%)
          </span>
        </div>
        <div className="w-full h-2.5 bg-black/80 rounded-full border border-[var(--crt-phosphor-dim)]/60 overflow-hidden">
          <div
            className="h-full bg-[var(--crt-phosphor)] transition-all duration-300"
            style={{ width: `${metrics.completionPercent}%` }}
          />
        </div>
      </div>

      {/* Target Goal Section with Explicit Reset Button (Double-tap strictly disabled) */}
      <div className="bg-[#050e06] border border-[var(--crt-phosphor-dim)] rounded-lg p-3 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--crt-phosphor-bright)] uppercase tracking-wide">
            <Target size={14} className="text-amber-400" />
            <span>Целевая оценка</span>
          </div>

          {/* Explicit Reset Button (ONLY WAY TO CLEAR TARGET) */}
          {metrics.targetThreshold && (
            <button
              onClick={handleResetTarget}
              type="button"
              className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-mono bg-red-950/40 hover:bg-red-900/60 border border-red-800 text-red-300 rounded cursor-pointer transition-colors active:scale-95"
              title="Сбросить целевую оценку"
            >
              <X size={12} />
              <span>Сбросить цель</span>
            </button>
          )}
        </div>

        {/* Scale Pills / Target Selectors (Single Tap to Select, NO double-tap reset) */}
        {subject.scale.length === 0 ? (
          <p className="text-xs text-[var(--crt-phosphor-dim)] italic">
            Шкала оценок пуста. Нажмите «Настроить шкалу» ниже, чтобы добавить пороги («Отлично», «Хорошо», «Зачёт» и др.).
          </p>
        ) : (
          <div className="flex flex-wrap gap-2 pt-0.5">
            {subject.scale.map((th) => {
              const isSelected = subject.targetScaleId === th.id;
              const isEarned = subject.currentScore >= th.minScore;

              return (
                <button
                  key={th.id}
                  type="button"
                  onClick={() => handleSelectTarget(th.id)}
                  className={`px-2.5 py-1.5 rounded text-xs font-mono font-bold flex items-center gap-1.5 transition-all cursor-pointer select-none active:scale-95 ${
                    isSelected
                      ? 'bg-[var(--crt-phosphor)] text-black ring-2 ring-[var(--crt-phosphor-bright)] shadow-md'
                      : isEarned
                      ? 'bg-emerald-950/40 border border-emerald-600 text-emerald-300 hover:border-emerald-400'
                      : 'bg-black/60 border border-[var(--crt-phosphor-dim)]/70 text-[var(--crt-phosphor-dim)] hover:border-[var(--crt-phosphor)] hover:text-[var(--crt-phosphor)]'
                  }`}
                >
                  <span>{th.label}</span>
                  <span className={`text-[10px] ${isSelected ? 'text-black/80' : 'opacity-70'}`}>
                    (≥{th.minScore})
                  </span>
                  {isSelected && <Check size={12} className="stroke-[3]" />}
                </button>
              );
            })}
          </div>
        )}

        {/* Calculation Summary Box (Points Deficit & Required Success Rate) */}
        {metrics.targetThreshold && (
          <div
            className={`mt-2 p-2.5 rounded border text-xs font-mono space-y-1 ${
              metrics.status === 'EXCEEDED'
                ? 'bg-emerald-950/30 border-emerald-600/80 text-emerald-200'
                : metrics.status === 'IMPOSSIBLE'
                ? 'bg-red-950/30 border-red-600/80 text-red-200'
                : 'bg-amber-950/30 border-amber-600/80 text-amber-200'
            }`}
          >
            <div className="flex items-center justify-between font-bold">
              <span>Цель: «{metrics.targetThreshold.label}» (порог {metrics.targetThreshold.minScore} б.)</span>
              {metrics.status === 'EXCEEDED' && (
                <span className="flex items-center gap-1 text-emerald-400">
                  <CheckCircle2 size={13} /> Достигнута!
                </span>
              )}
              {metrics.status === 'IMPOSSIBLE' && (
                <span className="flex items-center gap-1 text-red-400">
                  <AlertTriangle size={13} /> Недостижима
                </span>
              )}
              {metrics.status === 'POSSIBLE' && (
                <span className="text-amber-300">В процессе</span>
              )}
            </div>

            {metrics.status === 'POSSIBLE' && (
              <div className="pt-1 space-y-0.5">
                <div>
                  Дефицит баллов до цели:{' '}
                  <span className="font-extrabold text-[var(--crt-phosphor-bright)] text-sm">
                    {metrics.pointsNeeded} б.
                  </span>{' '}
                  из <span className="font-bold">{metrics.remainingScore} б.</span> оставшихся.
                </div>
                <div>
                  Требуемый процент на оставшихся заданиях:{' '}
                  <span className="font-extrabold text-[var(--crt-phosphor-bright)] text-sm">
                    {metrics.requiredRatePercent}%
                  </span>
                </div>
              </div>
            )}

            {metrics.status === 'IMPOSSIBLE' && (
              <p className="text-[11px] leading-relaxed pt-1 text-red-300">
                Не хватает {metrics.pointsNeeded} баллов, но до конца курса можно набрать максимум {metrics.remainingScore} б. Дефицит: {metrics.pointsNeeded - metrics.remainingScore} б.
              </p>
            )}

            {metrics.status === 'EXCEEDED' && (
              <p className="text-[11px] leading-relaxed pt-1 text-emerald-300">
                Порог преодолен на {metrics.currentScore - metrics.targetThreshold.minScore} б.
              </p>
            )}
          </div>
        )}
      </div>

      {/* AI Assistant Button & Response Card */}
      <div className="space-y-2">
        <button
          type="button"
          disabled={isAiLoading}
          onClick={() => onAskAi(subject)}
          className="w-full py-2.5 px-3 bg-gradient-to-r from-emerald-950/80 to-[#102a16] hover:from-emerald-900/90 hover:to-[#173e21] border border-[var(--crt-phosphor)] text-[var(--crt-phosphor-bright)] rounded-lg font-bold text-xs sm:text-sm font-mono flex items-center justify-center gap-2 transition-all cursor-pointer shadow active:scale-[0.98] disabled:opacity-50"
        >
          <Sparkles size={16} className={isAiLoading ? 'animate-spin text-amber-400' : 'text-amber-400'} />
          <span>{isAiLoading ? 'Анализ нейросетью Gemini...' : 'Спросить AI / Анализ и прогноз'}</span>
        </button>

        {aiAdviceResult && (
          <div className="bg-[#040e06] border border-[var(--crt-phosphor)] rounded-lg p-3 text-xs font-mono space-y-1.5 shadow-inner">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-amber-400 font-bold border-b border-[var(--crt-phosphor-dim)]/30 pb-1">
              <span className="flex items-center gap-1.5">
                <Sparkles size={13} />
                Персональная рекомендация Gemini
              </span>
              {aiModeUsed === 'web' ? (
                <span className="inline-flex items-center gap-1 text-[10px] text-amber-300">
                  <Globe size={11} />
                  <span>Режим 2: + Интернет</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-300">
                  <Lock size={11} />
                  <span>Режим 1: Локально (Приложение)</span>
                </span>
              )}
            </div>
            <p className="text-[var(--crt-phosphor-bright)] whitespace-pre-wrap leading-relaxed text-[11px] sm:text-xs">
              {aiAdviceResult}
            </p>
          </div>
        )}
      </div>

      {/* Accordion: Scale Configuration & Presets */}
      <div className="border-t border-[var(--crt-phosphor-dim)]/40 pt-2 font-mono text-xs">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setIsEditingScale(!isEditingScale)}
            className="flex items-center gap-1.5 text-[var(--crt-phosphor-dim)] hover:text-[var(--crt-phosphor)] font-bold py-1 cursor-pointer transition-colors"
          >
            <Sliders size={13} />
            <span>{isEditingScale ? 'Скрыть настройки шкалы' : 'Настроить шкалу и пороги'}</span>
            {isEditingScale ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {/* Presets Action */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowPresetDropdown(!showPresetDropdown)}
              className="flex items-center gap-1 text-[11px] text-[var(--crt-phosphor-dim)] hover:text-[var(--crt-phosphor-bright)] border border-[var(--crt-phosphor-dim)]/50 rounded px-2 py-0.5 cursor-pointer transition-colors"
            >
              <Bookmark size={12} />
              <span>Шаблоны</span>
              <ChevronDown size={12} />
            </button>

            {showPresetDropdown && (
              <div className="absolute right-0 bottom-full mb-1 w-64 bg-[#0a180d] border-2 border-[var(--crt-phosphor)] rounded-lg shadow-2xl p-2 z-50 space-y-2">
                <div className="flex items-center justify-between border-b border-[var(--crt-phosphor-dim)]/40 pb-1 text-[11px] font-bold text-[var(--crt-phosphor)]">
                  <span>Применить шаблон</span>
                  <button
                    onClick={() => setShowPresetDropdown(false)}
                    className="text-[var(--crt-phosphor-dim)] hover:text-white"
                  >
                    <X size={12} />
                  </button>
                </div>

                <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                  {presets.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleApplyPreset(preset)}
                      className="w-full text-left p-1.5 rounded hover:bg-[#142d19] border border-transparent hover:border-[var(--crt-phosphor-dim)] transition-colors text-[11px]"
                    >
                      <div className="font-bold text-[var(--crt-phosphor-bright)]">{preset.name}</div>
                      <div className="text-[9.5px] text-[var(--crt-phosphor-dim)]">{preset.description}</div>
                    </button>
                  ))}
                </div>

                <div className="border-t border-[var(--crt-phosphor-dim)]/40 pt-1.5">
                  {!showSavePresetInput ? (
                    <button
                      type="button"
                      onClick={() => setShowSavePresetInput(true)}
                      className="w-full py-1 text-center text-[10.5px] text-amber-300 hover:text-amber-200 border border-amber-600/40 rounded bg-amber-950/20"
                    >
                      + Сохранить текущую как шаблон
                    </button>
                  ) : (
                    <div className="space-y-1">
                      <input
                        type="text"
                        value={newPresetName}
                        onChange={(e) => setNewPresetName(e.target.value)}
                        placeholder="Название шаблона..."
                        className="w-full bg-black/80 border border-[var(--crt-phosphor-dim)] rounded px-1.5 py-1 text-[11px] text-[var(--crt-phosphor)] focus:outline-none"
                      />
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={handleConfirmSavePreset}
                          className="flex-1 py-0.5 bg-[var(--crt-phosphor)] text-black font-bold text-[10px] rounded"
                        >
                          Сохранить
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowSavePresetInput(false)}
                          className="px-2 py-0.5 border border-zinc-700 text-zinc-400 text-[10px] rounded"
                        >
                          Отмена
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Scale Editor Section */}
        {isEditingScale && (
          <div className="mt-3 p-3 bg-black/60 border border-[var(--crt-phosphor-dim)]/60 rounded-lg space-y-3">
            <p className="text-[11px] text-[var(--crt-phosphor-dim)]">
              Задайте названия рубежей и минимальные баллы. Шкала сортируется автоматически по убыванию порога.
            </p>

            {/* List of current thresholds */}
            <div className="space-y-1.5">
              {subject.scale.map((th) => (
                <div key={th.id} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={th.label}
                    onChange={(e) => handleUpdateThresholdLabel(th.id, e.target.value)}
                    className="flex-1 bg-black/80 border border-[var(--crt-phosphor-dim)]/70 rounded px-2 py-1 text-xs text-[var(--crt-phosphor)] focus:outline-none"
                    placeholder="Название (напр. Отлично)"
                  />
                  <div className="flex items-center gap-1 w-24">
                    <span className="text-[10px] text-[var(--crt-phosphor-dim)]">от</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      pattern="[0-9]*[.,]?[0-9]*"
                      value={th.minScore === 0 ? '' : th.minScore}
                      onChange={(e) => handleUpdateThresholdScore(th.id, e.target.value)}
                      placeholder="0"
                      className="w-full bg-black/80 border border-[var(--crt-phosphor-dim)]/70 rounded px-1.5 py-1 text-xs font-bold text-center text-[var(--crt-phosphor-bright)] focus:outline-none placeholder:text-[var(--crt-phosphor-dim)]/40"
                    />
                    <span className="text-[10px] text-[var(--crt-phosphor-dim)]">б.</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteThreshold(th.id)}
                    className="p-1 text-red-400 hover:text-red-300 hover:bg-red-950/40 rounded transition-colors"
                    title="Удалить рубеж"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>

            {/* Add new threshold row */}
            <div className="pt-2 border-t border-[var(--crt-phosphor-dim)]/40 flex items-center gap-2">
              <input
                type="text"
                value={newThresholdLabel}
                onChange={(e) => setNewThresholdLabel(e.target.value)}
                placeholder="Новый рубеж (напр. Зачёт)"
                className="flex-1 bg-black/80 border border-[var(--crt-phosphor-dim)]/70 rounded px-2 py-1 text-xs text-[var(--crt-phosphor)] focus:outline-none"
              />
              <div className="flex items-center gap-1 w-24">
                <span className="text-[10px] text-[var(--crt-phosphor-dim)]">от</span>
                <input
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9]*[.,]?[0-9]*"
                  value={newThresholdMin}
                  onChange={(e) => setNewThresholdMin(e.target.value)}
                  placeholder="60"
                  className="w-full bg-black/80 border border-[var(--crt-phosphor-dim)]/70 rounded px-1.5 py-1 text-xs font-bold text-center text-[var(--crt-phosphor-bright)] focus:outline-none placeholder:text-[var(--crt-phosphor-dim)]/40"
                />
                <span className="text-[10px] text-[var(--crt-phosphor-dim)]">б.</span>
              </div>
              <button
                type="button"
                onClick={handleAddThreshold}
                className="px-2.5 py-1 bg-[var(--crt-phosphor)] text-black font-bold text-xs rounded flex items-center gap-1 cursor-pointer hover:opacity-90 active:scale-95 transition-transform"
              >
                <Plus size={13} />
                <span>Добавить</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
