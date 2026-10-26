import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { MonitoredLink, SiteQAMessage, AIDataMode } from '../types/pipboy';
import { pipAudio } from '../utils/audio';
import { useModalScrollLock } from '../utils/useModalScrollLock';
import {
  collectAppInternalDataSnapshot,
  getStoredAIDataMode,
  setStoredAIDataMode,
  subscribeToAIDataMode
} from '../utils/appDataContext';
import { AIModeSwitch } from './AIModeSwitch';
import {
  Bot,
  Send,
  X,
  CheckSquare,
  Square,
  Sparkles,
  Layers,
  Copy,
  Check,
  RotateCcw,
  ExternalLink,
  Cpu,
  Save,
  FileText,
  Lock,
  Globe,
  Database
} from 'lucide-react';

interface SiteAIConsultantModalProps {
  links: MonitoredLink[];
  initialSelectedLinkId?: string | null;
  onClose: () => void;
}

const STORAGE_KEYS = {
  CHAT_MESSAGES: 'pipboy_ai_consultant_messages_v2',
  SELECTED_LINKS: 'pipboy_ai_consultant_selected_links_v2'
};

const INITIAL_WELCOME_MESSAGE: SiteQAMessage = {
  id: 'welcome-msg',
  sender: 'assistant',
  aiMode: 'local',
  text: `Здравствуйте! Я — встроенный ИИ-аналитик терминала Pip-Boy 3000.\n\nДоступны **два режима работы нейросети** (переключатель сверху):\n• **Режим 1 (Только сайты и приложение):** я опираюсь *исключительно* на прикреплённые вами сайты (их письменное содержание и Diff-изменения), ваше расписание (верхняя/нижняя недели), таблицу оценок БРС и профиль студента. Сторонняя информация из Интернета полностью отключена.\n• **Режим 2 (+ Данные из Интернета):** я использую как данные приложения и ваших сайтов, так и живой поиск в Интернете (Google Search) и внешние академические базы.\n\nВся история переписки автоматически сохраняется в памяти терминала даже после закрытия окна.`,
  timestamp: Date.now()
};

const QUICK_PROMPTS = [
  'Сделай развернутую выжимку письменного содержания прикреплённых сайтов',
  'Проанализируй последние зафиксированные изменения (Diff) на сайтах',
  'Какие пары у меня в расписании по верхней и нижней неделям?',
  'Проанализируй мои текущие оценки БРС и сопоставь их с расписанием',
  'Сравни прикреплённые сайты: где лучше искать материалы для курсовой?'
];

export const SiteAIConsultantModal: React.FC<SiteAIConsultantModalProps> = ({
  links,
  initialSelectedLinkId,
  onClose
}) => {
  useModalScrollLock(true);

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

  // Persistent Chat History: load from localStorage on init
  const [messages, setMessages] = useState<SiteQAMessage[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.CHAT_MESSAGES);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (err) {
      console.warn('Failed to load saved AI chat history:', err);
    }
    return [INITIAL_WELCOME_MESSAGE];
  });

  // Preselect either the specific link or all links (with localStorage memory)
  const [selectedLinkIds, setSelectedLinkIds] = useState<string[]>(() => {
    if (initialSelectedLinkId) {
      return [initialSelectedLinkId];
    }
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SELECTED_LINKS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const valid = parsed.filter((id) => links.some((l) => l.id === id));
          if (valid.length > 0) return valid;
        }
      }
    } catch {}
    return links.map((l) => l.id);
  });

  const [question, setQuestion] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isCopiedAll, setIsCopiedAll] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Snapshot of internal app data (profile, schedule, grades)
  const appDataSnapshot = collectAppInternalDataSnapshot(links);

  // Automatically save chat history to localStorage whenever messages change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.CHAT_MESSAGES, JSON.stringify(messages));
    } catch (err) {
      console.error('Failed to persist AI chat messages:', err);
    }
  }, [messages]);

  // Persist selected link filters
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.SELECTED_LINKS, JSON.stringify(selectedLinkIds));
    } catch {}
  }, [selectedLinkIds]);

  useEffect(() => {
    if (initialSelectedLinkId && !selectedLinkIds.includes(initialSelectedLinkId)) {
      setSelectedLinkIds((prev) => [...prev, initialSelectedLinkId]);
    }
  }, [initialSelectedLinkId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const toggleLinkSelection = (id: string) => {
    pipAudio.playClick();
    setSelectedLinkIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    pipAudio.playClick();
    if (selectedLinkIds.length === links.length) {
      setSelectedLinkIds([]);
    } else {
      setSelectedLinkIds(links.map((l) => l.id));
    }
  };

  const selectedLinks = links.filter((l) => selectedLinkIds.includes(l.id));

  const handleAsk = async (promptText?: string, overrideMode?: AIDataMode) => {
    const textToSend = (promptText || question).trim();
    if (!textToSend || isLoading) return;

    const effectiveMode: AIDataMode = overrideMode || aiMode;
    if (overrideMode && overrideMode !== aiMode) {
      handleModeChange(overrideMode);
    }

    pipAudio.playClick();

    const userMsg: SiteQAMessage = {
      id: 'user-' + Date.now(),
      sender: 'user',
      text: textToSend,
      timestamp: Date.now(),
      aiMode: effectiveMode,
      siteIds: selectedLinkIds,
      siteTitles: selectedLinks.map((l) => l.title)
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!promptText) {
      setQuestion('');
    }
    setIsLoading(true);

    const latestAppSnapshot = collectAppInternalDataSnapshot(links);

    try {
      const response = await fetch('/api/ai/site-qa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: textToSend,
          aiMode: effectiveMode,
          appData: latestAppSnapshot,
          history: messages
            .filter((m) => m.id !== 'welcome-msg' && !m.id.startsWith('welcome-reset'))
            .slice(-8)
            .map((m) => ({
              sender: m.sender,
              text: m.text
            })),
          selectedSites: selectedLinks.map((l) => ({
            id: l.id,
            title: l.title,
            url: l.url,
            category: l.category,
            tags: l.tags,
            status: l.status,
            lastChecked: l.lastChecked,
            contentSnippet: l.contentSnippet,
            writtenContent: l.writtenContent,
            telemetry: l.telemetry,
            isScientific: l.isScientific,
            scientificMeta: l.scientificMeta,
            diffHistory: l.diffHistory
          }))
        })
      });

      if (!response.ok) {
        throw new Error(`Ошибка сервера: ${response.status}`);
      }

      const data = await response.json();
      pipAudio.playSuccess();

      const aiMsg: SiteQAMessage = {
        id: 'ai-' + Date.now(),
        sender: 'assistant',
        text: data.answer || 'Ответ сформирован.',
        timestamp: Date.now(),
        aiMode: data.aiMode || effectiveMode,
        suggestSwitchToWeb: Boolean(data.suggestSwitchToWeb),
        originalQuestion: textToSend,
        webSources: Array.isArray(data.webSources) ? data.webSources : [],
        siteIds: selectedLinkIds,
        siteTitles: selectedLinks.map((l) => l.title)
      };

      setMessages((prev) => [...prev, aiMsg]);
    } catch (err: any) {
      console.error('Error asking AI:', err);
      pipAudio.playGeiger(2);

      const fallbackMsg: SiteQAMessage = {
        id: 'ai-err-' + Date.now(),
        sender: 'assistant',
        aiMode: effectiveMode,
        text:
          effectiveMode === 'local'
            ? `### Отчёт локального контура по запросу: «${textToSend}»\n\n**Анализируемые ресурсы:** ${
                selectedLinks.length > 0 ? selectedLinks.map((l) => `«${l.title}»`).join(', ') : 'Только внутренние данные приложения'
              }\n**Данные приложения:** Расписание (${latestAppSnapshot.schedule.length} пар), Оценки (${
                latestAppSnapshot.grades.length
              } дисциплин).\n\n- **Письменное содержание:** Все выбранные ресурсы и внутренние таблицы проверены автономным модулем терминала.`
            : `### Аналитическая сводка (Режим 2: + Интернет) по запросу: «${textToSend}»\n\n**Анализируемые ресурсы:** ${
                selectedLinks.length > 0 ? selectedLinks.map((l) => `«${l.title}»`).join(', ') : 'Внутренние данные и глобальный поиск'
              }\n\nОтвет сформирован резервным модулем терминала.`,
        timestamp: Date.now(),
        siteIds: selectedLinkIds,
        siteTitles: selectedLinks.map((l) => l.title)
      };

      setMessages((prev) => [...prev, fallbackMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyText = (msgId: string, text: string) => {
    pipAudio.playClick();
    navigator.clipboard?.writeText(text);
    setCopiedId(msgId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCopyAllChat = () => {
    pipAudio.playClick();
    const formatted = messages
      .filter((m) => m.id !== 'welcome-msg')
      .map((m) => {
        const time = new Date(m.timestamp).toLocaleString('ru-RU');
        const sender = m.sender === 'user' ? 'Студент' : 'ИИ-Аналитик Pip-Boy';
        const modeTag = m.aiMode === 'web' ? ' [Режим 2: + Интернет]' : ' [Режим 1: Локально]';
        const sites = m.siteTitles && m.siteTitles.length > 0 ? ` [Сайты: ${m.siteTitles.join(', ')}]` : '';
        return `=== ${sender} (${time})${modeTag}${sites} ===\n${m.text}\n`;
      })
      .join('\n');

    if (!formatted.trim()) {
      navigator.clipboard?.writeText(INITIAL_WELCOME_MESSAGE.text);
    } else {
      navigator.clipboard?.writeText(formatted);
    }
    setIsCopiedAll(true);
    setTimeout(() => setIsCopiedAll(false), 2200);
  };

  const handleClearChat = () => {
    pipAudio.playClick();
    const resetMsg: SiteQAMessage = {
      id: 'welcome-reset-' + Date.now(),
      sender: 'assistant',
      aiMode,
      text: 'История диалога очищена. Выберите режим работы (Локальный контур или + Интернет), отметьте нужные сайты и задайте вопрос.',
      timestamp: Date.now()
    };
    setMessages([resetMsg]);
    setShowClearConfirm(false);
    try {
      localStorage.setItem(STORAGE_KEYS.CHAT_MESSAGES, JSON.stringify([resetMsg]));
    } catch {}
  };

  const modalContent = (
    <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-black border-2 border-[var(--crt-phosphor)] rounded-lg w-full max-w-4xl max-h-[94vh] flex flex-col shadow-[0_0_35px_rgba(var(--crt-phosphor-rgb),0.3)] text-[var(--crt-phosphor)] font-mono overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="border-b border-[var(--crt-phosphor-dim)] bg-zinc-950 p-3 sm:p-4 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 border border-amber-400 bg-amber-950 text-amber-300 rounded shadow-[0_0_10px_rgba(251,191,36,0.3)]">
              <Bot size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-sm sm:text-base tracking-wider text-amber-300">
                  ИИ-АНАЛИТИК ТЕРМИНАЛА PIP-BOY
                </h3>
                <span
                  className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-emerald-950/70 text-emerald-300 border border-emerald-500/50"
                  title="Все сообщения автоматически сохраняются в localStorage и не пропадут при закрытии окна"
                >
                  <Save size={10} className="text-emerald-400" />
                  <span>ИСТОРИЯ СОХРАНЕНА ({messages.length})</span>
                </span>
              </div>
              <p className="text-xs opacity-75">
                Анализ прикреплённых сайтов, расписания, оценок и научных источников
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              onClick={handleCopyAllChat}
              className="p-1.5 border border-zinc-700 hover:border-amber-400 rounded text-xs opacity-80 hover:opacity-100 flex items-center gap-1 cursor-pointer bg-black text-amber-300 transition-colors"
              title="Скопировать весь диалог для конспекта или курсовой"
            >
              {isCopiedAll ? (
                <>
                  <Check size={13} className="text-emerald-400" />
                  <span className="hidden md:inline text-emerald-400 font-bold">Скопировано!</span>
                </>
              ) : (
                <>
                  <FileText size={13} />
                  <span className="hidden md:inline">Весь чат</span>
                </>
              )}
            </button>

            {showClearConfirm ? (
              <div className="flex items-center gap-1 bg-red-950/80 border border-red-500 rounded p-1 animate-in fade-in">
                <span className="text-[10px] text-red-300 px-1">Очистить?</span>
                <button
                  onClick={handleClearChat}
                  className="px-1.5 py-0.5 bg-red-600 hover:bg-red-500 text-white rounded text-[10px] font-bold cursor-pointer"
                >
                  Да
                </button>
                <button
                  onClick={() => setShowClearConfirm(false)}
                  className="px-1.5 py-0.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-[10px] cursor-pointer"
                >
                  Нет
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  pipAudio.playClick();
                  if (messages.length > 1) {
                    setShowClearConfirm(true);
                  } else {
                    handleClearChat();
                  }
                }}
                className="p-1.5 border border-zinc-700 hover:border-red-400 rounded text-xs opacity-70 hover:opacity-100 flex items-center gap-1 cursor-pointer bg-black text-zinc-300 hover:text-red-300 transition-colors"
                title="Очистить переписку и сбросить память"
              >
                <RotateCcw size={13} />
                <span className="hidden sm:inline">Очистить</span>
              </button>
            )}

            <button
              onClick={() => {
                pipAudio.playClick();
                onClose();
              }}
              className="p-1.5 border border-zinc-700 hover:border-[var(--crt-phosphor)] rounded text-[var(--crt-phosphor)] bg-black hover:bg-zinc-900 transition-colors cursor-pointer"
              title="Закрыть окно (диалог сохранится автоматически)"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Mode Switcher & Internal App Data Context Bar */}
        <div className="bg-zinc-950 border-b border-[var(--crt-phosphor-dim)] p-2.5 sm:p-3 space-y-2.5 shrink-0">
          <AIModeSwitch mode={aiMode} onChange={handleModeChange} showDescription={true} />

          {/* Summary of Internal App Data + Multi-Site Selector */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] pt-1 border-t border-zinc-800">
            <div className="flex flex-wrap items-center gap-2 text-[var(--crt-phosphor)]/90">
              <span className="flex items-center gap-1 font-bold text-[var(--crt-phosphor-bright)]">
                <Database size={12} />
                <span>Данные приложения в контуре:</span>
              </span>
              <span>Сайты ({selectedLinkIds.length}/{links.length})</span>
              <span>·</span>
              <span>Расписание ({appDataSnapshot.schedule.length} пар)</span>
              <span>·</span>
              <span>Оценки ({appDataSnapshot.grades.length} предм.)</span>
              <span>·</span>
              <span>Профиль ({appDataSnapshot.profile?.fullName ? appDataSnapshot.profile.fullName : 'активен'})</span>
            </div>

            {links.length > 0 && (
              <button
                onClick={handleSelectAll}
                className="text-[11px] underline opacity-80 hover:opacity-100 cursor-pointer"
              >
                {selectedLinkIds.length === links.length ? 'Снять выбор сайтов' : 'Выбрать все сайты'}
              </button>
            )}
          </div>

          {/* Links checklist chips */}
          <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto pr-1">
            {links.length === 0 ? (
              <span className="text-xs opacity-70">
                Прикреплённых сайтов пока нет — ИИ отвечает по вашему расписанию, оценкам и профилю{aiMode === 'web' ? ' + данным из Интернета' : ''}.
              </span>
            ) : (
              links.map((link) => {
                const isSelected = selectedLinkIds.includes(link.id);
                return (
                  <button
                    key={link.id}
                    onClick={() => toggleLinkSelection(link.id)}
                    className={`px-2.5 py-1 text-xs rounded border transition-colors flex items-center gap-1.5 cursor-pointer font-mono ${
                      isSelected
                        ? 'border-amber-400 bg-amber-950/50 text-amber-200 font-bold'
                        : 'border-zinc-800 bg-black/60 text-zinc-400 hover:border-zinc-600'
                    }`}
                  >
                    {isSelected ? (
                      <CheckSquare size={13} className="text-amber-400 shrink-0" />
                    ) : (
                      <Square size={13} className="opacity-50 shrink-0" />
                    )}
                    <span className="truncate max-w-[150px] sm:max-w-[200px]">{link.title}</span>
                    <span className="text-[10px] opacity-60">({link.category})</span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Chat Messages Log */}
        <div className="flex-1 p-3 sm:p-4 overflow-y-auto space-y-3.5 bg-black">
          {messages.map((msg) => {
            const isUser = msg.sender === 'user';
            const msgMode = msg.aiMode || 'local';
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} space-y-1`}
              >
                {/* Meta header */}
                <div className="flex flex-wrap items-center gap-2 text-[10px] opacity-75 px-1">
                  <span className="font-bold">{isUser ? 'ВЫ (СТУДЕНТ)' : 'НЕЙРОСЕТЬ PIP-BOY'}</span>
                  <span>·</span>
                  <span className="tabular-nums">{new Date(msg.timestamp).toLocaleTimeString('ru-RU')}</span>
                  <span>·</span>
                  {msgMode === 'local' ? (
                    <span className="inline-flex items-center gap-1 text-[var(--crt-phosphor-bright)]">
                      <Lock size={10} />
                      <span>Режим 1: Локальный контур</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-amber-300">
                      <Globe size={10} />
                      <span>Режим 2: + Интернет</span>
                    </span>
                  )}
                  {msg.siteTitles && msg.siteTitles.length > 0 && (
                    <span className="text-amber-400/80">
                      · Сайты: {msg.siteTitles.slice(0, 2).join(', ')}
                      {msg.siteTitles.length > 2 ? ` (+${msg.siteTitles.length - 2})` : ''}
                    </span>
                  )}
                </div>

                {/* Bubble */}
                <div
                  className={`p-3 sm:p-4 rounded-lg max-w-[92%] sm:max-w-[85%] text-xs sm:text-sm leading-relaxed border relative group ${
                    isUser
                      ? 'bg-zinc-900 border-[var(--crt-phosphor)] text-[var(--crt-phosphor-bright)] rounded-tr-none'
                      : msgMode === 'web'
                      ? 'bg-zinc-950 border-amber-400/70 text-amber-100 rounded-tl-none'
                      : 'bg-zinc-950 border-[var(--crt-phosphor-dim)] text-[var(--crt-phosphor-bright)] rounded-tl-none'
                  }`}
                >
                  <div className="whitespace-pre-wrap font-sans sm:font-mono">
                    {msg.text}
                  </div>

                  {/* Button to switch to Mode 2 if Mode 1 found no local data */}
                  {!isUser && msg.suggestSwitchToWeb && msg.originalQuestion && (
                    <div className="mt-3 pt-2.5 border-t border-amber-500/40 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[11px] text-amber-300">
                        В локальных данных терминала этих сведений нет. Использовать поиск в Интернете?
                      </span>
                      <button
                        type="button"
                        disabled={isLoading}
                        onClick={() => handleAsk(msg.originalQuestion, 'web')}
                        className="px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-black font-bold text-xs rounded flex items-center gap-1.5 cursor-pointer transition-colors"
                      >
                        <Globe size={13} />
                        <span>Включить Режим 2 (+ Интернет) и повторить</span>
                      </button>
                    </div>
                  )}

                  {/* Grounding Web Sources when in Mode 2 */}
                  {!isUser && msg.webSources && msg.webSources.length > 0 && (
                    <div className="mt-3 pt-2.5 border-t border-zinc-800 space-y-1.5">
                      <div className="text-[10px] uppercase tracking-wider text-amber-300 font-bold flex items-center gap-1">
                        <Globe size={11} />
                        <span>Источники из Интернета (Google Search):</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {msg.webSources.map((src, sIdx) => (
                          <a
                            key={sIdx}
                            href={src.uri}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-black border border-amber-500/40 text-amber-200 hover:border-amber-400 transition-colors"
                          >
                            <ExternalLink size={10} />
                            <span className="truncate max-w-[220px]">{src.title}</span>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Copy button */}
                  {!isUser && (
                    <button
                      onClick={() => handleCopyText(msg.id, msg.text)}
                      className="absolute top-2 right-2 p-1 rounded bg-black border border-zinc-700 opacity-0 group-hover:opacity-100 hover:border-amber-400 transition-opacity text-amber-300 cursor-pointer"
                      title="Скопировать ответ"
                    >
                      {copiedId === msg.id ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {isLoading && (
            <div className="flex flex-col items-start space-y-1">
              <div className="text-[10px] opacity-70 px-1 flex items-center gap-1.5">
                <Cpu size={11} className="animate-spin text-amber-400" />
                <span>
                  {aiMode === 'local'
                    ? 'ИИ АНАЛИЗИРУЕТ ТОЛЬКО САЙТЫ И ДАННЫЕ ПРИЛОЖЕНИЯ (РЕЖИМ 1)...'
                    : 'ИИ ИЩЕТ В ПРИЛОЖЕНИИ И В ИНТЕРНЕТЕ (РЕЖИМ 2)...'}
                </span>
              </div>
              <div className="p-3 rounded-lg bg-zinc-950 border border-amber-500/50 text-amber-300 text-xs flex items-center gap-2">
                <span>
                  {aiMode === 'local'
                    ? 'Сверка с прикреплёнными сайтами, расписанием, оценками и профилем...'
                    : 'Запрос к локальным данным и глобальному веб-поиску...'}
                </span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick Prompts Chips */}
        <div className="bg-zinc-950 border-t border-[var(--crt-phosphor-dim)] px-3 py-2 overflow-x-auto shrink-0 flex items-center gap-1.5">
          <span className="text-[10px] opacity-60 font-bold shrink-0 flex items-center gap-1">
            <Sparkles size={11} className="text-amber-400" /> БЫСТРЫЕ ВОПРОСЫ:
          </span>
          {QUICK_PROMPTS.map((prompt, idx) => (
            <button
              key={idx}
              onClick={() => handleAsk(prompt)}
              disabled={isLoading}
              className="text-[11px] px-2.5 py-1 rounded border border-[var(--crt-phosphor-dim)]/50 hover:border-amber-400 bg-black hover:bg-zinc-900 text-[var(--crt-phosphor)] hover:text-amber-300 transition-colors whitespace-nowrap cursor-pointer shrink-0 disabled:opacity-50"
            >
              {prompt}
            </button>
          ))}
        </div>

        {/* Input Bar */}
        <div className="p-3 bg-zinc-950 border-t border-[var(--crt-phosphor-dim)] shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAsk();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={
                aiMode === 'local'
                  ? `Режим 1 (Локально): спросите по сайтам (${selectedLinkIds.length}), расписанию, оценкам или профилю...`
                  : `Режим 2 (+ Интернет): спросите что угодно по сайтам, учебе или внешним источникам...`
              }
              disabled={isLoading}
              className="flex-1 bg-black border border-[var(--crt-phosphor)] px-3.5 py-2 text-xs sm:text-sm text-[var(--crt-phosphor)] outline-none rounded font-mono placeholder:text-zinc-600 focus:border-amber-400 focus:ring-1 focus:ring-amber-400 disabled:opacity-50"
            />

            <button
              type="submit"
              disabled={isLoading || !question.trim()}
              className="px-4 py-2 bg-amber-400 text-black hover:bg-amber-300 font-bold text-xs sm:text-sm rounded transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              <Send size={14} />
              <span>СПРОСИТЬ</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(modalContent, document.body)
    : modalContent;
};
