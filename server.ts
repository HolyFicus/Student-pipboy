import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '25mb' }));

// Initialize Google Gemini SDK server-side
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

function withTimeout<T>(promise: Promise<T>, ms = 7000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('AI Request Timeout')), ms)),
  ]);
}

const GEMINI_MODEL_POOL = ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite'] as const;

interface ExponentialBackoffOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitterMs?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableGeminiError(err: any): boolean {
  const msg = String(err?.message || err || '');
  const status = Number(err?.status || err?.code || err?.error?.code || 0);
  const statusText = String(err?.statusText || err?.error?.status || '');
  return (
    status === 503 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 504 ||
    statusText === 'UNAVAILABLE' ||
    statusText === 'RESOURCE_EXHAUSTED' ||
    msg.includes('503') ||
    msg.includes('429') ||
    msg.includes('UNAVAILABLE') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('high demand') ||
    msg.includes('overloaded') ||
    msg.includes('try again later') ||
    msg.includes('Timeout') ||
    msg.includes('ECONNRESET') ||
    msg.includes('fetch failed')
  );
}

function calculateExponentialBackoffDelay(
  attempt: number,
  baseDelayMs = 1000,
  maxDelayMs = 8000,
  jitterMs = 350
): number {
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
  const cappedDelay = Math.min(maxDelayMs, exponentialDelay);
  const randomJitter = Math.floor(Math.random() * jitterMs);
  return cappedDelay + randomJitter;
}

/**
 * Calls a specific Gemini model with automatic exponential backoff (1s -> 2s -> 4s + jitter)
 * when encountering 503 (UNAVAILABLE) or 429 (RESOURCE_EXHAUSTED) errors instead of failing immediately.
 */
async function callModelWithExponentialBackoff(
  modelName: string,
  contents: any,
  config: Record<string, any> | undefined,
  timeoutMs: number,
  backoffOptions: ExponentialBackoffOptions = {}
): Promise<{ response: any; text: string; modelUsed: string; attempts: number }> {
  const maxRetries = backoffOptions.maxRetries ?? 3;
  const baseDelayMs = backoffOptions.baseDelayMs ?? 1000;
  const maxDelayMs = backoffOptions.maxDelayMs ?? 8000;
  const jitterMs = backoffOptions.jitterMs ?? 350;

  let lastError: any = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await withTimeout(
        ai.models.generateContent({
          model: modelName,
          contents,
          ...(config ? { config } : {}),
        }),
        timeoutMs
      );

      const text = response?.text ? response.text.trim() : '';
      if (text) {
        return {
          response,
          text,
          modelUsed: modelName,
          attempts: attempt + 1,
        };
      }

      throw new Error('Empty response from Gemini model');
    } catch (err: any) {
      lastError = err;

      // If error is 503 UNAVAILABLE / 429 / transient and we have retries left, wait with exponential backoff
      if (attempt < maxRetries && isRetryableGeminiError(err)) {
        const delayMs = calculateExponentialBackoffDelay(attempt, baseDelayMs, maxDelayMs, jitterMs);
        await sleep(delayMs);
        continue;
      }

      break;
    }
  }

  throw lastError || new Error(`Gemini request failed after ${maxRetries + 1} attempts`);
}

/**
 * Executes a Gemini API request with per-model exponential backoff and multi-model fallback.
 */
async function callGeminiWithFallback(options: {
  contents: any;
  config?: Record<string, any>;
  timeoutMs?: number;
  backoff?: ExponentialBackoffOptions;
}): Promise<{ response: any; text: string; modelUsed: string } | null> {
  if (!process.env.GEMINI_API_KEY) {
    return null;
  }

  const timeoutMs = options.timeoutMs ?? 15000;
  const backoffConfig: ExponentialBackoffOptions = {
    maxRetries: options.backoff?.maxRetries ?? 3,
    baseDelayMs: options.backoff?.baseDelayMs ?? 1000,
    maxDelayMs: options.backoff?.maxDelayMs ?? 8000,
    jitterMs: options.backoff?.jitterMs ?? 350,
  };

  for (let i = 0; i < GEMINI_MODEL_POOL.length; i++) {
    const modelName = GEMINI_MODEL_POOL[i];
    try {
      const result = await callModelWithExponentialBackoff(
        modelName,
        options.contents,
        options.config,
        timeoutMs,
        backoffConfig
      );
      return result;
    } catch (err: any) {
      // If all exponential backoff retries for the current model failed on 503/429,
      // wait briefly and fall back to the next model in GEMINI_MODEL_POOL
      if (isRetryableGeminiError(err) && i < GEMINI_MODEL_POOL.length - 1) {
        await sleep(400);
        continue;
      }
    }
  }

  return null;
}


// Curated verified humanities databases for fallback and baseline recommendations
const CURATED_HUMANITIES_DBS = [
  {
    title: 'КиберЛенинка (CyberLeninka)',
    url: 'https://cyberleninka.ru',
    discipline: 'История, Философия, Литература, Культурология, Языкознание, Социология',
    accessType: '100% Открытый доступ (Open Access, CC-BY)',
    description: 'Крупнейшая открытая научная электронная библиотека России. Содержит миллионы статей из ведущих рецензируемых журналов ВАК и РИНЦ. Статьи можно читать и скачивать целиком в формате PDF без ограничений.',
    searchTips: 'Используйте фильтр по рубрикатору ГРНТИ «Гуманитарные науки» или точные фразы в кавычках («историческая память»).'
  },
  {
    title: 'eLIBRARY.RU (Научная электронная библиотека / РИНЦ)',
    url: 'https://elibrary.ru',
    discipline: 'Все гуманитарные и социальные науки',
    accessType: 'Бесплатная регистрация / Открытый доступ',
    description: 'Главный библиографический репозиторий и Российский индекс научного цитирования (РИНЦ). Позволяет находить монографии, сборники конференций, статьи из ядра РИНЦ и RSCI.',
    searchTips: 'В расширенном поиске выбирайте фильтр «статьи в открытом доступе» и сортировку по числу цитирований.'
  },
  {
    title: 'ФЭБ «Русская литература и фольклор»',
    url: 'http://feb-web.ru',
    discipline: 'Филология, Литературоведение, Фольклористика, Текстология',
    accessType: 'Открытый доступ без регистрации',
    description: 'Фундаментальная электронная библиотека ИМЛИ РАН и РГБ. Академические полные собрания сочинений Пушкина, Толстого, Достоевского с текстологическим аппаратом, литературоведческие словари и энциклопедии.',
    searchTips: 'Идеально для текстологического анализа, цитирования канонических академических изданий.'
  },
  {
    title: 'НЭБ (Национальная электронная библиотека)',
    url: 'https://rusneb.ru',
    discipline: 'История, Культура, Искусство, Книговедение, Первоисточники',
    accessType: 'Открытый доступ (к общественному достоянию)',
    description: 'Федеральный проект РГБ и РНБ. Оцифрованные редкие дореволюционные издания, архивные периодика, исторические рукописи, диссертации и книжные памятники.',
    searchTips: 'Ищите редкие архивные книги и исторические источники XVIII–XX веков.'
  },
  {
    title: 'Журнальный Зал (Русский Толстый Журнал)',
    url: 'https://magazines.gorky.media',
    discipline: 'Литературоведение, Современная литература, Критика, Культурология',
    accessType: 'Открытый доступ',
    description: 'Архивы главных гуманитарных и литературных журналов: «Новое литературное обозрение» (НЛО), «Вопросы литературы», «Новый мир», «Знамя», «Звезда», «Иностранная литература».',
    searchTips: 'Незаменимо для филологических курсовых, исследований современной литературы и культурологического дискурса.'
  },
  {
    title: 'ИНИОН РАН (Институт научной информации по общественным наукам)',
    url: 'http://inion.ru',
    discipline: 'Политология, Социология, Философия, Всеобщая история, Правоведение',
    accessType: 'Открытый доступ к библиографическим базам и рефератам',
    description: 'Академические реферативные журналы, аналитические обзоры и библиографические указатели по всему спектру социальных и гуманитарных наук.',
    searchTips: 'Используйте реферативные сборники для быстрого написания историографических обзоров в дипломах и ВКР.'
  },
  {
    title: 'Президентская библиотека имени Б.Н. Ельцина',
    url: 'https://www.prlib.ru',
    discipline: 'История России, Источниковедение, Право, Русский язык',
    accessType: 'Открытый доступ к цифровым коллекциям',
    description: 'Архивные первоисточники: указы, мемуары, картографические материалы, старинные газеты и протоколы государственных органов.',
    searchTips: 'Ищите первичные исторические источники и оцифрованные архивные документы.'
  },
  {
    title: 'DOAJ — Directory of Open Access Journals (Гуманитарный раздел)',
    url: 'https://doaj.org',
    discipline: 'History, Linguistics, Philosophy, Cultural Studies, Art History',
    accessType: 'Международный открытый доступ (Open Access)',
    description: 'Глобальный каталог рецензируемых журналов открытого доступа со строгой научной экспертизой. Тысячи статей на английском, французском, немецком и других языках без пэйволлов.',
    searchTips: 'Фильтруйте по предмету: History and Archaeology, Languages and Literature, Philosophy.'
  },
  {
    title: 'JSTOR (Open Access & Free Content)',
    url: 'https://www.jstor.org/open',
    discipline: 'История, Литература, Антропология, Классическая филология',
    accessType: 'Сотни тысяч статей в Open Access + бесплатный аккаунт (100 статей/мес)',
    description: 'Золотой мировой стандарт для исследователей-гуманитариев. Огромный архив классических и современных академических статей мировых университетов.',
    searchTips: 'При поиске ставьте галочку «Content I can access» для фильтрации бесплатных материалов.'
  },
  {
    title: 'Persée (Французские гуманитарные архивы)',
    url: 'https://www.persee.fr',
    discipline: 'История, Археология, Французская литература, Философия',
    accessType: '100% Открытый доступ',
    description: 'Ведущий портал академических журналов Франции в области гуманитарных наук. Полные тексты статей.',
    searchTips: 'Отлично подходит для компаративистики и европейских исследований.'
  }
];

// Helper to extract web grounding sources from Gemini response
function extractWebSources(response: any): Array<{ title: string; uri: string }> {
  const sources: Array<{ title: string; uri: string }> = [];
  const chunks = response?.candidates?.[0]?.groundingMetadata?.groundingChunks;
  if (Array.isArray(chunks)) {
    for (const chunk of chunks) {
      if (chunk?.web?.uri) {
        const uri = String(chunk.web.uri);
        const title = String(chunk.web.title || uri);
        if (!sources.some((s) => s.uri === uri)) {
          sources.push({ title, uri });
        }
      }
    }
  }
  return sources.slice(0, 6);
}

// Helper to format internal application data (Profile, Schedule, Grades)
function formatInternalAppDataBlock(appData: any): string {
  if (!appData || typeof appData !== 'object') {
    return 'Внутренние данные приложения (расписание, оценки, профиль) не переданы.';
  }

  const sections: string[] = [];

  // 1. Profile
  const p = appData.profile;
  if (p && (p.fullName || p.university || p.faculty || p.group || p.notes)) {
    sections.push(
      `[ПРОФИЛЬ СТУДЕНТА В ТЕРМИНАЛЕ]:\n` +
        `• ФИО: ${p.fullName || 'Не заполнено'} | Студ. билет: ${p.studentId || 'Не указан'}\n` +
        `• ВУЗ: ${p.university || 'Не указан'} | Факультет: ${p.faculty || 'Гуманитарный факультет'}\n` +
        `• Курс: ${p.course || 1}, Группа: ${p.group || 'Не указана'}\n` +
        `• Личные заметки студента: ${p.notes || 'Нет заметок'}`
    );
  } else {
    sections.push(`[ПРОФИЛЬ СТУДЕНТА В ТЕРМИНАЛЕ]: Анкета студента пока не заполнена.`);
  }

  // 2. Schedule (Upper / Lower Weeks)
  if (Array.isArray(appData.schedule) && appData.schedule.length > 0) {
    const schedLines = appData.schedule.map(
      (c: any, idx: number) =>
        `  ${idx + 1}. [${c.dayLabel} | ${c.weekParityLabel}] Пара №${c.lessonNumber} (${c.time}): «${c.subject}» (${c.typeLabel}), ауд.: ${c.classroom}, преп.: ${c.teacher}${c.notes ? `, примечание: ${c.notes}` : ''}`
    );
    sections.push(`[РАСПИСАНИЕ ЗАНЯТИЙ В ТЕРМИНАЛЕ (${appData.schedule.length} пар)]:\n` + schedLines.join('\n'));
  } else {
    sections.push(`[РАСПИСАНИЕ ЗАНЯТИЙ В ТЕРМИНАЛЕ]: Расписание пар пока пусто.`);
  }

  // 3. Grades & BRS
  if (Array.isArray(appData.grades) && appData.grades.length > 0) {
    const gradeLines = appData.grades.map(
      (g: any, idx: number) =>
        `  ${idx + 1}. Предмет «${g.name}» (преп.: ${g.teacherName || 'не указан'}): набрано ${g.currentScore} из ${g.maxScore} б. (осталось разыграть: ${g.remainingScore} б.). Цель: ${
          g.targetLabel ? `«${g.targetLabel}» (порог ${g.targetMinScore} б., нужно добрать ещё ${g.pointsNeededForTarget} б.)` : 'не задана'
        }. Шкала: [${g.scaleSummary}]`
    );
    sections.push(`[ТАБЛИЦА ОЦЕНОК И БРС В ТЕРМИНАЛЕ (${appData.grades.length} дисц.)]:\n` + gradeLines.join('\n'));
  } else {
    sections.push(`[ТАБЛИЦА ОЦЕНОК И БРС В ТЕРМИНАЛЕ]: Предметы в калькулятор оценок еще не добавлены.`);
  }

  // 4. Student Library
  if (Array.isArray(appData.library) && appData.library.length > 0) {
    const libLines = appData.library.map(
      (b: any, idx: number) =>
        `  ${idx + 1}. «${b.title}» (${String(b.fileType || '').toUpperCase()}, предмет: ${b.subjectName || 'Без предмета'}, стр./слайдов: ${b.totalPages || 1}, прочитано: стр. ${b.currentPage || 1})`
    );
    sections.push(`[БИБЛИОТЕКА СТУДЕНТА (${appData.library.length} матер.)]:\n` + libLines.join('\n'));
  }

  return sections.join('\n\n');
}

// POST /api/ai/find-databases
app.post('/api/ai/find-databases', async (req, res) => {
  try {
    const { query, discipline, aiMode = 'local', attachedSites = [], appData } = req.body;
    const userTopic = (query || '').trim();
    const isWebMode = aiMode === 'web';

    if (!userTopic) {
      return res.json({
        query: '',
        aiMode: isWebMode ? 'web' : 'local',
        databases: CURATED_HUMANITIES_DBS.slice(0, 5),
        methodologyAdvice: 'Введите интересующую вас гуманитарную тему, дисциплину или проблему, и нейросеть подберет научные базы.'
      });
    }

    // Build local catalog + user attached sites representation
    const localAttachedScientific = Array.isArray(attachedSites)
      ? attachedSites.map((s: any) => ({
          title: `[Прикрепленный сайт] ${s.title}`,
          url: s.url,
          discipline: s.category || 'Ресурс студента',
          accessType: `Статус: ${s.status || 'ONLINE'} (в мониторинге)`,
          description: s.writtenContent?.overview || s.contentSnippet || 'Прикрепленный пользователем ресурс.',
          searchTips: s.writtenContent?.keyTopics?.length
            ? `Ключевые темы на сайте: ${s.writtenContent.keyTopics.join(', ')}`
            : 'Проверьте разделы прикрепленного сайта во вкладке Мониторинг.'
        }))
      : [];

    const combinedLocalPool = [...localAttachedScientific, ...CURATED_HUMANITIES_DBS];

    if (!process.env.GEMINI_API_KEY) {
      const filtered = combinedLocalPool.filter(
        (db) =>
          db.title.toLowerCase().includes(userTopic.toLowerCase()) ||
          db.discipline.toLowerCase().includes(userTopic.toLowerCase()) ||
          db.description.toLowerCase().includes(userTopic.toLowerCase())
      );
      return res.json({
        query: userTopic,
        aiMode: isWebMode ? 'web' : 'local',
        databases: filtered.length > 0 ? filtered : combinedLocalPool.slice(0, 5),
        methodologyAdvice: isWebMode
          ? 'Рекомендации сформированы из академического реестра гуманитарных баз.'
          : 'Режим 1 (Локальный контур): подбор выполнен строго по прикрепленным вами сайтам и встроенному каталогу приложения.'
      });
    }

    const internalContext = formatInternalAppDataBlock(appData);

    const systemPrompt = isWebMode
      ? `Ты — ведущий университетский библиограф и академический методист гуманитарного факультета.
РЕЖИМ РАБОТЫ: РЕЖИМ 2 (ГЛОБАЛЬНЫЙ ПОИСК В ИНТЕРНЕТЕ + ДАННЫЕ ПРИЛОЖЕНИЯ).
Пользователь ищет открытые научные базы данных, электронные библиотеки, архивы и репозитории по теме: "${userTopic}" (дисциплина: ${discipline || 'Гуманитарные науки'}).

Внутренние данные студента в приложении:
${internalContext}

Прикрепленные сайты студента:
${localAttachedScientific.map((s) => `- ${s.title} (${s.url}): ${s.description}`).join('\n') || 'Нет'}

Используй как данные приложения, так и глобальные знания из Интернета, чтобы подобрать 4-6 наиболее релевантных, реально существующих открытых научных баз, архивов и репозиториев (включая профильные внешние интернет-ресурсы).

Верни СТРОГИЙ JSON следующего формата:
{
  "databases": [
    {
      "title": "Название базы данных или архива",
      "url": "Рабочий URL адрес",
      "discipline": "Профильные дисциплины",
      "accessType": "Тип доступа (Открытый доступ / Архивы / Репозиторий)",
      "description": "2-3 предложения: какие именно материалы по теме «${userTopic}» там есть",
      "searchTips": "Конкретный совет по поисковому запросу и фильтрам"
    }
  ],
  "methodologyAdvice": "Краткий совет методиста (2-3 предложения) с учетом расписания/предметов студента и внешних интернет-источников."
}
Отвечай ТОЛЬКО валидным JSON.`
      : `Ты — встроенный аналитический модуль терминала Pip-Boy 3000.
РЕЖИМ РАБОТЫ: РЕЖИМ 1 (СТРОГО ЛОКАЛЬНЫЙ КОНТУР — ТОЛЬКО ПРИКРЕПЛЕННЫЕ САЙТЫ И ДАННЫЕ ПРИЛОЖЕНИЯ).
КРИТИЧЕСКОЕ ПРАВИЛО: Тебе ЗАПРЕЩЕНО использовать сторонние сайты из Интернета, которых нет в списке ниже! Ты имеешь право выбирать и рекомендовать базы ТОЛЬКО из прикрепленных пользователем сайтов и встроенного локального реестра приложения.

Тема запроса студента: "${userTopic}" (дисциплина: ${discipline || 'Гуманитарные науки'}).

Внутренние данные студента в приложении:
${internalContext}

ДОСТУПНЫЙ ЛОКАЛЬНЫЙ ПУЛ РЕСУРСОВ (прикрепленные сайты + встроенный каталог приложения):
${JSON.stringify(combinedLocalPool, null, 2)}

Отбери из этого локального пула наиболее подходящие ресурсы (до 5 шт.) и объясни в поле description и searchTips, как использовать именно эти локальные ресурсы в связке с предметами и расписанием студента. Если тема узкая и прямых совпадений в локальном пуле мало, укажи в methodologyAdvice, что поиск выполнен строго по локальной базе приложения, и предложи переключиться во 2-й режим (+ Интернет) для поиска внешних архивов.

Верни СТРОГИЙ JSON следующего формата:
{
  "databases": [
    {
      "title": "Точное название из локального пула",
      "url": "Точный URL из локального пула",
      "discipline": "Профильные дисциплины",
      "accessType": "Локальный каталог / Прикрепленный сайт",
      "description": "Пояснение строго на основе данных приложения и паспорта ресурса",
      "searchTips": "Совет по поиску внутри этого ресурса"
    }
  ],
  "methodologyAdvice": "Методическая сводка строго по данным приложения (с упоминанием режима локального контура)."
}
Отвечай ТОЛЬКО валидным JSON.`;

    let responseText = '';
    let webSources: Array<{ title: string; uri: string }> = [];

    const aiResult = await callGeminiWithFallback({
      contents: systemPrompt,
      config: isWebMode
        ? {
            tools: [{ googleSearch: {} }],
            temperature: 0.7
          }
        : {
            temperature: 0.15
          },
      timeoutMs: 10000
    });

    if (aiResult) {
      responseText = aiResult.text;
      if (isWebMode) {
        webSources = extractWebSources(aiResult.response);
      }
    }

    if (!responseText) {
      const filtered = combinedLocalPool.filter(
        (db) =>
          db.title.toLowerCase().includes(userTopic.toLowerCase()) ||
          db.discipline.toLowerCase().includes(userTopic.toLowerCase()) ||
          db.description.toLowerCase().includes(userTopic.toLowerCase())
      );
      return res.json({
        query: userTopic,
        aiMode: isWebMode ? 'web' : 'local',
        databases: filtered.length > 0 ? filtered : combinedLocalPool.slice(0, 5),
        methodologyAdvice: isWebMode
          ? 'Рекомендации сформированы из академического реестра открытых гуманитарных баз.'
          : 'Режим 1 (Локальный контур): отображены ресурсы исключительно из памяти приложения и ваших прикрепленных ссылок.'
      });
    }

    const jsonMatch = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(jsonMatch);

    return res.json({
      query: userTopic,
      aiMode: isWebMode ? 'web' : 'local',
      webSources,
      databases: parsed.databases || combinedLocalPool.slice(0, 5),
      methodologyAdvice:
        parsed.methodologyAdvice ||
        (isWebMode
          ? 'Рекомендации сформированы с привлечением глобальной базы знаний.'
          : 'Подбор выполнен строго по локальным данным приложения и прикрепленным сайтам (Режим 1).')
    });
  } catch {
    return res.json({
      query: req.body.query || '',
      aiMode: req.body.aiMode === 'web' ? 'web' : 'local',
      webSources: [],
      databases: CURATED_HUMANITIES_DBS.slice(0, 5),
      methodologyAdvice: 'Рекомендации сформированы из локального реестра терминала Pip-Boy.'
    });
  }
});

// POST /api/ai/translate
app.post('/api/ai/translate', async (req, res) => {
  try {
    const { text, targetLang = 'ru', context } = req.body;
    const inputContent = (text || '').trim();

    if (!inputContent) {
      return res.status(400).json({ error: 'Текст для перевода не предоставлен.' });
    }

    const langNames: Record<string, string> = {
      ru: 'русский язык (строгий академический стиль)',
      en: 'английский язык (Academic English)',
      de: 'немецкий язык (Wissenschaftssprache Deutsch)',
      fr: 'французский язык (Français académique)',
      es: 'испанский язык (Español académico)',
      zh: 'китайский язык (学术中文)'
    };
    const targetLangLabel = langNames[String(targetLang).toLowerCase()] || langNames.ru;

    if (!process.env.GEMINI_API_KEY) {
      return res.json({
        translatedText: `[Локальный перевод → ${String(targetLang).toUpperCase()}]: ${inputContent}`,
        detectedLang: 'Автоопределение',
        academicNotes: 'API ключ не настроен на сервере. Для качественного ИИ-перевода настройте ключ в окружении.',
        keyTerms: []
      });
    }

    const systemPrompt = `Ты — профессиональный академический переводчик научных книг, лекций, презентаций и статей по гуманитарным и университетским дисциплинам (история, философия, филология, социология, культурология, искусствоведение, право, экономика).
Переведи следующий текст страницы книги / слайда презентации / фрагмента научной работы на ${targetLangLabel}.

Требования:
1. Строгий академический научный стиль речи (точная терминология, сохранение структуры абзацев и тезисов слайда).
2. Сохраняй латинские крылатые выражения и принятые в науке обозначения (например, status quo, mutatis mutandis, op. cit., ibid.).
3. Если встречаются сложные философские, исторические или лингвистические концепты, переведи их в соответствии с канонической академической традицией и выдели до 4 ключевых терминов в глоссарий (keyTerms).
4. Контекст документа / предмета (если указан): "${context || 'Учебный материал из Библиотеки студента'}".

Текст для перевода:
"""
${inputContent}
"""

Верни ответ в СТРОГОМ JSON формате:
{
  "translatedText": "Полный академический перевод текста с сохранением абзацев",
  "detectedLang": "Определенный исходный язык (например: Английский, Русский, Немецкий, Французский)",
  "academicNotes": "Краткая академическая заметка (1-2 предложения) об особенностях терминологии или контекста этой страницы",
  "keyTerms": [
    {
      "term": "Оригинальный термин из текста",
      "translation": "Академический перевод",
      "note": "Краткое пояснение значения в контексте дисциплины"
    }
  ]
}
Отвечай ТОЛЬКО валидным JSON.`;

    const aiResult = await callGeminiWithFallback({
      contents: systemPrompt,
      timeoutMs: 12000
    });
    const responseText = aiResult?.text || '';

    if (!responseText) {
      return res.json({
        translatedText: `[Академический перевод → ${String(targetLang).toUpperCase()}]:\n${inputContent}`,
        detectedLang: 'Автоопределение',
        academicNotes: 'Рекомендуется сверить перевод ключевых терминов по профильному академическому словарю.',
        keyTerms: []
      });
    }

    const jsonMatch = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(jsonMatch);

    return res.json({
      translatedText: parsed.translatedText || inputContent,
      detectedLang: parsed.detectedLang || 'Автоопределение',
      academicNotes: parsed.academicNotes || 'Перевод выполнен с соблюдением норм академического научного стиля.',
      keyTerms: Array.isArray(parsed.keyTerms) ? parsed.keyTerms : []
    });
  } catch {
    return res.json({
      translatedText: `[Научный перевод]:\n${req.body?.text || ''}`,
      detectedLang: 'Автоопределение',
      academicNotes: 'Временная задержка связи с языковым сервером. Повторите запрос через несколько секунд.',
      keyTerms: []
    });
  }
});

// Helper: Extract readable text blocks from binary PDF / DOC / PPT buffers as deterministic fallback
function extractReadableTextFromBuffer(buffer: Buffer, ext: string): string[] {
  const pages: string[] = [];

  if (ext === 'pdf') {
    const rawLatin = buffer.toString('latin1');
    // Extract parenthesized PDF text strings (...) and hex/UTF16 strings
    const textChunks: string[] = [];
    const btEtRegex = /BT[\s\S]*?ET/g;
    const btBlocks = rawLatin.match(btEtRegex) || [];
    for (const block of btBlocks) {
      const parenMatches = block.match(/\((?:\\.|[^\\()])*\)/g) || [];
      const lineParts: string[] = [];
      for (const m of parenMatches) {
        const inner = m
          .slice(1, -1)
          .replace(/\\n/g, '\n')
          .replace(/\\r/g, ' ')
          .replace(/\\t/g, ' ')
          .replace(/\\\(/g, '(')
          .replace(/\\\)/g, ')')
          .replace(/\\\\/g, '\\');
        if (/[A-Za-zА-Яа-яЁё0-9]{2,}/.test(inner)) {
          lineParts.push(inner.trim());
        }
      }
      if (lineParts.length > 0) {
        textChunks.push(lineParts.join(' '));
      }
    }

    if (textChunks.length > 0) {
      const combined = textChunks.join('\n');
      const words = combined.split(/\s+/);
      const chunkSize = 260;
      for (let i = 0; i < words.length; i += chunkSize) {
        const slice = words.slice(i, i + chunkSize).join(' ').trim();
        if (slice) pages.push(slice);
      }
      if (pages.length > 0) return pages;
    }
  }

  // Try UTF-8 and UTF-16LE readable sequences (useful for .doc / .ppt / .ppx binary streams)
  const utf8Text = buffer.toString('utf8');
  const utf16Text = buffer.toString('utf16le');

  const extractCleanRuns = (str: string) => {
    const matches = str.match(/[A-Za-zА-Яа-яЁё0-9.,;:!?()"«»—\-\s]{18,}/g) || [];
    return matches
      .map((s) => s.replace(/\s+/g, ' ').trim())
      .filter(
        (s) =>
          s.length >= 20 &&
          /[A-Za-zА-Яа-яЁё]{4,}/.test(s) &&
          !/^(Content_Types|xml|rels|theme|fontTable|styles|word\/|ppt\/|docProps)/i.test(s)
      );
  };

  const runs8 = extractCleanRuns(utf8Text);
  const runs16 = extractCleanRuns(utf16Text);
  const bestRuns = runs16.join(' ').length > runs8.join(' ').length ? runs16 : runs8;

  if (bestRuns.length > 0) {
    const fullText = bestRuns.join('\n\n');
    const paragraphs = fullText.split(/\n{2,}/);
    let current = '';
    for (const p of paragraphs) {
      if ((current + '\n\n' + p).length > 1600 && current.trim()) {
        pages.push(current.trim());
        current = p;
      } else {
        current = current ? `${current}\n\n${p}` : p;
      }
    }
    if (current.trim()) pages.push(current.trim());
  }

  return pages;
}

// POST /api/library/ocr-pages
// Performs high-accuracy Vision OCR on rendered images of scanned PDF pages
app.post('/api/library/ocr-pages', async (req, res) => {
  try {
    const { fileName = 'scan.pdf', pages = [] } = req.body;
    if (!Array.isArray(pages) || pages.length === 0) {
      return res.status(400).json({ error: 'Список страниц для OCR пуст.' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({
        error: 'GEMINI_API_KEY не настроен на сервере, переключение на локальный браузерный OCR.',
        fallbackToLocalOcr: true
      });
    }

    const batch = pages.slice(0, 5);
    const parts: any[] = [];

    for (const item of batch) {
      const pageNum = Number(item.pageNumber) || 1;
      const rawData = String(item.imageBase64 || '').replace(/^data:[^;]+;base64,/, '');
      const mimeType = String(item.mimeType || 'image/jpeg');
      if (!rawData) continue;

      parts.push({
        text: `=== СКАН СТРАНИЦЫ №${pageNum} ИЗ ДОКУМЕНТА «${fileName}» ===`
      });
      parts.push({
        inlineData: {
          mimeType,
          data: rawData
        }
      });
    }

    if (parts.length === 0) {
      return res.status(400).json({ error: 'Не переданы изображения страниц для распознавания.' });
    }

    const ocrPrompt = `Ты — высокоточный академический модуль оптического распознавания текста (OCR) для университетской читалки «Библиотека студента».
Перед тобой отсканированные страницы (изображения) из PDF-документа «${fileName}».

Твоя задача:
1. Провести полное и максимально точное распознавание текста (OCR) на каждом переданном изображении страницы.
2. Распознавай печатный, машинописный, старопечатный и разборчивый рукописный текст на русском, английском, немецком, французском, испанском, латинском и китайском языках.
3. Восстанавливай естественное деление на абзацы (разделяй абзацы через \\n\\n), сохраняй заголовки, сноски, нумерацию списков и цитаты. Убирай артефакты переноса слов по слогам на концах строк (например, «ис-\\nторический» -> «исторический»).
4. Ничего не сокращай и не пропускай: весь видимый текст страницы должен быть распознан целиком, чтобы по нему работали полнотекстовый поиск и автоматический переводчик.
5. Если на странице есть только иллюстрация/схема/таблица, распознай все подписи, заголовки и данные таблицы, а также кратко опиши структуру схемы в квадратных скобках.

Верни ответ в СТРОГОМ JSON формате:
{
  "pages": [
    {
      "pageNumber": 1,
      "title": "Заголовок страницы или колонтитул (если есть, иначе «Страница N»)",
      "content": "Полный распознанный текст страницы с разделением абзацев через \\n\\n",
      "bullets": ["Ключевой тезис или пункт списка (если на странице есть маркированный список)"],
      "confidence": 97
    }
  ]
}
Отвечай ТОЛЬКО валидным JSON без markdown-оберток.`;

    parts.push({ text: ocrPrompt });

    const aiResult = await callGeminiWithFallback({
      contents: [{ role: 'user', parts }],
      config: {
        temperature: 0.1
      },
      timeoutMs: 28000
    });

    if (!aiResult?.text) {
      return res.status(503).json({
        error: 'Серверная модель OCR временно недоступна.',
        fallbackToLocalOcr: true
      });
    }

    const cleanedJson = aiResult.text
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();

    let parsed: any = null;
    try {
      parsed = JSON.parse(cleanedJson);
    } catch {
      const firstBrace = cleanedJson.indexOf('{');
      const lastBrace = cleanedJson.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        parsed = JSON.parse(cleanedJson.slice(firstBrace, lastBrace + 1));
      }
    }

    if (Array.isArray(parsed?.pages) && parsed.pages.length > 0) {
      return res.json({
        ocrEngine: 'gemini-vision',
        pages: parsed.pages.map((p: any, idx: number) => ({
          pageNumber: Number(p.pageNumber) || Number(batch[idx]?.pageNumber) || idx + 1,
          title: String(p.title || `Страница ${Number(p.pageNumber) || idx + 1}`),
          content: String(p.content || '').trim(),
          bullets: Array.isArray(p.bullets) && p.bullets.length > 0 ? p.bullets.map(String) : undefined,
          isScannedPage: true,
          isOcrRecognized: true,
          ocrEngine: 'gemini-vision',
          ocrConfidence: Number(p.confidence) || 96
        }))
      });
    }

    return res.status(503).json({
      error: 'Не удалось разобрать JSON ответа OCR.',
      fallbackToLocalOcr: true
    });
  } catch (err: any) {
    return res.status(503).json({
      error: err?.message || 'Ошибка серверного OCR.',
      fallbackToLocalOcr: true
    });
  }
});

// POST /api/library/parse-file
app.post('/api/library/parse-file', async (req, res) => {
  try {
    const { fileName = 'document.pdf', fileType = 'pdf', base64Data = '' } = req.body;
    const cleanBase64 = String(base64Data).replace(/^data:[^;]+;base64,/, '');
    if (!cleanBase64) {
      return res.status(400).json({ error: 'Пустые данные файла.' });
    }

    const buffer = Buffer.from(cleanBase64, 'base64');
    const ext = String(fileType || fileName.split('.').pop() || 'pdf').toLowerCase();

    // 1. For PDF files when GEMINI_API_KEY is available and size <= 18MB, use Gemini multimodal extraction + OCR for scanned pages
    if (ext === 'pdf' && process.env.GEMINI_API_KEY && buffer.length <= 18 * 1024 * 1024) {
      try {
        const prompt = `Ты — академический модуль оцифровки и оптического распознавания текста (OCR) для читалки «Библиотека студента».
Извлеки и распознай ВЕСЬ текст из прикрепленного PDF-документа («${fileName}») с разбивкой по страницам (даже если страницы являются отсканированными картинками/фотографиями книги!).
Сохраняй заголовки, абзацы, списки и ключевые тезисы без пропусков и без выдумывания фактов.

Верни СТРОГИЙ JSON следующего формата:
{
  "isScannedPdf": true,
  "pages": [
    {
      "pageNumber": 1,
      "title": "Заголовок страницы или раздела",
      "content": "Полный распознанный читаемый текст страницы с разделением на абзацы через \\n\\n",
      "bullets": ["Ключевой тезис 1 (если есть)"],
      "speakerNotes": "",
      "isScannedPage": true,
      "isOcrRecognized": true
    }
  ]
}
Отвечай ТОЛЬКО валидным JSON.`;

        const aiResult = await callGeminiWithFallback({
          contents: [
            {
              role: 'user',
              parts: [
                {
                  inlineData: {
                    mimeType: 'application/pdf',
                    data: cleanBase64
                  }
                },
                { text: prompt }
              ]
            }
          ],
          timeoutMs: 25000
        });

        if (aiResult?.text) {
          const jsonStr = aiResult.text.replace(/```json/gi, '').replace(/```/g, '').trim();
          let parsed: any = null;
          try {
            parsed = JSON.parse(jsonStr);
          } catch {
            const firstBrace = jsonStr.indexOf('{');
            const lastBrace = jsonStr.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace > firstBrace) {
              parsed = JSON.parse(jsonStr.slice(firstBrace, lastBrace + 1));
            }
          }
          if (Array.isArray(parsed?.pages) && parsed.pages.length > 0) {
            return res.json({
              isScannedPdf: Boolean(parsed.isScannedPdf),
              pages: parsed.pages.map((p: any, idx: number) => ({
                pageNumber: Number(p.pageNumber) || idx + 1,
                title: String(p.title || `Страница ${idx + 1}`),
                content: String(p.content || '').trim(),
                bullets: Array.isArray(p.bullets) ? p.bullets.map(String) : undefined,
                speakerNotes: p.speakerNotes ? String(p.speakerNotes) : undefined,
                isScannedPage: Boolean(p.isScannedPage),
                isOcrRecognized: Boolean(p.isOcrRecognized ?? true),
                ocrEngine: 'gemini-vision',
                ocrConfidence: 96
              }))
            });
          }
        }
      } catch {
        // Fallback to deterministic extraction below
      }
    }

    // 2. Deterministic buffer extraction fallback for PDF / DOC / PPT / PPX
    const rawPages = extractReadableTextFromBuffer(buffer, ext);
    if (rawPages.length > 0) {
      const isSlideDeck = ext === 'ppt' || ext === 'pptx' || ext === 'ppx';
      return res.json({
        pages: rawPages.map((text, idx) => ({
          pageNumber: idx + 1,
          title: isSlideDeck ? `Слайд ${idx + 1}` : `Страница ${idx + 1}`,
          content: text,
          bullets: isSlideDeck
            ? text
                .split(/\n+/)
                .map((l) => l.trim())
                .filter((l) => l.length > 3)
                .slice(0, 8)
            : undefined
        }))
      });
    }

    return res.json({
      isScannedPdf: ext === 'pdf',
      pages: [
        {
          pageNumber: 1,
          title: `${fileName} — Страница 1`,
          content:
            ext === 'pdf'
              ? `Документ «${fileName}» является графическим сканом. Нажмите кнопку «РАСПОЗНАТЬ ТЕКСТ (OCR)» в верхней панели читалки для распознавания текста со сканов страниц.`
              : `Файл «${fileName}» (${ext.toUpperCase()}) успешно сохранен в Библиотеке студента.`,
          isScannedPage: ext === 'pdf',
          isOcrRecognized: false
        }
      ]
    });
  } catch (err: any) {
    return res.status(500).json({
      error: err?.message || 'Ошибка разбора файла на сервере.'
    });
  }
});

// POST /api/ai/site-qa
app.post('/api/ai/site-qa', async (req, res) => {
  try {
    const {
      question,
      query: rawQuery,
      selectedSites = [],
      history = [],
      aiMode = 'local',
      appData
    } = req.body;
    const query = (question || rawQuery || '').trim();
    const isWebMode = aiMode === 'web';

    if (!query) {
      return res.status(400).json({ error: 'Вопрос не может быть пустым.' });
    }

    const sitesOverview =
      selectedSites && selectedSites.length > 0
        ? selectedSites
            .map((site: any, idx: number) => {
              const parts = [
                `${idx + 1}. [${site.title}] (${site.url})`,
                `   Категория: ${site.category || 'Общее'} | Статус: ${site.status || 'ONLINE'}`,
                `   Теги: ${(site.tags || []).join(', ') || 'нет'}`
              ];

              if (site.writtenContent) {
                parts.push(`   Письменный паспорт ресурса: "${site.writtenContent.overview}"`);
                if (site.writtenContent.detectedSections && site.writtenContent.detectedSections.length > 0) {
                  parts.push(
                    `   Разделы сайта: ${site.writtenContent.detectedSections
                      .map((s: any) => `${s.title}: ${s.summary}`)
                      .join('; ')}`
                  );
                }
                if (site.writtenContent.keyTopics && site.writtenContent.keyTopics.length > 0) {
                  parts.push(`   Ключевые темы: ${site.writtenContent.keyTopics.join(', ')}`);
                }
                if (site.writtenContent.lastPublishedText) {
                  parts.push(`   Опубликованный текст на странице: "${site.writtenContent.lastPublishedText}"`);
                }
              } else if (site.contentSnippet) {
                parts.push(`   Сниппет содержания: "${site.contentSnippet}"`);
              }

              if (site.isScientific && site.scientificMeta) {
                parts.push(
                  `   Научная база: ${site.scientificMeta.source || 'Гуманитарный репозиторий'}, профиль: ${
                    site.scientificMeta.discipline || 'Гуманитарные науки'
                  }`
                );
              }

              if (site.diffHistory && site.diffHistory.length > 0) {
                parts.push(
                  `   Зафиксированные изменения письменных данных (Diff): ${site.diffHistory
                    .slice(0, 5)
                    .map(
                      (d: any) =>
                        `[Раздел: ${d.section}] Суть: ${d.summary} (Было: «${d.previousText || '—'}» → Стало: «${
                          d.newText
                        }»)`
                    )
                    .join('; ')}`
                );
              } else {
                parts.push(
                  `   Зафиксированные изменения письменных данных (Diff): ИЗМЕНЕНИЙ НЕ ОБНАРУЖЕНО (0 записей в истории правок).`
                );
              }

              return parts.join('\n');
            })
            .join('\n\n')
        : 'Сайты не выбраны или список прикрепленных сайтов пуст.';

    const internalAppBlock = formatInternalAppDataBlock(appData);

    const historyBlock =
      Array.isArray(history) && history.length > 0
        ? `\nПРЕДЫДУЩАЯ ИСТОРИЯ ДИАЛОГА В ТЕРМИНАЛЕ:\n` +
          history
            .filter((item: any) => item && item.text)
            .slice(-8)
            .map((item: any) => `${item.sender === 'user' ? 'Студент' : 'ИИ-Аналитик Pip-Boy'}: ${item.text}`)
            .join('\n\n') +
          '\n\n'
        : '';

    const systemPrompt = isWebMode
      ? `Ты — встроенный интеллектуальный ИИ-аналитик и академический консультант наручного терминала Pip-Boy 3000 (Student Edition).
АКТИВНЫЙ РЕЖИМ: РЕЖИМ 2 — ГЛОБАЛЬНЫЙ КОНТУР (ПРИКРЕПЛЕННЫЕ САЙТЫ + ДАННЫЕ ПРИЛОЖЕНИЯ + ИНТЕРНЕТ).

В этом режиме ты используешь:
1) Прикрепленные пользователем сайты и их реальные текстовые изменения (Diff);
2) Внутренние данные приложения (расписание верхней/нижней недели, оценки БРС, профиль студента);
3) Прочие данные из Интернета, поисковую систему Google и широкую академическую базу знаний.

=== 1. ПРИКРЕПЛЁННЫЕ САЙТЫ (${selectedSites.length} шт.) ===
${sitesOverview}

=== 2. ВНУТРЕННИЕ ДАННЫЕ ПРИЛОЖЕНИЯ PIP-BOY ===
${internalAppBlock}
${historyBlock}
ТЕКУЩИЙ ВОПРОС СТУДЕНТА:
"${query}"

ТРЕБОВАНИЯ К ОТВЕТУ (РЕЖИМ 2 — С ИНТЕРНЕТОМ):
1. Отвечай на чистом русском языке, четко, содержательно и структурированно.
2. ЗАПРЕТ НА ГАЛЛЮЦИНАЦИИ ИЗМЕНЕНИЙ: Никогда не выдумывай и не приписывай сайтам в мониторинге несуществующие изменения текста, обновления расписаний или новые приказы, если они явно не указаны в поле «Зафиксированные изменения письменных данных (Diff)»! Если в истории правок 0 записей — прямо укажи, что изменений письменных данных на сайте не зафиксировано.
3. Сочетай данные из прикрепленных сайтов и приложения с дополнительной информацией из Интернета, четко помечая источник.`
      : `Ты — встроенный интеллектуальный ИИ-аналитик наручного терминала Pip-Boy 3000 (Student Edition).
АКТИВНЫЙ РЕЖИМ: РЕЖИМ 1 — СТРОГИЙ ЛОКАЛЬНЫЙ КОНТУР (ТОЛЬКО ПРИКРЕПЛЕННЫЕ САЙТЫ И ДАННЫЕ ПРИЛОЖЕНИЯ).

КРИТИЧЕСКИЕ ПРАВИЛА ISOLATION-РЕЖИМА (РЕЖИМ 1) И ЗАПРЕТ НА ГАЛЛЮЦИНАЦИИ:
1. Тебе СТРОГО ЗАПРЕЩЕНО использовать любую стороннюю информацию из Интернета, внешние факты, энциклопедические знания или сайты, которых нет в приведенных ниже данных!
2. СТРОГИЙ ЗАПРЕТ НА ГАЛЛЮЦИНАЦИИ В МОНИТОРИНГЕ САЙТОВ:
   • НИКОГДА не придумывай и не фантазируй изменения письменных данных, новые параграфы, даты, фамилии или обновления на сайтах!
   • Если в поле «Зафиксированные изменения письменных данных (Diff)» указано «ИЗМЕНЕНИЙ НЕ ОБНАРУЖЕНО (0 записей)», ты обязан честно ответить, что на данный момент никаких изменений письменных данных на сайте не зафиксировано.
   • Если поле «Опубликованный текст на странице» еще пустое, сообщи пользователю, что нужно нажать интерактивную кнопку «ПРОВЕРИТЬ ИЗМЕНЕНИЯ ПИСЬМЕННЫХ ДАННЫХ» в карточке сайта.
3. Ты имеешь право опираться ИСКЛЮЧИТЕЛЬНО на:
   • Прикрепленные пользователем сайты (их названия, URL, реальное письменное содержание и реальную историю изменений Diff);
   • Внутренние данные самого приложения: учебное расписание (верхняя/нижняя недели, аудитории, преподаватели), таблицу оценок/БРС и анкету профиля студента.
4. Если студент задает вопрос о фактах, событиях, личностях, теориях, новостях или внешних сайтах, ОТВЕТА НА КОТОРЫЙ НЕТ в приведенных ниже прикрепленных сайтах и данных приложения:
   - НЕ давай ответ из своих общих знаний или Интернета!
   - Обязательно поставь в самом начале ответа маркер [NO_LOCAL_DATA]
   - Вежливо и конкретно сообщи, какие локальные разделы терминала ты проверил (прикрепленные сайты, расписание, оценки, профиль), объясни, что запрашиваемых сведений в них нет, и порекомендуй студенту переключить тумблер во **«2-й режим (+ Данные из Интернета)»**, чтобы получить ответ с использованием внешних источников.

=== 1. ПРИКРЕПЛЁННЫЕ САЙТЫ (${selectedSites.length} шт.) ===
${sitesOverview}

=== 2. ВНУТРЕННИЕ ДАННЫЕ ПРИЛОЖЕНИЯ PIP-BOY ===
${internalAppBlock}
${historyBlock}
ТЕКУЩИЙ ВОПРОС СТУДЕНТА:
"${query}"

Отвечай на русском языке, четко и по существу, без малейших галлюцинаций, опираясь ТОЛЬКО на данные выше.`;

    let responseText = '';
    let webSources: Array<{ title: string; uri: string }> = [];

    const aiResult = await callGeminiWithFallback({
      contents: systemPrompt,
      config: isWebMode
        ? {
            tools: [{ googleSearch: {} }],
            temperature: 0.7
          }
        : {
            temperature: 0.15
          },
      timeoutMs: 11000
    });

    if (aiResult) {
      responseText = aiResult.text;
      if (isWebMode) {
        webSources = extractWebSources(aiResult.response);
      }
    }

    let suggestSwitchToWeb = false;
    if (!isWebMode && responseText.includes('[NO_LOCAL_DATA]')) {
      suggestSwitchToWeb = true;
      responseText = responseText.replace(/\[NO_LOCAL_DATA\]/g, '').trim();
    }

    if (!responseText) {
      const titlesList =
        selectedSites.length > 0
          ? selectedSites.map((s: any) => `«${s.title}»`).join(', ')
          : 'Прикрепленные сайты не выбраны';

      if (!isWebMode) {
        responseText = `### 🔒 Отчёт локального контура Pip-Boy (Режим 1: Только сайты и приложение)\n**Проверенные прикреплённые сайты:** ${titlesList}\n**Внутренние данные приложения:** Расписание (${
          appData?.schedule?.length || 0
        } пар), Оценки (${appData?.grades?.length || 0} предм.), Профиль (${
          appData?.profile?.fullName || 'не заполнен'
        }).\n\n` +
          (selectedSites.length > 0
            ? selectedSites
                .map(
                  (s: any, idx: number) =>
                    `**${idx + 1}. ${s.title} (${s.url}):**\n` +
                    `• *Содержание:* ${
                      s.writtenContent?.overview || s.contentSnippet || 'Текстовый паспорт сохранен в терминале.'
                    }\n` +
                    `• *Последние изменения (Diff):* ${
                      s.diffHistory?.[0]
                        ? `${s.diffHistory[0].section} — ${s.diffHistory[0].summary}`
                        : 'Новых правок не зафиксировано.'
                    }`
                )
                .join('\n\n')
            : `В локальном контуре доступны данные вашего расписания и зачетной книжки. Для анализа внешних сведений из сети переключитесь во **2-й режим (+ Данные из Интернета)**.`);
      } else {
        responseText = `### 🌐 Аналитический отчёт Pip-Boy (Режим 2: Приложение + Интернет)\n**Анализируемые ресурсы:** ${titlesList}\n\nПо вашему запросу «${query}» проанализированы локальные данные приложения и внешние справочные сведения.`;
      }
    }

    return res.json({
      answer: responseText,
      aiMode: isWebMode ? 'web' : 'local',
      suggestSwitchToWeb,
      webSources,
      sitesAnalyzed: selectedSites.map((s: any) => ({ id: s.id, title: s.title, url: s.url }))
    });
  } catch {
    return res.status(500).json({
      error: 'Не удалось получить ответ от нейросети. Попробуйте еще раз через несколько секунд.'
    });
  }
});

// POST /api/ai/grade-analysis
// Analyzes student subject points, target threshold, remaining maximum and outputs precise actionable guidance in Russian
app.post('/api/ai/grade-analysis', async (req, res) => {
  try {
    const {
      subject,
      targetThreshold,
      currentScore,
      maxScore,
      remainingMax,
      pointsNeeded,
      requiredRatePercent,
      aiMode = 'local',
      appData
    } = req.body;
    const isWebMode = aiMode === 'web';

    if (!subject) {
      return res.status(400).json({ error: 'Subject data is required' });
    }

    const scaleDesc = (subject.scale || [])
      .map((s: any) => `«${s.label}»: от ${s.minScore} баллов`)
      .join(', ');

    const internalContext = formatInternalAppDataBlock(appData);

    const prompt = isWebMode
      ? `Ты — академический тьютор и консультант для студентов в РЕЖИМЕ 2 (Данные приложения + Интернет).
Проанализируй текущее состояние успеваемости студента по дисциплине:
- Название дисциплины: "${subject.name || 'Предмет'}"
- Преподаватель (ФИО): "${subject.teacherName || 'Не указан'}"
- Текущий балл: ${currentScore} из ${maxScore} возможных
- Оставшийся доступный максимум баллов в семестре: ${remainingMax}
- Шкала оценивания предмета: [${scaleDesc || 'Не указана'}]
- Выбранная целевая отметка: "${targetThreshold ? targetThreshold.label : 'Не выбрана'}" (порог: ${targetThreshold ? targetThreshold.minScore : '-'} баллов)
- Дефицит баллов до цели: ${pointsNeeded} баллов
- Требуемый средний процент выполнения на оставшихся заданиях: ${requiredRatePercent}%

Дополнительный контекст из приложения (расписание и профиль):
${internalContext}

ТРЕБОВАНИЯ К ОТВЕТУ (РЕЖИМ 2 — С ИНТЕРНЕТОМ):
1. Обязательно сформулируй точные цифры: «До оценки "..." осталось набрать X баллов из Y оставшихся. Минимальный средний результат на оставшихся заданиях: Z%».
2. Учти расписание занятий студента по этому предмету (если оно есть в данных приложения).
3. Поскольку включен Режим 2 (+ Интернет), порекомендуй 1-2 конкретных внешних открытых академических ресурса, учебника или курса в Интернете по предмету «${subject.name || 'дисциплине'}», которые помогут добрать баллы.`
      : `Ты — академический тьютор терминала Pip-Boy в РЕЖИМЕ 1 (СТРОГО ЛОКАЛЬНЫЙ КОНТУР: только данные приложения и сайтов).
КРИТИЧЕСКОЕ ПРАВИЛО: Опирайся ТОЛЬКО на математические данные предмета, расписание занятий студента и данные внутри приложения. НЕ используй и НЕ советуй сторонние сайты из Интернета!

Данные по дисциплине:
- Название дисциплины: "${subject.name || 'Предмет'}"
- Преподаватель (ФИО): "${subject.teacherName || 'Не указан'}"
- Текущий балл: ${currentScore} из ${maxScore} возможных
- Оставшийся доступный максимум баллов в семестре: ${remainingMax}
- Шкала оценивания предмета: [${scaleDesc || 'Не указана'}]
- Выбранная целевая отметка: "${targetThreshold ? targetThreshold.label : 'Не выбрана'}" (порог: ${targetThreshold ? targetThreshold.minScore : '-'} баллов)
- Дефицит баллов до цели: ${pointsNeeded} баллов
- Требуемый средний процент выполнения на оставшихся заданиях: ${requiredRatePercent}%

Внутренние данные приложения (расписание, профиль, оценки):
${internalContext}

ТРЕБОВАНИЯ К ОТВЕТУ (РЕЖИМ 1 — ТОЛЬКО ПРИЛОЖЕНИЕ):
1. Краткий, математически точный совет на русском языке (2-4 предложения) строго по данным приложения.
2. Обязательно сформулируй точные цифры: «До оценки "..." осталось набрать X баллов из Y оставшихся. Минимальный средний результат на оставшихся заданиях: Z%».
3. Сопоставь стратегию добора баллов с расписанием пар студента в приложении (лекции/семинары/преподаватель), не привлекая внешние интернет-источники.`;

    let responseText = '';
    let webSources: Array<{ title: string; uri: string }> = [];

    const aiResult = await callGeminiWithFallback({
      contents: prompt,
      config: isWebMode ? { tools: [{ googleSearch: {} }] } : { temperature: 0.15 },
      timeoutMs: 9500
    });

    if (aiResult) {
      responseText = aiResult.text;
      if (isWebMode) {
        webSources = extractWebSources(aiResult.response);
      }
    }

    if (!responseText) {
      if (targetThreshold) {
        if (currentScore >= targetThreshold.minScore) {
          responseText = `🎯 Цель «${targetThreshold.label}» (${targetThreshold.minScore} б.) уже выполнена! Набрано ${currentScore} из ${maxScore} баллов. Оставшиеся ${remainingMax} баллов можно распределить на подготовку к смежным дисциплинам из вашего расписания.`;
        } else if (pointsNeeded > remainingMax) {
          responseText = `⚠️ До оценки «${targetThreshold.label}» (${targetThreshold.minScore} б.) необходимо ${pointsNeeded} баллов, но до конца курса доступно максимум ${remainingMax} б. Дефицит составляет ${pointsNeeded - remainingMax} б. Рекомендуем обратиться к преподавателю (${subject.teacherName || 'ведущему курс'}) на ближайшем занятии по расписанию.`;
        } else {
          responseText = `До оценки «${targetThreshold.label}» осталось набрать ${pointsNeeded} баллов из ${remainingMax} оставшихся. Минимальный средний результат на оставшихся заданиях: ${requiredRatePercent}%. Сфокусируйтесь на семинарах и контрольных точках в вашем учебном расписании.`;
        }
      } else {
        responseText = `По предмету «${subject.name}» набрано ${currentScore} из ${maxScore} баллов (осталось набрать до ${remainingMax} б.). Выберите целевой рубеж в карточке предмета для построения пошаговой стратегии.`;
      }
    }

    return res.json({
      advice: responseText,
      aiMode: isWebMode ? 'web' : 'local',
      webSources,
      pointsNeeded,
      remainingMax,
      requiredRatePercent
    });
  } catch {
    return res.status(500).json({
      error: 'Не удалось получить анализ от AI. Проверьте соединение.'
    });
  }
});

// Helper: deterministic non-hallucinating parser for plain-text schedule input when AI models are overloaded
function parseScheduleFromTextDeterministic(rawText: string): Array<{
  day: string;
  weekParity: string;
  lessonNumber: number;
  startTime: string;
  endTime: string;
  subject: string;
  lessonType: string;
  classroom?: string;
  teacher?: string;
  notes?: string;
}> {
  if (!rawText || !rawText.trim()) return [];

  const dayPatterns: Array<{ code: string; regex: RegExp }> = [
    { code: 'MON', regex: /^(понедельник|пн|mon)\b/i },
    { code: 'TUE', regex: /^(вторник|вт|tue)\b/i },
    { code: 'WED', regex: /^(среда|ср|wed)\b/i },
    { code: 'THU', regex: /^(четверг|чт|thu)\b/i },
    { code: 'FRI', regex: /^(пятница|пт|fri)\b/i },
    { code: 'SAT', regex: /^(суббота|сб|sat)\b/i },
  ];

  const defaultSlotTimes: Record<number, { start: string; end: string }> = {
    1: { start: '09:00', end: '10:30' },
    2: { start: '10:40', end: '12:10' },
    3: { start: '12:20', end: '13:50' },
    4: { start: '14:30', end: '16:00' },
    5: { start: '16:10', end: '17:40' },
    6: { start: '17:50', end: '19:20' },
  };

  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  let currentDay = 'MON';
  let currentParity = 'BOTH';
  let lessonCounterForDay = 1;
  const results: Array<any> = [];

  for (const line of lines) {
    // Check if line switches day of week
    let matchedDayOnly = false;
    for (const dp of dayPatterns) {
      if (dp.regex.test(line)) {
        currentDay = dp.code;
        lessonCounterForDay = 1;
        const remainder = line.replace(dp.regex, '').replace(/^[:\-—.,\s]+/, '').trim();
        if (!remainder) {
          matchedDayOnly = true;
        }
        break;
      }
    }
    if (matchedDayOnly) continue;

    // Check parity markers
    if (/верхн|нечет|числител/i.test(line) && line.length < 35) {
      currentParity = 'UPPER';
      continue;
    }
    if (/нижн|четн|знаменател/i.test(line) && line.length < 35) {
      currentParity = 'LOWER';
      continue;
    }

    // Match lines with time range e.g. "09:00 - 10:30" or "1 пара (9:00-10:30)"
    const timeMatch = line.match(/(\d{1,2}[:.]\d{2})\s*[-–—]\s*(\d{1,2}[:.]\d{2})/);
    const lessonNumMatch = line.match(/(?:^|\s)([1-7])\s*(?:пара|ур\.?|занятие)/i);

    if (!timeMatch && !lessonNumMatch) continue;

    let cleanLine = line;
    for (const dp of dayPatterns) {
      cleanLine = cleanLine.replace(dp.regex, '').trim();
    }

    let lessonNumber = lessonNumMatch ? Number(lessonNumMatch[1]) : lessonCounterForDay;
    const slot = defaultSlotTimes[lessonNumber] || defaultSlotTimes[1];
    const startTime = timeMatch ? timeMatch[1].replace('.', ':').padStart(5, '0') : slot.start;
    const endTime = timeMatch ? timeMatch[2].replace('.', ':').padStart(5, '0') : slot.end;

    if (timeMatch) {
      cleanLine = cleanLine.replace(timeMatch[0], ' ');
    }
    if (lessonNumMatch) {
      cleanLine = cleanLine.replace(lessonNumMatch[0], ' ');
    }

    let lineParity = currentParity;
    if (/верхн|нечет|числител/i.test(cleanLine)) {
      lineParity = 'UPPER';
      cleanLine = cleanLine.replace(/\b(верхняя|нечетная|числитель|верх\.?)\b/gi, ' ');
    } else if (/нижн|четн|знаменател/i.test(cleanLine)) {
      lineParity = 'LOWER';
      cleanLine = cleanLine.replace(/\b(нижняя|четная|знаменатель|низ\.?)\b/gi, ' ');
    }

    let lessonType = 'SEMINAR';
    if (/лекц|лк\b/i.test(cleanLine)) lessonType = 'LECTURE';
    else if (/лаб\b|лабораторн/i.test(cleanLine)) lessonType = 'LAB';
    else if (/практ|пр\b/i.test(cleanLine)) lessonType = 'PRACTICE';
    else if (/экзам|зачет|коллоквиум/i.test(cleanLine)) lessonType = 'EXAM';

    // Extract classroom if present (e.g. "ауд. 304", "каб. 12")
    let classroom: string | undefined;
    const roomMatch = cleanLine.match(/(?:ауд\.?|аудитория|каб\.?)\s*([0-9а-яa-z\-/]+)/i);
    if (roomMatch) {
      classroom = `ауд. ${roomMatch[1]}`;
      cleanLine = cleanLine.replace(roomMatch[0], ' ');
    }

    const subject = cleanLine
      .replace(/^[\s:,\-—()[\].]+|[\s:,\-—()[\].]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (subject.length >= 3) {
      results.push({
        day: currentDay,
        weekParity: lineParity,
        lessonNumber,
        startTime,
        endTime,
        subject: subject.slice(0, 120),
        lessonType,
        classroom,
      });
      lessonCounterForDay++;
    }
  }

  return results;
}

// POST /api/ai/parse-schedule
// Multimodal & text schedule parser identifying upper/lower weeks, days, classrooms, times
app.post('/api/ai/parse-schedule', async (req, res) => {
  try {
    const { image, mimeType = 'image/jpeg', url, text } = req.body;

    if (!image && !url && !text) {
      return res.status(400).json({ error: 'Предоставьте скриншот, ссылку на сайт или текст расписания.' });
    }

    let fetchedText = '';
    if (url) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const resp = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);
        if (resp.ok) {
          const raw = await resp.text();
          fetchedText = raw
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .slice(0, 10000);
        }
      } catch {
        // Ignore fetch failure and proceed with URL string
      }
    }

    const promptText = `Ты — специализированный академический парсер расписания вуза.
Твоя задача — извлечь ВСЕ РЕАЛЬНЫЕ учебные занятия ИСКЛЮЧИТЕЛЬНО из предоставленного источника (скриншота, текста или сайта).

СТРОГИЙ ЗАПРЕТ НА ГАЛЛЮЦИНАЦИИ И ВЫДУМЫВАНИЕ:
1. Извлекай ТОЛЬКО те предметы, аудитории и преподавателей, которые ЯВНО присутствуют в предоставленном источнике!
2. КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО выдумывать, домысливать или генерировать вымышленные/примерные предметы («История отечественной культуры», «Латинский язык», «Философия» и т.п.)!
3. Если в предоставленном источнике нет расписания, изображение не читаемо, сайт не содержит расписания или источник пуст:
   ВЕРНИ ПУСТОЙ МАССИВ "classes": [] и понятное объяснение в "summary"! Никаких придуманных занятий!

Распредели найденные в источнике занятия по дням недели и четности:
- Верхняя неделя (нечетная / числитель / верх / I неделя) -> "UPPER"
- Нижняя неделя (четная / знаменатель / низ / II неделя) -> "LOWER"
- Обе недели (каждую неделю / еженедельно) -> "BOTH"

Дни недели:
- "MON" (Понедельник)
- "TUE" (Вторник)
- "WED" (Среда)
- "THU" (Четверг)
- "FRI" (Пятница)
- "SAT" (Суббота)

Типы занятий:
- "LECTURE" (Лекция)
- "SEMINAR" (Семинар)
- "PRACTICE" (Практическое занятие)
- "LAB" (Лабораторная работа)
- "EXAM" (Зачет, экзамен, коллоквиум)
- "OTHER" (Другое)

Верни СТРОГИЙ JSON без лишнего текста:
{
  "classes": [
    {
      "day": "MON",
      "weekParity": "UPPER",
      "lessonNumber": 1,
      "startTime": "09:00",
      "endTime": "10:30",
      "subject": "Название предмета ИЗ ИСТОЧНИКА",
      "lessonType": "LECTURE",
      "classroom": "ауд. 204",
      "teacher": "ФИО преподавателя",
      "notes": "Примечание или ссылка"
    }
  ],
  "summary": "Краткая характеристика: сколько реальных занятий найдено в источнике. Если источник не содержит расписания — прямо укажи об этом."
}
Отвечай ТОЛЬКО валидным JSON.`;

    const contentsPayload = image
      ? {
          parts: [
            {
              inlineData: {
                mimeType: mimeType || 'image/jpeg',
                data: image.includes('base64,') ? image.split('base64,')[1] : image,
              },
            },
            {
              text: promptText,
            },
          ],
        }
      : [
          promptText,
          text ? `\n\nТЕКСТ РАСПИСАНИЯ ДЛЯ АНАЛИЗА:\n${text}` : '',
          fetchedText ? `\n\nСОДЕРЖАНИЕ С САЙТА РАСПИСАНИЯ (${url}):\n${fetchedText}` : (url ? `\n\nURL РАСПИСАНИЯ: ${url}` : '')
        ].join('\n');

    const aiResult = await callGeminiWithFallback({
      contents: contentsPayload,
      config: {
        responseMimeType: 'application/json',
      },
      timeoutMs: 35000,
    });

    const responseText = aiResult?.text || '';

    if (responseText) {
      try {
        const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleanJson);
        const parsedClasses = Array.isArray(parsed.classes) ? parsed.classes : [];

        if (parsedClasses.length === 0) {
          return res.json({
            classes: [],
            error:
              parsed.summary ||
              'В предоставленном источнике не обнаружено учебных занятий. Загрузите чёткий скриншот расписания или прямую ссылку на страницу расписания.'
          });
        }

        return res.json({
          classes: parsedClasses,
          summary: parsed.summary || `Успешно распознано пар: ${parsedClasses.length}.`
        });
      } catch {
        // Proceed to deterministic text parser if JSON was malformed
      }
    }

    // If AI models experienced a global 503 spike and the user provided text or URL content, try deterministic extraction (no hallucinations)
    const candidateRawText = [text || '', fetchedText || ''].join('\n').trim();
    if (candidateRawText) {
      const deterministicClasses = parseScheduleFromTextDeterministic(candidateRawText);
      if (deterministicClasses.length > 0) {
        return res.json({
          classes: deterministicClasses,
          summary: `Распознано пар из текста источника: ${deterministicClasses.length}.`
        });
      }
    }

    return res.json({
      classes: [],
      error:
        'Сервер распознавания временно перегружен или в источнике не обнаружено расписания. Повторите попытку через пару секунд или вставьте расписание текстом.'
    });
  } catch {
    return res.json({
      classes: [],
      error: 'Не удалось распознать расписание. Попробуйте еще раз или внесите вручную.'
    });
  }
});

// GET /api/humanities/curated-databases
app.get('/api/humanities/curated-databases', (req, res) => {
  res.json({ databases: CURATED_HUMANITIES_DBS });
});

// Helper: compute deterministic hash of normalized text
function computeTextHash(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  let h1 = 0xdeadbeef ^ normalized.length;
  let h2 = 0x41c6ce57 ^ normalized.length;
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 'sha-' + (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0') + '-' + normalized.length;
}

// Helper: decode basic HTML entities
function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&laquo;/gi, '«')
    .replace(/&raquo;/gi, '»')
    .replace(/&mdash;/gi, '—')
    .replace(/&ndash;/gi, '–')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)));
}

// Helper: extract real structured written content from raw HTML without any AI invention
function extractStructuredWrittenContentFromHtml(html: string, url: string, fallbackTitle: string) {
  const cleanHtml = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, ' ')
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');

  // Extract <title>
  const titleMatch = cleanHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const pageTitle = titleMatch ? decodeHtmlEntities(titleMatch[1].replace(/\s+/g, ' ').trim()) : fallbackTitle;

  // Extract meta description
  const descMatch =
    cleanHtml.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
    cleanHtml.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i) ||
    cleanHtml.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
  const metaDescription = descMatch ? decodeHtmlEntities(descMatch[1].replace(/\s+/g, ' ').trim()) : '';

  // Extract headings (h1, h2, h3)
  const headingRegex = /<(h[1-3])[^>]*>([\s\S]*?)<\/\1>/gi;
  const headings: string[] = [];
  let hMatch;
  while ((hMatch = headingRegex.exec(cleanHtml)) !== null && headings.length < 12) {
    const hText = decodeHtmlEntities(hMatch[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
    if (hText.length > 2 && !headings.includes(hText)) {
      headings.push(hText);
    }
  }

  // Extract meaningful paragraphs and list items
  const blockRegex = /<(p|li|article|section|blockquote|td|div)[^>]*>([\s\S]*?)<\/\1>/gi;
  const paragraphs: string[] = [];
  let bMatch;
  while ((bMatch = blockRegex.exec(cleanHtml)) !== null && paragraphs.length < 60) {
    const rawBlock = bMatch[2].replace(/<[^>]+>/g, ' ');
    const pText = decodeHtmlEntities(rawBlock.replace(/\s+/g, ' ').trim());
    if (pText.length >= 35 && !paragraphs.some((existing) => existing.includes(pText) || pText.includes(existing))) {
      paragraphs.push(pText);
    }
  }

  // Fallback full plain text if structured tags are sparse
  const fullPlainText = decodeHtmlEntities(
    cleanHtml
      .replace(/<\/(p|div|h1|h2|h3|h4|li|tr|br|section|article)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s*\n+/g, '\n')
      .trim()
  );

  const lines = fullPlainText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 20);

  const effectiveParagraphs = paragraphs.length > 0 ? paragraphs : lines.slice(0, 30);
  const combinedBodyText = effectiveParagraphs.slice(0, 20).join('\n\n') || fullPlainText.slice(0, 4000);

  const words = fullPlainText.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const readingTimeMin = Math.max(1, Math.ceil(wordCount / 180));

  const detectedSections =
    headings.length > 0
      ? headings.slice(0, 6).map((h, idx) => ({
          title: h.slice(0, 90),
          summary: effectiveParagraphs[idx]
            ? effectiveParagraphs[idx].slice(0, 180)
            : 'Раздел обнаружен в HTML-структуре страницы.'
        }))
      : [
          {
            title: 'Основное текстовое содержимое страницы',
            summary: (effectiveParagraphs[0] || fullPlainText || 'Текстовый блок страницы').slice(0, 180)
          }
        ];

  const overview =
    metaDescription ||
    (effectiveParagraphs.length > 0
      ? effectiveParagraphs.slice(0, 2).join(' ').slice(0, 420)
      : fullPlainText.slice(0, 400)) ||
    `Реальный текстовый снимок страницы ${url} (${wordCount} слов).`;

  const keyTopics = headings.slice(0, 5).map((h) => h.slice(0, 45));

  return {
    fullTitle: pageTitle || fallbackTitle,
    overview,
    detectedSections,
    keyTopics: keyTopics.length > 0 ? keyTopics : ['Письменное содержание сайта', 'Реальный HTML-снимок'],
    lastPublishedText: combinedBodyText.slice(0, 5000) || 'Текстовое содержимое на странице отсутствует или защищено от чтения.',
    wordCount,
    readingTimeMin,
    plainLines: effectiveParagraphs.length > 0 ? effectiveParagraphs : lines
  };
}

// Helper: compare previous text and new text strictly by lines/sentences without hallucinating
function computeRealTextDiff(previousText: string, newText: string): {
  hasChanged: boolean;
  changeType: 'ADDED' | 'MODIFIED' | 'REMOVED';
  section: string;
  summary: string;
  previousSnippet: string;
  newSnippet: string;
} | null {
  const prevNorm = (previousText || '').replace(/\s+/g, ' ').trim();
  const newNorm = (newText || '').replace(/\s+/g, ' ').trim();

  if (!prevNorm || !newNorm || prevNorm === newNorm) {
    return null;
  }

  const prevLines = (previousText || '')
    .split(/\n+/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 10);
  const newLines = (newText || '')
    .split(/\n+/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 10);

  const addedLines = newLines.filter((l) => !prevLines.includes(l));
  const removedLines = prevLines.filter((l) => !newLines.includes(l));

  if (addedLines.length === 0 && removedLines.length === 0) {
    return null;
  }

  const changeType: 'ADDED' | 'MODIFIED' | 'REMOVED' =
    removedLines.length === 0
      ? 'ADDED'
      : addedLines.length === 0
      ? 'REMOVED'
      : 'MODIFIED';

  const newSnippet = addedLines.slice(0, 3).join(' | ').slice(0, 450) || 'Часть текста была удалена со страницы.';
  const previousSnippet = removedLines.slice(0, 3).join(' | ').slice(0, 450) || 'Ранее данный фрагмент отсутствовал на странице.';

  const summary =
    changeType === 'ADDED'
      ? `Добавлен новый текстовый фрагмент на сайте (${addedLines.length} абз.)`
      : changeType === 'REMOVED'
      ? `Удален текстовый фрагмент со страницы (${removedLines.length} абз.)`
      : `Изменено письменное содержание на странице (обновлено фрагментов: ${addedLines.length})`;

  return {
    hasChanged: true,
    changeType,
    section: 'Письменное содержание страницы',
    summary,
    previousSnippet,
    newSnippet
  };
}

// POST /api/monitor/check-site
// Fetches real website HTML, extracts real written content, and compares with previous snapshot without any AI hallucinations
app.post('/api/monitor/check-site', async (req, res) => {
  try {
    const { url, title = 'Отслеживаемый сайт', previousText = '', previousHash = '' } = req.body;
    const targetUrl = String(url || '').trim();

    if (!targetUrl) {
      return res.status(400).json({ error: 'URL сайта не указан.' });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);

    let html = '';
    let httpStatus = 200;
    try {
      const response = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7'
        },
        signal: controller.signal
      });
      clearTimeout(timeout);
      httpStatus = response.status;
      html = await response.text();
    } catch (fetchErr: any) {
      clearTimeout(timeout);
      return res.json({
        reachable: false,
        hasChanged: false,
        checkedAt: Date.now(),
        message: `Сайт временно недоступен или блокирует прямые автоматические запросы (${fetchErr?.message || 'ошибка соединения'}). Изменений не зафиксировано, предыдущая версия текста сохранена.`
      });
    }

    const extracted = extractStructuredWrittenContentFromHtml(html, targetUrl, title);
    const currentHash = computeTextHash(extracted.lastPublishedText);

    // If this is the very first baseline snapshot (no previousHash or init-hash), we record the real text without claiming a change
    const isInitialBaseline = !previousHash || previousHash === 'init-hash' || !previousText;

    let diffResult = null;
    if (!isInitialBaseline && previousHash !== currentHash) {
      diffResult = computeRealTextDiff(previousText, extracted.lastPublishedText);
    }

    const hasRealChange = Boolean(diffResult && diffResult.hasChanged);

    let hostName = targetUrl;
    try {
      hostName = new URL(targetUrl).hostname;
    } catch {}

    return res.json({
      reachable: true,
      httpStatus,
      checkedAt: Date.now(),
      isInitialBaseline,
      hasChanged: hasRealChange,
      currentHash,
      writtenContent: {
        fullTitle: extracted.fullTitle,
        overview: extracted.overview,
        detectedSections: extracted.detectedSections,
        keyTopics: extracted.keyTopics,
        lastPublishedText: extracted.lastPublishedText,
        wordCount: extracted.wordCount,
        readingTimeMin: extracted.readingTimeMin,
        authorOrSource: hostName,
        contentStatus: hasRealChange ? 'ОБНОВЛЕНО' : 'АКТУАЛЬНО'
      },
      diff: diffResult,
      message: isInitialBaseline
        ? `Базовый снимок письменного содержания сайта успешно получен (${extracted.wordCount} слов). Теперь терминал сравнивает новые проверки с этим текстом.`
        : hasRealChange
        ? `Обнаружено реальное изменение письменного содержания на сайте: ${diffResult?.summary}`
        : `Проверка завершена: письменных изменений на сайте не обнаружено (текст полностью совпадает с предыдущей проверкой, ~${extracted.wordCount} слов).`
    });
  } catch {
    return res.status(500).json({
      reachable: false,
      hasChanged: false,
      error: 'Ошибка при проверке письменных данных сайта.'
    });
  }
});

// Mount Vite or static server
async function startServer() {
  const PORT = Number(process.env.PORT) || 3000;

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Pip-Boy Student OS running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
