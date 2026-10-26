import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { MonitoredLink, CustomCategory, DiffEntry, SiteWrittenContent } from '../types/pipboy';
import { pipAudio } from '../utils/audio';
import { useModalScrollLock } from '../utils/useModalScrollLock';
import { generateInitialWrittenContent } from '../utils/siteChecker';
import { SiteTelemetryModal } from './SiteTelemetryModal';
import { SiteAIConsultantModal } from './SiteAIConsultantModal';
import { SiteUpdateSparkline } from './SiteUpdateSparkline';
import {
  Globe,
  RefreshCw,
  Plus,
  ExternalLink,
  Bell,
  BellOff,
  History,
  Trash2,
  Clock,
  Radio,
  FileCode,
  Zap,
  Search,
  Tag,
  FolderPlus,
  FolderEdit,
  X,
  Edit2,
  Check,
  Bot,
  FileText,
  Sparkles,
  List,
  Columns,
  AlignLeft,
  CheckCircle2,
  ArrowRight,
  BookOpen,
  FolderTree,
  ShieldCheck,
  ScanLine
} from 'lucide-react';

interface TabMonitorProps {
  links: MonitoredLink[];
  categories: CustomCategory[];
  isScanningAll: boolean;
  onScanAll: () => void;
  onScanSingle: (id: string) => Promise<{ hasChanged: boolean; message: string } | undefined> | void;
  onAddLink: (newLink: Omit<MonitoredLink, 'id' | 'lastChecked' | 'lastUpdated' | 'status' | 'currentHash' | 'diffHistory'>) => void;
  onDeleteLink: (id: string) => void;
  onToggleNotification: (id: string) => void;
  onUpdateLinkTags: (id: string, tags: string[]) => void;
  onUpdateLinkCategory: (id: string, category: string) => void;
  onUpdateLinkInterval?: (id: string, intervalSec: number) => void;
  onAddCategory: (category: CustomCategory) => void;
  onRenameCategory: (id: string, newName: string) => void;
  onDeleteCategory: (id: string) => void;
}

export const TabMonitor: React.FC<TabMonitorProps> = ({
  links,
  categories,
  isScanningAll,
  onScanAll,
  onScanSingle,
  onAddLink,
  onDeleteLink,
  onToggleNotification,
  onUpdateLinkTags,
  onUpdateLinkCategory,
  onUpdateLinkInterval,
  onAddCategory,
  onRenameCategory,
  onDeleteCategory
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  useModalScrollLock(isAddModalOpen || isCategoryModalOpen);

  const [expandedDiffId, setExpandedDiffId] = useState<string | null>(null);
  const [editingTagsLinkId, setEditingTagsLinkId] = useState<string | null>(null);
  const [tagsInputVal, setTagsInputVal] = useState('');

  // Interactive Written Data Check state per site
  const [pressedCheckId, setPressedCheckId] = useState<string | null>(null);
  const [siteCheckReports, setSiteCheckReports] = useState<
    Record<
      string,
      {
        checking: boolean;
        message: string;
        hasChanged: boolean;
        timestamp: number;
      }
    >
  >({});

  const handleInteractiveWrittenCheck = async (linkId: string) => {
    pipAudio.playGeiger(3);
    setSiteCheckReports((prev) => ({
      ...prev,
      [linkId]: {
        checking: true,
        message: 'Запрос реального HTML-кода сайта и сверка письменных данных с базовым снимком...',
        hasChanged: false,
        timestamp: Date.now()
      }
    }));

    const res = await onScanSingle(linkId);

    setSiteCheckReports((prev) => ({
      ...prev,
      [linkId]: {
        checking: false,
        message:
          res?.message ||
          'Проверка завершена: письменных изменений на сайте не обнаружено. Текст совпадает с предыдущим снимком.',
        hasChanged: Boolean(res?.hasChanged),
        timestamp: Date.now()
      }
    }));
  };

  // Inspector & AI Consultant States
  const [inspectingLinkId, setInspectingLinkId] = useState<string | null>(null);
  const [isAIConsultantOpen, setIsAIConsultantOpen] = useState(false);
  const [aiConsultantInitialLinkId, setAiConsultantInitialLinkId] = useState<string | null>(null);

  // View Mode: Cards (detailed written cards) vs diffFeed (chronological dynamic changes feed across all sites)
  const [monitorViewMode, setMonitorViewMode] = useState<'cards' | 'diffFeed'>('cards');

  // Form states for new link
  const [newTitle, setNewTitle] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newCategory, setNewCategory] = useState(categories[0]?.id || 'GENERAL');
  const [newTagsStr, setNewTagsStr] = useState('');
  const [newInterval, setNewInterval] = useState(60);
  const [isCustomInterval, setIsCustomInterval] = useState(false);
  const [customIntervalVal, setCustomIntervalVal] = useState(45);
  const [newNotify, setNewNotify] = useState(true);

  // Quick inline new category inside Add Link modal
  const [isAddingInlineCat, setIsAddingInlineCat] = useState(false);
  const [inlineCatName, setInlineCatName] = useState('');

  // Form state for category management
  const [newCatName, setNewCatName] = useState('');
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editingCatName, setEditingCatName] = useState('');

  // Compute all unique tags from links
  const allUniqueTags = useMemo(() => {
    const set = new Set<string>();
    links.forEach((l) => (l.tags || []).forEach((t) => set.add(t.toLowerCase().trim())));
    return Array.from(set).filter(Boolean);
  }, [links]);

  // Fast filtering by Category + Search Query + Selected Tag
  const filteredLinks = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    return links.filter((link) => {
      // 1. Category filter
      if (selectedCategory !== 'ALL' && link.category !== selectedCategory) {
        return false;
      }

      // 2. Tag filter chip
      if (selectedTag) {
        const hasTag = (link.tags || []).some((t) => t.toLowerCase().trim() === selectedTag.toLowerCase().trim());
        if (!hasTag) return false;
      }

      // 3. Search query matching: title, url, tags, content snippet, category, written overview
      if (q) {
        const matchesTitle = link.title.toLowerCase().includes(q);
        const matchesUrl = link.url.toLowerCase().includes(q);
        const matchesSnippet = (link.contentSnippet || '').toLowerCase().includes(q);
        const matchesCategory = link.category.toLowerCase().includes(q);
        const matchesTags = (link.tags || []).some((t) => t.toLowerCase().includes(q));
        const matchesOverview = (link.writtenContent?.overview || '').toLowerCase().includes(q);

        if (!matchesTitle && !matchesUrl && !matchesSnippet && !matchesCategory && !matchesTags && !matchesOverview) {
          return false;
        }
      }

      return true;
    });
  }, [links, selectedCategory, selectedTag, searchQuery]);

  // All diffs flattened across all monitored links, sorted by newest
  const allDiffsAcrossLinks = useMemo(() => {
    const result: { link: MonitoredLink; diff: DiffEntry }[] = [];
    links.forEach((l) => {
      (l.diffHistory || []).forEach((d) => {
        result.push({ link: l, diff: d });
      });
    });
    return result.sort((a, b) => b.diff.timestamp - a.diff.timestamp);
  }, [links]);

  // Total words tracked across links
  const totalTrackedWords = useMemo(() => {
    return links.reduce((sum, l) => {
      const cnt = l.writtenContent?.wordCount || 0;
      return sum + cnt;
    }, 0);
  }, [links]);

  const handleCreateInlineCategory = () => {
    const trimmed = inlineCatName.trim();
    if (!trimmed) return;
    pipAudio.playSuccess();
    const newId = 'CAT_' + Date.now();
    onAddCategory({
      id: newId,
      name: trimmed.toUpperCase(),
      isDefault: false
    });
    setNewCategory(newId);
    setInlineCatName('');
    setIsAddingInlineCat(false);
  };

  const handleSubmitNew = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newUrl.trim()) return;

    const cleanUrl = newUrl.trim().startsWith('http') ? newUrl.trim() : `https://${newUrl.trim()}`;

    const parsedTags = newTagsStr
      .split(/[,\s]+/)
      .map((t) => t.replace(/^#/, '').trim())
      .filter(Boolean);

    const effectiveInterval = isCustomInterval
      ? Math.max(10, Math.min(86400, Number(customIntervalVal) || 60))
      : Number(newInterval) || 60;

    const initialWritten = generateInitialWrittenContent(cleanUrl, newTitle.trim(), newCategory);

    onAddLink({
      title: newTitle.trim(),
      url: cleanUrl,
      category: newCategory,
      tags: parsedTags.length > 0 ? parsedTags : ['учёба'],
      checkIntervalSec: effectiveInterval,
      contentSnippet: `Содержание сайта подключено к отслеживанию (${initialWritten.detectedSections.length} разделов)`,
      writtenContent: initialWritten,
      autoRefresh: true,
      notificationEnabled: newNotify
    });

    setNewTitle('');
    setNewUrl('');
    setNewTagsStr('');
    setIsAddModalOpen(false);
  };

  const handleSaveInlineTags = (linkId: string) => {
    pipAudio.playClick();
    const updated = tagsInputVal
      .split(/[,\s]+/)
      .map((t) => t.replace(/^#/, '').trim())
      .filter(Boolean);
    onUpdateLinkTags(linkId, updated);
    setEditingTagsLinkId(null);
  };

  const handleCreateCategory = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newCatName.trim();
    if (!name) return;
    pipAudio.playSuccess();
    const id = 'CAT_' + Date.now();
    onAddCategory({
      id,
      name: name.toUpperCase(),
      isDefault: false
    });
    setNewCatName('');
  };

  const handleSaveRenameCategory = (id: string) => {
    if (!editingCatName.trim()) return;
    pipAudio.playClick();
    onRenameCategory(id, editingCatName.trim().toUpperCase());
    setEditingCatId(null);
  };

  const formatTimeAgo = (ts: number) => {
    if (!ts) return 'Никогда';
    const sec = Math.floor((Date.now() - ts) / 1000);
    if (sec < 5) return 'Только что';
    if (sec < 60) return `${sec} сек. назад`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min} мин. назад`;
    const hours = Math.floor(min / 60);
    return `${hours} ч. назад`;
  };

  return (
    <div className="space-y-4">
      {/* Search & Action Bar */}
      <div className="border border-[var(--crt-phosphor-dim)] bg-[#071309] p-3 rounded-lg space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Fast Search input */}
          <div className="relative flex-1 min-w-[220px]">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск по названию, содержанию, URL или #тегу..."
              className="w-full bg-black/90 border border-[var(--crt-phosphor)] px-3 py-1.5 text-xs text-[var(--crt-phosphor)] outline-none rounded pl-8 font-mono placeholder:text-[var(--crt-phosphor-dim)]/70"
            />
            <Search size={14} className="absolute left-2.5 top-2 opacity-60 text-[var(--crt-phosphor)]" />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-2 text-[var(--crt-phosphor)] hover:opacity-100 opacity-60 cursor-pointer"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {/* AI Consultant Button */}
            <button
              onClick={() => {
                pipAudio.playSuccess();
                setAiConsultantInitialLinkId(null);
                setIsAIConsultantOpen(true);
              }}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-amber-400 bg-amber-950/50 text-amber-300 hover:bg-amber-400 hover:text-black transition-colors rounded cursor-pointer font-bold shadow-[0_0_10px_rgba(251,191,36,0.25)]"
              title="Задать любой вопрос нейросети по письменному содержанию сайтов"
            >
              <Bot size={14} className="text-amber-400" />
              <span>ИИ-АНАЛИТИК СОДЕРЖАНИЯ</span>
            </button>

            {/* View Mode Toggle: Cards vs Diff Feed */}
            <div className="flex items-center border border-[var(--crt-phosphor-dim)] rounded overflow-hidden">
              <button
                onClick={() => {
                  pipAudio.playClick();
                  setMonitorViewMode('cards');
                }}
                className={`px-2.5 py-1.5 text-xs flex items-center gap-1.5 transition-colors cursor-pointer ${
                  monitorViewMode === 'cards'
                    ? 'bg-[var(--crt-phosphor)] text-black font-extrabold'
                    : 'bg-black/60 text-[var(--crt-phosphor)]/70 hover:text-[var(--crt-phosphor)]'
                }`}
                title="Отображение подробными карточками с письменным содержанием"
              >
                <List size={13} />
                <span className="hidden sm:inline">КАРТОЧКИ САЙТОВ</span>
              </button>
              <button
                onClick={() => {
                  pipAudio.playClick();
                  setMonitorViewMode('diffFeed');
                }}
                className={`px-2.5 py-1.5 text-xs flex items-center gap-1.5 transition-colors cursor-pointer ${
                  monitorViewMode === 'diffFeed'
                    ? 'bg-[var(--crt-phosphor)] text-black font-extrabold'
                    : 'bg-black/60 text-[var(--crt-phosphor)]/70 hover:text-[var(--crt-phosphor)]'
                }`}
                title="Хронологическая лента всех текстовых изменений (Diff)"
              >
                <Zap size={13} className={allDiffsAcrossLinks.length > 0 ? 'text-amber-400' : ''} />
                <span className="hidden sm:inline">ЛЕНТА ИЗМЕНЕНИЙ (DIFF)</span>
                {allDiffsAcrossLinks.length > 0 && (
                  <span className="text-[10px] px-1 py-0.2 rounded bg-black/60 font-mono">
                    {allDiffsAcrossLinks.length}
                  </span>
                )}
              </button>
            </div>

            <button
              onClick={() => {
                pipAudio.playClick();
                setIsCategoryModalOpen(true);
              }}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 border border-[var(--crt-phosphor-dim)] hover:border-[var(--crt-phosphor)] bg-black/60 rounded cursor-pointer transition-colors"
              title="Настройка пользовательских категорий"
            >
              <FolderEdit size={13} /> КАТЕГОРИИ
            </button>

            <button
              onClick={() => {
                pipAudio.playClick();
                setIsAddModalOpen(true);
              }}
              className="flex items-center gap-1 text-xs px-3 py-1.5 border border-[var(--crt-phosphor)] bg-[var(--crt-phosphor)]/15 hover:bg-[var(--crt-phosphor)] hover:text-black transition-colors rounded cursor-pointer font-bold"
            >
              <Plus size={14} /> НОВАЯ ССЫЛКА
            </button>

            <button
              onClick={() => {
                pipAudio.playGeiger(5);
                onScanAll();
              }}
              disabled={isScanningAll}
              className="flex items-center gap-1 text-xs px-3 py-1.5 border border-[var(--crt-phosphor)] bg-[var(--crt-phosphor)] text-black hover:bg-[var(--crt-phosphor-bright)] transition-colors rounded cursor-pointer font-bold disabled:opacity-50"
            >
              <RefreshCw size={13} className={isScanningAll ? 'animate-spin' : ''} />
              {isScanningAll ? 'СКАНИРУЮ...' : 'ОПРОСИТЬ ВСЁ'}
            </button>
          </div>
        </div>

        {/* Categories Bar */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 text-xs no-scrollbar">
          <span className="opacity-60 text-[10px] shrink-0 uppercase tracking-wider mr-1">Папки:</span>
          <button
            onClick={() => {
              pipAudio.playClick();
              setSelectedCategory('ALL');
            }}
            className={`px-2 py-0.5 rounded cursor-pointer uppercase shrink-0 transition-colors ${
              selectedCategory === 'ALL'
                ? 'bg-[var(--crt-phosphor)] text-black font-bold'
                : 'border border-[var(--crt-phosphor-dim)]/50 text-[var(--crt-phosphor)]/80 hover:border-[var(--crt-phosphor)]'
            }`}
          >
            ВСЕ ({links.length})
          </button>
          {categories.map((cat) => {
            const count = links.filter((l) => l.category === cat.id).length;
            const isSelected = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => {
                  pipAudio.playClick();
                  setSelectedCategory(cat.id);
                }}
                className={`px-2 py-0.5 rounded cursor-pointer uppercase shrink-0 transition-colors flex items-center gap-1 ${
                  isSelected
                    ? 'bg-[var(--crt-phosphor)] text-black font-bold'
                    : 'border border-[var(--crt-phosphor-dim)]/50 text-[var(--crt-phosphor)]/80 hover:border-[var(--crt-phosphor)]'
                }`}
              >
                <span>{cat.name}</span>
                <span className="opacity-60 text-[10px]">({count})</span>
              </button>
            );
          })}
        </div>

        {/* Tag Filter Chips */}
        {allUniqueTags.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap pt-1 text-[11px] border-t border-[var(--crt-phosphor-dim)]/30">
            <span className="opacity-60 text-[10px] flex items-center gap-1 uppercase mr-0.5">
              <Tag size={11} /> Теги:
            </span>
            {selectedTag && (
              <button
                onClick={() => {
                  pipAudio.playClick();
                  setSelectedTag(null);
                }}
                className="bg-amber-400 text-black px-1.5 py-0.2 rounded text-[10px] font-bold flex items-center gap-1 cursor-pointer"
              >
                #{selectedTag} <X size={10} />
              </button>
            )}
            {allUniqueTags.map((tag) => {
              const isTagActive = selectedTag?.toLowerCase() === tag.toLowerCase();
              return (
                <button
                  key={tag}
                  onClick={() => {
                    pipAudio.playClick();
                    setSelectedTag(isTagActive ? null : tag);
                  }}
                  className={`px-1.5 py-0.2 rounded text-[10px] cursor-pointer transition-colors font-mono ${
                    isTagActive
                      ? 'bg-[var(--crt-phosphor)] text-black font-bold'
                      : 'border border-[var(--crt-phosphor-dim)]/40 hover:border-[var(--crt-phosphor)] text-[var(--crt-phosphor)]/80'
                  }`}
                >
                  #{tag}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Filter / Search summary */}
      {(searchQuery || selectedTag || selectedCategory !== 'ALL') && (
        <div className="flex items-center justify-between text-[11px] text-[var(--crt-phosphor-bright)] px-1">
          <div>
            Найдено ресурсов: <strong>{filteredLinks.length}</strong> из {links.length}
            {searchQuery && ` по запросу "${searchQuery}"`}
            {selectedTag && ` с тегом #${selectedTag}`}
          </div>
          <button
            onClick={() => {
              setSearchQuery('');
              setSelectedTag(null);
              setSelectedCategory('ALL');
            }}
            className="underline opacity-70 hover:opacity-100 cursor-pointer"
          >
            Сбросить фильтры
          </button>
        </div>
      )}

      {/* VIEW MODE 1: CHRONOLOGICAL DIFF FEED ACROSS ALL SITES */}
      {monitorViewMode === 'diffFeed' ? (
        <div className="space-y-4">
          {/* Content & Diff Global Overview Ribbon */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-black/60 border border-[var(--crt-phosphor-dim)] p-3 rounded-lg">
            <div className="bg-black/40 border border-[var(--crt-phosphor-dim)]/40 p-2.5 rounded">
              <div className="text-[10px] opacity-70 flex items-center gap-1 uppercase">
                <Globe size={11} /> ОТСЛЕЖИВАЕМЫХ РЕСУРСОВ
              </div>
              <div className="text-base sm:text-lg font-bold text-[var(--crt-phosphor-bright)]">
                {links.length} <span className="text-xs font-normal">сайтов</span>
              </div>
            </div>

            <div className="bg-black/40 border border-[var(--crt-phosphor-dim)]/40 p-2.5 rounded">
              <div className="text-[10px] opacity-70 flex items-center gap-1 uppercase">
                <AlignLeft size={11} /> ОБЪЕМ ПИСЬМЕННОГО ТЕКСТА
              </div>
              <div className="text-base sm:text-lg font-bold text-[var(--crt-phosphor-bright)]">
                ~{totalTrackedWords.toLocaleString('ru-RU')} <span className="text-xs font-normal">слов</span>
              </div>
            </div>

            <div className="bg-black/40 border border-[var(--crt-phosphor-dim)]/40 p-2.5 rounded">
              <div className="text-[10px] opacity-70 flex items-center gap-1 uppercase">
                <Zap size={11} className="text-amber-400" /> ЗАФИКСИРОВАНО DIFF
              </div>
              <div className="text-base sm:text-lg font-bold text-amber-300">
                {allDiffsAcrossLinks.length} <span className="text-xs font-normal">записей</span>
              </div>
            </div>

            <div className="bg-black/40 border border-[var(--crt-phosphor-dim)]/40 p-2.5 rounded">
              <div className="text-[10px] opacity-70 flex items-center gap-1 uppercase">
                <Clock size={11} className="text-emerald-400" /> АКТИВНЫЙ РЕЖИМ
              </div>
              <div className="text-base sm:text-lg font-bold text-emerald-400">
                МОНИТОРИНГ
              </div>
            </div>
          </div>

          {/* Chronological Diff Entries */}
          {allDiffsAcrossLinks.length === 0 ? (
            <div className="border border-dashed border-[var(--crt-phosphor-dim)] p-8 text-center rounded-lg bg-black/40 space-y-3">
              <History className="mx-auto opacity-50" size={36} />
              <div className="font-bold text-sm text-[var(--crt-phosphor-bright)]">
                {links.length === 0 ? 'Список ресурсов чист' : 'Изменений письменных данных на сайтах не обнаружено'}
              </div>
              <div className="text-xs opacity-75 max-w-md mx-auto leading-relaxed">
                {links.length === 0
                  ? 'Добавьте сайты в мониторинг для отслеживания реальных изменений письменного текста.'
                  : 'Терминал не придумывает и не галлюцинирует изменения. Записи появляются только при реальном обновлении текста на отслеживаемой веб-странице.'}
              </div>
              {links.length > 0 && (
                <div className="pt-2">
                  <button
                    onMouseDown={() => setPressedCheckId(links[0].id)}
                    onMouseUp={() => setPressedCheckId(null)}
                    onMouseLeave={() => setPressedCheckId(null)}
                    onClick={() => handleInteractiveWrittenCheck(links[0].id)}
                    className={`px-4 py-2 bg-[var(--crt-phosphor)] text-black font-extrabold text-xs uppercase rounded-lg cursor-pointer hover:bg-[var(--crt-phosphor-bright)] transition-all inline-flex items-center gap-1.5 select-none shadow-[0_3px_0_rgba(0,0,0,0.8)] active:translate-y-0.5 active:scale-[0.98] ${
                      pressedCheckId === links[0].id ? 'translate-y-0.5 scale-[0.98] brightness-90' : ''
                    }`}
                  >
                    <ScanLine size={14} />
                    <span>ПРОВЕРИТЬ ПИСЬМЕННЫЕ ДАННЫЕ «{links[0].title}»</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs px-1">
                <span className="font-bold uppercase tracking-wider text-[var(--crt-phosphor-bright)] flex items-center gap-1.5">
                  <Zap size={13} className="text-amber-400" /> ХРОНИКА РЕАЛЬНЫХ ИЗМЕНЕНИЙ ПИСЬМЕННОГО КОНТЕНТА:
                </span>
                <span className="opacity-70 text-[11px]">
                  Всего событий: {allDiffsAcrossLinks.length}
                </span>
              </div>

              {allDiffsAcrossLinks.map(({ link, diff }) => {
                const timeStr = new Date(diff.timestamp).toLocaleTimeString('ru-RU');
                const dateStr = new Date(diff.timestamp).toLocaleDateString('ru-RU');

                return (
                  <div
                    key={diff.id}
                    className="border border-[var(--crt-phosphor-dim)] bg-[#071309] hover:border-[var(--crt-phosphor)] p-3.5 rounded-lg space-y-2.5 transition-all"
                  >
                    {/* Header */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--crt-phosphor-dim)]/40 pb-2">
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <span className="text-[10px] px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-500 font-bold uppercase">
                          {diff.changeType || 'MODIFIED'}
                        </span>
                        <span className="font-extrabold text-sm text-[var(--crt-phosphor-bright)] truncate">
                          {link.title}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--crt-phosphor-dim)]/60 bg-black/60 font-mono">
                          {diff.section}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] opacity-75 font-mono">
                          {timeStr} · {dateStr}
                        </span>
                        <button
                          onClick={() => {
                            pipAudio.playClick();
                            setInspectingLinkId(link.id);
                          }}
                          className="px-2 py-0.5 text-[10px] bg-[var(--crt-phosphor)]/20 hover:bg-[var(--crt-phosphor)] hover:text-black border border-[var(--crt-phosphor)] rounded font-bold cursor-pointer transition-colors"
                        >
                          ПОЛНЫЙ ТЕКСТ САЙТА
                        </button>
                      </div>
                    </div>

                    {/* Change Summary */}
                    <div className="text-xs font-semibold text-[var(--crt-phosphor-bright)] flex items-start gap-1.5">
                      <ArrowRight size={13} className="text-amber-400 shrink-0 mt-0.5" />
                      <span>{diff.summary}</span>
                    </div>

                    {/* Side-by-Side Comparison: Before vs After */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs font-mono">
                      <div className="bg-red-950/20 border border-red-500/40 rounded p-2.5 space-y-1">
                        <div className="text-[10px] font-bold text-red-400 uppercase tracking-wider">
                          [− БЫЛО / ПРЕЖНИЙ ТЕКСТ]:
                        </div>
                        <p className="text-red-200/90 leading-relaxed font-sans text-[11px] line-through decoration-red-400/60">
                          {diff.previousText || 'Предыдущая версия отсутствовала.'}
                        </p>
                      </div>

                      <div className="bg-emerald-950/30 border border-emerald-500/50 rounded p-2.5 space-y-1">
                        <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                          [+ СТАЛО / НОВЫЙ ТЕКСТ]:
                        </div>
                        <p className="text-emerald-100 font-sans text-[11px] leading-relaxed font-semibold">
                          {diff.newText}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* VIEW MODE 2: COMPREHENSIVE WRITTEN CONTENT CARDS */
        <div className="grid grid-cols-1 gap-3.5">
          {filteredLinks.length === 0 ? (
            <div className="border border-dashed border-[var(--crt-phosphor-dim)] p-8 text-center rounded-lg bg-black/40 space-y-3">
              <Radio className="mx-auto opacity-50" size={36} />
              <div className="font-bold text-sm text-[var(--crt-phosphor-bright)]">
                {links.length === 0 ? 'Список ресурсов чист' : 'По запросу ничего не найдено'}
              </div>
              <div className="text-xs opacity-75 max-w-md mx-auto leading-relaxed">
                {links.length === 0
                  ? 'Вы можете добавить любые необходимые сайты (деканат, научные репозитории, личный кабинет, Moodle), и Pip-Boy загрузит их реальное письменное содержание и будет проверять изменения без галлюцинаций.'
                  : 'Попробуйте сбросить фильтры поиска или изменить выбранный тег.'}
              </div>
              <div className="pt-2">
                <button
                  onClick={() => {
                    pipAudio.playClick();
                    setIsAddModalOpen(true);
                  }}
                  className="px-5 py-2.5 bg-[var(--crt-phosphor)] text-black font-extrabold text-xs rounded cursor-pointer hover:bg-[var(--crt-phosphor-bright)] transition-colors uppercase tracking-wider inline-flex items-center gap-1.5"
                >
                  <Plus size={15} /> ДОБАВИТЬ ССЫЛКУ
                </button>
              </div>
            </div>
          ) : (
            filteredLinks.map((link) => {
              const isChanged = link.status === 'CHANGED';
              const isSyncing = link.status === 'SYNCING';
              const hasDiffs = (link.diffHistory || []).length > 0;
              const isExpanded = expandedDiffId === link.id;
              const checkReport = siteCheckReports[link.id];
              const isPressed = pressedCheckId === link.id;
              
              // Ensure writtenContent exists
              const written: SiteWrittenContent = link.writtenContent || generateInitialWrittenContent(link.url, link.title, link.category);
              const latestDiff = link.diffHistory?.[0];

              return (
                <div
                  key={link.id}
                  className={`border rounded-lg p-4 bg-[#071309] space-y-3 transition-all ${
                    isChanged
                      ? 'border-amber-400 bg-[#150f02] box-glow-subtle'
                      : 'border-[var(--crt-phosphor-dim)] hover:border-[var(--crt-phosphor)]'
                  }`}
                >
                  {/* Card Top: Title, Category Selector, URL, Status */}
                  <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[var(--crt-phosphor-dim)]/30 pb-2.5">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-extrabold text-sm sm:text-base text-[var(--crt-phosphor-bright)] flex items-center gap-1.5">
                          <Globe size={15} className="opacity-75" />
                          {link.title}
                        </span>

                        {/* Category badge & selector */}
                        <select
                          value={link.category}
                          onChange={(e) => {
                            pipAudio.playClick();
                            onUpdateLinkCategory(link.id, e.target.value);
                          }}
                          className="text-[10px] px-1.5 py-0.5 border border-[var(--crt-phosphor-dim)] rounded bg-black text-[var(--crt-phosphor)] uppercase outline-none cursor-pointer font-mono"
                          title="Изменить категорию"
                        >
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>

                        {link.isScientific && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-[var(--crt-phosphor)]/20 text-[var(--crt-phosphor-bright)] border border-[var(--crt-phosphor)] rounded font-mono">
                            НАУЧНЫЙ РЕПОЗИТОРИЙ
                          </span>
                        )}

                        <span
                          className={`text-[10px] px-2 py-0.5 rounded font-black uppercase ${
                            isChanged
                              ? 'bg-amber-950 text-amber-300 border border-amber-500 animate-pulse'
                              : 'bg-emerald-950 text-emerald-400 border border-emerald-500'
                          }`}
                        >
                          ● {isChanged ? 'DIFF: ОБНОВЛЕНО' : 'БЕЗ ИЗМЕНЕНИЙ'}
                        </span>
                      </div>

                      {/* URL Link */}
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs opacity-75 hover:opacity-100 flex items-center gap-1 text-[var(--crt-phosphor)] underline underline-offset-2 break-all"
                      >
                        <span>{link.url}</span>
                        <ExternalLink size={11} className="inline shrink-0" />
                      </a>
                    </div>

                    {/* Reading metrics badge */}
                    <div className="flex items-center gap-2 text-[11px] opacity-80 shrink-0 font-mono">
                      <span className="px-2 py-0.5 bg-black/60 border border-[var(--crt-phosphor-dim)]/50 rounded">
                        ~{written.wordCount} слов
                      </span>
                      <span className="px-2 py-0.5 bg-black/60 border border-[var(--crt-phosphor-dim)]/50 rounded">
                        ~{written.readingTimeMin} мин чтения
                      </span>
                    </div>
                  </div>

                  {/* WRITTEN CONTENT: Detailed Overview */}
                  <div className="space-y-1.5">
                    <div className="text-[10px] uppercase font-bold text-[var(--crt-phosphor-bright)] opacity-75 tracking-wider flex items-center gap-1">
                      <AlignLeft size={11} /> Письменное содержание ресурса:
                    </div>
                    <p className="text-xs sm:text-sm text-[var(--crt-phosphor-bright)]/90 leading-relaxed font-sans bg-black/40 border border-[var(--crt-phosphor-dim)]/30 p-2.5 rounded">
                      {written.overview}
                    </p>
                  </div>

                  {/* Detected Sections & Tags */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
                    {/* Detected Sections Badges */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="opacity-60 text-[10px] uppercase flex items-center gap-1">
                        <FolderTree size={11} /> Разделы:
                      </span>
                      {written.detectedSections.slice(0, 3).map((sec, idx) => (
                        <span
                          key={idx}
                          className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--crt-phosphor-dim)]/60 bg-black/60 text-[var(--crt-phosphor-bright)]"
                          title={sec.summary}
                        >
                          {sec.title}
                        </span>
                      ))}
                      {written.detectedSections.length > 3 && (
                        <span className="text-[10px] opacity-60">
                          +{written.detectedSections.length - 3} ещё
                        </span>
                      )}
                    </div>

                    {/* Tags List & Inline Edit */}
                    <div className="flex items-center gap-1 flex-wrap">
                      {editingTagsLinkId === link.id ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={tagsInputVal}
                            onChange={(e) => setTagsInputVal(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSaveInlineTags(link.id)}
                            placeholder="тег1, тег2, тег3..."
                            className="bg-black border border-[var(--crt-phosphor)] text-[10px] px-1.5 py-0.5 rounded text-[var(--crt-phosphor)] outline-none"
                            autoFocus
                          />
                          <button
                            onClick={() => handleSaveInlineTags(link.id)}
                            className="p-1 text-black bg-[var(--crt-phosphor)] rounded cursor-pointer"
                            title="Сохранить"
                          >
                            <Check size={10} />
                          </button>
                          <button
                            onClick={() => setEditingTagsLinkId(null)}
                            className="p-1 border border-zinc-600 rounded cursor-pointer"
                            title="Отмена"
                          >
                            <X size={10} />
                          </button>
                        </div>
                      ) : (
                        <>
                          {(link.tags || []).map((t) => (
                            <span
                              key={t}
                              onClick={() => {
                                pipAudio.playClick();
                                setSelectedTag(t);
                              }}
                              className="text-[10px] px-1.5 py-0.2 border border-[var(--crt-phosphor-dim)]/40 hover:border-[var(--crt-phosphor)] text-[var(--crt-phosphor)]/80 rounded font-mono cursor-pointer"
                              title="Фильтровать по этому тегу"
                            >
                              #{t}
                            </span>
                          ))}
                          <button
                            onClick={() => {
                              pipAudio.playClick();
                              setEditingTagsLinkId(link.id);
                              setTagsInputVal((link.tags || []).join(', '));
                            }}
                            className="text-[10px] text-[var(--crt-phosphor-dim)] hover:text-[var(--crt-phosphor)] flex items-center gap-0.5 cursor-pointer ml-1"
                            title="Редактировать теги"
                          >
                            <Edit2 size={10} /> теги
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Sparkline Visualization of Update & Check Activity */}
                  <SiteUpdateSparkline link={link} variant="compact" />

                  {/* Live Non-Hallucinating Verification Status Banner */}
                  {checkReport && (
                    <div
                      className={`p-2.5 rounded-lg border text-xs font-mono flex items-start justify-between gap-2 transition-all ${
                        checkReport.checking
                          ? 'bg-black/80 border-[var(--crt-phosphor)] text-[var(--crt-phosphor-bright)] animate-pulse'
                          : checkReport.hasChanged
                          ? 'bg-amber-950/50 border-amber-400 text-amber-200'
                          : 'bg-emerald-950/30 border-emerald-500/60 text-emerald-200'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        {checkReport.checking ? (
                          <RefreshCw size={14} className="animate-spin text-[var(--crt-phosphor-bright)] shrink-0 mt-0.5" />
                        ) : checkReport.hasChanged ? (
                          <Zap size={14} className="text-amber-400 shrink-0 mt-0.5" />
                        ) : (
                          <ShieldCheck size={14} className="text-emerald-400 shrink-0 mt-0.5" />
                        )}
                        <div className="space-y-0.5">
                          <div className="text-[10px] font-bold uppercase tracking-wider opacity-80">
                            {checkReport.checking
                              ? 'ВЫПОЛНЯЕТСЯ СВЕРКА ПИСЬМЕННЫХ ДАННЫХ САЙТА...'
                              : checkReport.hasChanged
                              ? 'ЗАФИКСИРОВАНО РЕАЛЬНОЕ ИЗМЕНЕНИЕ ТЕКСТА НА САЙТЕ'
                              : 'ДОСТОВЕРНАЯ ПРОВЕРКА ЗАВЕРШЕНА (БЕЗ ГАЛЛЮЦИНАЦИЙ)'}
                          </div>
                          <div className="text-[11px] leading-relaxed font-sans">{checkReport.message}</div>
                        </div>
                      </div>
                      {!checkReport.checking && (
                        <button
                          onClick={() =>
                            setSiteCheckReports((prev) => {
                              const copy = { ...prev };
                              delete copy[link.id];
                              return copy;
                            })
                          }
                          className="p-0.5 opacity-60 hover:opacity-100 cursor-pointer shrink-0"
                          title="Скрыть отчёт"
                        >
                          <X size={13} />
                        </button>
                      )}
                    </div>
                  )}

                  {/* Dynamic change alert banner if content has changed */}
                  {isChanged && latestDiff && (
                    <div className="bg-amber-950/40 border border-amber-400/80 p-2.5 rounded text-xs space-y-1">
                      <div className="flex items-center justify-between text-[10px] text-amber-300 font-bold uppercase">
                        <span className="flex items-center gap-1">
                          <Zap size={12} className="text-amber-400" /> ОБНОВЛЕНИЕ В РАЗДЕЛЕ: {latestDiff.section}
                        </span>
                        <span>{new Date(latestDiff.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <div className="font-semibold text-amber-100">
                        {latestDiff.summary}
                      </div>
                    </div>
                  )}

                  {/* Card Bottom Actions & Polling Settings */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--crt-phosphor-dim)]/40">
                    {/* Polling Interval & Timestamps */}
                    <div className="flex flex-wrap items-center gap-2.5 text-[11px] opacity-80 font-mono">
                      <div className="flex items-center gap-1.5 bg-black/50 border border-[var(--crt-phosphor-dim)]/50 px-1.5 py-0.5 rounded">
                        <Clock size={11} className="text-[var(--crt-phosphor)] shrink-0" />
                        <span className="text-[10px] opacity-75">Опрос:</span>
                        <select
                          value={link.checkIntervalSec}
                          onChange={(e) => {
                            pipAudio.playClick();
                            const val = Number(e.target.value);
                            if (onUpdateLinkInterval) {
                              onUpdateLinkInterval(link.id, val);
                            }
                          }}
                          className="bg-black text-[10px] text-[var(--crt-phosphor-bright)] font-mono outline-none cursor-pointer border-none"
                          title="Изменить интервал проверки"
                        >
                          <option value={15}>15 сек</option>
                          <option value={30}>30 сек</option>
                          <option value={45}>45 сек</option>
                          <option value={60}>1 мин</option>
                          <option value={180}>3 мин</option>
                          <option value={300}>5 мин</option>
                          <option value={600}>10 мин</option>
                          <option value={1800}>30 мин</option>
                          <option value={3600}>1 час</option>
                        </select>
                      </div>
                      <span>Проверено: {formatTimeAgo(link.lastChecked)}</span>
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {/* Interactive Tactile Button: Check Written Data Changes on Site */}
                      <button
                        type="button"
                        disabled={isSyncing}
                        onMouseDown={() => setPressedCheckId(link.id)}
                        onMouseUp={() => setPressedCheckId(null)}
                        onMouseLeave={() => setPressedCheckId(null)}
                        onTouchStart={() => setPressedCheckId(link.id)}
                        onTouchEnd={() => setPressedCheckId(null)}
                        onClick={() => handleInteractiveWrittenCheck(link.id)}
                        title="Нажмите для реальной проверки изменений письменных данных на сайте (сверка HTML без галлюцинаций)"
                        className={`text-xs px-3 py-1.5 rounded-md font-mono font-extrabold uppercase tracking-wide flex items-center gap-1.5 cursor-pointer select-none transition-all duration-100 ${
                          isSyncing
                            ? 'bg-[var(--crt-phosphor)]/30 text-[var(--crt-phosphor-bright)] border-2 border-[var(--crt-phosphor)] animate-pulse cursor-wait'
                            : isPressed
                            ? 'bg-[var(--crt-phosphor-bright)] text-black border-2 border-white translate-y-0.5 scale-[0.97] shadow-inner'
                            : 'bg-[var(--crt-phosphor)] text-black border-2 border-[var(--crt-phosphor-bright)] hover:bg-[var(--crt-phosphor-bright)] shadow-[0_3px_0_rgba(0,0,0,0.85),0_0_12px_rgba(var(--crt-phosphor-rgb),0.3)] active:translate-y-0.5 active:scale-[0.97]'
                        }`}
                      >
                        {isSyncing ? (
                          <>
                            <RefreshCw size={13} className="animate-spin" />
                            <span>СВЕРКА ТЕКСТА...</span>
                          </>
                        ) : (
                          <>
                            <ScanLine size={13} />
                            <span>ПРОВЕРИТЬ ИЗМЕНЕНИЯ ПИСЬМЕННЫХ ДАННЫХ</span>
                          </>
                        )}
                      </button>

                      {/* Deep Written Content & Diff Inspector Button */}
                      <button
                        onClick={() => {
                          pipAudio.playClick();
                          setInspectingLinkId(link.id);
                        }}
                        title="Открыть развернутое письменное содержание, каталог разделов и историю реальных правок"
                        className="text-xs px-2.5 py-1 border border-[var(--crt-phosphor)] hover:border-[var(--crt-phosphor-bright)] bg-[var(--crt-phosphor)]/15 text-[var(--crt-phosphor-bright)] hover:bg-[var(--crt-phosphor)] hover:text-black rounded cursor-pointer transition-colors font-mono flex items-center gap-1 font-bold"
                      >
                        <FileText size={12} /> СОДЕРЖАНИЕ & DIFF
                      </button>

                      {/* Ask AI about this site */}
                      <button
                        onClick={() => {
                          pipAudio.playSuccess();
                          setAiConsultantInitialLinkId(link.id);
                          setIsAIConsultantOpen(true);
                        }}
                        title="Спросить у нейросети по содержанию этого сайта"
                        className="text-xs px-2 py-1 border border-amber-400/80 hover:border-amber-300 bg-amber-950/40 text-amber-300 hover:bg-amber-400 hover:text-black rounded cursor-pointer transition-colors font-mono flex items-center gap-1 font-bold shadow-[0_0_6px_rgba(251,191,36,0.2)]"
                      >
                        <Bot size={12} /> СПРОСИТЬ ИИ
                      </button>

                      {/* Expand Diff History */}
                      {hasDiffs && (
                        <button
                          onClick={() => {
                            pipAudio.playClick();
                            setExpandedDiffId(isExpanded ? null : link.id);
                          }}
                          className={`text-[11px] px-2 py-1 border rounded cursor-pointer transition-colors flex items-center gap-1 ${
                            isExpanded
                              ? 'bg-[var(--crt-phosphor)] text-black border-[var(--crt-phosphor)] font-bold'
                              : 'border-[var(--crt-phosphor-dim)] text-[var(--crt-phosphor)]'
                          }`}
                        >
                          <History size={11} />
                          ИСТОРИЯ ({link.diffHistory.length})
                        </button>
                      )}

                      {/* Toggle Notification */}
                      <button
                        onClick={() => {
                          pipAudio.playClick();
                          onToggleNotification(link.id);
                        }}
                        title={link.notificationEnabled ? 'Уведомления включены' : 'Уведомления выключены'}
                        className={`p-1 border rounded cursor-pointer transition-colors ${
                          link.notificationEnabled
                            ? 'border-[var(--crt-phosphor)] text-[var(--crt-phosphor)] bg-[var(--crt-phosphor)]/15'
                            : 'border-zinc-700 text-zinc-500 hover:text-zinc-300'
                        }`}
                      >
                        {link.notificationEnabled ? <Bell size={13} /> : <BellOff size={13} />}
                      </button>

                      {/* Delete */}
                      <button
                        onClick={() => {
                          pipAudio.playClick();
                          onDeleteLink(link.id);
                        }}
                        title="Удалить из мониторинга"
                        className="p-1 border border-red-900/60 hover:border-red-500 text-red-400 rounded cursor-pointer transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {/* Inline Diff History Expansion */}
                  {isExpanded && hasDiffs && (
                    <div className="mt-3 pt-3 border-t border-[var(--crt-phosphor-dim)]/40 space-y-2.5">
                      <div className="text-[11px] font-bold tracking-wider opacity-80 uppercase flex items-center justify-between">
                        <span className="flex items-center gap-1">
                          <FileCode size={12} /> ХРОНОЛОГИЯ ИЗМЕНЕНИЙ КОНТЕНТА:
                        </span>
                        <span className="text-[10px] opacity-60">
                          {link.diffHistory.length} записей
                        </span>
                      </div>

                      <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                        {link.diffHistory.map((diff) => (
                          <div
                            key={diff.id}
                            className="bg-black/90 border-l-2 border-amber-400 p-2.5 text-xs rounded-r font-mono space-y-1.5"
                          >
                            <div className="flex items-center justify-between text-[10px] text-amber-300/90">
                              <span className="font-bold">[{diff.section}]</span>
                              <span>{new Date(diff.timestamp).toLocaleString('ru-RU')}</span>
                            </div>
                            <div className="font-semibold text-[var(--crt-phosphor-bright)]">
                              {diff.summary}
                            </div>
                            {diff.previousText && (
                              <div className="text-[11px] text-red-300/80 bg-red-950/20 px-2 py-0.5 rounded line-through">
                                − Было: {diff.previousText}
                              </div>
                            )}
                            <div className="text-[11px] text-emerald-300 bg-emerald-950/30 px-2 py-0.5 rounded font-semibold">
                              + Стало: {diff.newText}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Modal: Add Link */}
      {isAddModalOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 bg-black/95 flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto">
          <div className="border-2 border-[var(--crt-phosphor)] bg-[#050d06] p-4 sm:p-5 rounded-xl max-w-lg w-full text-[var(--crt-phosphor)] space-y-4 shadow-2xl font-mono">
            <div className="text-sm font-bold tracking-wider uppercase flex items-center justify-between border-b border-[var(--crt-phosphor-dim)] pb-2.5">
              <span className="flex items-center gap-2 text-[var(--crt-phosphor-bright)]">
                <Plus size={16} /> ПОДКЛЮЧИТЬ НОВЫЙ САЙТ К МОНИТОРИНГУ
              </span>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="cursor-pointer text-xs p-1 hover:bg-[var(--crt-phosphor)]/20 rounded"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmitNew} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider mb-1">
                  Название ресурса:
                </label>
                <input
                  type="text"
                  required
                  placeholder="Например: Личный кабинет МГУ, Ведомости БРС, eLIBRARY..."
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full bg-black border border-[var(--crt-phosphor)] px-3 py-2 rounded text-[var(--crt-phosphor)] outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider mb-1">
                  URL адрес сайта:
                </label>
                <input
                  type="text"
                  required
                  placeholder="https://example.university.ru/study"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  className="w-full bg-black border border-[var(--crt-phosphor)] px-3 py-2 rounded text-[var(--crt-phosphor)] outline-none font-mono"
                />
              </div>

              {/* Category */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-bold uppercase tracking-wider">
                    Категория:
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsAddingInlineCat(!isAddingInlineCat)}
                    className="text-[10px] text-[var(--crt-phosphor-bright)] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Plus size={10} /> {isAddingInlineCat ? 'Выбрать существующую' : 'Создать новую'}
                  </button>
                </div>

                {!isAddingInlineCat ? (
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full bg-black border border-[var(--crt-phosphor)] px-3 py-2 rounded text-[var(--crt-phosphor)] outline-none uppercase font-mono cursor-pointer"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      placeholder="Название категории..."
                      value={inlineCatName}
                      onChange={(e) => setInlineCatName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleCreateInlineCategory();
                        }
                      }}
                      className="flex-1 bg-black border border-[var(--crt-phosphor)] px-2.5 py-1.5 text-xs text-[var(--crt-phosphor)] outline-none rounded uppercase font-mono"
                    />
                    <button
                      type="button"
                      onClick={handleCreateInlineCategory}
                      className="bg-[var(--crt-phosphor)] text-black font-bold px-3 py-1.5 rounded cursor-pointer hover:bg-[var(--crt-phosphor-bright)]"
                    >
                      ОК
                    </button>
                  </div>
                )}
              </div>

              {/* Tags */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider mb-1">
                  Теги (через запятую):
                </label>
                <input
                  type="text"
                  placeholder="расписание, брс, диплом, архивы"
                  value={newTagsStr}
                  onChange={(e) => setNewTagsStr(e.target.value)}
                  className="w-full bg-black border border-[var(--crt-phosphor)] px-3 py-2 rounded text-[var(--crt-phosphor)] outline-none font-mono"
                />
              </div>

              {/* Interval & Notifications */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider mb-1">
                    Интервал опроса:
                  </label>
                  <select
                    value={isCustomInterval ? 'CUSTOM' : newInterval}
                    onChange={(e) => {
                      if (e.target.value === 'CUSTOM') {
                        setIsCustomInterval(true);
                      } else {
                        setIsCustomInterval(false);
                        setNewInterval(Number(e.target.value));
                      }
                    }}
                    className="w-full bg-black border border-[var(--crt-phosphor)] px-2.5 py-1.5 rounded text-[var(--crt-phosphor)] outline-none font-mono cursor-pointer"
                  >
                    <option value={15}>15 секунд</option>
                    <option value={30}>30 секунд</option>
                    <option value={45}>45 секунд</option>
                    <option value={60}>1 минута</option>
                    <option value={180}>3 минуты</option>
                    <option value={300}>5 минут</option>
                    <option value={600}>10 минут</option>
                    <option value={1800}>30 минут</option>
                    <option value={3600}>1 час</option>
                  </select>
                </div>

                <div className="flex items-center gap-2 pt-4">
                  <input
                    type="checkbox"
                    id="newNotifyCheck"
                    checked={newNotify}
                    onChange={(e) => setNewNotify(e.target.checked)}
                    className="accent-[var(--crt-phosphor)] w-4 h-4 cursor-pointer"
                  />
                  <label htmlFor="newNotifyCheck" className="text-xs cursor-pointer select-none">
                    Push-уведомления об изменениях
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--crt-phosphor-dim)]">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 border border-zinc-700 hover:border-zinc-500 rounded text-xs cursor-pointer"
                >
                  ОТМЕНА
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[var(--crt-phosphor)] text-black font-extrabold rounded text-xs uppercase cursor-pointer hover:bg-[var(--crt-phosphor-bright)] transition-colors shadow-md"
                >
                  ПОДКЛЮЧИТЬ САЙТ
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Modal: Category Manager */}
      {isCategoryModalOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 bg-black/95 flex items-center justify-center p-4 z-50">
          <div className="border-2 border-[var(--crt-phosphor)] bg-[#050d06] p-5 rounded max-w-md w-full text-[var(--crt-phosphor)] space-y-4 font-mono shadow-2xl">
            <div className="text-sm font-bold tracking-wider uppercase flex items-center justify-between border-b border-[var(--crt-phosphor-dim)] pb-2">
              <span className="flex items-center gap-1.5 text-[var(--crt-phosphor-bright)]">
                <FolderPlus size={16} /> МЕНЕДЖЕР КАТЕГОРИЙ PIP-BOY
              </span>
              <button
                onClick={() => setIsCategoryModalOpen(false)}
                className="cursor-pointer text-xs px-2 py-0.5 border border-[var(--crt-phosphor-dim)] hover:border-[var(--crt-phosphor)]"
              >
                ЗАКРЫТЬ
              </button>
            </div>

            {/* Create Category Form */}
            <form onSubmit={handleCreateCategory} className="flex gap-2 text-xs">
              <input
                type="text"
                placeholder="Новая категория (напр. ДИПЛОМ, ГРАНТЫ)..."
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                className="flex-1 bg-black border border-[var(--crt-phosphor)] px-3 py-1.5 rounded text-[var(--crt-phosphor)] outline-none uppercase font-mono"
              />
              <button
                type="submit"
                className="bg-[var(--crt-phosphor)] text-black font-bold px-3 py-1.5 rounded cursor-pointer hover:bg-[var(--crt-phosphor-bright)] shrink-0"
              >
                + СОЗДАТЬ
              </button>
            </form>

            {/* Categories List */}
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1 text-xs">
              {categories.map((cat) => {
                const isEditingThis = editingCatId === cat.id;
                const linkCount = links.filter((l) => l.category === cat.id).length;

                return (
                  <div
                    key={cat.id}
                    className="flex items-center justify-between p-2 border border-[var(--crt-phosphor-dim)]/50 bg-black/50 rounded"
                  >
                    {isEditingThis ? (
                      <div className="flex items-center gap-2 flex-1 mr-2">
                        <input
                          type="text"
                          value={editingCatName}
                          onChange={(e) => setEditingCatName(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleSaveRenameCategory(cat.id)}
                          className="bg-black border border-[var(--crt-phosphor)] text-xs px-2 py-1 rounded text-[var(--crt-phosphor)] outline-none uppercase flex-1 font-mono"
                          autoFocus
                        />
                        <button
                          onClick={() => handleSaveRenameCategory(cat.id)}
                          className="p-1 bg-[var(--crt-phosphor)] text-black rounded cursor-pointer"
                        >
                          <Check size={12} />
                        </button>
                        <button
                          onClick={() => setEditingCatId(null)}
                          className="p-1 border border-zinc-600 rounded cursor-pointer"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <span className="font-bold">{cat.name}</span>
                          <span className="opacity-60 text-[10px]">({linkCount} сайтов)</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              setEditingCatId(cat.id);
                              setEditingCatName(cat.name);
                            }}
                            className="p-1 text-[var(--crt-phosphor)]/75 hover:text-[var(--crt-phosphor)] cursor-pointer"
                            title="Переименовать"
                          >
                            <Edit2 size={12} />
                          </button>
                          {!cat.isDefault && (
                            <button
                              onClick={() => {
                                pipAudio.playClick();
                                onDeleteCategory(cat.id);
                              }}
                              className="p-1 text-red-400 hover:text-red-300 cursor-pointer"
                              title="Удалить категорию"
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Deep Written Content & Dynamic Diff Inspector Modal */}
      {inspectingLinkId && (
        (() => {
          const targetLink = links.find((l) => l.id === inspectingLinkId);
          if (!targetLink) return null;
          return (
            <SiteTelemetryModal
              link={targetLink}
              isSyncing={targetLink.status === 'SYNCING'}
              checkReport={siteCheckReports[targetLink.id]}
              onClose={() => setInspectingLinkId(null)}
              onOpenAIWithLink={(linkId) => {
                setInspectingLinkId(null);
                setAiConsultantInitialLinkId(linkId);
                setIsAIConsultantOpen(true);
              }}
              onScanSingle={handleInteractiveWrittenCheck}
            />
          );
        })()
      )}

      {/* Site AI Consultant Modal */}
      {isAIConsultantOpen && (
        <SiteAIConsultantModal
          links={links}
          initialSelectedLinkId={aiConsultantInitialLinkId}
          onClose={() => {
            setIsAIConsultantOpen(false);
            setAiConsultantInitialLinkId(null);
          }}
        />
      )}
    </div>
  );
};
