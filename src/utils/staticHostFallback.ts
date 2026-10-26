import { createWorker } from 'tesseract.js';
import { SiteWrittenContent } from '../types/pipboy';
import { ScheduleClass, DayOfWeek, WeekParityType, LessonType, STANDARD_LESSON_TIMES } from '../types/schedule';

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

/**
 * Client-side schedule parser fallback for GitHub Pages (supports text & image OCR via Tesseract.js).
 */
export async function parseScheduleClientFallback(params: {
  imageBase64?: string;
  text?: string;
  url?: string;
}): Promise<{ classes: ScheduleClass[]; summary: string }> {
  let rawText = params.text || '';

  if (!rawText && params.imageBase64) {
    let worker: any = null;
    try {
      worker = await createWorker(['rus', 'eng']);
      const ret = await worker.recognize(params.imageBase64);
      rawText = String(ret?.data?.text || '');
    } finally {
      if (worker) {
        try {
          await worker.terminate();
        } catch {}
      }
    }
  }

  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 2);

  const dayMap: Array<{ pattern: RegExp; code: DayOfWeek }> = [
    { pattern: /^(понедельник|пн|mon)/i, code: 'MON' },
    { pattern: /^(вторник|вт|tue)/i, code: 'TUE' },
    { pattern: /^(среда|ср|wed)/i, code: 'WED' },
    { pattern: /^(четверг|чт|thu)/i, code: 'THU' },
    { pattern: /^(пятница|пт|fri)/i, code: 'FRI' },
    { pattern: /^(суббота|сб|sat)/i, code: 'SAT' }
  ];

  let currentDay: DayOfWeek = 'MON';
  let currentParity: WeekParityType = 'BOTH';
  const parsedClasses: ScheduleClass[] = [];

  for (const line of lines) {
    const matchedDay = dayMap.find((d) => d.pattern.test(line));
    if (matchedDay && line.length < 25) {
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

    // Match time range like 09:00 - 10:30 or lesson number like "1 пара" / "1."
    const timeMatch = line.match(/(\d{1,2}[:.]\d{2})\s*[-–—]\s*(\d{1,2}[:.]\d{2})/);
    const numMatch = line.match(/^([1-7])\s*(?:пара|[.)]|-я)/i);

    if (timeMatch || numMatch || line.length >= 6) {
      const lessonNum = numMatch ? Number(numMatch[1]) : (parsedClasses.length % 6) + 1;
      const stdTime = STANDARD_LESSON_TIMES[lessonNum] || { start: '09:00', end: '10:30' };
      const startTime = timeMatch ? timeMatch[1].replace('.', ':').padStart(5, '0') : stdTime.start;
      const endTime = timeMatch ? timeMatch[2].replace('.', ':').padStart(5, '0') : stdTime.end;

      const cleanedSubject = line
        .replace(/(\d{1,2}[:.]\d{2})\s*[-–—]\s*(\d{1,2}[:.]\d{2})/g, '')
        .replace(/^([1-7])\s*(?:пара|[.)]|-я)\s*/i, '')
        .replace(/^[-–—:•\s]+/, '')
        .trim();

      if (cleanedSubject.length >= 3) {
        const lessonType: LessonType = /лекц/i.test(cleanedSubject)
          ? 'LECTURE'
          : /практ/i.test(cleanedSubject)
          ? 'PRACTICE'
          : /лаб/i.test(cleanedSubject)
          ? 'LAB'
          : 'SEMINAR';

        parsedClasses.push({
          id: `ghp-cls-${Date.now()}-${parsedClasses.length}`,
          day: currentDay,
          weekParity: /верхн/i.test(line) ? 'UPPER' : /нижн/i.test(line) ? 'LOWER' : currentParity,
          lessonNumber: lessonNum,
          startTime,
          endTime,
          subject: cleanedSubject.slice(0, 90),
          lessonType,
          notificationEnabled: true
        });
      }
    }
  }

  return {
    classes: parsedClasses,
    summary: `Распознано занятий в клиентском режиме: ${parsedClasses.length}`
  };
}
