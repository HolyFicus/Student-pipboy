import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { MonitoredLink, DiffEntry, SiteWrittenContent } from '../types/pipboy';
import { pipAudio } from '../utils/audio';
import { useModalScrollLock } from '../utils/useModalScrollLock';
import { generateInitialWrittenContent } from '../utils/siteChecker';
import { SiteUpdateSparkline } from './SiteUpdateSparkline';
import {
  FileText,
  Clock,
  ExternalLink,
  X,
  Bot,
  Zap,
  RefreshCw,
  Copy,
  Check,
  BookOpen,
  FolderTree,
  Tag,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  FileCode,
  Sparkles,
  Layers,
  History,
  AlignLeft,
  Columns,
  ListFilter,
  ScanLine
} from 'lucide-react';

interface SiteTelemetryModalProps {
  link: MonitoredLink;
  onClose: () => void;
  onOpenAIWithLink: (linkId: string) => void;
  onScanSingle: (linkId: string) => void;
  isSyncing?: boolean;
  checkReport?: {
    checking: boolean;
    message: string;
    hasChanged: boolean;
    timestamp: number;
  };
}

export const SiteTelemetryModal: React.FC<SiteTelemetryModalProps> = ({
  link,
  onClose,
  onOpenAIWithLink,
  onScanSingle,
  isSyncing = false,
  checkReport
}) => {
  useModalScrollLock(true);
  const [activeTab, setActiveTab] = useState<'content' | 'diffs' | 'digest'>('content');
  const [diffViewMode, setDiffViewMode] = useState<'sideBySide' | 'unified'>('sideBySide');
  const [diffFilter, setDiffFilter] = useState<'ALL' | 'MODIFIED' | 'ADDED' | 'UPDATE'>('ALL');
  const [copiedText, setCopiedText] = useState(false);
  const [copiedDigest, setCopiedDigest] = useState(false);
  const [isPressedCheck, setIsPressedCheck] = useState(false);

  // Get or initialize detailed written content
  const content: SiteWrittenContent = link.writtenContent || generateInitialWrittenContent(link.url, link.title, link.category);
  const diffs: DiffEntry[] = link.diffHistory || [];

  const filteredDiffs = diffs.filter((d) => {
    if (diffFilter === 'ALL') return true;
    return d.changeType === diffFilter;
  });

  const handleCopyCurrentText = () => {
    navigator.clipboard.writeText(content.lastPublishedText);
    setCopiedText(true);
    pipAudio.playClick();
    setTimeout(() => setCopiedText(false), 2000);
  };

  const generateMarkdownDigest = () => {
    const lines = [
      `# Академический дайджест: ${link.title}`,
      `**URL:** ${link.url}`,
      `**Категория:** ${link.category} | **Статус:** ${content.contentStatus}`,
      `**Объем текста:** ~${content.wordCount} слов | **Время чтения:** ~${content.readingTimeMin} мин`,
      `**Источник:** ${content.authorOrSource || 'Официальный ресурс'}`,
      '',
      '## 1. Письменное описание и назначение ресурса',
      content.overview,
      '',
      '## 2. Структура и ключевые разделы сайта',
      ...content.detectedSections.map(
        (s, idx) => `${idx + 1}. **${s.title}**${s.itemsCount ? ` (${s.itemsCount} материалов)` : ''}: ${s.summary}`
      ),
      '',
      '## 3. Ключевые термины и темы',
      content.keyTopics.map((t) => `- ${t}`).join('\n'),
      '',
      '## 4. Текущий опубликованный текст / Документ',
      content.lastPublishedText,
      '',
      '## 5. Протокол динамических изменений (История правок)',
      diffs.length === 0
        ? 'Изменений с момента добавления в мониторинг не зафиксировано.'
        : diffs
            .map(
              (d) =>
                `- **[${new Date(d.timestamp).toLocaleString('ru-RU')}] ${d.section}**: ${d.summary}\n  - *Было:* ${d.previousText || '—'}\n  - *Стало:* ${d.newText}`
            )
            .join('\n')
    ];
    return lines.join('\n');
  };

  const handleCopyDigest = () => {
    navigator.clipboard.writeText(generateMarkdownDigest());
    setCopiedDigest(true);
    pipAudio.playSuccess();
    setTimeout(() => setCopiedDigest(false), 2500);
  };

  const modalContent = (
    <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-[#071309] border-2 border-[var(--crt-phosphor)] rounded-xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-[0_0_40px_rgba(var(--crt-phosphor-rgb),0.3)] text-[var(--crt-phosphor)] font-mono overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Modal Top Header */}
        <div className="border-b border-[var(--crt-phosphor-dim)] bg-[#0d1d10] p-3 sm:p-4 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 border border-[var(--crt-phosphor)] bg-[var(--crt-phosphor)]/15 rounded-lg shrink-0">
              <FileText size={22} className="text-[var(--crt-phosphor-bright)]" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-extrabold text-sm sm:text-base text-[var(--crt-phosphor-bright)] tracking-wide truncate">
                  {link.title}
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded border border-[var(--crt-phosphor-dim)] bg-black/70 font-mono uppercase">
                  {link.category}
                </span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded font-black uppercase ${
                    link.status === 'CHANGED'
                      ? 'bg-amber-950 text-amber-300 border border-amber-500 animate-pulse'
                      : 'bg-emerald-950 text-emerald-400 border border-emerald-500'
                  }`}
                >
                  ● {link.status === 'CHANGED' ? 'ОБНОВЛЕНИЕ КОНТЕНТА' : 'КОНТЕНТ АКТУАЛЕН'}
                </span>
              </div>
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs opacity-75 hover:opacity-100 underline flex items-center gap-1 truncate text-[var(--crt-phosphor)] mt-0.5"
              >
                <span>{link.url}</span>
                <ExternalLink size={12} className="shrink-0" />
              </a>
            </div>
          </div>

          {/* Quick Header Actions */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onMouseDown={() => setIsPressedCheck(true)}
              onMouseUp={() => setIsPressedCheck(false)}
              onMouseLeave={() => setIsPressedCheck(false)}
              onTouchStart={() => setIsPressedCheck(true)}
              onTouchEnd={() => setIsPressedCheck(false)}
              onClick={() => {
                onScanSingle(link.id);
              }}
              disabled={isSyncing}
              className={`px-3 py-1.5 bg-[var(--crt-phosphor)] text-black font-extrabold text-xs rounded-md hover:bg-[var(--crt-phosphor-bright)] transition-all flex items-center gap-1.5 cursor-pointer select-none disabled:opacity-50 shadow-[0_3px_0_rgba(0,0,0,0.85)] active:translate-y-0.5 active:scale-[0.97] ${
                isPressedCheck ? 'translate-y-0.5 scale-[0.97] brightness-90' : ''
              }`}
              title="Нажмите для реальной проверки изменений письменных данных на сайте прямо сейчас"
            >
              {isSyncing ? (
                <RefreshCw size={13} className="animate-spin" />
              ) : (
                <ScanLine size={13} />
              )}
              <span>{isSyncing ? 'СВЕРКА ТЕКСТА...' : 'ПРОВЕРИТЬ ПИСЬМЕННЫЕ ДАННЫЕ'}</span>
            </button>

            <button
              onClick={() => {
                pipAudio.playSuccess();
                onOpenAIWithLink(link.id);
              }}
              className="px-3 py-1.5 bg-amber-950/60 border border-amber-400 text-amber-300 font-bold text-xs rounded hover:bg-amber-400 hover:text-black transition-colors flex items-center gap-1.5 cursor-pointer shadow-[0_0_8px_rgba(251,191,36,0.25)]"
              title="Задать вопрос ИИ-консультанту по содержанию этого сайта"
            >
              <Bot size={13} />
              <span className="hidden sm:inline">СПРОСИТЬ ИИ</span>
            </button>

            <button
              onClick={() => {
                pipAudio.playClick();
                onClose();
              }}
              className="p-1.5 border border-zinc-700 hover:border-[var(--crt-phosphor)] text-[var(--crt-phosphor)] rounded cursor-pointer transition-colors"
              title="Закрыть окно"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Sub-tab Navigation */}
        <div className="bg-[#050e06] border-b border-[var(--crt-phosphor-dim)]/50 px-3 sm:px-4 py-2 flex items-center justify-between gap-2 overflow-x-auto no-scrollbar shrink-0">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                pipAudio.playClick();
                setActiveTab('content');
              }}
              className={`px-3 py-1.5 rounded text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'content'
                  ? 'bg-[var(--crt-phosphor)] text-black font-extrabold shadow-sm'
                  : 'bg-black/40 text-[var(--crt-phosphor)]/80 hover:text-[var(--crt-phosphor)] hover:bg-black/70 border border-transparent'
              }`}
            >
              <BookOpen size={14} />
              <span>ПИСЬМЕННОЕ СОДЕРЖАНИЕ</span>
            </button>

            <button
              onClick={() => {
                pipAudio.playClick();
                setActiveTab('diffs');
              }}
              className={`px-3 py-1.5 rounded text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'diffs'
                  ? 'bg-[var(--crt-phosphor)] text-black font-extrabold shadow-sm'
                  : 'bg-black/40 text-[var(--crt-phosphor)]/80 hover:text-[var(--crt-phosphor)] hover:bg-black/70 border border-transparent'
              }`}
            >
              <Zap size={14} className={diffs.length > 0 ? 'text-amber-400' : ''} />
              <span>ДИНАМИКА ИЗМЕНЕНИЙ ({diffs.length})</span>
            </button>

            <button
              onClick={() => {
                pipAudio.playClick();
                setActiveTab('digest');
              }}
              className={`px-3 py-1.5 rounded text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'digest'
                  ? 'bg-[var(--crt-phosphor)] text-black font-extrabold shadow-sm'
                  : 'bg-black/40 text-[var(--crt-phosphor)]/80 hover:text-[var(--crt-phosphor)] hover:bg-black/70 border border-transparent'
              }`}
            >
              <FileCode size={14} />
              <span>ДАЙДЖЕСТ & ЭКСПОРТ</span>
            </button>
          </div>

          {/* Quick Metrics Bar */}
          <div className="hidden md:flex items-center gap-3 text-[11px] opacity-80">
            <span>Объем: <strong>~{content.wordCount}</strong> слов</span>
            <span>•</span>
            <span>Чтение: <strong>~{content.readingTimeMin}</strong> мин</span>
            <span>•</span>
            <span>Разделов: <strong>{content.detectedSections.length}</strong></span>
          </div>
        </div>

        {/* Live Verification Banner inside Modal */}
        {checkReport && (
          <div
            className={`mx-3 sm:mx-5 mt-3 p-2.5 rounded-lg border text-xs font-mono flex items-start gap-2 ${
              checkReport.checking
                ? 'bg-black/90 border-[var(--crt-phosphor)] text-[var(--crt-phosphor-bright)] animate-pulse'
                : checkReport.hasChanged
                ? 'bg-amber-950/50 border-amber-400 text-amber-200'
                : 'bg-emerald-950/40 border-emerald-500/70 text-emerald-200'
            }`}
          >
            {checkReport.checking ? (
              <RefreshCw size={14} className="animate-spin shrink-0 mt-0.5" />
            ) : checkReport.hasChanged ? (
              <Zap size={14} className="text-amber-400 shrink-0 mt-0.5" />
            ) : (
              <ShieldCheck size={14} className="text-emerald-400 shrink-0 mt-0.5" />
            )}
            <div className="text-[11px] font-sans leading-relaxed">{checkReport.message}</div>
          </div>
        )}

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-4">
          
          {/* Detailed Sparkline Activity Visualization */}
          <SiteUpdateSparkline link={link} variant="detailed" />

          {/* TAB 1: DETAILED WRITTEN CONTENT */}
          {activeTab === 'content' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              
              {/* Comprehensive Overview Box */}
              <div className="bg-[#0b170e] border border-[var(--crt-phosphor-dim)] rounded-lg p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-[var(--crt-phosphor-bright)] flex items-center gap-1.5">
                    <AlignLeft size={14} /> НАЗНАЧЕНИЕ И ПИСЬМЕННЫЙ ПАСПОРТ РЕСУРСА
                  </span>
                  <span className="text-[10px] text-[var(--crt-phosphor)]/75">
                    Источник: {content.authorOrSource || 'Официальный портал'}
                  </span>
                </div>
                <p className="text-xs sm:text-sm leading-relaxed text-[var(--crt-phosphor-bright)]/90 font-sans">
                  {content.overview}
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[var(--crt-phosphor-dim)]/40 text-[11px]">
                  <span className="opacity-75 flex items-center gap-1">
                    <Tag size={12} /> Ключевые академические понятия:
                  </span>
                  {content.keyTopics.map((topic, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 rounded border border-[var(--crt-phosphor-dim)]/60 bg-black/60 text-[var(--crt-phosphor-bright)] text-[10px]"
                    >
                      {topic}
                    </span>
                  ))}
                </div>
              </div>

              {/* Current Published Full Text Block */}
              <div className="bg-black/70 border border-[var(--crt-phosphor)] rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-[var(--crt-phosphor-bright)] flex items-center gap-1.5">
                    <FileText size={14} className="text-amber-400" /> ТЕКУЩИЙ ОПУБЛИКОВАННЫЙ ТЕКСТ / РАСПОРЯЖЕНИЕ / СТАТЬЯ
                  </span>
                  <button
                    onClick={handleCopyCurrentText}
                    className="text-[11px] px-2.5 py-1 bg-[#122416] hover:bg-[#1a3520] border border-[var(--crt-phosphor-dim)] rounded flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    {copiedText ? (
                      <>
                        <Check size={12} className="text-green-400" />
                        <span>Скопировано!</span>
                      </>
                    ) : (
                      <>
                        <Copy size={12} />
                        <span>Копировать фрагмент</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="bg-[#050c07] border border-[var(--crt-phosphor-dim)]/50 p-3 rounded text-xs sm:text-sm text-[var(--crt-phosphor-bright)] font-sans leading-relaxed whitespace-pre-wrap selection:bg-[var(--crt-phosphor)] selection:text-black max-h-64 overflow-y-auto">
                  {content.lastPublishedText}
                </div>
              </div>

              {/* Detected Sections & Content Catalog */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-[var(--crt-phosphor-bright)] flex items-center gap-1.5">
                    <FolderTree size={14} /> КАТАЛОГ И СОДЕРЖАНИЕ РАЗДЕЛОВ ({content.detectedSections.length})
                  </span>
                  <span className="text-[10px] opacity-70">
                    Все разделы страницы, обнаруженные поисковым модулем
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {content.detectedSections.map((sec, idx) => (
                    <div
                      key={idx}
                      className="bg-[#07150a] border border-[var(--crt-phosphor-dim)]/70 hover:border-[var(--crt-phosphor)] p-3 rounded-lg space-y-1.5 transition-all"
                    >
                      <div className="flex items-center justify-between text-xs font-bold text-[var(--crt-phosphor-bright)]">
                        <span className="flex items-center gap-1">
                          <CheckCircle2 size={13} className="text-[var(--crt-phosphor)] shrink-0" />
                          {sec.title}
                        </span>
                        {sec.itemsCount && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-black/60 border border-[var(--crt-phosphor-dim)]/50 text-[var(--crt-phosphor)]">
                            ~{sec.itemsCount} мат.
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[var(--crt-phosphor)]/80 leading-normal font-sans">
                        {sec.summary}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}

          {/* TAB 2: CONTENT CHANGE DYNAMICS (DIFF COMPARATOR) */}
          {activeTab === 'diffs' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              
              {/* Diff Controls Header */}
              <div className="bg-[#0b170e] border border-[var(--crt-phosphor-dim)] p-3 rounded-lg flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <Zap size={14} className="text-amber-400" /> РЕЖИМ СРАВНЕНИЯ:
                  </span>
                  <div className="flex items-center border border-[var(--crt-phosphor-dim)] rounded overflow-hidden">
                    <button
                      onClick={() => {
                        pipAudio.playClick();
                        setDiffViewMode('sideBySide');
                      }}
                      className={`px-2.5 py-1 text-xs flex items-center gap-1 cursor-pointer transition-colors ${
                        diffViewMode === 'sideBySide'
                          ? 'bg-[var(--crt-phosphor)] text-black font-bold'
                          : 'bg-black/60 text-[var(--crt-phosphor)]/80'
                      }`}
                    >
                      <Columns size={12} />
                      <span>ДО / ПОСЛЕ (SIDE-BY-SIDE)</span>
                    </button>
                    <button
                      onClick={() => {
                        pipAudio.playClick();
                        setDiffViewMode('unified');
                      }}
                      className={`px-2.5 py-1 text-xs flex items-center gap-1 cursor-pointer transition-colors ${
                        diffViewMode === 'unified'
                          ? 'bg-[var(--crt-phosphor)] text-black font-bold'
                          : 'bg-black/60 text-[var(--crt-phosphor)]/80'
                      }`}
                    >
                      <AlignLeft size={12} />
                      <span>ЕДИНЫЙ ТЕКСТ С ПОДСВЕТКОЙ</span>
                    </button>
                  </div>
                </div>

                {/* Diff Type Filter */}
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="opacity-70 text-[10px] uppercase">Фильтр:</span>
                  {(['ALL', 'MODIFIED', 'ADDED', 'UPDATE'] as const).map((filter) => (
                    <button
                      key={filter}
                      onClick={() => {
                        pipAudio.playClick();
                        setDiffFilter(filter);
                      }}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer transition-colors ${
                        diffFilter === filter
                          ? 'bg-[var(--crt-phosphor)] text-black'
                          : 'border border-[var(--crt-phosphor-dim)]/50 text-[var(--crt-phosphor)]/70 hover:border-[var(--crt-phosphor)]'
                      }`}
                    >
                      {filter === 'ALL'
                        ? 'ВСЕ'
                        : filter === 'MODIFIED'
                        ? 'ИЗМЕНЕНИЯ'
                        : filter === 'ADDED'
                        ? 'ДОБАВЛЕНИЯ'
                        : 'РЕГЛАМЕНТЫ'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Diffs List */}
              {filteredDiffs.length === 0 ? (
                <div className="border border-dashed border-[var(--crt-phosphor-dim)] p-8 text-center rounded-lg bg-black/40 space-y-3">
                  <History className="mx-auto opacity-50 text-[var(--crt-phosphor)]" size={36} />
                  <div className="font-bold text-sm text-[var(--crt-phosphor-bright)]">
                    {diffs.length === 0
                      ? 'Изменений письменных данных на сайте не зафиксировано'
                      : 'По выбранному фильтру записей не найдено'}
                  </div>
                  <p className="text-xs opacity-75 max-w-md mx-auto leading-relaxed">
                    Терминал сверяет реальный текстовый снимок веб-страницы без галлюцинаций и выдумок. Нажмите кнопку ниже, чтобы выполнить интерактивную сверку письменных данных на сайте прямо сейчас.
                  </p>
                  <div>
                    <button
                      type="button"
                      disabled={isSyncing}
                      onMouseDown={() => setIsPressedCheck(true)}
                      onMouseUp={() => setIsPressedCheck(false)}
                      onMouseLeave={() => setIsPressedCheck(false)}
                      onClick={() => {
                        onScanSingle(link.id);
                      }}
                      className={`px-4 py-2 bg-[var(--crt-phosphor)] text-black font-extrabold text-xs uppercase rounded-md cursor-pointer hover:bg-[var(--crt-phosphor-bright)] transition-all inline-flex items-center gap-1.5 select-none shadow-[0_3px_0_rgba(0,0,0,0.85)] active:translate-y-0.5 active:scale-[0.97] ${
                        isPressedCheck ? 'translate-y-0.5 scale-[0.97] brightness-90' : ''
                      }`}
                    >
                      <ScanLine size={14} />
                      <span>{isSyncing ? 'СВЕРКА ПИСЬМЕННЫХ ДАННЫХ...' : 'ПРОВЕРИТЬ ИЗМЕНЕНИЯ ПИСЬМЕННЫХ ДАННЫХ'}</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredDiffs.map((diff) => {
                    const timeStr = new Date(diff.timestamp).toLocaleTimeString('ru-RU');
                    const dateStr = new Date(diff.timestamp).toLocaleDateString('ru-RU');

                    return (
                      <div
                        key={diff.id}
                        className="border border-[var(--crt-phosphor-dim)] bg-[#050e06] rounded-lg p-3.5 space-y-2.5 transition-all"
                      >
                        {/* Diff Item Header */}
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--crt-phosphor-dim)]/40 pb-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-500 font-bold uppercase">
                              {diff.changeType || 'MODIFIED'}
                            </span>
                            <span className="font-extrabold text-xs text-[var(--crt-phosphor-bright)]">
                              {diff.section}
                            </span>
                          </div>
                          <div className="text-[10px] opacity-75 flex items-center gap-1.5">
                            <Clock size={11} />
                            <span>{timeStr} · {dateStr}</span>
                          </div>
                        </div>

                        {/* Change Summary */}
                        <div className="text-xs font-semibold text-[var(--crt-phosphor-bright)] flex items-start gap-1.5">
                          <ArrowRight size={13} className="text-amber-400 shrink-0 mt-0.5" />
                          <span>{diff.summary}</span>
                        </div>

                        {/* Diff Comparison Presentation */}
                        {diffViewMode === 'sideBySide' ? (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs font-mono">
                            {/* Before */}
                            <div className="bg-red-950/20 border border-red-500/40 rounded p-2.5 space-y-1">
                              <div className="text-[10px] font-bold text-red-400 uppercase tracking-wider flex items-center gap-1">
                                <span>[− БЫЛО / ПРЕЖНИЙ ТЕКСТ]:</span>
                              </div>
                              <p className="text-red-200/90 leading-relaxed font-sans text-[11px] line-through decoration-red-400/60">
                                {diff.previousText || 'Предыдущая версия отсутствовала.'}
                              </p>
                            </div>

                            {/* After */}
                            <div className="bg-emerald-950/30 border border-emerald-500/50 rounded p-2.5 space-y-1">
                              <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                                <span>[+ СТАЛО / НОВЫЙ ТЕКСТ]:</span>
                              </div>
                              <p className="text-emerald-100 font-sans text-[11px] leading-relaxed font-semibold">
                                {diff.newText}
                              </p>
                            </div>
                          </div>
                        ) : (
                          /* Unified Diff View */
                          <div className="bg-black/80 border border-zinc-800 rounded p-3 font-mono text-xs space-y-1.5">
                            {diff.previousText && (
                              <div className="text-red-400 bg-red-950/30 px-2 py-1 rounded flex items-start gap-2">
                                <span className="font-bold select-none shrink-0">−</span>
                                <span className="line-through">{diff.previousText}</span>
                              </div>
                            )}
                            <div className="text-emerald-300 bg-emerald-950/40 px-2 py-1 rounded flex items-start gap-2 font-semibold">
                              <span className="font-bold select-none shrink-0">+</span>
                              <span>{diff.newText}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

            </div>
          )}

          {/* TAB 3: ACADEMIC DIGEST & EXPORT */}
          {activeTab === 'digest' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="bg-[#0b170e] border border-[var(--crt-phosphor-dim)] rounded-lg p-3.5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="font-bold text-xs sm:text-sm text-[var(--crt-phosphor-bright)] uppercase tracking-wider">
                    ПИСЬМЕННЫЙ ДАЙДЖЕСТ ДЛЯ СТУДЕНТА (MARKDOWN)
                  </h4>
                  <p className="text-[11px] opacity-75">
                    Сводный структурированный конспект содержания и всех зафиксированных изменений для курсовой или конспекта
                  </p>
                </div>
                <button
                  onClick={handleCopyDigest}
                  className="px-4 py-2 bg-[var(--crt-phosphor)] text-black font-extrabold text-xs uppercase rounded hover:bg-[var(--crt-phosphor-bright)] transition-colors flex items-center gap-1.5 cursor-pointer shadow-md"
                >
                  {copiedDigest ? (
                    <>
                      <Check size={14} className="text-black" />
                      <span>СКОПИРОВАНО В БУФЕР!</span>
                    </>
                  ) : (
                    <>
                      <Copy size={14} />
                      <span>СКОПИРОВАТЬ ДАЙДЖЕСТ</span>
                    </>
                  )}
                </button>
              </div>

              <div className="bg-black/90 border border-[var(--crt-phosphor-dim)] rounded-lg p-4 font-mono text-xs text-[var(--crt-phosphor-bright)] max-h-96 overflow-y-auto whitespace-pre-wrap leading-relaxed selection:bg-[var(--crt-phosphor)] selection:text-black">
                {generateMarkdownDigest()}
              </div>
            </div>
          )}

        </div>

        {/* Modal Bottom Footer */}
        <div className="border-t border-[var(--crt-phosphor-dim)]/60 bg-[#071309] px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs shrink-0">
          <div className="flex items-center gap-2 opacity-75 text-[11px]">
            <ShieldCheck size={13} className="text-emerald-400" />
            <span>Интеллектуальный контроль содержания Pip-Boy 3000 • Мониторинг активен</span>
          </div>

          <button
            onClick={() => {
              pipAudio.playClick();
              onClose();
            }}
            className="px-4 py-1 border border-[var(--crt-phosphor-dim)] hover:border-[var(--crt-phosphor)] text-[var(--crt-phosphor)] text-xs rounded cursor-pointer transition-colors"
          >
            ЗАКРЫТЬ
          </button>
        </div>

      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : null;
};
