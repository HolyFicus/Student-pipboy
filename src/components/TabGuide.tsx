import React, { useState } from 'react';
import {
  BookOpen,
  Plus,
  FlaskConical,
  HelpCircle,
  Copy,
  Check,
  Globe,
  Terminal,
  Library
} from 'lucide-react';
import { pipAudio } from '../utils/audio';

interface TabGuideProps {
  onGoToMonitor: () => void;
  onGoToScience: () => void;
}

export const TabGuide: React.FC<TabGuideProps> = ({
  onGoToMonitor,
  onGoToScience
}) => {
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  const handleCopyCommand = (id: string, cmd: string) => {
    pipAudio.playClick();
    navigator.clipboard.writeText(cmd).catch(() => {});
    setCopiedCmd(id);
    setTimeout(() => setCopiedCmd(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Intro Banner */}
      <div className="border border-[var(--crt-phosphor-dim)] bg-[#071309] p-4 sm:p-5 rounded-xl flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="text-sm sm:text-base font-bold uppercase tracking-wider text-[var(--crt-phosphor-bright)] flex items-center gap-2">
            <BookOpen size={18} /> КРАТКОЕ РУКОВОДСТВО ПО ЭКСПЛУАТАЦИИ PIP-BOY STUDENT
          </div>
          <div className="text-xs sm:text-sm text-[var(--crt-phosphor)]/80 max-w-2xl leading-relaxed">
            Терминал студента гуманитарного факультета для организации учебных порталов, чтения книг и сканов с автопереводом, мониторинга научных баз данных и расчёта БРС.
          </div>
        </div>

        <button
          onClick={onGoToMonitor}
          className="px-4 py-2 bg-[var(--crt-phosphor)] text-black font-bold text-xs rounded-lg cursor-pointer hover:bg-[var(--crt-phosphor-bright)] transition-colors uppercase tracking-wider flex items-center gap-1.5 shadow-md"
        >
          <Plus size={14} /> К МОНИТОРИНГУ ССЫЛОК
        </button>
      </div>

      {/* GitHub Pages Deployment Guide Card */}
      <div className="border-2 border-cyan-400/70 bg-cyan-950/20 p-4 sm:p-5 rounded-xl space-y-4 shadow-[0_0_18px_rgba(34,211,238,0.12)]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-cyan-500/30 pb-3">
          <div className="flex items-center gap-2 text-cyan-300 font-extrabold text-xs sm:text-sm uppercase tracking-wider">
            <Globe size={18} /> ПУБЛИКАЦИЯ САЙТА НА GITHUB PAGES (ПОШАГОВЫЙ ГАЙД)
          </div>
          <span className="px-2.5 py-0.5 rounded bg-cyan-400 text-black font-extrabold text-[10px] uppercase tracking-wider">
            ГОТОВО К GITHUB PAGES (АВТОДЕПЛОЙ)
          </span>
        </div>

        <p className="text-xs text-cyan-100/90 leading-relaxed">
          Приложение полностью адаптировано под статический хостинг <strong>GitHub Pages</strong>: настроены относительные пути сборки (<code>base: './'</code>), обход Jekyll (<code>.nojekyll</code>), маршрутизация <code>404.html</code>, автономная работа читалки с локальным OCR (<code>PDF.js + Tesseract.js</code>), переводчика и хранилища <code>IndexedDB / LocalStorage</code>, а также готовый файл автоматической публикации <code>.github/workflows/deploy.yml</code>.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          {/* Step A */}
          <div className="bg-[#061108] border border-cyan-500/40 rounded-lg p-3 space-y-2">
            <div className="font-extrabold text-cyan-300 uppercase">
              ШАГ 1. ЭКСПОРТ ИЛИ СОЗДАНИЕ РЕПОЗИТОРИЯ
            </div>
            <ol className="list-decimal list-inside space-y-1 text-[var(--crt-phosphor)]/90 leading-relaxed">
              <li>В верхней панели Google AI Studio нажмите <strong>«Export to GitHub»</strong> (иконка GitHub) или <strong>«Download ZIP»</strong>.</li>
              <li>Если скачали архив — создайте на <a href="https://github.com/new" target="_blank" rel="noreferrer" className="underline text-cyan-300">github.com/new</a> публичный репозиторий (например, <code>pipboy-student-os</code>).</li>
            </ol>
          </div>

          {/* Step B */}
          <div className="bg-[#061108] border border-cyan-500/40 rounded-lg p-3 space-y-2">
            <div className="font-extrabold text-cyan-300 uppercase">
              ШАГ 2. НАСТРОЙКА НА САЙТЕ GITHUB
            </div>
            <ol className="list-decimal list-inside space-y-1 text-[var(--crt-phosphor)]/90 leading-relaxed">
              <li>Откройте ваш репозиторий на GitHub и перейдите во вкладку <strong>Settings</strong> (верхнее меню).</li>
              <li>В левом боковом меню выберите раздел <strong>Pages</strong> (в блоке <em>Code and automation</em>).</li>
              <li>В выпадающем списке <strong>Build and deployment → Source</strong> выберите <strong>«GitHub Actions»</strong>.</li>
            </ol>
          </div>

          {/* Step C */}
          <div className="bg-[#061108] border border-cyan-500/40 rounded-lg p-3 space-y-2">
            <div className="font-extrabold text-cyan-300 uppercase">
              ШАГ 3. АВТОМАТИЧЕСКИЙ ЗАПУСК САЙТА
            </div>
            <ol className="list-decimal list-inside space-y-1 text-[var(--crt-phosphor)]/90 leading-relaxed">
              <li>Перейдите во вкладку <strong>Actions</strong> вашего репозитория на GitHub.</li>
              <li>Workflow <strong>«Deploy Pip-Boy 3000 Student OS to GitHub Pages»</strong> автоматически соберёт проект за ~1 минуту.</li>
              <li>После зелёной галочки ваш сайт будет доступен по ссылке <code>https://ваш-логин.github.io/имя-репозитория/</code>.</li>
            </ol>
          </div>
        </div>

        {/* Copyable git commands block */}
        <div className="bg-black/60 border border-cyan-500/30 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold text-cyan-300 flex items-center gap-1.5 uppercase">
              <Terminal size={13} /> Команды для загрузки проекта из папки на ПК в GitHub:
            </span>
            <button
              onClick={() =>
                handleCopyCommand(
                  'git-push',
                  'git init\ngit add .\ngit commit -m "Deploy Pip-Boy 3000 Student OS"\ngit branch -M main\ngit remote add origin https://github.com/ВАШ_ЛОГИН/ИМЯ_РЕПОЗИТОРИЯ.git\ngit push -u origin main'
                )
              }
              className="px-2.5 py-1 rounded bg-cyan-400 hover:bg-cyan-300 text-black font-extrabold text-[10px] uppercase flex items-center gap-1 cursor-pointer"
            >
              {copiedCmd === 'git-push' ? <Check size={12} /> : <Copy size={12} />}
              {copiedCmd === 'git-push' ? 'СКОПИРОВАНО' : 'КОПИРОВАТЬ КОМАНДЫ'}
            </button>
          </div>
          <pre className="text-[11px] text-cyan-200/90 font-mono overflow-x-auto leading-relaxed select-text">
{`git init
git add .
git commit -m "Deploy Pip-Boy 3000 Student OS"
git branch -M main
git remote add origin https://github.com/ВАШ_ЛОГИН/ИМЯ_РЕПОЗИТОРИЯ.git
git push -u origin main`}
          </pre>
        </div>
      </div>

      {/* Step by step cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Step 1 */}
        <div className="border border-[var(--crt-phosphor-dim)] bg-[#071309] p-4 rounded-xl space-y-2.5">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-[var(--crt-phosphor)] text-black font-extrabold text-xs flex items-center justify-center">
              1
            </span>
            <div className="font-bold text-xs uppercase tracking-wider text-[var(--crt-phosphor-bright)]">
              ДОБАВЛЕНИЕ ССЫЛОК И НАСТРОЙКА ОПРОСА
            </div>
          </div>
          <p className="text-xs text-[var(--crt-phosphor)]/85 leading-relaxed">
            Во вкладке <strong>«МОНИТОРИНГ»</strong> нажмите кнопку <strong>«+ НОВАЯ ССЫЛКА»</strong>:
          </p>
          <ul className="text-xs text-[var(--crt-phosphor)]/80 list-disc list-inside space-y-1">
            <li>Укажите название (например: <em>«Личный кабинет студента»</em>, <em>«Темы курсовых»</em>).</li>
            <li>Вставьте URL-адрес страницы портала, сайта кафедры или научной статьи.</li>
            <li><strong>Категории прямо при подключении:</strong> выбирайте существующую папку или создавайте новую на лету прямо в окне добавления.</li>
            <li><strong>Гибкий интервал опроса:</strong> выбирайте пресет (от 15 сек. до 1 ч.) либо задавайте произвольное время в секундах вручную (например: 45 сек.).</li>
            <li>Включайте Push-уведомления при обнаружении изменений.</li>
          </ul>
        </div>

        {/* Step 2: Student Library & Scanned PDF OCR */}
        <div className="border border-cyan-500/50 bg-[#071309] p-4 rounded-xl space-y-2.5">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-cyan-400 text-black font-extrabold text-xs flex items-center justify-center">
              2
            </span>
            <div className="font-bold text-xs uppercase tracking-wider text-cyan-300 flex items-center gap-1.5">
              <Library size={14} /> БИБЛИОТЕКА СТУДЕНТА, OCR СКАНОВ И ПЕРЕВОДЧИК
            </div>
          </div>
          <p className="text-xs text-[var(--crt-phosphor)]/85 leading-relaxed">
            Во вкладке <strong>«БИБЛИОТЕКА»</strong> загружайте учебники, монографии и презентации:
          </p>
          <ul className="text-xs text-[var(--crt-phosphor)]/80 list-disc list-inside space-y-1">
            <li>Поддерживаются форматы <strong>PDF, Word (DOCX, DOC), презентации (PPTX, PPX, PPT), TXT, MD</strong>.</li>
            <li><strong>Распознавание сканов (OCR):</strong> если PDF состоит из отсканированных страниц-картинок, система автоматически распознаёт текст (через ИИ или локальный движок <code>Tesseract.js</code>), чтобы работали поиск и переводчик.</li>
            <li><strong>Параллельный автопереводчик:</strong> кнопка <strong>«ПЕРЕВОДЧИК»</strong> в читалке включает синхронный перевод текущей страницы рядом с оригиналом.</li>
            <li>Поддерживается адаптивный горизонтальный разворот экрана для удобного чтения со смартфона и ПК.</li>
          </ul>
        </div>

        {/* Step 3 */}
        <div className="border border-[var(--crt-phosphor-dim)] bg-[#071309] p-4 rounded-xl space-y-2.5">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-[var(--crt-phosphor)] text-black font-extrabold text-xs flex items-center justify-center">
              3
            </span>
            <div className="font-bold text-xs uppercase tracking-wider text-[var(--crt-phosphor-bright)]">
              ОТСЛЕЖИВАНИЕ ОБНОВЛЕНИЙ (DIFF DETECTOR)
            </div>
          </div>
          <p className="text-xs text-[var(--crt-phosphor)]/85 leading-relaxed">
            Терминал регулярно мониторит добавленные ресурсы на предмет изменений:
          </p>
          <ul className="text-xs text-[var(--crt-phosphor)]/80 list-disc list-inside space-y-1">
            <li>При появлении правок карточка подсвечивается статусом <strong>«DIFF: ОБНОВЛЕНО»</strong>.</li>
            <li>Воспроизводится звуковой сигнал и регистрируется уведомление в колокольчике.</li>
            <li>Кнопка <strong>«ИСТОРИЯ»</strong> сохраняет протокол изменений с точной датой и временем.</li>
          </ul>
        </div>

        {/* Step 4: Graphical & Written Site Data + AI Consultant */}
        <div className="border border-amber-500/60 bg-amber-950/20 p-4 rounded-xl space-y-2.5">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-amber-400 text-black font-extrabold text-xs flex items-center justify-center">
              4
            </span>
            <div className="font-bold text-xs uppercase tracking-wider text-amber-300">
              ГРАФИЧЕСКО-ПИСЬМЕННЫЕ ДАННЫЕ И ИИ-АНАЛИТИК САЙТОВ
            </div>
          </div>
          <p className="text-xs text-amber-100/90 leading-relaxed">
            Вкладка <strong>«МОНИТОРИНГ»</strong> оснащена глубокой телеметрией и нейросетевым консультантом:
          </p>
          <ul className="text-xs text-amber-100/80 list-disc list-inside space-y-1">
            <li>
              <strong>Графическо-письменное отображение («ДАННЫЕ & ГРАФИКА»):</strong> интерактивный SVG-график задержки отклика (мс), диаграмма распределения веса, шкалы аптайма и структура разделов страницы.
            </li>
            <li>
              <strong>ИИ-Аналитик («СПРОСИТЬ ИИ»):</strong> возможность задать вопрос по конкретному сайту, расписанию или таблице оценок БРС.
            </li>
          </ul>
        </div>
      </div>

      {/* Science Quick Link */}
      <div className="border-2 border-[var(--crt-phosphor)] bg-[#08140a] p-4 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-[0_0_20px_var(--crt-glow)]">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-[var(--crt-phosphor)]/15 border border-[var(--crt-phosphor)] rounded-lg text-[var(--crt-phosphor-bright)]">
            <FlaskConical size={20} />
          </div>
          <div>
            <div className="font-bold text-xs sm:text-sm text-[var(--crt-phosphor-bright)] uppercase tracking-wider">
              ГОТОВЫ ПЕРЕЙТИ К НАУЧНЫМ БАЗАМ ДАННЫХ?
            </div>
            <div className="text-xs text-[var(--crt-phosphor)]/80">
              Каталог открытых библиотек, академический переводчик и встроенный гайд.
            </div>
          </div>
        </div>

        <button
          onClick={onGoToScience}
          className="px-4 py-2 bg-[var(--crt-phosphor)] text-black font-bold text-xs rounded-lg hover:bg-[var(--crt-phosphor-bright)] transition-colors uppercase tracking-wider cursor-pointer shrink-0"
        >
          В РАЗДЕЛ НАУКИ →
        </button>
      </div>

      {/* FAQ & Themes */}
      <div className="border border-[var(--crt-phosphor-dim)] bg-[#071309] p-4 sm:p-5 rounded-xl space-y-3">
        <div className="font-bold text-xs uppercase tracking-wider text-[var(--crt-phosphor-bright)] flex items-center gap-2">
          <HelpCircle size={15} /> ЧАСТО ЗАДАВАЕМЫЕ ВОПРОСЫ
        </div>

        <div className="space-y-3 text-xs text-[var(--crt-phosphor)]/85">
          <div>
            <strong className="text-[var(--crt-phosphor-bright)] block">
              — Сохраняются ли добавленные книги, расписание и ссылки на GitHub Pages?
            </strong>
            <span>
              Да! Все книги (включая оригиналы PDF и распознанный OCR-текст) хранятся в браузерной базе данных <strong>IndexedDB</strong>, а расписание, оценки БРС, предметы и ссылки — в <strong>LocalStorage</strong> вашего устройства.
            </span>
          </div>

          <div>
            <strong className="text-[var(--crt-phosphor-bright)] block">
              — Как включить сиреневый цвет оформления?
            </strong>
            <span>
              В правом верхнем углу панели управления нажмите кнопку переключения цвета люминофора. Доступны: <strong>СИРЕНЕВЫЙ</strong>, <strong>ЗЕЛЕНЫЙ</strong>, <strong>ЯНТАРНЫЙ</strong> и <strong>ГОЛУБОЙ</strong>.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

