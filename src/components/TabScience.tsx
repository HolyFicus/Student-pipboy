import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { MonitoredLink, CustomCategory, AIDataMode } from '../types/pipboy';
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
  BookOpen,
  Search,
  Languages,
  Sparkles,
  ExternalLink,
  BookmarkPlus,
  HelpCircle,
  Library,
  Copy,
  Check,
  RotateCcw,
  Send,
  Scroll,
  Layers,
  ArrowRight,
  ShieldCheck,
  Info,
  Compass,
  Clock,
  FolderEdit,
  Plus,
  Sliders,
  X,
  Lock,
  Globe
} from 'lucide-react';

interface TabScienceProps {
  links?: MonitoredLink[];
  categories?: CustomCategory[];
  onAddCategory?: (category: CustomCategory) => void;
  onAddScientificLink: (link: Omit<MonitoredLink, 'id' | 'lastChecked' | 'lastUpdated' | 'status' | 'currentHash' | 'diffHistory'>) => void;
}

// Curated verified humanities databases for Russian students
interface HumanitiesDatabase {
  id: string;
  title: string;
  shortName: string;
  url: string;
  discipline: string;
  category: 'ALL' | 'HISTORY' | 'PHILOLOGY' | 'PHILOSOPHY' | 'CULTURE' | 'SOCIOLOGY';
  accessType: string;
  isRussian: boolean;
  description: string;
  searchTips: string;
  whyUseful: string;
}

const HUMANITIES_DATABASES: HumanitiesDatabase[] = [
  {
    id: 'cyberleninka',
    title: 'КиберЛенинка (CyberLeninka)',
    shortName: 'КиберЛенинка',
    url: 'https://cyberleninka.ru',
    discipline: 'История, Филология, Философия, Культурология, Педагогика',
    category: 'ALL',
    accessType: '100% Открытый доступ (Open Access, CC-BY)',
    isRussian: true,
    description: 'Крупнейшая открытая научная библиотека России. Более 3 миллионов полных текстов статей из сотен ведущих академических журналов списка ВАК и РИНЦ.',
    searchTips: 'Используйте точные фразы в кавычках («семиотика текста») или фильтр по рубрикатору ГРНТИ «Гуманитарные науки».',
    whyUseful: 'Идеально для первого этапа: полные статьи без платных подписок и сложных регистраций, мгновенное скачивание PDF.'
  },
  {
    id: 'elibrary',
    title: 'eLIBRARY.RU (Научная электронная библиотека)',
    shortName: 'eLIBRARY / РИНЦ',
    url: 'https://elibrary.ru',
    discipline: 'Все гуманитарные и общественные науки',
    category: 'ALL',
    accessType: 'Бесплатная регистрация / Открытый доступ',
    isRussian: true,
    description: 'Главная научная база РФ и ядро Российского индекса научного цитирования (РИНЦ). Содержит монографии, сборники конференций, авторефераты диссертаций.',
    searchTips: 'В расширенном поиске включайте галочку «доступные полные тексты» и сортируйте по количеству цитирований.',
    whyUseful: 'Главный ориентир для курсовых и дипломов: позволяет проверить авторитетность автора и статус журнала в ВАК / RSCI.'
  },
  {
    id: 'feb',
    title: 'ФЭБ «Русская литература и фольклор»',
    shortName: 'ФЭБ ИМЛИ РАН',
    url: 'http://feb-web.ru',
    discipline: 'Литературоведение, Филология, Фольклористика, Текстология',
    category: 'PHILOLOGY',
    accessType: 'Полный открытый доступ без регистрации',
    isRussian: true,
    description: 'Фундаментальная электронная библиотека ИМЛИ РАН и РГБ. Академические выверенные собрания сочинений классиков (Пушкин, Достоевский, Толстой) с комментариями и черновиками.',
    searchTips: 'Ищите точные цитаты по корпусу текстов или исследуйте текстологические примечания к каноническим редакциям.',
    whyUseful: 'Базовый эталон для филолога: любые ссылки на художественный текст в академической работе требуют авторитетного источника.'
  },
  {
    id: 'neb',
    title: 'НЭБ (Национальная электронная библиотека)',
    shortName: 'НЭБ РФ',
    url: 'https://rusneb.ru',
    discipline: 'История, Культурология, Искусствоведение, Архивы',
    category: 'HISTORY',
    accessType: 'Открытый доступ к общественному достоянию',
    isRussian: true,
    description: 'Единый портал оцифрованных фондов ведущих библиотек РФ (РГБ «Ленинка», РНБ). Дореволюционные издания, архивные газеты, редкие книги и диссертации.',
    searchTips: 'Ищите раздел «Книжные памятники» и оцифрованную историческую периодику XIX–XX веков.',
    whyUseful: 'Незаменима для историков и культурологов: доступ к первичным историческим источникам, недоступным в обычных библиотеках.'
  },
  {
    id: 'magazines',
    title: 'Журнальный Зал (Русский Толстый Журнал)',
    shortName: 'Журнальный Зал',
    url: 'https://magazines.gorky.media',
    discipline: 'Литературоведение, Литературная критика, Культурология',
    category: 'PHILOLOGY',
    accessType: 'Открытый доступ',
    isRussian: true,
    description: 'Электронная библиотека ведущих гуманитарных и литературных журналов: «Новое литературное обозрение» (НЛО), «Вопросы литературы», «Новый мир», «Иностранная литература».',
    searchTips: 'Используйте поиск по авторам литературной критики и архивам «НЛО» для культурологических эссе.',
    whyUseful: 'Живой контекст современной гуманитарной мысли: эссе, рецензии на свежие монографии, дискуссии и переводы.'
  },
  {
    id: 'inion',
    title: 'ИНИОН РАН (Институт информации по общ. наукам)',
    shortName: 'ИНИОН РАН',
    url: 'http://inion.ru',
    discipline: 'Философия, Политология, Всеобщая история, Социология',
    category: 'PHILOSOPHY',
    accessType: 'Открытые библиографические базы и рефераты',
    isRussian: true,
    description: 'Академический центр реферативной информации. Публикует реферативные журналы и библиографические указатели по ключевым проблемам философии и социологии.',
    searchTips: 'Изучайте реферативные журналы — они содержат сжатый разбор зарубежных и отечественных монографий.',
    whyUseful: 'Экономит десятки часов при подготовке историографического обзора и анализе зарубежных научных школ.'
  },
  {
    id: 'prlib',
    title: 'Президентская библиотека им. Б.Н. Ельцина',
    shortName: 'Президентская библиотека',
    url: 'https://www.prlib.ru',
    discipline: 'История России, Источниковедение, Правоведение',
    category: 'HISTORY',
    accessType: 'Открытый доступ к электронным коллекциям',
    isRussian: true,
    description: 'Крупнейшее цифровое хранилище первоисточников по истории российской государственности, архивам законодательства и русскому языку.',
    searchTips: 'Фильтруйте коллекции по хронологическим периодам и типам документов (грамоты, указы, мемуары).',
    whyUseful: 'Прямой доступ к первоисточникам для курсовых по отечественной истории.'
  },
  {
    id: 'jstor_open',
    title: 'JSTOR (Open Access Humanities)',
    shortName: 'JSTOR Open Access',
    url: 'https://www.jstor.org/open',
    discipline: 'История, Литература, Философия, Антропология, Антиковедение',
    category: 'ALL',
    accessType: 'Open Access + Бесплатный аккаунт (100 статей в месяц)',
    isRussian: false,
    description: 'Мировой авторитет №1 в области гуманитарных наук. Тысячи открытых рецензируемых монографий и статей от издательств Oxford, Cambridge, Harvard.',
    searchTips: 'Вбивайте термины на английском и используйте встроенный в наш терминал переводчик для анализа аннотаций.',
    whyUseful: 'Необходим для введения в курсовую международной историографии и зарубежного научного контекста.'
  },
  {
    id: 'doaj',
    title: 'DOAJ (Directory of Open Access Journals)',
    shortName: 'DOAJ Humanities',
    url: 'https://doaj.org',
    discipline: 'Languages, Literature, History, Philosophy, Art',
    category: 'ALL',
    accessType: '100% Открытый доступ (Open Access)',
    isRussian: false,
    description: 'Глобальный независимый каталог высокорейтинговых рецензируемых журналов открытого доступа без пэйволлов и скрытых подписок.',
    searchTips: 'Выбирайте предметный фильтр: Languages and Literatures, History, Philosophy.',
    whyUseful: 'Гарантия отсутствия псевдонаучных «хищнических» журналов благодаря строгой международной аккредитации.'
  }
];

export const TabScience: React.FC<TabScienceProps> = ({
  links = [],
  categories = [],
  onAddCategory,
  onAddScientificLink
}) => {
  // Navigation inside Science Tab:
  // 1. 'catalog': Curated databases
  // 2. 'ai_finder': Neural network assistant to find open databases
  // 3. 'translator': Academic article translator
  // 4. 'guide': Walkthrough & essence of scientific databases
  const [currentSection, setCurrentSection] = useState<'catalog' | 'ai_finder' | 'translator' | 'guide'>('catalog');

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

  // Discipline Filter for Catalog
  const [selectedDiscipline, setSelectedDiscipline] = useState<string>('ALL');

  // AI Finder state
  const [aiTopic, setAiTopic] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResults, setAiResults] = useState<{
    aiMode?: AIDataMode;
    webSources?: Array<{ title: string; uri: string }>;
    databases: Array<{
      title: string;
      url: string;
      discipline: string;
      accessType: string;
      description: string;
      searchTips: string;
    }>;
    methodologyAdvice: string;
  } | null>(null);

  // Translator state
  const [transInput, setTransInput] = useState('');
  const [transContext, setTransContext] = useState('');
  const [transLoading, setTransLoading] = useState(false);
  const [transOutput, setTransOutput] = useState<{
    translatedText: string;
    detectedLang: string;
    academicNotes: string;
    keyTerms: Array<{ term: string; translation: string; note: string }>;
  } | null>(null);
  const [copiedTrans, setCopiedTrans] = useState(false);

  // Notification / toast feedback
  const [addedDbTitle, setAddedDbTitle] = useState<string | null>(null);

  // Connection configuration dialog for adding a database to monitoring
  const [configuringDb, setConfiguringDb] = useState<{
    title: string;
    url: string;
    discipline: string;
    description: string;
  } | null>(null);
  useModalScrollLock(Boolean(configuringDb));
  const [cfgCategory, setCfgCategory] = useState<string>('HUMANITIES');
  const [cfgInterval, setCfgInterval] = useState<number>(60);
  const [cfgIsCustomInterval, setCfgIsCustomInterval] = useState<boolean>(false);
  const [cfgCustomIntervalVal, setCfgCustomIntervalVal] = useState<number>(45);
  const [cfgNotify, setCfgNotify] = useState<boolean>(true);
  const [cfgIsAddingNewCat, setCfgIsAddingNewCat] = useState<boolean>(false);
  const [cfgNewCatName, setCfgNewCatName] = useState<string>('');

  // Open config modal before connecting database
  const handleOpenConnectModal = (db: { title: string; url: string; discipline: string; description: string }) => {
    pipAudio.playClick();
    setConfiguringDb(db);
    // Find initial category: prefer HUMANITIES or first available category
    const defaultCat = categories.find((c) => c.id === 'HUMANITIES')?.id || categories[0]?.id || 'GENERAL';
    setCfgCategory(defaultCat);
    setCfgInterval(60);
    setCfgIsCustomInterval(false);
    setCfgCustomIntervalVal(45);
    setCfgNotify(true);
    setCfgIsAddingNewCat(false);
    setCfgNewCatName('');
  };

  const handleCreateNewCategoryInScience = () => {
    const trimmed = cfgNewCatName.trim();
    if (!trimmed) return;
    pipAudio.playSuccess();
    const newId = 'CAT_' + Date.now();
    if (onAddCategory) {
      onAddCategory({
        id: newId,
        name: trimmed.toUpperCase(),
        isDefault: false
      });
    }
    setCfgCategory(newId);
    setCfgNewCatName('');
    setCfgIsAddingNewCat(false);
  };

  // Confirm connection of DB with customized category & interval
  const handleConfirmConnectDb = () => {
    if (!configuringDb) return;
    pipAudio.playSuccess();

    const effectiveInterval = cfgIsCustomInterval
      ? Math.max(10, Math.min(86400, Number(cfgCustomIntervalVal) || 60))
      : Number(cfgInterval) || 60;

    onAddScientificLink({
      title: configuringDb.title,
      url: configuringDb.url,
      category: cfgCategory,
      tags: ['наука', 'гуманитарный', configuringDb.discipline.split(',')[0].trim().toLowerCase()],
      checkIntervalSec: effectiveInterval,
      autoRefresh: true,
      notificationEnabled: cfgNotify,
      isScientific: true,
      contentSnippet: configuringDb.description.slice(0, 100),
      scientificMeta: {
        query: configuringDb.title,
        source: configuringDb.title,
        discipline: configuringDb.discipline
      }
    });

    const title = configuringDb.title;
    setConfiguringDb(null);
    setAddedDbTitle(title);
    setTimeout(() => setAddedDbTitle(null), 3000);
  };

  // Direct quick-add fallback
  const handleAddDatabaseToMonitor = (db: { title: string; url: string; discipline: string; description: string }) => {
    handleOpenConnectModal(db);
  };

  // AI Finder submit
  const handleFindDatabasesWithAI = async (presetTopic?: string, overrideMode?: AIDataMode) => {
    const queryToUse = (presetTopic || aiTopic).trim();
    if (!queryToUse) return;

    const effectiveMode = overrideMode || aiMode;
    if (overrideMode && overrideMode !== aiMode) {
      handleModeChange(overrideMode);
    }

    setAiLoading(true);
    pipAudio.playClick();

    const appSnapshot = collectAppInternalDataSnapshot(links);

    try {
      const res = await fetch('/api/ai/find-databases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: queryToUse,
          aiMode: effectiveMode,
          attachedSites: links.map((l) => ({
            id: l.id,
            title: l.title,
            url: l.url,
            category: l.category,
            status: l.status,
            contentSnippet: l.contentSnippet,
            writtenContent: l.writtenContent
          })),
          appData: appSnapshot
        })
      });

      if (!res.ok) throw new Error('Ошибка сервера');
      const data = await res.json();
      setAiResults(data);
      pipAudio.playSuccess();
    } catch (err) {
      console.error(err);
      pipAudio.playAlert();
    } finally {
      setAiLoading(false);
    }
  };

  // Academic Translator submit
  const handleTranslateArticle = async () => {
    const textToTranslate = transInput.trim();
    if (!textToTranslate) return;

    setTransLoading(true);
    pipAudio.playClick();

    try {
      const res = await fetch('/api/ai/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: textToTranslate,
          context: transContext || 'Гуманитарная научная статья / аннотация',
          targetLang: 'ru'
        })
      });

      if (!res.ok) throw new Error('Ошибка при переводе');
      const data = await res.json();
      setTransOutput(data);
      pipAudio.playSuccess();
    } catch (err) {
      console.error(err);
      pipAudio.playAlert();
    } finally {
      setTransLoading(false);
    }
  };

  const handleCopyTranslation = () => {
    if (!transOutput?.translatedText) return;
    navigator.clipboard.writeText(transOutput.translatedText);
    setCopiedTrans(true);
    pipAudio.playClick();
    setTimeout(() => setCopiedTrans(false), 2000);
  };

  // Sample texts for instant translation demonstration
  const sampleAbstracts = [
    {
      label: 'Философия (Фуко / Дискурс)',
      text: 'Discourse is not simply that which translates struggles or systems of domination, but that for which and by which there is struggle, the power which is to be seized. The archaeology of knowledge examines epistemic ruptures rather than continuous progress.'
    },
    {
      label: 'История (Школа «Анналов»)',
      text: 'Historical inquiry requires examining the longue durée rather than episodic political history. The collective mentalities of medieval agrarian societies shaped structural transformations across centuries, demonstrating how socio-economic inertia constrains individual agency.'
    },
    {
      label: 'Литературоведение (Нарратология)',
      text: 'The diegetic levels within modernist prose construct an intradiegetic focalization that destabilizes the omniscient narrator. Through heteroglossia and polyphony, the novel deconstructs monologic ideological authority.'
    }
  ];

  // Filtered databases
  const filteredDatabases = HUMANITIES_DATABASES.filter((db) => {
    if (selectedDiscipline === 'ALL') return true;
    if (selectedDiscipline === 'RUSSIAN') return db.isRussian;
    if (selectedDiscipline === 'FOREIGN') return !db.isRussian;
    return db.category === selectedDiscipline;
  });

  return (
    <div className="space-y-6">
      {/* Tab Header & Sub-navigation */}
      <div className="bg-[#0b160e] border-2 border-[var(--crt-phosphor-dim)] rounded-xl p-4 sm:p-5 shadow-lg relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[var(--crt-phosphor-bright)] mb-1">
              <BookOpen size={20} />
              <h2 className="text-lg sm:text-xl font-bold tracking-wider uppercase">
                НАУЧНЫЙ ОТДЕЛ: ГУМАНИТАРНЫЙ ЦЕНТР
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-[var(--crt-phosphor)]/80 max-w-2xl leading-relaxed">
              Открытые научные базы данных, академический переводчик зарубежных статей и ИИ-поиск первоисточников для курсовых, дипломов и семинаров.
            </p>
          </div>

          {/* Sub-tab Switchers */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                pipAudio.playClick();
                setCurrentSection('catalog');
              }}
              className={`px-3 py-2 rounded-lg text-xs font-bold uppercase transition-all flex items-center gap-1.5 cursor-pointer ${
                currentSection === 'catalog'
                  ? 'bg-[var(--crt-phosphor)] text-black font-extrabold shadow-[0_0_12px_var(--crt-glow)]'
                  : 'bg-[#132417] text-[var(--crt-phosphor-bright)] hover:bg-[#1a3321] border border-[var(--crt-phosphor-dim)]'
              }`}
            >
              <Library size={14} />
              Каталог баз
            </button>

            <button
              onClick={() => {
                pipAudio.playClick();
                setCurrentSection('translator');
              }}
              className={`px-3 py-2 rounded-lg text-xs font-bold uppercase transition-all flex items-center gap-1.5 cursor-pointer ${
                currentSection === 'translator'
                  ? 'bg-[var(--crt-phosphor)] text-black font-extrabold shadow-[0_0_12px_var(--crt-glow)]'
                  : 'bg-[#132417] text-[var(--crt-phosphor-bright)] hover:bg-[#1a3321] border border-[var(--crt-phosphor-dim)]'
              }`}
            >
              <Languages size={14} />
              Переводчик статей
            </button>

            <button
              onClick={() => {
                pipAudio.playClick();
                setCurrentSection('ai_finder');
              }}
              className={`px-3 py-2 rounded-lg text-xs font-bold uppercase transition-all flex items-center gap-1.5 cursor-pointer ${
                currentSection === 'ai_finder'
                  ? 'bg-[var(--crt-phosphor)] text-black font-extrabold shadow-[0_0_12px_var(--crt-glow)]'
                  : 'bg-[#132417] text-[var(--crt-phosphor-bright)] hover:bg-[#1a3321] border border-[var(--crt-phosphor-dim)]'
              }`}
            >
              <Sparkles size={14} />
              ИИ-поиск баз
            </button>

            <button
              onClick={() => {
                pipAudio.playClick();
                setCurrentSection('guide');
              }}
              className={`px-3 py-2 rounded-lg text-xs font-bold uppercase transition-all flex items-center gap-1.5 cursor-pointer ${
                currentSection === 'guide'
                  ? 'bg-[var(--crt-phosphor)] text-black font-extrabold shadow-[0_0_12px_var(--crt-glow)]'
                  : 'bg-[#132417] text-[var(--crt-phosphor-bright)] hover:bg-[#1a3321] border border-[var(--crt-phosphor-dim)]'
              }`}
            >
              <HelpCircle size={14} />
              Гайд по базам
            </button>
          </div>
        </div>

        {/* Success toast alert */}
        {addedDbTitle && (
          <div className="mt-4 p-3 bg-[var(--crt-phosphor)]/20 border border-[var(--crt-phosphor)] rounded-lg flex items-center gap-2 text-xs sm:text-sm text-[var(--crt-phosphor-bright)] animate-fade-in">
            <ShieldCheck size={16} />
            <span>База данных «<strong>{addedDbTitle}</strong>» успешно добавлена в ваш список мониторинга ссылок!</span>
          </div>
        )}
      </div>

      {/* SECTION 1: CATALOG OF HUMANITIES DATABASES */}
      {currentSection === 'catalog' && (
        <div className="space-y-5">
          {/* Discipline Filters */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-[#08120a] p-3 rounded-lg border border-[var(--crt-phosphor-dim)]/60">
            <div className="flex items-center gap-2 text-xs font-bold text-[var(--crt-phosphor-bright)] uppercase">
              <Compass size={14} />
              <span>Дисциплина:</span>
            </div>

            <div className="flex flex-wrap gap-1.5 text-xs">
              {[
                { id: 'ALL', label: 'Все базы' },
                { id: 'RUSSIAN', label: '🇷🇺 На русском' },
                { id: 'HISTORY', label: 'История & Архивы' },
                { id: 'PHILOLOGY', label: 'Филология & Литература' },
                { id: 'PHILOSOPHY', label: 'Философия & Общество' },
                { id: 'FOREIGN', label: '🌍 Международные' }
              ].map((chip) => (
                <button
                  key={chip.id}
                  onClick={() => {
                    pipAudio.playClick();
                    setSelectedDiscipline(chip.id);
                  }}
                  className={`px-2.5 py-1 rounded text-xs transition-colors cursor-pointer ${
                    selectedDiscipline === chip.id
                      ? 'bg-[var(--crt-phosphor)] text-black font-bold'
                      : 'bg-[#112014] text-[var(--crt-phosphor)] hover:bg-[#182e1d] border border-[var(--crt-phosphor-dim)]/50'
                  }`}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>

          {/* Database Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredDatabases.map((db) => (
              <div
                key={db.id}
                className="bg-[#0b160e] border-2 border-[var(--crt-phosphor-dim)]/70 hover:border-[var(--crt-phosphor)] rounded-xl p-4 sm:p-5 flex flex-col justify-between transition-all group hover:shadow-[0_0_20px_var(--crt-glow)]"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-[var(--crt-phosphor-dim)]/40 text-[var(--crt-phosphor-bright)] border border-[var(--crt-phosphor-dim)] mb-1">
                        {db.accessType}
                      </span>
                      <h3 className="text-base sm:text-lg font-bold text-[var(--crt-phosphor-bright)] group-hover:text-[var(--crt-phosphor)] transition-colors">
                        {db.title}
                      </h3>
                    </div>

                    <a
                      href={db.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 bg-[#142618] hover:bg-[var(--crt-phosphor)] hover:text-black rounded border border-[var(--crt-phosphor-dim)] transition-colors cursor-pointer"
                      title="Открыть сайт базы"
                    >
                      <ExternalLink size={16} />
                    </a>
                  </div>

                  <p className="text-xs text-[var(--crt-phosphor)]/90 mb-3 leading-relaxed">
                    {db.description}
                  </p>

                  <div className="space-y-2 text-[11px] bg-[#071109] p-3 rounded-lg border border-[var(--crt-phosphor-dim)]/40 mb-4">
                    <div className="text-[var(--crt-phosphor)]/80">
                      <strong className="text-[var(--crt-phosphor-bright)]">Профиль:</strong> {db.discipline}
                    </div>
                    <div className="text-[var(--crt-phosphor)]/80">
                      <strong className="text-[var(--crt-phosphor-bright)]">Польза для студента:</strong> {db.whyUseful}
                    </div>
                    <div className="text-[var(--crt-phosphor-bright)]">
                      <strong className="text-[var(--crt-phosphor)]">Совет по поиску:</strong> <em>{db.searchTips}</em>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-[var(--crt-phosphor-dim)]/40">
                  <button
                    onClick={() => handleAddDatabaseToMonitor(db)}
                    className="flex-1 py-2 px-3 bg-[#132717] hover:bg-[var(--crt-phosphor)] hover:text-black text-[var(--crt-phosphor-bright)] border border-[var(--crt-phosphor-dim)] rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    <BookmarkPlus size={14} />
                    Добавить в мониторинг
                  </button>

                  <a
                    href={db.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-2 px-3 bg-[#0c1a10] hover:bg-[#1a3320] text-[var(--crt-phosphor)] border border-[var(--crt-phosphor-dim)] rounded-lg text-xs font-bold transition-colors flex items-center gap-1"
                  >
                    <span>Перейти</span>
                    <ArrowRight size={13} />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SECTION 2: ACADEMIC ARTICLE TRANSLATOR */}
      {currentSection === 'translator' && (
        <div className="space-y-6">
          <div className="bg-[#0b160e] border-2 border-[var(--crt-phosphor-dim)] rounded-xl p-4 sm:p-5">
            <div className="flex items-center gap-2 text-[var(--crt-phosphor-bright)] mb-2">
              <Languages size={20} />
              <h3 className="text-base sm:text-lg font-bold uppercase tracking-wider">
                АКАДЕМИЧЕСКИЙ ПЕРЕВОДЧИК СТАТЕЙ И АННОТАЦИЙ
              </h3>
            </div>
            <p className="text-xs sm:text-sm text-[var(--crt-phosphor)]/80 leading-relaxed mb-4">
              Специализированный ИИ-переводчик для гуманитарных исследований. В отличие от общих переводчиков, он точно сохраняет философские категории, терминологию нарратологии, историографии, латинские выражения (<em>de facto, status quo, op. cit.</em>) и формирует научный стиль изложения на русском языке.
            </p>

            {/* Presets */}
            <div className="mb-4">
              <span className="text-[11px] font-bold text-[var(--crt-phosphor-bright)] block mb-1.5 uppercase">
                Быстрые примеры фрагментов (нажмите для проверки):
              </span>
              <div className="flex flex-wrap gap-2">
                {sampleAbstracts.map((sample, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      pipAudio.playClick();
                      setTransInput(sample.text);
                      setTransContext(sample.label);
                    }}
                    className="text-xs px-2.5 py-1 bg-[#122216] hover:bg-[#1d3523] border border-[var(--crt-phosphor-dim)] rounded text-[var(--crt-phosphor)] transition-colors cursor-pointer"
                  >
                    {sample.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Translation Input Area */}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-[var(--crt-phosphor-bright)] mb-1 uppercase">
                  Иностранный текст (аннотация, цитата, тезисы):
                </label>
                <textarea
                  value={transInput}
                  onChange={(e) => setTransInput(e.target.value)}
                  placeholder="Вставьте сюда текст на английском, французском, немецком или латыни..."
                  rows={5}
                  className="w-full bg-[#071109] border border-[var(--crt-phosphor-dim)] focus:border-[var(--crt-phosphor)] rounded-lg p-3 text-xs sm:text-sm text-[var(--crt-phosphor-bright)] font-mono outline-none transition-colors"
                />
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <input
                  type="text"
                  value={transContext}
                  onChange={(e) => setTransContext(e.target.value)}
                  placeholder="Контекст (например: историография средних веков, лингвистика, семиотика)"
                  className="flex-1 bg-[#071109] border border-[var(--crt-phosphor-dim)] rounded-lg px-3 py-2 text-xs text-[var(--crt-phosphor)] outline-none"
                />

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      pipAudio.playClick();
                      setTransInput('');
                      setTransOutput(null);
                    }}
                    className="px-3 py-2 bg-[#121f14] hover:bg-[#1a2d1e] text-[var(--crt-phosphor)] border border-[var(--crt-phosphor-dim)] rounded-lg text-xs cursor-pointer flex items-center gap-1"
                  >
                    <RotateCcw size={14} />
                    Очистить
                  </button>

                  <button
                    onClick={handleTranslateArticle}
                    disabled={transLoading || !transInput.trim()}
                    className="px-5 py-2 bg-[var(--crt-phosphor)] hover:bg-[var(--crt-phosphor-bright)] disabled:opacity-50 text-black font-bold text-xs uppercase rounded-lg transition-all shadow-[0_0_15px_var(--crt-glow)] flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {transLoading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                        <span>Выполняю перевод...</span>
                      </>
                    ) : (
                      <>
                        <Languages size={15} />
                        <span>Перевести на русский</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Translation Results */}
            {transOutput && (
              <div className="mt-6 space-y-4 pt-6 border-t-2 border-[var(--crt-phosphor-dim)] animate-fade-in">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-[var(--crt-phosphor)]/20 text-[var(--crt-phosphor-bright)] border border-[var(--crt-phosphor)] rounded text-[11px] font-bold">
                      Исходный язык: {transOutput.detectedLang}
                    </span>
                    <span className="text-xs text-[var(--crt-phosphor)]/80">
                      Академический перевод
                    </span>
                  </div>

                  <button
                    onClick={handleCopyTranslation}
                    className="px-3 py-1 bg-[#132517] hover:bg-[#1c3621] border border-[var(--crt-phosphor-dim)] rounded text-xs text-[var(--crt-phosphor-bright)] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    {copiedTrans ? (
                      <>
                        <Check size={14} className="text-green-400" />
                        <span>Скопировано!</span>
                      </>
                    ) : (
                      <>
                        <Copy size={14} />
                        <span>Копировать перевод</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Translated Text Block */}
                <div className="bg-[#071309] border-2 border-[var(--crt-phosphor)] rounded-xl p-4 sm:p-5 shadow-inner">
                  <p className="text-xs sm:text-sm text-[var(--crt-phosphor-bright)] font-sans leading-relaxed whitespace-pre-wrap selection:bg-[var(--crt-phosphor)] selection:text-black">
                    {transOutput.translatedText}
                  </p>
                </div>

                {/* Academic Notes & Glossary */}
                <div className="bg-[#09150b] border border-[var(--crt-phosphor-dim)] rounded-lg p-3 sm:p-4 space-y-3">
                  <div className="flex items-start gap-2 text-xs text-[var(--crt-phosphor)]/90">
                    <Info size={15} className="text-[var(--crt-phosphor-bright)] shrink-0 mt-0.5" />
                    <span><strong>Комментарий переводчика:</strong> {transOutput.academicNotes}</span>
                  </div>

                  {transOutput.keyTerms && transOutput.keyTerms.length > 0 && (
                    <div>
                      <span className="text-[11px] font-bold text-[var(--crt-phosphor-bright)] block mb-1.5 uppercase">
                        Специализированные термины и концепты:
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {transOutput.keyTerms.map((t, idx) => (
                          <div key={idx} className="bg-[#071108] p-2.5 rounded border border-[var(--crt-phosphor-dim)]/50 text-xs">
                            <div className="font-bold text-[var(--crt-phosphor-bright)]">
                              {t.term} → <span className="text-white">{t.translation}</span>
                            </div>
                            <div className="text-[11px] text-[var(--crt-phosphor)]/75 mt-0.5">
                              {t.note}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SECTION 3: AI DATABASE FINDER */}
      {currentSection === 'ai_finder' && (
        <div className="space-y-6">
          <div className="bg-[#0b160e] border-2 border-[var(--crt-phosphor-dim)] rounded-xl p-4 sm:p-5 space-y-4">
            <div>
              <div className="flex items-center gap-2 text-[var(--crt-phosphor-bright)] mb-1">
                <Sparkles size={20} />
                <h3 className="text-base sm:text-lg font-bold uppercase tracking-wider">
                  ИИ-АССИСТЕНТ: ПОИСК ДОСТУПНЫХ НАУЧНЫХ БАЗ
                </h3>
              </div>
              <p className="text-xs sm:text-sm text-[var(--crt-phosphor)]/80 leading-relaxed">
                Опишите своими словами, какую тему или дисциплину вы изучаете. В <strong>Режиме 1 (Локально)</strong> нейросеть подбирает базы строго из ваших прикреплённых сайтов ({links.length} шт.) и встроенного каталога терминала с учетом вашего расписания и предметов. В <strong>Режиме 2 (+ Интернет)</strong> подключается глобальный поиск внешних архивов.
              </p>
            </div>

            {/* AI Mode Switcher */}
            <AIModeSwitch mode={aiMode} onChange={handleModeChange} showDescription={true} />

            {/* Quick Topic Chips */}
            <div>
              <span className="text-[11px] font-bold text-[var(--crt-phosphor-bright)] block mb-1.5 uppercase">
                Примеры тем исследований для гуманитариев:
              </span>
              <div className="flex flex-wrap gap-2">
                {[
                  'История СССР 1920-х (НЭП и коллективизация)',
                  'Русский литературный авангард и футуризм',
                  'Античная философия и стоицизм',
                  'Социология молодежных субкультур',
                  'Историческая память и коммеморация',
                  'Корпусная лингвистика и частотные словари'
                ].map((chipTopic, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setAiTopic(chipTopic);
                      handleFindDatabasesWithAI(chipTopic);
                    }}
                    className="text-xs px-2.5 py-1 bg-[#122216] hover:bg-[#1e3824] border border-[var(--crt-phosphor-dim)] rounded text-[var(--crt-phosphor)] transition-colors cursor-pointer"
                  >
                    {chipTopic}
                  </button>
                ))}
              </div>
            </div>

            {/* Query Form */}
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={aiTopic}
                  onChange={(e) => setAiTopic(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleFindDatabasesWithAI()}
                  placeholder={
                    aiMode === 'local'
                      ? 'Режим 1 (Локально): введите тему для подбора по сайтам и каталогу терминала...'
                      : 'Режим 2 (+ Интернет): введите тему для поиска в приложении и внешнем Интернете...'
                  }
                  className="w-full bg-[#071109] border border-[var(--crt-phosphor-dim)] focus:border-[var(--crt-phosphor)] rounded-lg px-4 py-2.5 text-xs sm:text-sm text-[var(--crt-phosphor-bright)] outline-none"
                />
              </div>

              <button
                onClick={() => handleFindDatabasesWithAI()}
                disabled={aiLoading || !aiTopic.trim()}
                className="px-5 py-2.5 bg-[var(--crt-phosphor)] hover:bg-[var(--crt-phosphor-bright)] disabled:opacity-50 text-black font-bold text-xs uppercase rounded-lg transition-all shadow-[0_0_15px_var(--crt-glow)] flex items-center justify-center gap-2 cursor-pointer shrink-0"
              >
                {aiLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                    <span>{aiMode === 'local' ? 'Локальный подбор...' : 'Глобальный поиск...'}</span>
                  </>
                ) : (
                  <>
                    <Send size={15} />
                    <span>{aiMode === 'local' ? 'Подобрать (Режим 1)' : 'Найти (+ Интернет)'}</span>
                  </>
                )}
              </button>
            </div>

            {/* AI Results */}
            {aiResults && (
              <div className="mt-6 space-y-4 pt-6 border-t-2 border-[var(--crt-phosphor-dim)] animate-fade-in">
                <div className="p-3 bg-[#08130a] border border-[var(--crt-phosphor-dim)] rounded-lg text-xs text-[var(--crt-phosphor-bright)] space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--crt-phosphor-dim)]/40 pb-2">
                    <div className="flex items-center gap-1.5 font-bold">
                      {aiResults.aiMode === 'web' ? (
                        <>
                          <Globe size={14} className="text-amber-400" />
                          <span className="text-amber-300">РЕЖИМ 2: ДАННЫЕ ПРИЛОЖЕНИЯ + ИНТЕРНЕТ</span>
                        </>
                      ) : (
                        <>
                          <Lock size={14} className="text-[var(--crt-phosphor)]" />
                          <span>РЕЖИМ 1: СТРОГО ЛОКАЛЬНЫЙ КОНТУР ТЕРМИНАЛА</span>
                        </>
                      )}
                    </div>

                    {aiResults.aiMode !== 'web' && (
                      <button
                        type="button"
                        disabled={aiLoading}
                        onClick={() => handleFindDatabasesWithAI(aiTopic, 'web')}
                        className="px-2.5 py-1 bg-amber-400 hover:bg-amber-300 text-black font-bold text-[11px] rounded flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <Globe size={12} />
                        <span>Расширить поиск во 2-м режиме (+ Интернет)</span>
                      </button>
                    )}
                  </div>

                  <div className="flex items-start gap-2">
                    <ShieldCheck size={16} className="text-[var(--crt-phosphor)] shrink-0 mt-0.5" />
                    <div>
                      <strong>Совет методиста по библиографии:</strong> {aiResults.methodologyAdvice}
                    </div>
                  </div>

                  {aiResults.webSources && aiResults.webSources.length > 0 && (
                    <div className="pt-2 border-t border-[var(--crt-phosphor-dim)]/30 space-y-1">
                      <span className="text-[10px] text-amber-300 uppercase font-bold flex items-center gap-1">
                        <Globe size={11} /> Внешние источники Google Search:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {aiResults.webSources.map((ws, wIdx) => (
                          <a
                            key={wIdx}
                            href={ws.uri}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-black border border-amber-500/40 text-amber-200 hover:border-amber-400"
                          >
                            <ExternalLink size={10} />
                            <span className="truncate max-w-[200px]">{ws.title}</span>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {aiResults.databases.map((rec, idx) => (
                    <div
                      key={idx}
                      className="bg-[#08140a] border border-[var(--crt-phosphor-dim)] hover:border-[var(--crt-phosphor)] rounded-xl p-4 flex flex-col justify-between transition-all"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <div>
                            <span className="inline-block text-[10px] font-bold uppercase text-[var(--crt-phosphor-dim)] bg-[var(--crt-phosphor)]/10 px-2 py-0.5 rounded border border-[var(--crt-phosphor-dim)]/50 mb-1">
                              {rec.accessType}
                            </span>
                            <h4 className="text-base font-bold text-[var(--crt-phosphor-bright)]">
                              {rec.title}
                            </h4>
                          </div>

                          <a
                            href={rec.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 bg-[#122216] hover:bg-[var(--crt-phosphor)] hover:text-black rounded border border-[var(--crt-phosphor-dim)]"
                            title="Открыть базу"
                          >
                            <ExternalLink size={15} />
                          </a>
                        </div>

                        <p className="text-xs text-[var(--crt-phosphor)]/90 mb-2 leading-relaxed">
                          {rec.description}
                        </p>

                        <div className="text-[11px] bg-[#050e07] p-2.5 rounded border border-[var(--crt-phosphor-dim)]/30 space-y-1 mb-3">
                          <div>
                            <span className="font-bold text-[var(--crt-phosphor-bright)]">Дисциплина:</span> {rec.discipline}
                          </div>
                          <div>
                            <span className="font-bold text-[var(--crt-phosphor-bright)]">Как искать:</span> <em>{rec.searchTips}</em>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-2 border-t border-[var(--crt-phosphor-dim)]/30">
                        <button
                          onClick={() => handleAddDatabaseToMonitor(rec)}
                          className="flex-1 py-1.5 px-3 bg-[#132717] hover:bg-[var(--crt-phosphor)] hover:text-black text-[var(--crt-phosphor-bright)] border border-[var(--crt-phosphor-dim)] rounded text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <BookmarkPlus size={13} />
                          Добавить в мониторинг
                        </button>

                        <a
                          href={rec.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="py-1.5 px-3 bg-[#0c1a10] hover:bg-[#1a3320] text-[var(--crt-phosphor)] border border-[var(--crt-phosphor-dim)] rounded text-xs font-bold transition-colors flex items-center gap-1"
                        >
                          <span>Перейти</span>
                          <ArrowRight size={13} />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SECTION 4: EDUCATIONAL GUIDE FOR HUMANITIES STUDENTS */}
      {currentSection === 'guide' && (
        <div className="space-y-6">
          <div className="bg-[#0b160e] border-2 border-[var(--crt-phosphor-dim)] rounded-xl p-5 sm:p-6 space-y-6">
            <div className="flex items-center gap-3 text-[var(--crt-phosphor-bright)] border-b border-[var(--crt-phosphor-dim)] pb-4">
              <Scroll size={24} />
              <div>
                <h3 className="text-lg sm:text-xl font-bold uppercase tracking-wider">
                  ГАЙД ПО ЭКСПЛУАТАЦИИ НАУЧНЫХ БАЗ ДЛЯ СТУДЕНТА-ГУМАНИТАРИЯ
                </h3>
                <span className="text-xs text-[var(--crt-phosphor)]/75">
                  Полное руководство по поиску первоисточников, монографий и рецензируемых статей
                </span>
              </div>
            </div>

            {/* Guide Card 1 */}
            <div className="bg-[#071309] border border-[var(--crt-phosphor-dim)] rounded-xl p-4 sm:p-5 space-y-2.5">
              <div className="flex items-center gap-2 text-[var(--crt-phosphor-bright)] text-sm sm:text-base font-bold">
                <span className="w-6 h-6 rounded-full bg-[var(--crt-phosphor)] text-black flex items-center justify-center text-xs font-black">
                  1
                </span>
                В ЧЕМ СУТЬ НАУЧНЫХ БАЗ И ЧЕМ ОНИ ОТЛИЧАЮТСЯ ОТ ОБЫЧНОГО ПОИСКА?
              </div>
              <p className="text-xs sm:text-sm text-[var(--crt-phosphor)]/90 leading-relaxed">
                Поисковики вроде Яндекса или Google индексируют любые сайты: блоги, студенческие рефератные помойки, рекламные материалы и форумы. Для курсовой, диплома (ВКР) или семинара такие источники использовать нельзя — научный руководитель их сразу забракует.
              </p>
              <div className="bg-[#0a1a0d] p-3 rounded-lg border border-[var(--crt-phosphor-dim)]/50 text-xs space-y-1">
                <div><strong>Научная база данных</strong> — это архив проверенных, рецензируемых научных трудов:</div>
                <ul className="list-disc list-inside space-y-1 text-[var(--crt-phosphor)]/80 mt-1 pl-2">
                  <li><strong>Рецензирование (Peer Review):</strong> каждую статью перед публикацией анонимно проверяют 2–3 доктора или кандидата наук.</li>
                  <li><strong>Список ВАК:</strong> издания, признанные Высшей аттестационной комиссией РФ для защиты диссертаций.</li>
                  <li><strong>РИНЦ (Российский индекс научного цитирования):</strong> национальная библиографическая база, учитывающая цитируемость и авторитет авторов.</li>
                </ul>
              </div>
            </div>

            {/* Guide Card 2 */}
            <div className="bg-[#071309] border border-[var(--crt-phosphor-dim)] rounded-xl p-4 sm:p-5 space-y-2.5">
              <div className="flex items-center gap-2 text-[var(--crt-phosphor-bright)] text-sm sm:text-base font-bold">
                <span className="w-6 h-6 rounded-full bg-[var(--crt-phosphor)] text-black flex items-center justify-center text-xs font-black">
                  2
                </span>
                СПЕЦИФИКА ГУМАНИТАРНОГО ПОИСКА: ПЕРВОИСТОЧНИКИ И ИСТОРИОГРАФИЯ
              </div>
              <p className="text-xs sm:text-sm text-[var(--crt-phosphor)]/90 leading-relaxed">
                В гуманитарных науках (история, филология, философия, культурология) все исследования делятся на два ключевых пласта:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs mt-2">
                <div className="bg-[#0b1a0e] p-3 rounded-lg border border-[var(--crt-phosphor-dim)]/60">
                  <div className="font-bold text-[var(--crt-phosphor-bright)] mb-1">
                    📜 Первоисточники (Primary Sources)
                  </div>
                  <p className="text-[var(--crt-phosphor)]/80 leading-relaxed">
                    Тексты эпохи: архивные документы, указы, мемуары, письма, дневники, канонические художественные произведения. Их ищут в <strong>НЭБ</strong>, <strong>ФЭБ</strong>, <strong>Президентской библиотеке</strong> и архивах.
                  </p>
                </div>

                <div className="bg-[#0b1a0e] p-3 rounded-lg border border-[var(--crt-phosphor-dim)]/60">
                  <div className="font-bold text-[var(--crt-phosphor-bright)] mb-1">
                    📚 Историография & Исследования (Secondary Sources)
                  </div>
                  <p className="text-[var(--crt-phosphor)]/80 leading-relaxed">
                    Что написали об этом ученые: монографии, статьи, диссертации. Их ищут в <strong>КиберЛенинке</strong>, <strong>eLIBRARY</strong>, <strong>ИНИОН РАН</strong> и <strong>Журнальном Зале</strong>.
                  </p>
                </div>
              </div>
            </div>

            {/* Guide Card 3 */}
            <div className="bg-[#071309] border border-[var(--crt-phosphor-dim)] rounded-xl p-4 sm:p-5 space-y-2.5">
              <div className="flex items-center gap-2 text-[var(--crt-phosphor-bright)] text-sm sm:text-base font-bold">
                <span className="w-6 h-6 rounded-full bg-[var(--crt-phosphor)] text-black flex items-center justify-center text-xs font-black">
                  3
                </span>
                ПРАКТИЧЕСКИЕ ХИТРОСТИ ПОИСКА В НАУЧНЫХ БАЗАХ
              </div>
              <div className="space-y-2 text-xs sm:text-sm text-[var(--crt-phosphor)]/90">
                <div className="bg-[#08150a] p-3 rounded border border-[var(--crt-phosphor-dim)]/40">
                  <strong className="text-[var(--crt-phosphor-bright)]">1. Поиск по цитате и кавычки:</strong><br />
                  Если ищете устойчивый термин («историческая память», «картина мира», «семантическое поле»), всегда берите его в кавычки, чтобы база не искала слова вразброс.
                </div>
                <div className="bg-[#08150a] p-3 rounded border border-[var(--crt-phosphor-dim)]/40">
                  <strong className="text-[var(--crt-phosphor-bright)]">2. Метод «снежного кома»:</strong><br />
                  Найдите одну отличную недавнюю статью по вашей теме (за последние 3-5 лет). Откройте в ее конце раздел «Список литературы» — там уже собран готовый золотой фонд библиографии по вашей теме!
                </div>
                <div className="bg-[#08150a] p-3 rounded border border-[var(--crt-phosphor-dim)]/40">
                  <strong className="text-[var(--crt-phosphor-bright)]">3. Зарубежные базы и переводчик:</strong><br />
                  В престижных курсовых ценится привлечение зарубежных публикаций. Найдите статью в <strong>JSTOR</strong> или <strong>DOAJ</strong>, скопируйте ее аннотацию в наш встроенный <strong>«Переводчик статей»</strong>, и вы сразу поймете суть концепции зарубежного автора.
                </div>
              </div>
            </div>

            {/* Guide Card 4: How to cite according to GOST */}
            <div className="bg-[#071309] border border-[var(--crt-phosphor-dim)] rounded-xl p-4 sm:p-5 space-y-2.5">
              <div className="flex items-center gap-2 text-[var(--crt-phosphor-bright)] text-sm sm:text-base font-bold">
                <span className="w-6 h-6 rounded-full bg-[var(--crt-phosphor)] text-black flex items-center justify-center text-xs font-black">
                  4
                </span>
                ШАБЛОН ОФОРМЛЕНИЯ ССЫЛКИ ПО ГОСТ 7.0.5-2008 В СПИСОК ЛИТЕРАТУРЫ
              </div>
              <div className="bg-[#040a05] p-3 rounded border border-[var(--crt-phosphor-dim)] font-mono text-xs text-[var(--crt-phosphor-bright)] space-y-2">
                <div>
                  <strong>Для статьи из журнала:</strong><br />
                  <span className="text-[var(--crt-phosphor)]/80">Иванов И. И. Концепт исторической памяти в нарративе XX века // Вопросы философии. — 2023. — № 4. — С. 45–52.</span>
                </div>
                <div>
                  <strong>Для статьи из КиберЛенинки / Сети:</strong><br />
                  <span className="text-[var(--crt-phosphor)]/80">Петрова А. С. Текстология ранних редакций романа // Филологические науки. Вопросы теории и практики. — 2022. — Т. 15. — № 8. — URL: https://cyberleninka.ru/article/n/... (дата обращения: 12.10.2026).</span>
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => {
                  pipAudio.playClick();
                  setCurrentSection('catalog');
                }}
                className="px-4 py-2 bg-[var(--crt-phosphor)] text-black font-bold text-xs uppercase rounded-lg hover:bg-[var(--crt-phosphor-bright)] cursor-pointer transition-all flex items-center gap-1.5"
              >
                <span>Перейти к каталогу баз</span>
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Custom Category & Polling Interval during Database Link Connection */}
      {configuringDb && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 bg-black/95 flex items-center justify-center p-4 z-50">
          <div className="border-2 border-[var(--crt-phosphor)] bg-[#050d06] p-5 rounded-xl max-w-md w-full box-glow text-[var(--crt-phosphor)] space-y-4">
            <div className="text-sm font-bold tracking-wider uppercase flex items-center justify-between border-b border-[var(--crt-phosphor-dim)] pb-2.5">
              <span className="flex items-center gap-1.5 text-[var(--crt-phosphor-bright)]">
                <Sliders size={16} /> ПОДКЛЮЧЕНИЕ НАУЧНОЙ БАЗЫ В МОНИТОРИНГ
              </span>
              <button
                onClick={() => setConfiguringDb(null)}
                className="cursor-pointer text-xs p-1 border border-[var(--crt-phosphor-dim)] hover:border-[var(--crt-phosphor)] rounded"
                title="Отмена"
              >
                <X size={14} />
              </button>
            </div>

            {/* Target resource preview */}
            <div className="bg-[#09150b] p-3 rounded-lg border border-[var(--crt-phosphor-dim)]/60 space-y-1">
              <div className="text-[10px] text-[var(--crt-phosphor-dim)] uppercase font-mono tracking-wider">
                Подключаемый ресурс:
              </div>
              <div className="font-bold text-xs text-[var(--crt-phosphor-bright)] flex items-center gap-1.5">
                <BookOpen size={14} className="shrink-0 text-[var(--crt-phosphor)]" />
                <span>{configuringDb.title}</span>
              </div>
              <div className="text-[11px] opacity-75 font-mono truncate">
                {configuringDb.url}
              </div>
              <div className="text-[10px] text-[var(--crt-phosphor)]/80 pt-1">
                <span className="font-bold">Профиль:</span> {configuringDb.discipline}
              </div>
            </div>

            {/* Category Setting */}
            <div className="bg-black/60 p-3 rounded-lg border border-[var(--crt-phosphor-dim)]/50 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <label className="font-bold uppercase tracking-wider flex items-center gap-1.5">
                  <FolderEdit size={13} className="text-[var(--crt-phosphor)]" />
                  КАТЕГОРИЯ:
                </label>
                <button
                  type="button"
                  onClick={() => {
                    pipAudio.playClick();
                    setCfgIsAddingNewCat(!cfgIsAddingNewCat);
                  }}
                  className="text-[10px] text-[var(--crt-phosphor-bright)] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Plus size={11} /> {cfgIsAddingNewCat ? 'Выбрать готовую' : '+ Своя категория'}
                </button>
              </div>

              {!cfgIsAddingNewCat ? (
                <select
                  value={cfgCategory}
                  onChange={(e) => setCfgCategory(e.target.value)}
                  className="w-full bg-black border border-[var(--crt-phosphor)] px-2.5 py-1.5 text-xs text-[var(--crt-phosphor)] outline-none rounded font-mono uppercase cursor-pointer"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                  {!categories.some((c) => c.id === 'HUMANITIES') && (
                    <option value="HUMANITIES">ГУМАНИТАРНЫЕ НАУКИ</option>
                  )}
                </select>
              ) : (
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    placeholder="Название новой категории..."
                    value={cfgNewCatName}
                    onChange={(e) => setCfgNewCatName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleCreateNewCategoryInScience();
                      }
                    }}
                    autoFocus
                    className="flex-1 bg-black border border-[var(--crt-phosphor)] px-2.5 py-1 text-xs text-[var(--crt-phosphor)] outline-none rounded uppercase font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleCreateNewCategoryInScience}
                    className="bg-[var(--crt-phosphor)] text-black font-bold px-2.5 py-1 text-xs rounded cursor-pointer hover:bg-[var(--crt-phosphor-bright)]"
                  >
                    ОК
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCfgIsAddingNewCat(false);
                      setCfgNewCatName('');
                    }}
                    className="border border-zinc-600 px-2 py-1 text-xs rounded cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>

            {/* Polling Interval Setting */}
            <div className="bg-black/60 p-3 rounded-lg border border-[var(--crt-phosphor-dim)]/50 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <label className="font-bold uppercase tracking-wider flex items-center gap-1.5">
                  <Clock size={13} className="text-[var(--crt-phosphor)]" />
                  ИНТЕРВАЛ ОПРОСА:
                </label>
                <button
                  type="button"
                  onClick={() => {
                    pipAudio.playClick();
                    setCfgIsCustomInterval(!cfgIsCustomInterval);
                  }}
                  className="text-[10px] text-[var(--crt-phosphor-bright)] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Sliders size={11} />
                  {cfgIsCustomInterval ? 'Выбрать из списка' : 'Задать вручную (сек)'}
                </button>
              </div>

              {!cfgIsCustomInterval ? (
                <select
                  value={cfgInterval}
                  onChange={(e) => setCfgInterval(Number(e.target.value))}
                  className="w-full bg-black border border-[var(--crt-phosphor)] px-2.5 py-1.5 text-xs text-[var(--crt-phosphor)] outline-none rounded font-mono cursor-pointer"
                >
                  <option value={15}>Каждые 15 секунд (Сверхбыстрый)</option>
                  <option value={30}>Каждые 30 секунд (Высокий приоритет)</option>
                  <option value={45}>Каждые 45 секунд</option>
                  <option value={60}>Каждую 1 минуту (Рекомендуется)</option>
                  <option value={120}>Каждые 2 минуты</option>
                  <option value={180}>Каждые 3 минуты</option>
                  <option value={300}>Каждые 5 минут</option>
                  <option value={600}>Каждые 10 минут</option>
                  <option value={1800}>Каждые 30 минут</option>
                  <option value={3600}>Каждый 1 час</option>
                </select>
              ) : (
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={10}
                      max={86400}
                      step={5}
                      value={cfgCustomIntervalVal}
                      onChange={(e) => setCfgCustomIntervalVal(Number(e.target.value))}
                      placeholder="Секунды (напр. 60)"
                      className="flex-1 bg-black border border-[var(--crt-phosphor)] px-3 py-1.5 text-xs text-[var(--crt-phosphor)] outline-none rounded font-mono"
                    />
                    <span className="text-xs text-[var(--crt-phosphor-bright)] font-mono shrink-0">
                      сек. ({cfgCustomIntervalVal >= 60 ? `${(cfgCustomIntervalVal / 60).toFixed(1)} мин.` : `${cfgCustomIntervalVal} с`})
                    </span>
                  </div>
                  <div className="text-[10px] opacity-60">
                    Минимум 10 сек., максимум 86400 сек. (24 ч).
                  </div>
                </div>
              )}
            </div>

            {/* Notification Checkbox */}
            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="cfgNotifyCheck"
                checked={cfgNotify}
                onChange={(e) => setCfgNotify(e.target.checked)}
                className="cursor-pointer accent-[var(--crt-phosphor)]"
              />
              <label htmlFor="cfgNotifyCheck" className="cursor-pointer text-xs font-bold">
                Отправлять Push-уведомление при изменении контента базы
              </label>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-3 border-t border-[var(--crt-phosphor-dim)]">
              <button
                type="button"
                onClick={() => setConfiguringDb(null)}
                className="px-3.5 py-1.5 border border-zinc-600 hover:border-zinc-400 text-xs rounded cursor-pointer"
              >
                ОТМЕНА
              </button>
              <button
                type="button"
                onClick={handleConfirmConnectDb}
                className="px-4 py-1.5 border border-[var(--crt-phosphor)] bg-[var(--crt-phosphor)] text-black text-xs font-bold hover:bg-[var(--crt-phosphor-bright)] rounded cursor-pointer transition-all shadow-[0_0_12px_var(--crt-glow)]"
              >
                + ПОДКЛЮЧИТЬ В МОНИТОРИНГ
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
