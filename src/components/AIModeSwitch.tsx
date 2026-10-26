import React, { useEffect, useState } from 'react';
import { AIDataMode } from '../types/pipboy';
import {
  getStoredAIDataMode,
  setStoredAIDataMode,
  subscribeToAIDataMode
} from '../utils/appDataContext';
import { pipAudio } from '../utils/audio';
import { ShieldCheck, Globe, Lock } from 'lucide-react';

interface AIModeSwitchProps {
  mode?: AIDataMode;
  onChange?: (newMode: AIDataMode) => void;
  compact?: boolean;
  showDescription?: boolean;
}

export const AIModeSwitch: React.FC<AIModeSwitchProps> = ({
  mode: externalMode,
  onChange,
  compact = false,
  showDescription = false
}) => {
  const [internalMode, setInternalMode] = useState<AIDataMode>(() =>
    externalMode || getStoredAIDataMode()
  );

  useEffect(() => {
    if (externalMode) {
      setInternalMode(externalMode);
    }
  }, [externalMode]);

  useEffect(() => {
    return subscribeToAIDataMode((updated) => {
      setInternalMode(updated);
    });
  }, []);

  const activeMode = externalMode || internalMode;

  const handleSelectMode = (targetMode: AIDataMode) => {
    if (targetMode === activeMode) return;
    pipAudio.playClick();
    setInternalMode(targetMode);
    setStoredAIDataMode(targetMode);
    if (onChange) {
      onChange(targetMode);
    }
  };

  if (compact) {
    return (
      <div
        className="inline-flex items-center bg-[#09140b] border border-[var(--crt-phosphor-dim)] rounded p-0.5 font-mono text-[10px]"
        title="Переключение режима работы встроенной нейросети: Режим 1 (только прикрепленные сайты и данные приложения) / Режим 2 (+ данные из Интернета)"
      >
        <button
          type="button"
          onClick={() => handleSelectMode('local')}
          className={`flex items-center gap-1 px-2 py-1 rounded transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
            activeMode === 'local'
              ? 'bg-[var(--crt-phosphor)] text-black font-extrabold shadow-[0_0_8px_var(--crt-glow)]'
              : 'text-[var(--crt-phosphor)]/75 hover:text-[var(--crt-phosphor-bright)]'
          }`}
        >
          <Lock size={11} className="shrink-0" />
          <span>РЕЖИМ 1: ЛОКАЛЬНО</span>
        </button>

        <button
          type="button"
          onClick={() => handleSelectMode('web')}
          className={`flex items-center gap-1 px-2 py-1 rounded transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
            activeMode === 'web'
              ? 'bg-amber-400 text-black font-extrabold shadow-[0_0_8px_rgba(251,191,36,0.4)]'
              : 'text-amber-300/75 hover:text-amber-200'
          }`}
        >
          <Globe size={11} className="shrink-0" />
          <span>РЕЖИМ 2: + ИНТЕРНЕТ</span>
        </button>
      </div>
    );
  }

  return (
    <div className="bg-[#061108] border border-[var(--crt-phosphor-dim)] rounded-lg p-2.5 font-mono space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs">
          {activeMode === 'local' ? (
            <ShieldCheck size={15} className="text-[var(--crt-phosphor-bright)] shrink-0" />
          ) : (
            <Globe size={15} className="text-amber-400 shrink-0" />
          )}
          <span className="font-bold uppercase tracking-wider text-[11px] text-[var(--crt-phosphor-bright)]">
            Контур данных нейросети:
          </span>
        </div>

        <div className="flex items-center bg-black border border-[var(--crt-phosphor-dim)] rounded p-0.5 text-[11px]">
          <button
            type="button"
            onClick={() => handleSelectMode('local')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              activeMode === 'local'
                ? 'bg-[var(--crt-phosphor)] text-black font-extrabold shadow-[0_0_10px_var(--crt-glow)]'
                : 'text-zinc-400 hover:text-[var(--crt-phosphor-bright)]'
            }`}
          >
            <Lock size={12} className="shrink-0" />
            <span>1. Только сайты и приложение</span>
          </button>

          <button
            type="button"
            onClick={() => handleSelectMode('web')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              activeMode === 'web'
                ? 'bg-amber-400 text-black font-extrabold shadow-[0_0_10px_rgba(251,191,36,0.4)]'
                : 'text-zinc-400 hover:text-amber-300'
            }`}
          >
            <Globe size={12} className="shrink-0" />
            <span>2. + Данные из Интернета</span>
          </button>
        </div>
      </div>

      {showDescription && (
        <div className="text-[11px] leading-relaxed px-1">
          {activeMode === 'local' ? (
            <span className="text-[var(--crt-phosphor)]/90">
              <strong>Режим 1 (Строгий локальный контур):</strong> ИИ опирается <em>только</em> на прикрепленные вами сайты, расписание (верхняя/нижняя недели), таблицу оценок и профиль студента. Сторонняя информация из Интернета отключена.
            </span>
          ) : (
            <span className="text-amber-300/95">
              <strong>Режим 2 (Глобальный поиск + Приложение):</strong> ИИ использует как данные ваших сайтов и приложения, так и живой поиск в Интернете (Google Search) и внешние академические знания.
            </span>
          )}
        </div>
      )}
    </div>
  );
};
