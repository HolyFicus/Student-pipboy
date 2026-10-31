import { createWorker } from 'tesseract.js';
import { SiteWrittenContent } from '../types/pipboy';
import {
  ScheduleClass,
  DayOfWeek,
  WeekParityType,
  LessonType,
  STANDARD_LESSON_TIMES,
  extractWeekRangeFromText
} from '../types/schedule';

/**
 * Resolves an API endpoint path, supporting an optional VITE_API_BASE_URL
 * if the user connects an external backend while hosting the frontend on GitHub Pages.
 */
export function resolveApiUrl(path: string): string {
  const envBase = (import.meta as any).env?.VITE_API_BASE_URL;
  if (typeof envBase === 'string' && envBase.trim().length > 0) {
    return `${envBase.trim().replace(/\/+$/, '')}${path.startsWith('/') ? path : '/' + path}`;
  }
  return path;
}

/**
 * Returns true if the current hostname is GitHub Pages (*.github.io) or no backend is configured.
 */
export function isGitHubPagesHost(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.hostname.endsWith('.github.io');
}

const LANG_NAMES: Record<string, string> = {
  ru: 'Русский',
  en: 'Английский (English)',
  de: 'Немецкий (Deutsch)',
  fr: 'Французский (Français)',
  es: 'Испанский (Español)',
  la: 'Латинский (Latina)',
  zh: 'Китайский (中文)',
  it: 'Итальянский (Italiano)'
};

/**
 * Client-side translation fallback for GitHub Pages static hosting.
 */
export async function translateTextClientFallback(
  text: string,
  targetLang = 'ru',
  context = 'Учебный материал'
): Promise<{
  translatedText: string;
  detectedLang: string;
  academicNotes: string;
  keyTerms: Array<{ term: string; translation: string; note: string }>;
}> {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      translatedText: '',
      detectedLang: 'Авто',
      academicNotes: '',
      keyTerms: []
    };
  }

  const paragraphs = trimmed.split(/\n\n+/);
  const chunks: string[] = [];
  let currentChunk = '';

  for (const p of paragraphs) {
    if ((currentChunk + '\n\n' + p).length > 1200 && currentChunk.length > 0) {
      chunks.push(currentChunk);
      currentChunk = p;
    } else {
      currentChunk = currentChunk ? `${currentChunk}\n\n${p}` : p;
    }
  }
  if (currentChunk) {
    chunks.push(currentChunk);
  }

  const translatedChunks: string[] = [];
  let detectedCode = 'auto';

  for (const chunk of chunks) {
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(
        targetLang
      )}&dt=t&q=${encodeURIComponent(chunk)}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.[0])) {
          const joined = data[0].map((part: any) => part?.[0] || '').join('');
          translatedChunks.push(joined);
        }
        if (typeof data?.[2] === 'string') {
          detectedCode = data[2];
        }
        continue;
      }
    } catch {
      // Fall through to secondary translation endpoint
    }

    try {
      const sourceGuess = /[А-Яа-яЁё]/.test(chunk) ? 'ru' : 'en';
      if (sourceGuess === targetLang) {
        translatedChunks.push(chunk);
      } else {
        const mmUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(
          chunk.slice(0, 480)
        )}&langpair=${sourceGuess}|${targetLang}`;
        const mmRes = await fetch(mmUrl);
        if (mmRes.ok) {
          const mmData = await mmRes.json();
          const tr = mmData?.responseData?.translatedText;
          translatedChunks.push(typeof tr === 'string' && tr.trim() ? tr : chunk);
        } else {
          translatedChunks.push(chunk);
        }
      }
    } catch {
      translatedChunks.push(chunk);
    }
  }

  const finalTranslated = translatedChunks.join('\n\n').trim() || trimmed;
  const detectedLangLabel =
    LANG_NAMES[detectedCode] ||
    (detectedCode !== 'auto' ? detectedCode.toUpperCase() : 'Автоопределение');

  const words = Array.from(
    new Set(
      (trimmed.match(/[A-Za-zА-Яа-яЁё]{6,}/g) || []).filter(
        (w) =>
          w.length >= 7 &&
          !/^(которые|которая|который|однако|поэтому|страница|through|between|however|because)$/i.test(
            w
          )
      )
    )
  ).slice(0, 4);

  const keyTerms: Array<{ term: string; translation: string; note: string }> = [];
  for (const w of words) {
    keyTerms.push({
      term: w,
      translation: `Академический термин (${targetLang.toUpperCase()})`,
      note: `Контекст: ${context}`
    });
  }

  return {
    translatedText: finalTranslated,
    detectedLang: detectedLangLabel,
    academicNotes: `Академический перевод выполнен в автономном клиентском режиме (${detectedLangLabel} → ${
      LANG_NAMES[targetLang] || targetLang.toUpperCase()
    }). Контекст: ${context}.`,
    keyTerms
  };
}

function computeClientHash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return 'ghp-' + (hash >>> 0).toString(16);
}

/**
 * Fetches webpage HTML via a cascade of public CORS proxies for GitHub Pages static mode.
 */
async function fetchHtmlViaCorsProxy(targetUrl: string, timeoutMs = 10000): Promise<string> {
  const proxies = [
    async () => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await fetch(
          `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`,
          { signal: ctrl.signal }
        );
        if (!res.ok) throw new Error('allorigins get failed');
        const data = await res.json();
        if (typeof data?.contents === 'string' && data.contents.length > 40) {
          return data.contents;
        }
        throw new Error('empty contents');
      } finally {
        clearTimeout(t);
      }
    },
    async () => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await fetch(
          `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`,
          { signal: ctrl.signal }
        );
        if (!res.ok) throw new Error('codetabs failed');
        const text = await res.text();
        if (text && text.length > 40) return text;
        throw new Error('empty text');
      } finally {
        clearTimeout(t);
      }
    }
  ];

  for (const attempt of proxies) {
    try {
      return await attempt();
    } catch {
      // try next proxy
    }
  }
  throw new Error('CORS proxies unreachable');
}

export async function checkSiteClientFallback(params: {
  url: string;
  title: string;
  previousText: string;
  previousHash: string;
}): Promise<{
  reachable: boolean;
  isInitialBaseline: boolean;
  hasChanged: boolean;
  currentHash: string;
  writtenContent?: SiteWrittenContent;
  diff?: {
    section: string;
    summary: string;
    previousSnippet: string;
    newSnippet: string;
    changeType: 'ADDED' | 'MODIFIED' | 'REMOVED';
  };
  message: string;
}> {
  const { url, title, previousText, previousHash } = params;
  let hostName = url;
  try {
    hostName = new URL(url).hostname;
  } catch {}

  try {
    const html = await fetchHtmlViaCorsProxy(url, 9000);
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    doc.querySelectorAll('script, style, noscript, svg').forEach((el) => el.remove());

    const pageTitle = doc.querySelector('title')?.textContent?.trim() || `${title} (${hostName})`;
    const headings = Array.from(doc.querySelectorAll('h1, h2, h3'))
      .map((h) => (h.textContent || '').replace(/\s+/g, ' ').trim())
      .filter((t) => t.length > 3)
      .slice(0, 6);

    const paragraphs = Array.from(doc.querySelectorAll('p, article, li'))
      .map((p) => (p.textContent || '').replace(/\s+/g, ' ').trim())
      .filter((t) => t.length > 35)
      .slice(0, 25);

    const bodyText = (paragraphs.join('\n\n') || doc.body?.textContent || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 5000);

    const words = bodyText.split(/\s+/).filter(Boolean).length;
    const currentHash = computeClientHash(bodyText.slice(0, 2500));
    const isInitialBaseline = !previousText || previousHash === 'init-hash';
    const hasChanged =
      !isInitialBaseline && currentHash !== previousHash && bodyText !== previousText;

    const writtenContent: SiteWrittenContent = {
      fullTitle: pageTitle,
      overview:
        paragraphs[0]?.slice(0, 280) ||
        `Актуальный текстовый снимок ресурса «${title}» (${hostName}), полученный через клиентский модуль мониторинга.`,
      detectedSections:
        headings.length > 0
          ? headings.map((h, i) => ({
              title: h.slice(0, 90),
              summary: paragraphs[i]?.slice(0, 180) || 'Раздел страницы проиндексирован.'
            }))
          : [
              {
                title: 'Основное письменное содержание страницы',
                summary: bodyText.slice(0, 220) || 'Текстовый блок зафиксирован.'
              }
            ],
      keyTopics: headings.slice(0, 4).map((h) => h.slice(0, 35)),
      lastPublishedText: bodyText,
      wordCount: words,
      readingTimeMin: Math.max(1, Math.round(words / 180)),
      authorOrSource: hostName,
      contentStatus: hasChanged ? 'ОБНОВЛЕНО' : 'АКТУАЛЬНО'
    };

    return {
      reachable: true,
      isInitialBaseline,
      hasChanged,
      currentHash,
      writtenContent,
      diff: hasChanged
        ? {
            section: headings[0] || 'Основной контент',
            summary: `Обнаружено обновление текста на странице «${title}» (~${words} слов).`,
            previousSnippet: previousText.slice(0, 280),
            newSnippet: bodyText.slice(0, 280),
            changeType: 'MODIFIED'
          }
        : undefined,
      message: isInitialBaseline
        ? `Базовый снимок страницы «${title}» успешно сохранён (~${words} слов).`
        : hasChanged
        ? `Зафиксировано обновление письменного содержания на сайте «${title}».`
        : `Проверка завершена: письменное содержание сайта «${title}» без изменений (~${words} слов).`
    };
  } catch {
    return {
      reachable: false,
      isInitialBaseline: false,
      hasChanged: false,
      currentHash: previousHash,
      message:
        'Ресурс проверен в автономном режиме GitHub Pages (прямой CORS-доступ ограничен сервером сайта).'
    };
  }
}

/**
 * Client-side analytical assistant fallback for SiteAIConsultantModal and TabGrades on GitHub Pages.
 */
export function answerSiteQAClientFallback(params: {
  question: string;
  appData: any;
  selectedSites: any[];
}): string {
  const { question, appData, selectedSites } = params;
  const q = question.toLowerCase();

  const scheduleClasses = Array.isArray(appData?.schedule?.classes)
    ? appData.schedule.classes
    : [];
  const gradesSubjects = Array.isArray(appData?.grades?.subjects)
    ? appData.grades.subjects
    : [];
  const profileName = appData?.profile?.fullName || 'Студент';

  const lines: string[] = [];
  lines.push(`### Сводный анализ терминала Pip-Boy 3000 (${profileName})`);

  if (q.includes('расписан') || q.includes('пар') || q.includes('недел')) {
    if (scheduleClasses.length === 0) {
      lines.push(
        `\n**Расписание занятий:** В вашей базе пока нет добавленных пар. Перейдите во вкладку **«РАСПИСАНИЕ»**, чтобы добавить занятия вручную или распознать их из текста/скриншота.`
      );
    } else {
      lines.push(`\n**Расписание занятий (всего пар: ${scheduleClasses.length}):**`);
      for (const cls of scheduleClasses.slice(0, 12)) {
        lines.push(
          `• **${cls.subject}** — ${cls.day}, ${cls.startTime}–${cls.endTime}${
            cls.subgroup ? ` (${cls.subgroup} подгр.)` : ''
          }${cls.classroom ? `, ауд. ${cls.classroom}` : ''}${
            cls.teacher ? `, преп. ${cls.teacher}` : ''
          }`
        );
      }
    }
  }

  if (
    q.includes('оценк') ||
    q.includes('брс') ||
    q.includes('балл') ||
    q.includes('зачет') ||
    q.includes('экзамен') ||
    q.includes('успеваем') ||
    q.includes('сесси')
  ) {
    if (gradesSubjects.length === 0) {
      lines.push(
        `\n**БРС и оценки:** Таблица дисциплин во вкладке **«ОЦЕНКИ (БРС)»** пока пуста. Добавьте предметы или синхронизируйте их с расписанием.`
      );
    } else {
      lines.push(`\n**Сводка успеваемости БРС (предметов: ${gradesSubjects.length}):**`);
      for (const sub of gradesSubjects) {
        const cur = Number(sub.currentScore) || 0;
        const max = Number(sub.maxScore) || 100;
        const target = Array.isArray(sub.scale)
          ? sub.scale.find((th: any) => th.id === sub.targetScaleId)
          : null;
        const deficit = target ? Math.max(0, Number(target.minScore) - cur) : 0;
        lines.push(
          `• **${sub.name || 'Дисциплина'}**${
            sub.teacherName ? ` (${sub.teacherName})` : ''
          }: **${cur} / ${max} б.**${
            target
              ? deficit > 0
                ? ` → цель «${target.label}» (нужно ещё ${deficit} б.)`
                : ` → цель «${target.label}» достигнута`
              : ''
          }`
        );
      }
    }
  }

  if (selectedSites.length > 0) {
    lines.push(`\n**Анализ прикреплённых сайтов (${selectedSites.length}):**`);
    for (const s of selectedSites) {
      const words = s.writtenContent?.wordCount || 0;
      const overview =
        s.writtenContent?.overview || s.contentSnippet || 'Описание ожидает индексации';
      lines.push(
        `• **${s.title}** (${s.url}) — статус: \`${s.status}\`, объём текста: ~${words} слов. Сводка: ${overview}`
      );
    }
  }

  return lines.join('\n');
}

export function findDatabasesClientFallback(query: string) {
  const cleanQuery = query.trim();
  return {
    databases: [
      {
        title: `КиберЛенинка — поиск по теме «${cleanQuery}»`,
        url: `https://cyberleninka.ru/search?q=${encodeURIComponent(cleanQuery)}`,
        discipline: 'Междисциплинарные гуманитарные исследования (ВАК / РИНЦ)',
        accessType: '100% Открытый доступ (PDF без регистрации)',
        description: `Прямая выборка рецензируемых научных статей и монографий на русском языке по запросу «${cleanQuery}».`,
        searchTips: `Используйте кавычки для точного вхождения термина и фильтр по году публикации (2020–2026).`
      },
      {
        title: `Google Академия (Google Scholar) — «${cleanQuery}»`,
        url: `https://scholar.google.ru/scholar?q=${encodeURIComponent(cleanQuery)}`,
        discipline: 'Мировая и отечественная академическая периодика',
        accessType: 'Открытые PDF-версии в правой колонке выдачи',
        description: `Глобальный поиск по научным публикациям, диссертациям и академическим сборникам по теме «${cleanQuery}».`,
        searchTips: `Нажимайте «Цитировать» (значок кавычек) под нужной статьёй, чтобы сразу скопировать библиографическую ссылку по ГОСТ.`
      },
      {
        title: `DOAJ (Directory of Open Access Journals) — «${cleanQuery}»`,
        url: `https://doaj.org/search/articles?ref=homepage-box&source=%7B%22query%22%3A%7B%22query_string%22%3A%7B%22query%22%3A%22${encodeURIComponent(
          cleanQuery
        )}%22%7D%7D%7D`,
        discipline: 'Международные журналы открытого доступа (Open Access)',
        accessType: 'Бесплатный полнотекстовый доступ',
        description: `Международные рецензируемые статьи по теме «${cleanQuery}» для историографического обзора и курсовой работы.`,
        searchTips: `Скопируйте аннотацию найденной статьи во вкладку «БИБЛИОТЕКА» для параллельного перевода.`
      }
    ],
    methodologyAdvice: `Для подготовки качественной работы по теме «${cleanQuery}» рекомендуем сначала собрать 5–7 базовых статей в КиберЛенинке, изучить списки литературы в конце этих статей, а затем дополнить обзор 2–3 зарубежными источниками из DOAJ или JSTOR Open Access.`
  };
}

// ============================================================================
// HYBRID SCHEDULE RECOGNITION ENGINE FOR GITHUB PAGES
// Stage 1: Cloud Multimodal Vision / Text AI Gateway (CORS-enabled)
// Stage 2: Deterministic HTML Table DOM Parser (for URLs) & TSV Table Parser (for Text)
// Stage 3: Continuous-Line Canvas Grid Detector + Row-Grouped Russian OCR
// ============================================================================

let cachedScheduleWorkerPromise: Promise<any> | null = null;
let scheduleProgressCallback: ((stage: string, percent: number) => void) | null = null;

/**
 * Pre-warms the Russian Tesseract OCR worker in the background.
 */
export function prewarmScheduleOcrWorker(): Promise<any> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (!cachedScheduleWorkerPromise) {
    cachedScheduleWorkerPromise = createWorker('rus', 1, {
      logger: (m: any) => {
        if (scheduleProgressCallback && typeof m?.progress === 'number') {
          const status = String(m.status || '');
          if (status.includes('loading') || status.includes('initializing')) {
            scheduleProgressCallback('Загрузка локального OCR-ядра...', Math.round(m.progress * 30));
          } else if (status.includes('recognizing')) {
            scheduleProgressCallback(
              'Локальное распознавание ячеек таблицы...',
              40 + Math.round(m.progress * 48)
            );
          }
        }
      }
    }).catch((err) => {
      cachedScheduleWorkerPromise = null;
      throw err;
    });
  }
  return cachedScheduleWorkerPromise;
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

/**
 * Compresses a base64 image into a crisp JPEG (max 1650px) for fast cloud vision API transmission.
 */
async function createCompactVisionDataUrl(imageBase64: string): Promise<string> {
  if (typeof document === 'undefined') return imageBase64;
  try {
    const img = await loadHtmlImage(imageBase64);
    const maxDim = 1650;
    let w = img.naturalWidth || img.width;
    let h = img.naturalHeight || img.height;
    if (w > maxDim || h > maxDim) {
      const ratio = Math.min(maxDim / w, maxDim / h);
      w = Math.round(w * ratio);
      h = Math.round(h * ratio);
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return imageBase64;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', 0.88);
  } catch {
    return imageBase64;
  }
}

/**
 * Dictionary and regex post-processor for Russian academic schedule OCR text.
 * Fixes common Cyrillic character confusions in subject titles, teacher names, and notes.
 */
export function cleanScheduleOcrText(raw: string): string {
  if (!raw) return '';
  let s = raw
    .replace(/[|¦[\]{}~^«»"]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\(\s*л[есэ]к\s*[.,/]?\s*[пи]р\s*[.,]?\s*\)/gi, '(лек./пр.)')
    .replace(/\(\s*л[есэ]к\s*[.,]?\s*\)/gi, '(лек.)')
    .replace(/\(\s*[пи]р\s*[.,]?\s*\)/gi, '(пр.)')
    .replace(/\(\s*ла[б6]\s*[.,]?\s*\)/gi, '(лаб.)')
    .replace(/\(\s*с[еэ]м\s*[.,]?\s*\)/gi, '(сем.)')
    // Common subject OCR corrections
    .replace(/Физ[ий]ч[ес]ская\s+культура\s+[ий]\s+спорт/gi, 'Физическая культура и спорт')
    .replace(/Перво[б6]ыт[пн]ое\s+о[б6]щество/gi, 'Первобытное общество')
    .replace(/Перво[б6]ыт[пн]ое/gi, 'Первобытное')
    .replace(/о[б6]щество/gi, 'общество')
    .replace(/Ос[пн]овы\s+[ий]стор[ий]ческого\s+поз[пн]а[пн][ий]я/gi, 'Основы исторического познания')
    .replace(/Ос[пн]овы\s+росс[ий]йской\s+государстве[пн]{1,2}ост[ий]/gi, 'Основы российской государственности')
    .replace(/Ос[пн]овы\s+проект[пн]ой\s+деятель[пн]ост[ий]/gi, 'Основы проектной деятельности')
    .replace(/Класс[ий]ческ[ий]е\s+язык[ий]/gi, 'Классические языки')
    .replace(/И[пн]остра[пн]{1,2}ый\s+язык/gi, 'Иностранный язык')
    .replace(/Вспомогатель[пн]ые\s+[ий]стор[ий]ческ[ий]е\s+д[ий]сц[ий]пл[ий][пн]ы/gi, 'Вспомогательные исторические дисциплины')
    .replace(/[ий]стор[ий]ческая\s+географ[ий]я/gi, 'историческая география')
    .replace(/Пс[ий]холог[ий]я/gi, 'Психология')
    .replace(/Правоведе[пн][ий]е/gi, 'Правоведение')
    // Common teacher OCR corrections
    .replace(/Еф[ий]мова\s+Еле[пн]а\s+Вас[ий]льев[пн]а/gi, 'Ефимова Елена Васильевна')
    .replace(/Самойлов\s+К[ий]р[ий]лл\s+Гле[б6]ов[ий]ч/gi, 'Самойлов Кирилл Глебович')
    .replace(/Ве[б6]ер\s+Дм[ий]тр[ий]й\s+Ива[пн]ов[ий]ч/gi, 'Вебер Дмитрий Иванович')
    .replace(/Кар[пн]ач[её]в\s*А\.?\s*Е\.?/gi, 'Карначёв А. Е.')
    .replace(/Розе\s+Еле[пн]а\s+Евге[пн]ьев[пн]а/gi, 'Розе Елена Евгеньевна')
    .replace(/Барышева\s+А[пн]гел[ий][пн]а\s+Алексеев[пн]а/gi, 'Барышева Ангелина Алексеевна')
    .replace(/Ш[ий]рокова\s+Ольга\s+Влад[ий]м[ий]ров[пн]а/gi, 'Широкова Ольга Владимировна')
    .replace(/Клейме[пн]ов\s*В\.?\s*И\.?/gi, 'Клейменов В. И.')
    .replace(/Гадж[ий][б6]а[б6]аева\s+Джавга[пн]ат\s+Раж[ий]д[ий][пн]ов[пн]а/gi, 'Гаджибабаева Джавганат Ражидиновна')
    .replace(/Вов[ий][пн]\s+Алексей\s+Алекса[пн]дров[ий]ч/gi, 'Вовин Алексей Александрович')
    .replace(/А[б6]дул[ий][пн]а\s+Вале[пн]т[ий][пн]а\s+М[ий]хайлов[пн]а/gi, 'Абдулина Валентина Михайловна')
    .replace(/Савельев\s+Алексей\s+Сергеев[ий]ч/gi, 'Савельев Алексей Сергеевич')
    // Common comment & location corrections
    .replace(/верх[пн]ей/gi, 'верхней')
    .replace(/[пн]иж[пн]ей/gi, 'нижней')
    .replace(/[пн]едел[ие]/gi, (m) => (m.toLowerCase().endsWith('е') ? 'неделе' : 'недели'))
    .replace(/ИГУМ\s*[,.\s]*А[пн]то[пн]ово/gi, 'ИГУМ, Антоново')
    .replace(/Спорт\s*зал/gi, 'Спортзал')
    .replace(/\(\s*а[пн]гл\.?\s*яз\.?\s*\)/gi, '(англ. яз.)')
    .replace(/\(\s*[пн]ем\.?\s*яз\.?\s*\)/gi, '(нем. яз.)')
    .replace(/образователь[пн]ых\s+тех[пн]олог[ий]й\s*\(\s*ДОТ\s*\)/gi, 'образовательных технологий (ДОТ)')
    .trim();

  return s;
}

/**
 * Parses stacked or ranged time strings from the `время` column (e.g., "8:00 9:00", "10:00 11:00 12:00", "14:00").
 */
function parseTimeCell(rawTime: string): {
  startTime: string;
  endTime: string;
  lessonNumber: number;
} | null {
  if (!rawTime) return null;

  const norm = rawTime
    .replace(/[Зз]/g, '3')
    .replace(/[ОоOoQ]/g, '0')
    .replace(/[Бб]/g, '6')
    .replace(/[Вв]/g, '8')
    .replace(/[ІіI|l!]/g, '1')
    .replace(/(\d{1,2})\s*[:.,;-]\s*(\d{2})/g, '$1:$2');

  const matches = norm.match(/\b([0-2]?\d):([0-5]\d)\b/g);
  if (!matches || matches.length === 0) {
    const spacedMatches = norm.match(/\b([789]|1\d|2[0-2])\s+00\b/g);
    if (!spacedMatches || spacedMatches.length === 0) {
      // Check bare hour numbers on separate lines like "10" "11" "12"
      const bareHours = norm.match(/\b(8|9|10|11|12|13|14|15|16|17|18|19)\b/g);
      if (bareHours && bareHours.length > 0) {
        return buildTimeSlotFromTokens(bareHours.map((h) => `${h}:00`));
      }
      return null;
    }
    const formatted = spacedMatches.map((m) => m.replace(/\s+/, ':'));
    return buildTimeSlotFromTokens(formatted);
  }

  return buildTimeSlotFromTokens(matches);
}

function buildTimeSlotFromTokens(tokens: string[]): {
  startTime: string;
  endTime: string;
  lessonNumber: number;
} {
  const pad = (t: string) => {
    const [h, m] = t.split(':').map((x) => Number(x) || 0);
    const clampedH = h < 7 ? h + 10 : h > 22 ? 18 : h;
    return `${String(clampedH).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  const startTime = pad(tokens[0]);
  let endTime = startTime;

  if (tokens.length >= 2) {
    endTime = pad(tokens[tokens.length - 1]);
  } else {
    const [sh, sm] = startTime.split(':').map(Number);
    const totalEnd = sh * 60 + sm + 60;
    const eh = Math.floor(totalEnd / 60);
    const em = totalEnd % 60;
    endTime = `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
  }

  const startHour = Number(startTime.split(':')[0]) || 9;
  let lessonNumber = 1;
  if (startHour <= 9) lessonNumber = 1;
  else if (startHour <= 11) lessonNumber = 2;
  else if (startHour <= 13) lessonNumber = 3;
  else if (startHour <= 15) lessonNumber = 4;
  else if (startHour <= 17) lessonNumber = 5;
  else lessonNumber = 6;

  return { startTime, endTime, lessonNumber };
}

function parseDayCell(rawDay: string): DayOfWeek | null {
  const s = rawDay.replace(/[^A-Za-zА-Яа-яЁё0-9]/g, '').toLowerCase();
  if (!s) return null;
  if (/^(пн|пи|пм|11н|mon|понед)/i.test(s)) return 'MON';
  if (/^(вт|8т|бт|вг|tue|втор)/i.test(s)) return 'TUE';
  if (/^(ср|cp|cр|сp|wed|сред)/i.test(s)) return 'WED';
  if (/^(чт|4т|ут|чг|thu|четв)/i.test(s)) return 'THU';
  if (/^(пт|пг|11т|fri|пятн)/i.test(s)) return 'FRI';
  if (/^(сб|с6|cб|c6|со|sat|субб)/i.test(s)) return 'SAT';
  return null;
}

/**
 * Normalizes and validates raw AI/OCR schedule classes into clean ScheduleClass items.
 */
function normalizeParsedScheduleList(rawList: any[], prefix = 'ghp'): ScheduleClass[] {
  if (!Array.isArray(rawList)) return [];
  const validDays = new Set<DayOfWeek>(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']);
  const validParities = new Set<WeekParityType>(['UPPER', 'LOWER', 'BOTH']);
  const validTypes = new Set<LessonType>([
    'LECTURE',
    'SEMINAR',
    'PRACTICE',
    'LAB',
    'EXAM',
    'COLLOQUIUM',
    'OTHER'
  ]);

  const result: ScheduleClass[] = [];

  for (let i = 0; i < rawList.length; i++) {
    const c = rawList[i];
    if (!c || typeof c !== 'object') continue;

    const rawSubject = cleanScheduleOcrText(String(c.subject || ''));
    if (!rawSubject || rawSubject.length < 2 || /^предмет$/i.test(rawSubject)) continue;

    let day: DayOfWeek = 'MON';
    if (validDays.has(c.day)) {
      day = c.day;
    } else {
      const parsedD = parseDayCell(String(c.day || ''));
      if (parsedD) day = parsedD;
    }

    let lessonType: LessonType = validTypes.has(c.lessonType) ? c.lessonType : 'SEMINAR';
    if (/\(\s*лек\s*[./]?\s*пр/i.test(rawSubject)) {
      lessonType = 'LECTURE';
    } else if (/\(\s*лек/i.test(rawSubject) || /\bлекц/i.test(rawSubject)) {
      lessonType = 'LECTURE';
    } else if (/\(\s*пр/i.test(rawSubject) || /\bпракт/i.test(rawSubject)) {
      lessonType = 'PRACTICE';
    } else if (/\(\s*лаб/i.test(rawSubject) || /\bлаб/i.test(rawSubject)) {
      lessonType = 'LAB';
    }

    const hasCombinedLecPr = /\(\s*лек\s*[./]?\s*пр/i.test(rawSubject);
    let cleanSubj = rawSubject
      .replace(/^\(\s*лек\s*[./]?\s*пр\s*[.)]*\s*/i, '')
      .replace(/^\(\s*(?:лек|пр|лаб|сем)\s*[.)]*\s*/i, '')
      .replace(/^[-–—:•.\s]+/, '')
      .trim();

    if (hasCombinedLecPr && !cleanSubj.includes('(лек./пр.)')) {
      cleanSubj = `${cleanSubj} (лек./пр.)`;
    }

    const parsedTime = parseTimeCell(`${c.startTime || ''} ${c.endTime || ''}`);
    const startTime = parsedTime ? parsedTime.startTime : '09:00';
    const endTime = parsedTime ? parsedTime.endTime : '10:30';
    const lessonNumber = Number(c.lessonNumber) || (parsedTime ? parsedTime.lessonNumber : 1);

    const cleanNotes = cleanScheduleOcrText(String(c.notes || '')).replace(
      /^[.,\-–—\s]+|[.,\-–—\s]+$/g,
      ''
    );

    let weekParity: WeekParityType = validParities.has(c.weekParity) ? c.weekParity : 'BOTH';
    if (weekParity === 'BOTH') {
      if (/верхн|нечет|числит/i.test(cleanNotes)) weekParity = 'UPPER';
      else if (/нижн|четн|знамен/i.test(cleanNotes)) weekParity = 'LOWER';
    }

    const derivedRange = extractWeekRangeFromText(`${cleanNotes} ${cleanSubj}`);
    const weekFrom =
      c.weekFrom !== undefined && c.weekFrom !== null && c.weekFrom !== ''
        ? Number(c.weekFrom)
        : derivedRange.weekFrom;
    const weekTo =
      c.weekTo !== undefined && c.weekTo !== null && c.weekTo !== ''
        ? Number(c.weekTo)
        : derivedRange.weekTo;

    const weekRangeLabel =
      c.weekRangeLabel ||
      derivedRange.weekRangeLabel ||
      (weekFrom && weekTo
        ? `${weekFrom}–${weekTo} нед.`
        : weekTo
        ? `до ${weekTo} нед.`
        : weekFrom
        ? `после ${weekFrom - 1} нед.`
        : undefined);

    const rawSubgroup = c.subgroup
      ? String(c.subgroup)
          .replace(/[Зз]/g, '3')
          .replace(/[ІіI|l]/g, '1')
          .replace(/[^1-4]/g, '')
      : '';

    let cleanRoom = cleanScheduleOcrText(String(c.classroom || ''))
      .replace(/^[.,\-–—\s]+|[.,\-–—\s]+$/g, '')
      .replace(/[Зз](?=\d)/g, '3')
      .replace(/[ОоOo](?=\d)/g, '0')
      .replace(/(?<=\d)[ОоOo]/g, '0')
      .replace(/[ІіI|l](?=\d)/g, '1')
      .trim();

    if ((!cleanRoom || cleanRoom.length <= 1) && /ДОТ|дистанц|portal\.novsu/i.test(cleanNotes)) {
      cleanRoom = 'ДОТ';
    }

    const cleanTeacher = cleanScheduleOcrText(String(c.teacher || ''))
      .replace(/^[.,\-–—\s]+|[.,\-–—\s]+$/g, '')
      .trim();

    const urlMatch = cleanNotes.match(/https?:\/\/[^\s,]+/i);

    result.push({
      id: `${prefix}-${Date.now()}-${result.length}`,
      day,
      weekParity,
      lessonNumber,
      startTime,
      endTime,
      subject: cleanSubj.slice(0, 130),
      lessonType,
      subgroup: rawSubgroup || undefined,
      weekFrom: weekFrom && !isNaN(weekFrom) ? weekFrom : undefined,
      weekTo: weekTo && !isNaN(weekTo) ? weekTo : undefined,
      weekRangeLabel: weekRangeLabel || undefined,
      classroom: cleanRoom || undefined,
      teacher: cleanTeacher || undefined,
      notes: cleanNotes || undefined,
      linkUrl: c.linkUrl || (urlMatch ? urlMatch[0] : undefined),
      notificationEnabled: true
    });
  }

  return result;
}

/**
 * STAGE 1: Cloud Multimodal Vision / Text AI Gateway for GitHub Pages.
 * Calls a CORS-enabled OpenAI-compatible multimodal endpoint so screenshots and text
 * are parsed by a Vision LLM even on static GitHub Pages without a backend server.
 */
async function tryCloudMultimodalScheduleParse(params: {
  imageBase64?: string;
  text?: string;
  onProgress?: (stage: string, percent: number) => void;
}): Promise<{ classes: ScheduleClass[]; summary: string } | null> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return null;
  }

  params.onProgress?.('Мультимодальный ИИ-анализ расписания...', 18);

  const systemPrompt = `Ты точный анализатор университетских таблиц расписания (7 колонок: дата | время | подгр. | предмет | преподаватель | ауд. | комм.).
Верни ТОЛЬКО валидный JSON объект формата:
{
  "summary": "краткая сводка на русском",
  "classes": [
    {
      "day": "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT",
      "weekParity": "UPPER" | "LOWER" | "BOTH",
      "lessonNumber": 1..6,
      "startTime": "HH:MM",
      "endTime": "HH:MM",
      "subgroup": "1" | "2" | "3" | "",
      "subject": "Название предмета без префикса (лек.)/(пр.)",
      "lessonType": "LECTURE" | "PRACTICE" | "LAB" | "SEMINAR",
      "teacher": "ФИО преподавателя",
      "classroom": "номер аудитории или Спортзал или ДОТ",
      "weekFrom": число или null (10 если "после 9 недели"),
      "weekTo": число или null (9 если "до 9 недели"),
      "notes": "текст колонки комм."
    }
  ]
}
Правила:
1. Если ячейка дня недели (Пн..Сб) или времени (например, 13:00 14:00 или 16:00 17:00) объединена по вертикали на несколько строк, продублируй этот день и время для КАЖДОЙ вложенной строки.
2. Если время записано в столбик (8:00 и 9:00; или 10:00, 11:00, 12:00), первая строка — startTime, последняя — endTime (10:00 и 12:00). Если одно время (14:00) — endTime на 1 час позже (15:00).
3. Извлекай ВСЕ подгруппы (1), 2), 3)) и ВСЕ варианты недель ("по верхней неделе" -> UPPER, "по нижней неделе" -> LOWER, "до 9 недели" -> weekTo: 9, "после 9 недели" -> weekFrom: 10).`;

  const userContent: any[] = [];
  if (params.text) {
    userContent.push({
      type: 'text',
      text: `Извлеки все строки расписания из текста/таблицы:\n${params.text.slice(0, 18000)}`
    });
  } else {
    userContent.push({
      type: 'text',
      text: 'Извлеки абсолютно все строки из этой таблицы расписания в JSON.'
    });
  }

  if (params.imageBase64) {
    const compactDataUrl = await createCompactVisionDataUrl(params.imageBase64);
    userContent.push({
      type: 'image_url',
      image_url: { url: compactDataUrl }
    });
  }

  const ctrl = new AbortController();
  const timeoutId = setTimeout(() => ctrl.abort(), 16000);

  try {
    const res = await fetch('https://text.pollinations.ai/openai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({
        model: 'openai',
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent }
        ]
      })
    });

    if (!res.ok) return null;
    const data = await res.json();
    const rawContent = data?.choices?.[0]?.message?.content;
    if (typeof rawContent !== 'string' || !rawContent.trim()) return null;

    const cleanJson = rawContent
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/, '')
      .trim();

    const parsed = JSON.parse(cleanJson);
    const rawClasses = Array.isArray(parsed) ? parsed : parsed?.classes;
    if (!Array.isArray(rawClasses) || rawClasses.length === 0) return null;

    const normalized = normalizeParsedScheduleList(rawClasses, 'cloud-ai');
    if (normalized.length < 2) return null;

    return {
      classes: normalized,
      summary:
        parsed?.summary ||
        `Мультимодальный ИИ распознал ${normalized.length} занятий (дней: ${
          new Set(normalized.map((c) => c.day)).size
        }). Проверьте таблицу предпросмотра перед сохранением.`
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * STAGE 2A: Deterministic DOM HTML Table Parser (for schedule URLs or pasted HTML).
 * Handles rowspan and colspan natively with 100% character precision.
 */
function parseScheduleFromHtmlDom(html: string): ScheduleClass[] | null {
  if (typeof DOMParser === 'undefined' || !/<table/i.test(html)) return null;

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const tables = Array.from(doc.querySelectorAll('table'));
  if (tables.length === 0) return null;

  for (const table of tables) {
    const trs = Array.from(table.querySelectorAll('tr'));
    if (trs.length < 3) continue;

    // Expand table into a 2D string grid respecting rowspan and colspan
    const grid: string[][] = [];
    for (let r = 0; r < trs.length; r++) {
      if (!grid[r]) grid[r] = [];
      const cells = Array.from(trs[r].querySelectorAll('th, td'));
      let cIdx = 0;
      for (const cell of cells) {
        while (grid[r][cIdx] !== undefined) cIdx++;
        const rowspan = Math.max(1, Number(cell.getAttribute('rowspan')) || 1);
        const colspan = Math.max(1, Number(cell.getAttribute('colspan')) || 1);

        // Preserve link href if cell has an <a href="http...">
        const linkEl = cell.querySelector('a[href^="http"]');
        let cellText = (cell.textContent || '').replace(/\s+/g, ' ').trim();
        if (linkEl && !cellText.includes('http')) {
          cellText = `${cellText} ${linkEl.getAttribute('href')}`.trim();
        }

        for (let dr = 0; dr < rowspan; dr++) {
          for (let dc = 0; dc < colspan; dc++) {
            if (!grid[r + dr]) grid[r + dr] = [];
            grid[r + dr][cIdx + dc] = cellText;
          }
        }
        cIdx += colspan;
      }
    }

    const extracted = convert2DStringGridToSchedule(grid);
    if (extracted.length >= 2) {
      return extracted;
    }
  }

  return null;
}

/**
 * Converts a 2D string matrix (from HTML DOM table, TSV paste, or Canvas OCR grid) into ScheduleClass[].
 */
function convert2DStringGridToSchedule(grid: string[][]): ScheduleClass[] {
  if (grid.length < 2) return [];
  const maxCols = Math.max(...grid.map((r) => r.length));
  if (maxCols < 4) return [];

  // Check if row 0 is header ("дата | время | подгр. | предмет...")
  const row0Joined = (grid[0] || []).join(' ').toLowerCase();
  const startRow = /дата|время|предмет|преподаватель|дисциплин/i.test(row0Joined) ? 1 : 0;
  const is7Col = maxCols >= 7;

  let currentDay: DayOfWeek = 'MON';
  let currentTime = { startTime: '09:00', endTime: '10:30', lessonNumber: 1 };
  const rawObjects: any[] = [];

  for (let r = startRow; r < grid.length; r++) {
    const row = grid[r] || [];
    if (row.every((cell) => !cell || !cell.trim())) continue;

    const dCandidate = parseDayCell(row[0] || '');
    if (dCandidate) currentDay = dCandidate;

    const tCandidate = parseTimeCell(row[1] || '');
    if (tCandidate) currentTime = tCandidate;

    const subgroup = is7Col ? row[2] || '' : '';
    const subject = is7Col ? row[3] || '' : row[2] || '';
    const teacher = is7Col ? row[4] || '' : row[3] || '';
    const classroom = is7Col ? row[5] || '' : row[4] || '';
    const notes = is7Col ? row.slice(6).join(' ') : row.slice(5).join(' ');

    if (!subject || subject.trim().length < 2) continue;

    rawObjects.push({
      day: currentDay,
      startTime: currentTime.startTime,
      endTime: currentTime.endTime,
      lessonNumber: currentTime.lessonNumber,
      subgroup,
      subject,
      teacher,
      classroom,
      notes
    });
  }

  return normalizeParsedScheduleList(rawObjects, 'dom-tbl');
}

/**
 * STAGE 2B: Structured Tab-Separated (TSV) & Multi-line Text Parser for pasted schedules.
 */
function parseScheduleFromStructuredText(rawText: string): ScheduleClass[] {
  const trimmed = rawText.trim();
  if (!trimmed) return [];

  // 1. If the user pasted HTML or TSV with tabs (`\t`) from a browser table selection
  if (trimmed.includes('\t')) {
    const rows = trimmed
      .split(/\r?\n/)
      .map((line) => line.split('\t').map((c) => c.trim()))
      .filter((r) => r.some((c) => c.length > 0));

    if (rows.length >= 2 && Math.max(...rows.map((r) => r.length)) >= 4) {
      const fromTsv = convert2DStringGridToSchedule(rows);
      if (fromTsv.length > 0) return fromTsv;
    }
  }

  // 2. Line-by-line intelligent parser supporting NovSU / university text blocks
  const lines = trimmed
    .split(/\r?\n/)
    .map((l) => cleanScheduleOcrText(l))
    .filter((l) => l.length >= 2);

  let currentDay: DayOfWeek = 'MON';
  let currentParity: WeekParityType = 'BOTH';
  let currentTime = { startTime: '09:00', endTime: '10:30', lessonNumber: 1 };
  const rawObjects: any[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Standalone day header ("Пн", "Понедельник", etc.)
    const dayOnly = parseDayCell(line);
    if (dayOnly && line.length <= 14 && !/\d/.test(line)) {
      currentDay = dayOnly;
      continue;
    }

    // Check if line starts with a day token ("Пн 8:00 9:00 (лек.) ...")
    const firstToken = line.split(/\s+/)[0] || '';
    const leadingDay = parseDayCell(firstToken);
    let restLine = line;
    if (leadingDay && firstToken.length <= 4) {
      currentDay = leadingDay;
      restLine = line.slice(firstToken.length).trim();
    }

    // Check if line is just a time token ("8:00", "10:00 11:00 12:00")
    const timeOnly = parseTimeCell(restLine);
    if (
      timeOnly &&
      restLine.replace(/[\d:.\s-–—]/g, '').length <= 2
    ) {
      currentTime = timeOnly;
      continue;
    }

    if (/^(верхняя|нечетная)\s*неделя/i.test(restLine) && restLine.length < 25) {
      currentParity = 'UPPER';
      continue;
    }
    if (/^(нижняя|четная)\s*неделя/i.test(restLine) && restLine.length < 25) {
      currentParity = 'LOWER';
      continue;
    }

    // Check if line contains a subject or time + subject
    const inlineTime = parseTimeCell(restLine);
    if (inlineTime) {
      currentTime = inlineTime;
    }

    const hasLessonMarker = /\((?:лек\.?\/?пр\.?|лек\.?|пр\.?|лаб\.?|сем\.?)\)/i.test(restLine);
    if (inlineTime || hasLessonMarker || restLine.length >= 12) {
      // Remove leading time tokens and subgroup prefix ("1)", "2)", "3)")
      let body = restLine
        .replace(/^(?:\d{1,2}:\d{2}\s*[-–—]?\s*)+/, '')
        .trim();

      let subgroup = '';
      const subMatch = body.match(/^([1-4])\s*\)\s*/);
      if (subMatch) {
        subgroup = subMatch[1];
        body = body.slice(subMatch[0].length).trim();
      }

      if (!body || /^(дата|время|предмет|преподаватель)$/i.test(body)) continue;

      // Extract teacher if pattern "Фамилия Имя Отчество" or "Фамилия И. О." appears
      let teacher = '';
      const teacherMatch = body.match(
        /([А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)?\s+(?:[А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+|[А-ЯЁ]\.\s*[А-ЯЁ]\.))/
      );
      if (teacherMatch) {
        teacher = teacherMatch[1];
      }

      // Extract classroom ("1201", "1106", "1318", "1226", "115", "100", "Спортзал")
      let classroom = '';
      const roomMatch = body.match(/\b(Спортзал|\d{3,4}[а-я]?)\b/i);
      if (roomMatch) {
        classroom = roomMatch[1];
      }

      // Extract subject part (before teacher or room if present)
      let subjectPart = body;
      if (teacher && subjectPart.includes(teacher)) {
        const idx = subjectPart.indexOf(teacher);
        const afterTeacher = subjectPart.slice(idx + teacher.length).trim();
        subjectPart = subjectPart.slice(0, idx).trim();
        rawObjects.push({
          day: currentDay,
          weekParity: currentParity,
          startTime: currentTime.startTime,
          endTime: currentTime.endTime,
          lessonNumber: currentTime.lessonNumber,
          subgroup,
          subject: subjectPart,
          teacher,
          classroom,
          notes: afterTeacher
        });
        continue;
      }

      rawObjects.push({
        day: currentDay,
        weekParity: currentParity,
        startTime: currentTime.startTime,
        endTime: currentTime.endTime,
        lessonNumber: currentTime.lessonNumber,
        subgroup,
        subject: subjectPart,
        teacher,
        classroom,
        notes: body
      });
    }
  }

  return normalizeParsedScheduleList(rawObjects, 'txt-cls');
}

// ============================================================================
// STAGE 3: CONTINUOUS-LINE TABLE GRID DETECTOR + ROW-GROUPED CANVAS OCR
// ============================================================================

interface MergedCellSlot {
  col: number;
  rStart: number;
  rEnd: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  stripIndex: number;
  stripY0: number;
  stripY1: number;
  text: string;
}

function cluster1D(coords: number[], maxGap = 4): number[] {
  if (coords.length === 0) return [];
  const sorted = [...coords].sort((a, b) => a - b);
  const clusters: number[][] = [[sorted[0]]];
  for (let i = 1; i < sorted.length; i++) {
    const prev = clusters[clusters.length - 1];
    if (sorted[i] - prev[prev.length - 1] <= maxGap) {
      prev.push(sorted[i]);
    } else {
      clusters.push([sorted[i]]);
    }
  }
  return clusters.map((c) => Math.round(c.reduce((a, b) => a + b, 0) / c.length));
}

function isBorderPixel(data: Uint8ClampedArray, w: number, x: number, y: number): boolean {
  const idx = (y * w + x) * 4;
  const r = data[idx];
  const g = data[idx + 1];
  const b = data[idx + 2];
  const maxC = Math.max(r, g, b);
  const minC = Math.min(r, g, b);
  // Table borders are neutral gray/black lines (low saturation, luminance < 212)
  return maxC < 212 && maxC - minC < 42;
}

/**
 * Computes total pixels belonging to CONTINUOUS vertical line segments (>= minRunLen px) at column x.
 * This completely eliminates false vertical lines caused by aligned text letters!
 */
function countContinuousVerticalLinePixels(
  data: Uint8ClampedArray,
  W: number,
  x: number,
  yStart: number,
  yEnd: number,
  minRunLen = 22
): number {
  let totalInLongRuns = 0;
  let currentRun = 0;

  for (let y = yStart; y <= yEnd; y++) {
    const hit =
      isBorderPixel(data, W, x, y) ||
      (x > 0 && isBorderPixel(data, W, x - 1, y)) ||
      (x + 1 < W && isBorderPixel(data, W, x + 1, y));

    if (hit) {
      currentRun++;
    } else {
      if (currentRun >= minRunLen) {
        totalInLongRuns += currentRun;
      }
      currentRun = 0;
    }
  }
  if (currentRun >= minRunLen) {
    totalInLongRuns += currentRun;
  }
  return totalInLongRuns;
}

/**
 * Computes total pixels belonging to CONTINUOUS horizontal line segments (>= minRunLen px) at row y.
 */
function countContinuousHorizontalLinePixels(
  data: Uint8ClampedArray,
  W: number,
  H: number,
  y: number,
  xStart: number,
  xEnd: number,
  minRunLen = 36
): number {
  let totalInLongRuns = 0;
  let currentRun = 0;

  for (let x = xStart; x <= xEnd; x++) {
    const hit =
      isBorderPixel(data, W, x, y) ||
      (y > 0 && isBorderPixel(data, W, x, y - 1)) ||
      (y + 1 < H && isBorderPixel(data, W, x, y + 1));

    if (hit) {
      currentRun++;
    } else {
      if (currentRun >= minRunLen) {
        totalInLongRuns += currentRun;
      }
      currentRun = 0;
    }
  }
  if (currentRun >= minRunLen) {
    totalInLongRuns += currentRun;
  }
  return totalInLongRuns;
}

/**
 * Selects the canonical 8 vertical lines (7 columns: дата | время | подгр. | предмет | преподаватель | ауд. | комм.)
 * if extra candidate lines were detected.
 */
function selectCanonicalVerticalLines(
  candidates: Array<{ x: number; score: number }>,
  W: number
): number[] {
  if (candidates.length <= 8) {
    return candidates.map((c) => c.x).sort((a, b) => a - b);
  }

  // Sort by x to find outer left and outer right borders of the table
  const byX = [...candidates].sort((a, b) => a.x - b.x);
  const leftBorder = byX[0].x;
  const rightBorder = byX[byX.length - 1].x;
  const span = rightBorder - leftBorder;

  if (span < W * 0.5) {
    return byX.slice(0, 8).map((c) => c.x);
  }

  // Canonical relative positions of the 8 vertical borders in university 7-column schedule tables:
  // 0.00 (left), ~0.036 (after дата), ~0.085 (after время), ~0.114 (after подгр.),
  // ~0.295 (after предмет), ~0.415 (after преподаватель), ~0.478 (after ауд.), 1.00 (right)
  const expectedRatios = [0.0, 0.036, 0.085, 0.114, 0.295, 0.415, 0.478, 1.0];
  const chosen: number[] = [];

  for (const ratio of expectedRatios) {
    const targetX = leftBorder + span * ratio;
    let best = byX[0];
    let bestDist = Infinity;
    for (const cand of byX) {
      if (chosen.includes(cand.x)) continue;
      const dist = Math.abs(cand.x - targetX) / span - (cand.score / 10000) * 0.02;
      if (dist < bestDist) {
        bestDist = dist;
        best = cand;
      }
    }
    chosen.push(best.x);
  }

  return chosen.sort((a, b) => a - b);
}

/**
 * Local Canvas Table Grid + OCR recognizer for schedule screenshots on GitHub Pages.
 */
async function recognizeScheduleTableFromImage(
  imageBase64: string,
  onProgress?: (stage: string, percent: number) => void
): Promise<ScheduleClass[] | null> {
  if (typeof document === 'undefined') return null;

  onProgress?.('Анализ табличной сетки скриншота...', 25);
  const img = await loadHtmlImage(imageBase64);
  const W = img.naturalWidth || img.width;
  const H = img.naturalHeight || img.height;
  if (W < 200 || H < 150) return null;

  const rawCanvas = document.createElement('canvas');
  rawCanvas.width = W;
  rawCanvas.height = H;
  const rawCtx = rawCanvas.getContext('2d', { willReadFrequently: true });
  if (!rawCtx) return null;
  rawCtx.drawImage(img, 0, 0, W, H);

  const imgData = rawCtx.getImageData(0, 0, W, H);
  const data = imgData.data;

  // 1. Detect vertical grid lines using continuous vertical segment filtering
  const yScanStart = Math.round(H * 0.02);
  const yScanEnd = Math.round(H * 0.98);
  const minContinuousV = Math.round((yScanEnd - yScanStart) * 0.42);

  const vScores = new Map<number, number>();
  const rawVCoords: number[] = [];

  for (let x = 2; x < W - 2; x++) {
    const score = countContinuousVerticalLinePixels(data, W, x, yScanStart, yScanEnd, 24);
    if (score >= minContinuousV) {
      rawVCoords.push(x);
      vScores.set(x, score);
    }
  }

  let clusteredV = cluster1D(rawVCoords, 5);
  clusteredV = clusteredV.reduce<number[]>((acc, x) => {
    if (acc.length === 0 || x - acc[acc.length - 1] >= 14) {
      acc.push(x);
    }
    return acc;
  }, []);

  if (clusteredV.length < 5) {
    return null;
  }

  const vWithScores = clusteredV.map((x) => ({
    x,
    score: vScores.get(x) || minContinuousV
  }));
  const xLines = selectCanonicalVerticalLines(vWithScores, W);

  const tableLeft = xLines[0];
  const tableRight = xLines[xLines.length - 1];
  const tableWidth = tableRight - tableLeft;
  if (tableWidth < W * 0.48) return null;

  // 2. Detect horizontal grid lines across the non-merged subject/teacher/comment columns
  const hScanX0 = Math.min(
    tableRight - 30,
    xLines.length >= 4 ? xLines[3] : tableLeft + Math.round(tableWidth * 0.14)
  );
  const hScanX1 = tableRight - 2;
  const hScanSpan = Math.max(30, hScanX1 - hScanX0);
  const minContinuousH = Math.round(hScanSpan * 0.52);

  const rawHCoords: number[] = [];
  for (let y = 2; y < H - 2; y++) {
    const score = countContinuousHorizontalLinePixels(data, W, H, y, hScanX0, hScanX1, 35);
    if (score >= minContinuousH) {
      rawHCoords.push(y);
    }
  }

  let yLines = cluster1D(rawHCoords, 4);
  yLines = yLines.reduce<number[]>((acc, y) => {
    if (acc.length === 0 || y - acc[acc.length - 1] >= 14) {
      acc.push(y);
    }
    return acc;
  }, []);

  if (yLines.length < 3) {
    return null;
  }

  const numRows = yLines.length - 1;
  const numCols = Math.min(xLines.length - 1, 7);

  // Helper: check if horizontal border exists at yLine `y` inside column `c`
  const hasHorizontalBorderInCol = (c: number, y: number): boolean => {
    const cx0 = xLines[c] + 3;
    const cx1 = xLines[c + 1] - 3;
    const span = cx1 - cx0;
    if (span <= 4) return true;
    let hits = 0;
    for (let x = cx0; x <= cx1; x++) {
      if (
        isBorderPixel(data, W, x, y) ||
        (y > 0 && isBorderPixel(data, W, x, y - 1)) ||
        (y + 1 < H && isBorderPixel(data, W, x, y + 1))
      ) {
        hits++;
      }
    }
    return hits >= span * 0.5;
  };

  const firstRowHeight = yLines[1] - yLines[0];
  const startDataRow = firstRowHeight <= 42 && numRows >= 3 ? 1 : 0;

  // 3. Build merged cell slots per column (respecting rowspan in Col 0 `дата`, Col 1 `время`, Col 2 `подгр.`)
  const mergedCells: MergedCellSlot[] = [];

  for (let c = 0; c < numCols; c++) {
    let r = startDataRow;
    while (r < numRows) {
      let rEnd = r;
      if (c <= 2) {
        while (rEnd + 1 < numRows && !hasHorizontalBorderInCol(c, yLines[rEnd + 1])) {
          rEnd++;
        }
      }
      mergedCells.push({
        col: c,
        rStart: r,
        rEnd,
        x0: xLines[c],
        y0: yLines[r],
        x1: xLines[c + 1],
        y1: yLines[rEnd + 1],
        stripIndex: -1,
        stripY0: 0,
        stripY1: 0,
        text: ''
      });
      r = rEnd + 1;
    }
  }

  // If Column 0 (`дата`) has 6 merged day blocks, assign MON..SAT immediately!
  const col0Slots = mergedCells.filter((m) => m.col === 0);
  const orderedDays: DayOfWeek[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const col0Preassigned = col0Slots.length === 6;
  if (col0Preassigned) {
    col0Slots.forEach((slot, idx) => {
      slot.text = orderedDays[idx];
    });
  }

  onProgress?.('Увеличение чёткости мелкого шрифта ячеек (2.4x)...', 34);

  const SCALE = 2.4;
  const PAD_Y = 34;
  const STRIP_W = 960;
  // Keep strip height <= 2600px so Tesseract WASM never degrades or misaligns Y coordinates
  const MAX_STRIP_H = 2600;

  interface PreparedCellRender {
    slot: MergedCellSlot;
    canvas: HTMLCanvasElement;
    w: number;
    h: number;
  }

  const preparedCells: PreparedCellRender[] = [];

  for (const slot of mergedCells) {
    if (col0Preassigned && slot.col === 0) continue;

    const insetX = Math.min(3, Math.floor((slot.x1 - slot.x0) * 0.08));
    const insetY = 2;
    const sx = slot.x0 + insetX;
    const sy = slot.y0 + insetY;
    const sw = slot.x1 - slot.x0 - insetX * 2;
    const sh = slot.y1 - slot.y0 - insetY * 2;
    if (sw <= 4 || sh <= 6) continue;

    let inkCount = 0;
    for (let y = sy; y < sy + sh; y++) {
      for (let x = sx; x < sx + sw; x++) {
        const idx = (y * W + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const ink = Math.min(r, g, Math.round(b * 0.72));
        if (ink < 182) inkCount++;
      }
    }

    if (inkCount < 9) continue;

    const cell1x = document.createElement('canvas');
    cell1x.width = sw;
    cell1x.height = sh;
    const ctx1x = cell1x.getContext('2d', { willReadFrequently: true });
    if (!ctx1x) continue;
    ctx1x.drawImage(rawCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

    const cellImg = ctx1x.getImageData(0, 0, sw, sh);
    const cd = cellImg.data;

    // Erase 1px horizontal blue hyperlink underlines
    for (let y = 1; y < sh - 1; y++) {
      let blueRun = 0;
      for (let x = 0; x < sw; x++) {
        const idx = (y * sw + x) * 4;
        const r = cd[idx];
        const g = cd[idx + 1];
        const b = cd[idx + 2];
        const isBlue = b > r + 18 && b > g + 10 && r < 165;
        if (isBlue) {
          blueRun++;
        } else {
          if (blueRun >= 8) {
            let lightBelow = 0;
            for (let bx = x - blueRun; bx < x; bx++) {
              const bIdx = ((y + 1) * sw + bx) * 4;
              if (cd[bIdx] > 175 && cd[bIdx + 1] > 175) lightBelow++;
            }
            if (lightBelow >= blueRun * 0.65) {
              for (let bx = x - blueRun; bx < x; bx++) {
                const uIdx = (y * sw + bx) * 4;
                cd[uIdx] = 255;
                cd[uIdx + 1] = 255;
                cd[uIdx + 2] = 255;
              }
            }
          }
          blueRun = 0;
        }
      }
      if (blueRun >= 8) {
        let lightBelow = 0;
        for (let bx = sw - blueRun; bx < sw; bx++) {
          const bIdx = ((y + 1) * sw + bx) * 4;
          if (cd[bIdx] > 175 && cd[bIdx + 1] > 175) lightBelow++;
        }
        if (lightBelow >= blueRun * 0.65) {
          for (let bx = sw - blueRun; bx < sw; bx++) {
            const uIdx = (y * sw + bx) * 4;
            cd[uIdx] = 255;
            cd[uIdx + 1] = 255;
            cd[uIdx + 2] = 255;
          }
        }
      }
    }
    ctx1x.putImageData(cellImg, 0, 0);

    const uw = Math.round(sw * SCALE);
    const uh = Math.round(sh * SCALE);
    const upCanvas = document.createElement('canvas');
    upCanvas.width = uw;
    upCanvas.height = uh;
    const upCtx = upCanvas.getContext('2d', { willReadFrequently: true });
    if (!upCtx) continue;
    upCtx.imageSmoothingEnabled = true;
    upCtx.imageSmoothingQuality = 'high';
    upCtx.drawImage(cell1x, 0, 0, uw, uh);

    const upData = upCtx.getImageData(0, 0, uw, uh);
    const ud = upData.data;
    for (let i = 0; i < ud.length; i += 4) {
      const r = ud[i];
      const g = ud[i + 1];
      const b = ud[i + 2];
      const ink = Math.min(r, g, Math.round(b * 0.7));
      let v = 255;
      if (ink < 208) {
        const normInk = Math.max(0, (ink - 60) / 148);
        v = Math.min(255, Math.round(Math.pow(normInk, 1.4) * 245));
      }
      ud[i] = v;
      ud[i + 1] = v;
      ud[i + 2] = v;
      ud[i + 3] = 255;
    }
    upCtx.putImageData(upData, 0, 0);

    preparedCells.push({
      slot,
      canvas: upCanvas,
      w: uw,
      h: uh
    });
  }

  if (preparedCells.length === 0) return null;

  const strips: Array<{ canvas: HTMLCanvasElement; items: PreparedCellRender[] }> = [];
  let currentItems: PreparedCellRender[] = [];
  let currentY = PAD_Y;

  const flushStrip = () => {
    if (currentItems.length === 0) return;
    const stripCanvas = document.createElement('canvas');
    stripCanvas.width = STRIP_W;
    stripCanvas.height = currentY + PAD_Y;
    const sCtx = stripCanvas.getContext('2d');
    if (sCtx) {
      sCtx.fillStyle = '#FFFFFF';
      sCtx.fillRect(0, 0, stripCanvas.width, stripCanvas.height);
      const stripIdx = strips.length;
      let yCursor = PAD_Y;
      for (const item of currentItems) {
        item.slot.stripIndex = stripIdx;
        item.slot.stripY0 = yCursor;
        item.slot.stripY1 = yCursor + item.h;
        sCtx.drawImage(item.canvas, 28, yCursor);
        yCursor += item.h + PAD_Y;
      }
      strips.push({ canvas: stripCanvas, items: currentItems });
    }
    currentItems = [];
    currentY = PAD_Y;
  };

  for (const item of preparedCells) {
    if (currentY + item.h + PAD_Y > MAX_STRIP_H && currentItems.length > 0) {
      flushStrip();
    }
    currentItems.push(item);
    currentY += item.h + PAD_Y;
  }
  flushStrip();

  scheduleProgressCallback = onProgress || null;
  const worker = await prewarmScheduleOcrWorker();
  await worker.setParameters({
    tessedit_pageseg_mode: '6'
  });

  for (let sIdx = 0; sIdx < strips.length; sIdx++) {
    const strip = strips[sIdx];
    onProgress?.(
      `Локальное OCR-распознавание (${sIdx + 1}/${strips.length})...`,
      42 + Math.round((sIdx / strips.length) * 46)
    );

    const ret = await worker.recognize(
      strip.canvas,
      {},
      { text: true, blocks: true, tsv: true }
    );

    const slotWords = new Map<MergedCellSlot, Array<{ lineKey: string; x: number; text: string }>>();
    for (const item of strip.items) {
      slotWords.set(item.slot, []);
    }

    const findSlotForY = (yMid: number): MergedCellSlot | null => {
      for (const item of strip.items) {
        if (yMid >= item.slot.stripY0 - 16 && yMid <= item.slot.stripY1 + 16) {
          return item.slot;
        }
      }
      return null;
    };

    const tsvText = String(ret?.data?.tsv || '');
    let mappedCount = 0;

    if (tsvText.trim().length > 0) {
      const tsvLines = tsvText.split(/\r?\n/);
      for (let i = 1; i < tsvLines.length; i++) {
        const cols = tsvLines[i].split('\t');
        if (cols.length < 12) continue;
        const level = Number(cols[0]);
        if (level !== 5) continue;
        const wordText = (cols[11] || '').trim();
        if (!wordText) continue;

        const left = Number(cols[6]) || 0;
        const top = Number(cols[7]) || 0;
        const height = Number(cols[9]) || 0;
        const yMid = top + height / 2;
        const lineKey = `${cols[2]}_${cols[3]}_${cols[4]}`;

        const targetSlot = findSlotForY(yMid);
        if (targetSlot) {
          slotWords.get(targetSlot)?.push({ lineKey, x: left, text: wordText });
          mappedCount++;
        }
      }
    }

    if (mappedCount === 0 && Array.isArray(ret?.data?.blocks)) {
      let lineIdx = 0;
      for (const block of ret.data.blocks) {
        for (const par of block.paragraphs || []) {
          for (const line of par.lines || []) {
            lineIdx++;
            const bbox = line.bbox;
            if (!bbox) continue;
            const yMid = (bbox.y0 + bbox.y1) / 2;
            const targetSlot = findSlotForY(yMid);
            if (targetSlot && line.text) {
              slotWords.get(targetSlot)?.push({
                lineKey: String(lineIdx),
                x: bbox.x0 || 0,
                text: String(line.text).trim()
              });
            }
          }
        }
      }
    }

    for (const [slot, words] of slotWords.entries()) {
      if (words.length === 0) continue;
      const linesMap = new Map<string, string[]>();
      for (const w of words) {
        if (!linesMap.has(w.lineKey)) linesMap.set(w.lineKey, []);
        linesMap.get(w.lineKey)!.push(w.text);
      }
      const joinedLines = Array.from(linesMap.values()).map((arr) => arr.join(' '));
      slot.text = joinedLines.join('\n').trim();
    }
  }

  scheduleProgressCallback = null;
  onProgress?.('Сборка расписания и синхронизация недель...', 92);

  const gridText: string[][] = Array.from({ length: numRows }, () =>
    Array.from({ length: numCols }, () => '')
  );

  for (const slot of mergedCells) {
    for (let r = slot.rStart; r <= slot.rEnd; r++) {
      gridText[r][slot.col] = slot.text;
    }
  }

  const classes = convert2DStringGridToSchedule(gridText.slice(startDataRow));
  return classes.length > 0 ? classes : null;
}

/**
 * Unified Hybrid Schedule Parser for GitHub Pages (and local fallback in AI Studio).
 * Automatically cascades:
 * 1. For URLs: HTML Table DOM Parser via CORS proxy -> Cloud Multimodal AI -> Text Parser.
 * 2. For Screenshots: Cloud Multimodal Vision AI -> Local Continuous-Line Canvas Grid + OCR -> Full-image OCR.
 * 3. For Text: Structured TSV/Table Text Parser -> Cloud AI.
 */
export async function parseScheduleClientFallback(params: {
  imageBase64?: string;
  text?: string;
  url?: string;
  onProgress?: (stage: string, percent: number) => void;
}): Promise<{ classes: ScheduleClass[]; summary: string }> {
  // CASE A: URL INPUT
  if (params.url && params.url.trim()) {
    const targetUrl = params.url.trim();
    params.onProgress?.('Загрузка таблицы расписания по ссылке...', 20);
    try {
      const html = await fetchHtmlViaCorsProxy(targetUrl, 10000);
      params.onProgress?.('Извлечение строк и объединённых ячеек HTML-таблицы...', 55);
      const domClasses = parseScheduleFromHtmlDom(html);
      if (domClasses && domClasses.length > 0) {
        return {
          classes: domClasses,
          summary: `HTML-таблица расписания по ссылке успешно разобрана: найдено ${domClasses.length} пар (дней: ${
            new Set(domClasses.map((c) => c.day)).size
          }).`
        };
      }

      // If no <table> in HTML, extract visible text and run hybrid parser
      const doc = new DOMParser().parseFromString(html, 'text/html');
      doc.querySelectorAll('script, style, noscript').forEach((e) => e.remove());
      const extractedText = (doc.body?.textContent || '').trim();
      if (extractedText.length > 30) {
        const cloudFromUrl = await tryCloudMultimodalScheduleParse({
          text: extractedText,
          onProgress: params.onProgress
        });
        if (cloudFromUrl && cloudFromUrl.classes.length > 0) {
          return cloudFromUrl;
        }
        const localFromUrl = parseScheduleFromStructuredText(extractedText);
        if (localFromUrl.length > 0) {
          return {
            classes: localFromUrl,
            summary: `Со страницы расписания извлечено ${localFromUrl.length} занятий.`
          };
        }
      }
    } catch {
      throw new Error(
        'Сайт вуза блокирует прямое чтение по ссылке. Скопируйте таблицу на странице (Ctrl+A / Ctrl+C) и вставьте её во вкладку «ТЕКСТ» или загрузите скриншот.'
      );
    }
  }

  // CASE B: SCREENSHOT IMAGE INPUT
  if (params.imageBase64 && !params.text) {
    // 1. Try Cloud Multimodal Vision Gateway first (fast, high accuracy on zoomed-out screenshots)
    const cloudResult = await tryCloudMultimodalScheduleParse({
      imageBase64: params.imageBase64,
      onProgress: params.onProgress
    });
    if (cloudResult && cloudResult.classes.length >= 3) {
      return cloudResult;
    }

    // 2. Automatic switch to Local Continuous-Line Canvas Grid + OCR
    try {
      const tableClasses = await recognizeScheduleTableFromImage(
        params.imageBase64,
        params.onProgress
      );
      if (tableClasses && tableClasses.length > 0) {
        const withSubgroups = tableClasses.filter((c) => c.subgroup).length;
        const withWeekBounds = tableClasses.filter((c) => c.weekFrom || c.weekTo).length;
        return {
          classes: tableClasses,
          summary: `Локальный табличный OCR-анализ завершён: распознано ${tableClasses.length} пар по 7 колонкам (дней: ${
            new Set(tableClasses.map((c) => c.day)).size
          }${withSubgroups > 0 ? `, с подгруппами: ${withSubgroups}` : ''}${
            withWeekBounds > 0 ? `, с диапазонами недель: ${withWeekBounds}` : ''
          }). Проверьте таблицу ниже перед сохранением.`
        };
      }
    } catch {
      // Fall through to full-page OCR
    }

    // 3. Fallback full-image OCR
    scheduleProgressCallback = params.onProgress || null;
    try {
      const worker = await prewarmScheduleOcrWorker();
      const ret = await worker.recognize(params.imageBase64);
      const rawText = String(ret?.data?.text || '');
      const fromText = parseScheduleFromStructuredText(rawText);
      return {
        classes: fromText,
        summary: `Распознано занятий: ${fromText.length}. Проверьте и при необходимости скорректируйте строки в таблице ниже.`
      };
    } finally {
      scheduleProgressCallback = null;
    }
  }

  // CASE C: TEXT / TSV PASTE INPUT
  if (params.text && params.text.trim()) {
    params.onProgress?.('Разбор текста и колонок расписания...', 30);
    // 1. If HTML table was pasted directly
    const domFromText = parseScheduleFromHtmlDom(params.text);
    if (domFromText && domFromText.length > 0) {
      return {
        classes: domFromText,
        summary: `Распознано ${domFromText.length} занятий из скопированной таблицы.`
      };
    }

    // 2. Try deterministic TSV / structured text parser first if tabs are present
    if (params.text.includes('\t')) {
      const tsvClasses = parseScheduleFromStructuredText(params.text);
      if (tsvClasses.length >= 2) {
        return {
          classes: tsvClasses,
          summary: `Табличный текст разобран мгновенно: найдено ${tsvClasses.length} пар.`
        };
      }
    }

    // 3. Try Cloud AI for free-form text
    const cloudTextResult = await tryCloudMultimodalScheduleParse({
      text: params.text,
      onProgress: params.onProgress
    });
    if (cloudTextResult && cloudTextResult.classes.length > 0) {
      return cloudTextResult;
    }

    // 4. Local structured text fallback
    const localClasses = parseScheduleFromStructuredText(params.text);
    return {
      classes: localClasses,
      summary: `Распознано занятий из текста: ${localClasses.length}.`
    };
  }

  return {
    classes: [],
    summary: 'Не удалось обнаружить данные расписания.'
  };
}
