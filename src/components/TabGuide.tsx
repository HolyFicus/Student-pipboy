import React from 'react';
import {
  BookOpen,
  Plus,
  Search,
  Bell,
  Layers,
  FlaskConical,
  HelpCircle,
  ShieldCheck,
  Languages,
  Sparkles,
  Palette
} from 'lucide-react';

interface TabGuideProps {
  onGoToMonitor: () => void;
  onGoToScience: () => void;
}

export const TabGuide: React.FC<TabGuideProps> = ({
  onGoToMonitor,
  onGoToScience
}) => {
  return (
    <div className="space-y-6">
      {/* Intro Banner */}
      <div className="border border-[var(--crt-phosphor-dim)] bg-[#071309] p-4 sm:p-5 rounded-xl flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="text-sm sm:text-base font-bold uppercase tracking-wider text-[var(--crt-phosphor-bright)] flex items-center gap-2">
            <BookOpen size={18} /> КРАТКОЕ РУКОВОДСТВО ПО ЭКСПЛУАТАЦИИ PIP-BOY STUDENT
          </div>
          <div className="text-xs sm:text-sm text-[var(--crt-phosphor)]/80 max-w-2xl leading-relaxed">
            Терминал студента гуманитарного факультета для организации учебных порталов, мониторинга научных баз данных, академического перевода и подготовки к курсовым и семинарам.
          </div>
        </div>

        <button
          onClick={onGoToMonitor}
          className="px-4 py-2 bg-[var(--crt-phosphor)] text-black font-bold text-xs rounded-lg cursor-pointer hover:bg-[var(--crt-phosphor-bright)] transition-colors uppercase tracking-wider flex items-center gap-1.5 shadow-md"
        >
          <Plus size={14} /> К МОНИТОРИНГУ ССЫЛОК
        </button>
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

        {/* Step 2 */}
        <div className="border border-[var(--crt-phosphor-dim)] bg-[#071309] p-4 rounded-xl space-y-2.5">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-[var(--crt-phosphor)] text-black font-extrabold text-xs flex items-center justify-center">
              2
            </span>
            <div className="font-bold text-xs uppercase tracking-wider text-[var(--crt-phosphor-bright)]">
              ТЕГИ И НАСТРАИВАЕМЫЕ КАТЕГОРИИ
            </div>
          </div>
          <p className="text-xs text-[var(--crt-phosphor)]/85 leading-relaxed">
            Структурируйте ссылки под ваши учебные задачи:
          </p>
          <ul className="text-xs text-[var(--crt-phosphor)]/80 list-disc list-inside space-y-1">
            <li>
              Кнопка <strong>«КАТЕГОРИИ»</strong> позволяет создавать, переименовывать и удалять разделы (например: <em>«ДИПЛОМ»</em>, <em>«СЕМИНАРЫ»</em>, <em>«ИСТОЧНИКИ»</em>).
            </li>
            <li>
              Назначайте теги (<code>#сессия</code>, <code>#первоисточник</code>, <code>#латынь</code>) и фильтруйте в один клик.
            </li>
            <li>
              Быстрый поиск мгновенно ищет по названию, URL или тегу.
            </li>
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
              <strong>Графическо-письменное отображение («ДАННЫЕ & ГРАФИКА»):</strong> интерактивный SVG-график задержки отклика (мс), круговая и столбчатая диаграмма распределения веса (HTML, JS-скрипты, медиа, текст), шкалы аптайма, полные HTTP-заголовки и структура разделов страницы.
            </li>
            <li>
              <strong>Режим «ГРАФИКА»:</strong> переключатель в панели позволяет просматривать сводную инфографику по всем ресурсам одновременно.
            </li>
            <li>
              <strong>ИИ-Аналитик («СПРОСИТЬ ИИ»):</strong> возможность задать нейросети любой вопрос по конкретному сайту или выбрать сразу несколько прикреплённых ресурсов для сравнительного анализа (подбор литературы, навигация, дедлайны).
            </li>
          </ul>
        </div>

        {/* Step 5 */}
        <div className="border border-[var(--crt-phosphor-dim)] bg-[#071309] p-4 rounded-xl space-y-2.5">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-[var(--crt-phosphor)] text-black font-extrabold text-xs flex items-center justify-center">
              5
            </span>
            <div className="font-bold text-xs uppercase tracking-wider text-[var(--crt-phosphor-bright)]">
              ГУМАНИТАРНАЯ НАУКА, ПЕРЕВОДЧИК И ИИ-ПОИСК
            </div>
          </div>
          <p className="text-xs text-[var(--crt-phosphor)]/85 leading-relaxed">
            Вкладка <strong>«НАУЧНЫЕ БАЗЫ»</strong> содержит все необходимые инструменты исследователя:
          </p>
          <ul className="text-xs text-[var(--crt-phosphor)]/80 list-disc list-inside space-y-1">
            <li>
              <strong>Каталог баз:</strong> проверенные открытые репозитории КиберЛенинка, eLIBRARY, ФЭБ, НЭБ и др.
            </li>
            <li>
              <strong>Переводчик статей:</strong> перевод научных аннотаций с сохранением строгой академической терминологии.
            </li>
            <li>
              <strong>ИИ-поиск:</strong> возможность спросить нейросеть о профильных базах и архивах по вашей теме.
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
              — Сохраняются ли добавленные ссылки при закрытии браузера?
            </strong>
            <span>
              Да, вся база ссылок, тегов, категорий и профиля хранится локально в вашем браузере (LocalStorage). Никакие личные данные не стираются при перезагрузке.
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

          <div>
            <strong className="text-[var(--crt-phosphor-bright)] block">
              — Как работает отображение времени и верхних/нижних недель?
            </strong>
            <span>
              На верхней панели Pip-Boy в реальном времени тикают часы, синхронизированные с вашим устройством и пересчитанные по московскому времени (МСК), с указанием года, числа, месяца и дня недели. Система автоматически определяет текущую неделю по утвержденному графику из 18 недель (нечетные/верхние и четные/нижние). Нажав на кнопку недели, можно вызвать полную таблицу семестра.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
