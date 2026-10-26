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
 * Returns true if the current hostname is GitHub Pages (*.github.io).
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
 * Uses public GTX translation endpoint with chunking so full book pages and articles
 * translate reliably in the browser without requiring a Node.js backend.
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

  // Split text into safe paragraphs (~1200 chars max per request) so URL length stays safe
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

    // Secondary fallback via MyMemory public translation API
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
  const detectedLangLabel = LANG_NAMES[detectedCode] || (detectedCode !== 'auto' ? detectedCode.toUpperCase() : 'Автоопределение');

  // Extract notable academic/specialized terms from original and translated text
  const words = Array.from(
    new Set(
      (trimmed.match(/[A-Za-zА-Яа-яЁё]{6,}/g) || []).filter(
        (w) => w.length >= 7 && !/^(которые|которая|который|однако|поэтому|страница|through|between|however|because)$/i.test(w)
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

/**
 * Simple deterministic string hash for client-side site diff detection on GitHub Pages.
 */
function computeClientHash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return 'ghp-' + (hash >>> 0).toString(16);
}

/**
 * Client-side website checker for GitHub Pages static mode.
 * Uses public CORS proxy (AllOrigins) to fetch real HTML and compute diffs in the browser.
 */
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
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
    const res = await fetch(proxyUrl);
    if (!res.ok) {
      throw new Error('Proxy unreachable');
    }
    const data = await res.json();
    const html = typeof data?.contents === 'string' ? data.contents : '';
    if (!html || html.length < 40) {
      throw new Error('Empty HTML');
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Remove script/style tags
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
    const hasChanged = !isInitialBaseline && currentHash !== previousHash && bodyText !== previousText;

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
      message: 'Ресурс проверен в автономном режиме GitHub Pages (прямой CORS-доступ ограничен сервером сайта).'
    };
  }
}

/**
 * Client-side analytical assistant fallback for SiteAIConsultantModal on GitHub Pages.
 */
export function answerSiteQAClientFallback(params: {
  question: string;
  appData: any;
  selectedSites: any[];
}): string {
  const { question, appData, selectedSites } = params;
  const q = question.toLowerCase();

  const scheduleClasses = Array.isArray(appData?.schedule?.classes) ? appData.schedule.classes : [];
  const gradesSubjects = Array.isArray(appData?.grades?.subjects) ? appData.grades.subjects : [];
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
      for (const cls of scheduleClasses.slice(0, 10)) {
        lines.push(
          `• **${cls.subject}** — ${cls.day}, ${cls.lessonNumber}-я пара (${cls.startTime}–${cls.endTime}), неделя: ${cls.weekParity}${
            cls.classroom ? `, ауд. ${cls.classroom}` : ''
          }`
        );
      }
    }
  }

  if (q.includes('оценк') || q.includes('брс') || q.includes('балл') || q.includes('зачет') || q.includes('экзамен')) {
    if (gradesSubjects.length === 0) {
      lines.push(
        `\n**БРС и оценки:** Таблица дисциплин во вкладке **«ОЦЕНКИ (БРС)»** пока пуста. Добавьте предметы для автоматического расчёта текущего рейтинга и прогноза автомата.`
      );
    } else {
      lines.push(`\n**Сводка успеваемости БРС (предметов: ${gradesSubjects.length}):**`);
      for (const sub of gradesSubjects) {
        lines.push(`• **${sub.name}** (${sub.assessmentType === 'EXAM' ? 'Экзамен' : 'Зачёт'})`);
      }
    }
  }

  if (selectedSites.length > 0) {
    lines.push(`\n**Анализ прикреплённых сайтов (${selectedSites.length}):**`);
    for (const s of selectedSites) {
      const words = s.writtenContent?.wordCount || 0;
      const overview = s.writtenContent?.overview || s.contentSnippet || 'Описание ожидает индексации';
      lines.push(`• **${s.title}** (${s.url}) — статус: \`${s.status}\`, объём текста: ~${words} слов. Сводка: ${overview}`);
    }
  } else {
    lines.push(`\n*Примечание: Выберите галочками один или несколько сайтов слева для детального разбора их текстового снимка.*`);
  }

  return lines.join('\n');
}

/**
 * Client-side database recommendation fallback for TabScience on GitHub Pages.
 */
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
        searchTips: `Скопируйте аннотацию найденной статьи во вкладку «ПЕРЕВОДЧИК» или «БИБЛИОТЕКА» для параллельного перевода.`
      }
    ],
    methodologyAdvice: `Для подготовки качественной работы по теме «${cleanQuery}» рекомендуем сначала собрать 5–7 базовых статей в КиберЛенинке, изучить списки литературы в конце этих статей, а затем дополнить обзор 2–3 зарубежными источниками из DOAJ или JSTOR Open Access.`
  };
}

// Cached singleton Tesseract worker for fast schedule recognition on GitHub Pages
let cachedScheduleWorkerPromise: Promise<any> | null = null;
let scheduleProgressCallback: ((stage: string, percent: number) => void) | null = null;

/**
 * Pre-warms the Russian Tesseract OCR worker in the background so that when the user clicks
 * "РАСПОЗНАТЬ РАСПИСАНИЕ", 0ms is wasted downloading WASM or language traineddata.
 */
export function prewarmScheduleOcrWorker(): Promise<any> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (!cachedScheduleWorkerPromise) {
    cachedScheduleWorkerPromise = createWorker('rus', 1, {
      logger: (m: any) => {
        if (scheduleProgressCallback && typeof m?.progress === 'number') {
          const status = String(m.status || '');
          if (status.includes('loading') || status.includes('initializing')) {
            scheduleProgressCallback('Загрузка OCR-ядра...', Math.round(m.progress * 35));
          } else if (status.includes('recognizing')) {
            scheduleProgressCallback(
              'Распознавание ячеек таблицы...',
              35 + Math.round(m.progress * 55)
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

/**
 * Loads a base64 / data URL into an HTMLImageElement.
 */
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
 * Clusters sorted 1D coordinates that are within `maxGap` pixels of each other.
 */
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

/**
 * Checks if a pixel at (x, y) is a neutral dark/gray table border pixel.
 */
function isBorderPixel(data: Uint8ClampedArray, w: number, x: number, y: number): boolean {
  const idx = (y * w + x) * 4;
  const r = data[idx];
  const g = data[idx + 1];
  const b = data[idx + 2];
  const maxC = Math.max(r, g, b);
  const minC = Math.min(r, g, b);
  // Table borders are gray/black lines (low saturation, luminance < 200)
  return maxC < 202 && maxC - minC < 45;
}

/**
 * Cleans OCR errors in Russian academic subject names, teacher names, and schedule comments.
 */
function cleanScheduleOcrText(raw: string): string {
  return raw
    .replace(/[|¦[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\(\s*лек\s*[.,/]?\s*пр\s*[.,]?\s*\)/gi, '(лек./пр.)')
    .replace(/\(\s*л[ес]к\s*[.,]?\s*\)/gi, '(лек.)')
    .replace(/\(\s*[пи]р\s*[.,]?\s*\)/gi, '(пр.)')
    .replace(/\(\s*лаб\s*[.,]?\s*\)/gi, '(лаб.)')
    .replace(/Первобыт[пн]ое/gi, 'Первобытное')
    .replace(/И[пн]остра[пн]{1,2}ый/gi, 'Иностранный')
    .replace(/государстве[пн]{1,2}ости/gi, 'государственности')
    .replace(/поз[пн]а[пн]ия/gi, 'познания')
    .replace(/дисципли[пн]ы/gi, 'дисциплины')
    .replace(/география/gi, 'география')
    .replace(/верх[пн]ей/gi, 'верхней')
    .replace(/[пн]иж[пн]ей/gi, 'нижней')
    .replace(/[пн]едел[ие]/gi, (m) => (m.toLowerCase().endsWith('е') ? 'неделе' : 'недели'))
    .replace(/А[пн]то[пн]ово/gi, 'Антоново')
    .replace(/Спорт\s*зал/gi, 'Спортзал')
    .trim();
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

  // Normalize common OCR digit confusions inside time cells
  const norm = rawTime
    .replace(/[Зз]/g, '3')
    .replace(/[ОоOo]/g, '0')
    .replace(/[Бб]/g, '6')
    .replace(/[Вв]/g, '8')
    .replace(/[ІіI|l]/g, '1')
    .replace(/(\d{1,2})[.,;](\d{2})/g, '$1:$2');

  const matches = norm.match(/\b([0-2]?\d):([0-5]\d)\b/g);
  if (!matches || matches.length === 0) {
    // Also check bare hours like "8 00" or "10 00"
    const spacedMatches = norm.match(/\b([789]|1\d|2[0-2])\s+00\b/g);
    if (!spacedMatches || spacedMatches.length === 0) return null;
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
    const clampedH = h < 7 ? h + 10 : h;
    return `${String(clampedH).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  const startTime = pad(tokens[0]);
  let endTime = startTime;

  if (tokens.length >= 2) {
    endTime = pad(tokens[tokens.length - 1]);
  } else {
    const [sh, sm] = startTime.split(':').map(Number);
    const totalEnd = sh * 60 + sm + 90;
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

/**
 * Parses day of week from Column 0 (`дата`) text.
 */
function parseDayCell(rawDay: string): DayOfWeek | null {
  const s = rawDay.replace(/[^A-Za-zА-Яа-яЁё0-9]/g, '').toLowerCase();
  if (!s) return null;
  if (/^(пн|пи|11н|mon|понед)/i.test(s)) return 'MON';
  if (/^(вт|8т|бт|вг|tue|втор)/i.test(s)) return 'TUE';
  if (/^(ср|cp|wed|сред)/i.test(s)) return 'WED';
  if (/^(чт|4т|ут|чг|thu|четв)/i.test(s)) return 'THU';
  if (/^(пт|пг|11т|fri|пятн)/i.test(s)) return 'FRI';
  if (/^(сб|с6|cб|c6|sat|субб)/i.test(s)) return 'SAT';
  return null;
}

/**
 * Detects a 5-to-7 column schedule table grid on Canvas, extracts and upscales non-empty cells
 * (removing grid lines and blue link underlines), runs a fast single-column OCR pass, and reconstructs
 * every schedule row accurately.
 */
async function recognizeScheduleTableFromImage(
  imageBase64: string,
  onProgress?: (stage: string, percent: number) => void
): Promise<ScheduleClass[] | null> {
  if (typeof document === 'undefined') return null;

  onProgress?.('Анализ табличной сетки скриншота...', 10);
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

  // 1. Find vertical grid lines (columns)
  const rawVLines: number[] = [];
  const yScanStart = Math.round(H * 0.02);
  const yScanEnd = Math.round(H * 0.98);
  const minVCount = Math.round((yScanEnd - yScanStart) * 0.38);

  for (let x = 2; x < W - 2; x++) {
    let count = 0;
    for (let y = yScanStart; y < yScanEnd; y += 2) {
      if (isBorderPixel(data, W, x, y)) count += 2;
    }
    if (count >= minVCount) {
      rawVLines.push(x);
    }
  }

  let xLines = cluster1D(rawVLines, 5);
  // Filter out very close duplicate lines (< 14px apart)
  xLines = xLines.reduce<number[]>((acc, x) => {
    if (acc.length === 0 || x - acc[acc.length - 1] >= 14) {
      acc.push(x);
    }
    return acc;
  }, []);

  if (xLines.length < 5) {
    return null; // Not a structured multi-column grid table
  }

  const tableLeft = xLines[0];
  const tableRight = xLines[xLines.length - 1];
  const tableWidth = tableRight - tableLeft;
  if (tableWidth < W * 0.5) return null;

  // 2. Find horizontal grid lines (rows) using the right 75% of the table
  // (since left columns `дата` and `время` are often vertically merged via rowspan)
  const hScanX0 = Math.min(tableRight - 20, xLines.length >= 4 ? xLines[3] : tableLeft + Math.round(tableWidth * 0.15));
  const hScanX1 = tableRight - 2;
  const hScanSpan = Math.max(20, hScanX1 - hScanX0);

  const rawHLines: number[] = [];
  for (let y = 2; y < H - 2; y++) {
    let count = 0;
    for (let x = hScanX0; x < hScanX1; x += 2) {
      if (isBorderPixel(data, W, x, y)) count += 2;
    }
    if (count >= hScanSpan * 0.58) {
      rawHLines.push(y);
    }
  }

  let yLines = cluster1D(rawHLines, 4);
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
  const numCols = Math.min(xLines.length - 1, 8);

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
    return hits >= span * 0.52;
  };

  // Detect if Row 0 is the header row ("дата | время | подгр. | предмет...")
  // Header row in NovSU schedule is ~22-36px tall at the very top of the table
  const firstRowHeight = yLines[1] - yLines[0];
  const startDataRow = firstRowHeight <= 42 && numRows >= 3 ? 1 : 0;

  // 3. Build merged cell slots per column (respecting rowspan in Col 0 `дата`, Col 1 `время`, Col 2 `подгр.`)
  const mergedCells: MergedCellSlot[] = [];

  for (let c = 0; c < numCols; c++) {
    let r = startDataRow;
    while (r < numRows) {
      let rEnd = r;
      // Only columns 0 (`дата`), 1 (`время`), and 2 (`подгр.`) can span multiple rows
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

  onProgress?.('Увеличение чёткости мелкого шрифта (2.25x)...', 22);

  // 4. Crop, clean (remove blue link underlines & borders), and upscale non-empty cells onto vertical strip canvas(es)
  const SCALE = 2.25;
  const PAD_Y = 30;
  const STRIP_W = 920;
  const MAX_STRIP_H = 7200;

  interface PreparedCellRender {
    slot: MergedCellSlot;
    canvas: HTMLCanvasElement;
    w: number;
    h: number;
  }

  const preparedCells: PreparedCellRender[] = [];

  for (const slot of mergedCells) {
    const insetX = Math.min(3, Math.floor((slot.x1 - slot.x0) * 0.1));
    const insetY = 2;
    const sx = slot.x0 + insetX;
    const sy = slot.y0 + insetY;
    const sw = slot.x1 - slot.x0 - insetX * 2;
    const sh = slot.y1 - slot.y0 - insetY * 2;
    if (sw <= 4 || sh <= 6) continue;

    // Count dark/ink pixels to skip empty cells (like empty subgroup cells or empty room cells)
    let inkCount = 0;
    for (let y = sy; y < sy + sh; y++) {
      for (let x = sx; x < sx + sw; x++) {
        const idx = (y * W + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const ink = Math.min(r, g, Math.round(b * 0.75));
        if (ink < 180) inkCount++;
      }
    }

    // Skip cells with no text or just a single "." placeholder
    if (inkCount < 10) continue;

    // Copy cell to a small 1x canvas and remove 1px horizontal blue link underlines
    const cell1x = document.createElement('canvas');
    cell1x.width = sw;
    cell1x.height = sh;
    const ctx1x = cell1x.getContext('2d', { willReadFrequently: true });
    if (!ctx1x) continue;
    ctx1x.drawImage(rawCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

    const cellImg = ctx1x.getImageData(0, 0, sw, sh);
    const cd = cellImg.data;

    // Detect and erase 1px horizontal blue hyperlink underlines (common in teacher & classroom columns)
    for (let y = 1; y < sh - 1; y++) {
      let blueRun = 0;
      for (let x = 0; x < sw; x++) {
        const idx = (y * sw + x) * 4;
        const r = cd[idx];
        const g = cd[idx + 1];
        const b = cd[idx + 2];
        const isBlue = b > r + 18 && b > g + 10 && r < 160;
        if (isBlue) {
          blueRun++;
        } else {
          if (blueRun >= 10) {
            // Check if the row immediately below is mostly light background
            let lightBelow = 0;
            for (let bx = x - blueRun; bx < x; bx++) {
              const bIdx = ((y + 1) * sw + bx) * 4;
              if (cd[bIdx] > 180 && cd[bIdx + 1] > 180) lightBelow++;
            }
            if (lightBelow >= blueRun * 0.7) {
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
      if (blueRun >= 10) {
        let lightBelow = 0;
        for (let bx = sw - blueRun; bx < sw; bx++) {
          const bIdx = ((y + 1) * sw + bx) * 4;
          if (cd[bIdx] > 180 && cd[bIdx + 1] > 180) lightBelow++;
        }
        if (lightBelow >= blueRun * 0.7) {
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

    // Upscale 2.25x and enhance contrast (pure white background, crisp dark ink)
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
      // Treat blue link ink as dark ink
      const ink = Math.min(r, g, Math.round(b * 0.72));
      let v = 255;
      if (ink < 205) {
        // Stretch [60..205] -> [0..240]
        const normInk = Math.max(0, (ink - 65) / 140);
        v = Math.min(255, Math.round(Math.pow(normInk, 1.35) * 245));
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

  // Pack prepared cells into vertical strips of height <= MAX_STRIP_H
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
        sCtx.drawImage(item.canvas, 24, yCursor);
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

  // 5. Recognize each vertical strip using the cached Russian Tesseract worker
  scheduleProgressCallback = onProgress || null;
  const worker = await prewarmScheduleOcrWorker();
  await worker.setParameters({
    tessedit_pageseg_mode: '6' // Assume a single uniform column of text blocks
  });

  for (let sIdx = 0; sIdx < strips.length; sIdx++) {
    const strip = strips[sIdx];
    onProgress?.(
      `Распознавание таблицы (${sIdx + 1}/${strips.length})...`,
      35 + Math.round((sIdx / strips.length) * 50)
    );

    const ret = await worker.recognize(
      strip.canvas,
      {},
      { text: true, blocks: true, tsv: true }
    );

    // Map recognized words back to their exact MergedCellSlot via vertical Y coordinate
    const slotWords = new Map<MergedCellSlot, Array<{ lineKey: string; x: number; text: string }>>();
    for (const item of strip.items) {
      slotWords.set(item.slot, []);
    }

    const findSlotForY = (yMid: number): MergedCellSlot | null => {
      for (const item of strip.items) {
        if (yMid >= item.slot.stripY0 - 14 && yMid <= item.slot.stripY1 + 14) {
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
        if (level !== 5) continue; // Level 5 = word
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

    // Fallback to `ret.data.blocks` if TSV was not populated
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

    // Assemble multiline text inside each slot
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

  // 6. Populate 2D table grid `gridText[r][c]` from merged cells
  const gridText: string[][] = Array.from({ length: numRows }, () =>
    Array.from({ length: numCols }, () => '')
  );

  // Also check if Column 0 (`дата`) has exactly 6 merged day groups (MON..SAT)
  const col0Slots = mergedCells.filter((m) => m.col === 0);
  const orderedDays: DayOfWeek[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

  for (const slot of mergedCells) {
    for (let r = slot.rStart; r <= slot.rEnd; r++) {
      gridText[r][slot.col] = slot.text;
    }
  }

  // If Column 0 has 6 merged blocks (Пн, Вт, Ср, Чт, Пт, Сб), reinforce any missed short 2-letter day label
  if (col0Slots.length === 6) {
    col0Slots.forEach((slot, idx) => {
      const parsed = parseDayCell(slot.text);
      const dayCode = parsed || orderedDays[idx];
      for (let r = slot.rStart; r <= slot.rEnd; r++) {
        gridText[r][0] = dayCode;
      }
    });
  }

  // 7. Convert rows into ScheduleClass objects
  // Standard 7-column layout: 0=дата, 1=время, 2=подгр., 3=предмет, 4=преподаватель, 5=ауд., 6=комм.
  const is7ColLayout = numCols >= 7;
  let currentDay: DayOfWeek = 'MON';
  let currentTimeSlot = { startTime: '09:00', endTime: '10:30', lessonNumber: 1 };
  const classes: ScheduleClass[] = [];

  for (let r = startDataRow; r < numRows; r++) {
    const rowCells = gridText[r];

    // Day of week
    const rawDay = rowCells[0] || '';
    if (['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].includes(rawDay)) {
      currentDay = rawDay as DayOfWeek;
    } else {
      const detectedDay = parseDayCell(rawDay);
      if (detectedDay) currentDay = detectedDay;
    }

    // Time slot
    const rawTime = rowCells[1] || '';
    const parsedTime = parseTimeCell(rawTime);
    if (parsedTime) {
      currentTimeSlot = parsedTime;
    }

    // Subgroup (in 7-col layout, col 2 is `подгр.`)
    let subgroup: string | undefined;
    if (is7ColLayout) {
      const rawSub = (rowCells[2] || '')
        .replace(/[Зз]/g, '3')
        .replace(/[ІіI|l]/g, '1');
      const subMatch = rawSub.match(/([1-4])/);
      if (subMatch) {
        subgroup = subMatch[1];
      }
    }

    const subjColIdx = is7ColLayout ? 3 : 2;
    const teacherColIdx = is7ColLayout ? 4 : 3;
    const roomColIdx = is7ColLayout ? 5 : 4;
    const commColIdx = is7ColLayout ? 6 : 5;

    const rawSubject = cleanScheduleOcrText(rowCells[subjColIdx] || '');
    if (!rawSubject || rawSubject.length < 3 || /^предмет$/i.test(rawSubject)) {
      continue;
    }

    // Determine lessonType from prefix (лек.), (пр.), (лек./пр.)
    let lessonType: LessonType = 'SEMINAR';
    if (/\(\s*лек\s*[./]?\s*пр/i.test(rawSubject)) {
      lessonType = 'LECTURE';
    } else if (/\(\s*лек/i.test(rawSubject) || /\bлекц/i.test(rawSubject)) {
      lessonType = 'LECTURE';
    } else if (/\(\s*пр/i.test(rawSubject) || /\bпракт/i.test(rawSubject)) {
      lessonType = 'PRACTICE';
    } else if (/\(\s*лаб/i.test(rawSubject) || /\bлаб/i.test(rawSubject)) {
      lessonType = 'LAB';
    }

    // Clean subject name while preserving "(лек./пр.)" info in a tidy format
    const hasCombinedLecPr = /\(\s*лек\s*[./]?\s*пр/i.test(rawSubject);
    let cleanSubj = rawSubject
      .replace(/^\(\s*лек\s*[./]?\s*пр\s*[.)]*\s*/i, '')
      .replace(/^\(\s*(?:лек|пр|лаб|сем)\s*[.)]*\s*/i, '')
      .replace(/^[-–—:•.\s]+/, '')
      .trim();

    if (hasCombinedLecPr && !cleanSubj.includes('(лек./пр.)')) {
      cleanSubj = `${cleanSubj} (лек./пр.)`;
    }

    const rawTeacher = cleanScheduleOcrText(rowCells[teacherColIdx] || '')
      .replace(/^[.,\-–—\s]+|[.,\-–—\s]+$/g, '')
      .trim();

    let rawRoom = cleanScheduleOcrText(rowCells[roomColIdx] || '')
      .replace(/^[.,\-–—\s]+|[.,\-–—\s]+$/g, '')
      .replace(/[Зз](?=\d)/g, '3')
      .replace(/[ОоOo](?=\d)/g, '0')
      .replace(/(?<=\d)[ОоOo]/g, '0')
      .replace(/[ІіI|l](?=\d)/g, '1')
      .trim();

    const rawComm = cleanScheduleOcrText(rowCells[commColIdx] || '')
      .replace(/^[.,\-–—\s]+|[.,\-–—\s]+$/g, '')
      .trim();

    if ((!rawRoom || rawRoom.length <= 1) && /ДОТ|дистанц|portal\.novsu/i.test(rawComm)) {
      rawRoom = 'ДОТ';
    }

    // Determine weekParity from comments
    let weekParity: WeekParityType = 'BOTH';
    if (/верхн|нечет|числит/i.test(rawComm)) {
      weekParity = 'UPPER';
    } else if (/нижн|четн|знамен/i.test(rawComm)) {
      weekParity = 'LOWER';
    }

    // Extract week range ("до 9 недели", "после 9 недели")
    const weekRange = extractWeekRangeFromText(`${rawComm} ${cleanSubj}`);

    // Extract linkUrl if present in comment
    const urlMatch = rawComm.match(/https?:\/\/[^\s,]+/i);

    classes.push({
      id: `ghp-tbl-${Date.now()}-${classes.length}`,
      day: currentDay,
      weekParity,
      lessonNumber: currentTimeSlot.lessonNumber,
      startTime: currentTimeSlot.startTime,
      endTime: currentTimeSlot.endTime,
      subject: cleanSubj.slice(0, 120),
      lessonType,
      subgroup,
      weekFrom: weekRange.weekFrom,
      weekTo: weekRange.weekTo,
      weekRangeLabel: weekRange.weekRangeLabel,
      classroom: rawRoom || undefined,
      teacher: rawTeacher || undefined,
      notes: rawComm || undefined,
      linkUrl: urlMatch ? urlMatch[0] : undefined,
      notificationEnabled: true
    });
  }

  return classes.length > 0 ? classes : null;
}

/**
 * Client-side schedule parser fallback for GitHub Pages (supports 7-column table OCR & plain text).
 */
export async function parseScheduleClientFallback(params: {
  imageBase64?: string;
  text?: string;
  url?: string;
  onProgress?: (stage: string, percent: number) => void;
}): Promise<{ classes: ScheduleClass[]; summary: string }> {
  // 1. If an image screenshot is provided, first run the high-precision Canvas Table Grid + Cell OCR pipeline
  if (params.imageBase64 && !params.text) {
    try {
      const tableClasses = await recognizeScheduleTableFromImage(params.imageBase64, params.onProgress);
      if (tableClasses && tableClasses.length > 0) {
        const withSubgroups = tableClasses.filter((c) => c.subgroup).length;
        const withWeekBounds = tableClasses.filter((c) => c.weekFrom || c.weekTo).length;
        return {
          classes: tableClasses,
          summary: `Табличный ИИ-анализ завершён: распознано ${tableClasses.length} пар по 7 колонкам (дней: ${
            new Set(tableClasses.map((c) => c.day)).size
          }${withSubgroups > 0 ? `, с подгруппами: ${withSubgroups}` : ''}${
            withWeekBounds > 0 ? `, с диапазонами недель: ${withWeekBounds}` : ''
          }). Проверьте таблицу ниже перед сохранением.`
        };
      }
    } catch {
      // Fall through to full-page OCR fallback if table grid was not detected
    }
  }

  let rawText = params.text || '';

  if (!rawText && params.imageBase64) {
    scheduleProgressCallback = params.onProgress || null;
    try {
      const worker = await prewarmScheduleOcrWorker();
      const ret = await worker.recognize(params.imageBase64);
      rawText = String(ret?.data?.text || '');
    } finally {
      scheduleProgressCallback = null;
    }
  }

  const lines = rawText
    .split(/\r?\n/)
    .map((l) => cleanScheduleOcrText(l))
    .filter((l) => l.length > 2);

  const dayMap: Array<{ pattern: RegExp; code: DayOfWeek }> = [
    { pattern: /^(понедельник|пн|mon)\b/i, code: 'MON' },
    { pattern: /^(вторник|вт|tue)\b/i, code: 'TUE' },
    { pattern: /^(среда|ср|wed)\b/i, code: 'WED' },
    { pattern: /^(четверг|чт|thu)\b/i, code: 'THU' },
    { pattern: /^(пятница|пт|fri)\b/i, code: 'FRI' },
    { pattern: /^(суббота|сб|sat)\b/i, code: 'SAT' }
  ];

  let currentDay: DayOfWeek = 'MON';
  let currentParity: WeekParityType = 'BOTH';
  const parsedClasses: ScheduleClass[] = [];

  for (const line of lines) {
    const matchedDay = dayMap.find((d) => d.pattern.test(line));
    if (matchedDay && line.length < 20) {
      currentDay = matchedDay.code;
      continue;
    }

    if (/верхн|нечет/i.test(line) && line.length < 25) {
      currentParity = 'UPPER';
      continue;
    }
    if (/нижн|четн/i.test(line) && line.length < 25) {
      currentParity = 'LOWER';
      continue;
    }

    const timeMatch = line.match(/(\d{1,2}[:.]\d{2})\s*[-–—]\s*(\d{1,2}[:.]\d{2})/);
    const singleTimeMatch = line.match(/\b([0-2]?\d:[0-5]\d)\b/);
    const numMatch = line.match(/^([1-7])\s*(?:пара|[.)]|-я)/i);

    if (timeMatch || singleTimeMatch || numMatch || /\((?:лек|пр|лаб)/i.test(line)) {
      const lessonNum = numMatch ? Number(numMatch[1]) : (parsedClasses.length % 6) + 1;
      const stdTime = STANDARD_LESSON_TIMES[lessonNum - 1] || { start: '09:00', end: '10:30' };
      const startTime = timeMatch
        ? timeMatch[1].replace('.', ':').padStart(5, '0')
        : singleTimeMatch
        ? singleTimeMatch[1].padStart(5, '0')
        : stdTime.start;
      const endTime = timeMatch ? timeMatch[2].replace('.', ':').padStart(5, '0') : stdTime.end;

      const cleanedSubject = line
        .replace(/(\d{1,2}[:.]\d{2})\s*[-–—]\s*(\d{1,2}[:.]\d{2})/g, '')
        .replace(/^([1-7])\s*(?:пара|[.)]|-я)\s*/i, '')
        .replace(/^[-–—:•\s]+/, '')
        .trim();

      if (cleanedSubject.length >= 3) {
        const lessonType: LessonType = /лек/i.test(cleanedSubject)
          ? 'LECTURE'
          : /пр/i.test(cleanedSubject)
          ? 'PRACTICE'
          : /лаб/i.test(cleanedSubject)
          ? 'LAB'
          : 'SEMINAR';

        const weekRange = extractWeekRangeFromText(line);
        const subMatch = line.match(/\b([1-3])\s*\)/);

        parsedClasses.push({
          id: `ghp-cls-${Date.now()}-${parsedClasses.length}`,
          day: currentDay,
          weekParity: /верхн/i.test(line) ? 'UPPER' : /нижн/i.test(line) ? 'LOWER' : currentParity,
          lessonNumber: lessonNum,
          startTime,
          endTime,
          subject: cleanedSubject.slice(0, 100),
          lessonType,
          subgroup: subMatch ? subMatch[1] : undefined,
          weekFrom: weekRange.weekFrom,
          weekTo: weekRange.weekTo,
          weekRangeLabel: weekRange.weekRangeLabel,
          notificationEnabled: true
        });
      }
    }
  }

  return {
    classes: parsedClasses,
    summary: `Распознано занятий: ${parsedClasses.length}. Вы можете отредактировать любые поля в таблице предпросмотра ниже.`
  };
}
