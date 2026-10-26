import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ThemeColor, PipBoySettings, StudentProfile, PipBoyNotification } from '../types/pipboy';
import { pipAudio } from '../utils/audio';
import { getMoscowTimeState, MoscowTimeState } from '../utils/academicCalendar';
import { useModalScrollLock } from '../utils/useModalScrollLock';
import { AIModeSwitch } from './AIModeSwitch';
import {
  Volume2,
  VolumeX,
  Palette,
  Bell,
  Clock,
  HelpCircle,
  X,
  BookOpen,
  User,
  FlaskConical,
  List,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Calculator,
  Library
} from 'lucide-react';

export type ActiveTab = 'MONITOR' | 'SCHEDULE' | 'GRADES' | 'LIBRARY' | 'SCIENCE' | 'PROFILE' | 'GUIDE';

interface PipBoyShellProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  settings: PipBoySettings;
  onUpdateSettings: (newSettings: Partial<PipBoySettings>) => void;
  profile: StudentProfile;
  linksCount: number;
  changedCount: number;
  notifications: PipBoyNotification[];
  onClearNotifications: () => void;
  onResetAllData: () => void;
  children: React.ReactNode;
}

export const PipBoyShell: React.FC<PipBoyShellProps> = ({
  activeTab,
  onSelectTab,
  settings,
  onUpdateSettings,
  profile,
  linksCount,
  changedCount,
  notifications,
  onClearNotifications,
  onResetAllData,
  children
}) => {
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  useModalScrollLock(isNotifOpen || showResetConfirm);
  const [moscowTime, setMoscowTime] = useState<MoscowTimeState>(() => getMoscowTimeState());

  const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    const timer = setInterval(() => {
      setMoscowTime(getMoscowTimeState());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const cycleTheme = () => {
    pipAudio.playClick();
    const themes: ThemeColor[] = ['lilac', 'green', 'amber', 'cyan'];
    const nextIdx = (themes.indexOf(settings.colorTheme) + 1) % themes.length;
    onUpdateSettings({ colorTheme: themes[nextIdx] });
  };

  const toggleAudio = () => {
    pipAudio.playClick();
    pipAudio.isMuted = settings.audioEnabled;
    onUpdateSettings({ audioEnabled: !settings.audioEnabled });
  };

  const tabs: { id: ActiveTab; label: string; icon: React.ReactNode }[] = [
    { id: 'MONITOR', label: 'МОНИТОРИНГ', icon: <List size={14} /> },
    { id: 'SCHEDULE', label: 'РАСПИСАНИЕ', icon: <Calendar size={14} /> },
    { id: 'GRADES', label: 'КАЛЬКУЛЯТОР ОЦЕНОК', icon: <Calculator size={14} /> },
    { id: 'LIBRARY', label: 'БИБЛИОТЕКА СТУДЕНТА', icon: <Library size={14} /> },
    { id: 'SCIENCE', label: 'НАУЧНЫЕ БАЗЫ', icon: <FlaskConical size={14} /> },
    { id: 'PROFILE', label: 'ПРОФИЛЬ СТУДЕНТА', icon: <User size={14} /> },
    { id: 'GUIDE', label: 'ИНСТРУКЦИЯ', icon: <BookOpen size={14} /> }
  ];

  return (
    <div
      data-theme={settings.colorTheme}
      className={`min-h-screen bg-[#030804] text-[var(--crt-phosphor)] relative flex flex-col p-2 sm:p-4 md:p-6 transition-colors duration-300 ${
        settings.crtFlicker ? 'crt-flicker' : ''
      }`}
    >
      {/* Outer Industrial Hardware Casing */}
      <div className="max-w-6xl w-full mx-auto my-auto border-4 sm:border-8 border-[#1f2820] bg-[#071309] rounded-2xl sm:rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.9)] relative overflow-hidden flex flex-col">
        {/* Hardware Bezel Top Screws & Knobs with Real-Time MSK Clock & Academic Week Parity */}
        <div className="bg-[#121c13] border-b-4 border-[#1c291e] px-3 sm:px-4 py-2 sm:py-2.5 flex flex-wrap items-center justify-between gap-3 select-none">
          {/* Logo & Station Status */}
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="w-3.5 h-3.5 rounded-full bg-[#354337] border border-[#162017] flex items-center justify-center shadow-inner shrink-0">
              <div className="w-2 h-0.5 bg-[#162017]" />
            </div>

            <div className="flex flex-col">
              <span className="font-extrabold text-xs sm:text-sm tracking-[0.2em] text-[#86a88b] uppercase leading-tight">
                PIP-BOY 3000
              </span>
              <span className="text-[9px] sm:text-[10px] tracking-widest text-[#4d6952] font-bold uppercase">
                ГУМАНИТАРНАЯ РАБОЧАЯ СТАНЦИЯ
              </span>
            </div>

            {/* Live Status Pulse */}
            <div className="hidden 2xl:flex items-center gap-1.5 bg-[#09110a] border border-[#273a2a] px-2 py-0.5 rounded-full shadow-inner">
              <div className="w-1.5 h-1.5 rounded-full bg-[var(--crt-phosphor)] shadow-[0_0_8px_var(--crt-phosphor)] animate-pulse" />
              <span className="text-[8.5px] text-[var(--crt-phosphor-bright)] font-mono font-bold tracking-wider">
                СИСТЕМА АКТИВНА
              </span>
            </div>
          </div>

          {/* Academic & Time HUD: Device-Synchronized Moscow Time, Full Date & Even/Odd Academic Week */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 font-mono">
            {/* Live Clock & Full Date (MSK) */}
            <div
              className="flex items-center gap-2 sm:gap-3 bg-[#08120a] border border-[#233827] px-2.5 sm:px-3 py-1 rounded shadow-inner"
              title="Синхронизированное с устройством московское время (UTC+3) и текущая календарная дата"
            >
              <Clock size={14} className="text-emerald-400 animate-pulse shrink-0" />

              {/* Real-time Time */}
              <div className="flex items-baseline gap-1">
                <span className="font-extrabold text-xs sm:text-sm tracking-widest text-[var(--crt-phosphor-bright)]">
                  {moscowTime.timeStr}
                </span>
                <span className="text-[9px] text-[#719677] font-bold">МСК</span>
              </div>

              {/* Separator */}
              <div className="h-4 w-px bg-[#233827]" />

              {/* Full Date: Year, Month, Day, Weekday */}
              <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px]">
                <span className="text-[#a4c9a8] font-bold">
                  {moscowTime.dayNumber} {moscowTime.monthName} {moscowTime.yearNumber} г.
                </span>
                <span className="hidden md:inline text-[9px] text-[#5e7e63] font-semibold uppercase">
                  ({moscowTime.weekdayFull})
                </span>
              </div>
            </div>

            {/* Academic Week System: Upper (Odd) vs Lower (Even) */}
            <div
              className={`flex items-center gap-2 px-2.5 sm:px-3 py-1 rounded border ${
                moscowTime.computedParity.isOdd
                  ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.15)]'
                  : 'bg-amber-950/40 border-amber-500/50 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.15)]'
              }`}
              title="Текущая учебная неделя и четность"
            >
              {moscowTime.computedParity.isOdd ? (
                <ArrowUpRight size={14} className="text-emerald-400 shrink-0" />
              ) : (
                <ArrowDownRight size={14} className="text-amber-400 shrink-0" />
              )}

              <div className="flex flex-col text-left leading-tight">
                <div className="flex items-center gap-1.5">
                  <span className="font-extrabold text-[10px] sm:text-[11px] tracking-wider uppercase">
                    {moscowTime.computedParity.typeName} неделя
                  </span>
                  <span className="text-[9px] opacity-75 font-semibold">
                    ({moscowTime.computedParity.parityName})
                  </span>
                </div>
                {moscowTime.currentWeek ? (
                  <span className="text-[9px] opacity-80">
                    {moscowTime.currentWeek.num}-я неделя • {moscowTime.currentWeek.label}
                  </span>
                ) : (
                  <span className="text-[9px] opacity-80">
                    {moscowTime.computedParity.sublabel}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Controls: AI Mode, Theme, Sound, Alerts */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 text-xs">
            {/* Global AI Data Mode Switcher */}
            <AIModeSwitch
              compact
              mode={settings.aiDataMode || 'local'}
              onChange={(newMode) => onUpdateSettings({ aiDataMode: newMode })}
            />

            {/* Theme Selector (Green / Amber / Cyan / Lilac) */}
            <button
              onClick={cycleTheme}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1 bg-[#1a291c] hover:bg-[#253a28] border border-[#304733] rounded text-[11px] text-[#9fc7a4] font-bold cursor-pointer transition-colors"
              title="Переключить цвет люминофора (Сиреневый / Зеленый / Янтарный / Голубой)"
            >
              <Palette size={13} />
              <span className="uppercase text-[10px] sm:text-[11px]">
                {settings.colorTheme === 'lilac'
                  ? 'СИРЕНЕВЫЙ'
                  : settings.colorTheme === 'green'
                  ? 'ЗЕЛЕНЫЙ'
                  : settings.colorTheme === 'amber'
                  ? 'ЯНТАРНЫЙ'
                  : 'ГОЛУБОЙ'}
              </span>
            </button>

            {/* Sound Toggle */}
            <button
              onClick={toggleAudio}
              className={`p-1.5 border rounded cursor-pointer transition-colors ${
                settings.audioEnabled
                  ? 'border-[var(--crt-phosphor)] text-[var(--crt-phosphor)] bg-[var(--crt-phosphor)]/15'
                  : 'border-zinc-700 text-zinc-500'
              }`}
              title={settings.audioEnabled ? 'Звук включен' : 'Звук выключен'}
            >
              {settings.audioEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
            </button>

            {/* Notifications Button */}
            <button
              onClick={() => {
                pipAudio.playClick();
                setIsNotifOpen(!isNotifOpen);
              }}
              className="relative p-1.5 border border-[#304733] hover:border-[var(--crt-phosphor)] rounded cursor-pointer text-[#9fc7a4]"
              title="Журнал системных оповещений"
            >
              <Bell size={14} />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-amber-400 text-black font-extrabold text-[9px] w-4 h-4 rounded-full flex items-center justify-center animate-bounce">
                  {unreadCount}
                </span>
              )}
            </button>

            {/* Hardware Screw */}
            <div className="w-3.5 h-3.5 rounded-full bg-[#354337] border border-[#162017] flex items-center justify-center shadow-inner ml-1 shrink-0">
              <div className="w-2 h-0.5 bg-[#162017]" />
            </div>
          </div>
        </div>

        {/* CRT Screen Display Area with Scanlines & Vignette */}
        <div className="relative bg-[#050e06] p-3 sm:p-5 flex-1 flex flex-col overflow-hidden">
          {settings.scanlines && <div className="absolute inset-0 crt-overlay z-20 pointer-events-none" />}
          <div className="absolute inset-0 crt-vignette z-20 pointer-events-none" />

          {/* Top Tabs: Clean & Focused */}
          <div className="relative z-30 border-b-2 border-[var(--crt-phosphor-dim)] pb-2 mb-4">
            <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto no-scrollbar font-mono text-xs sm:text-sm">
              {tabs.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      pipAudio.playTabSwitch();
                      onSelectTab(tab.id);
                    }}
                    className={`px-3 sm:px-4 py-1.5 rounded-t-sm uppercase font-extrabold tracking-wider transition-all cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                      isActive
                        ? 'bg-[var(--crt-phosphor)] text-black phosphor-glow-strong shadow-lg translate-y-[2px]'
                        : 'border border-[var(--crt-phosphor-dim)]/50 text-[var(--crt-phosphor)]/70 hover:text-[var(--crt-phosphor)] hover:border-[var(--crt-phosphor)]'
                    }`}
                  >
                    {tab.icon}
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tab Content Display */}
          <div className="relative z-10 flex-1 overflow-y-auto pr-1 pipboy-shell-screen">
            {children}
          </div>

          {/* Clean Academic Status Footer */}
          <div className="relative z-30 border-t-2 border-[var(--crt-phosphor-dim)] pt-2.5 mt-4 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
            <div className="flex items-center gap-3">
              <span className="font-bold text-[var(--crt-phosphor-bright)]">
                РЕСУРСОВ В БАЗЕ: {linksCount}
              </span>
              {changedCount > 0 && (
                <span className="bg-amber-500 text-black px-1.5 py-0.2 rounded font-bold">
                  ИЗМЕНЕНИЙ: {changedCount}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 text-[11px] opacity-80">
              <span>СТУДЕНТ: {profile.fullName || 'НЕ ЗАПОЛНЕНО'}</span>
              {profile.faculty && <span>({profile.faculty})</span>}
            </div>

            <div className="flex items-center gap-3 text-[11px] opacity-75">
              <span>АВТО-СИНХРОНИЗАЦИЯ: {settings.globalInterval}с</span>
              <button
                onClick={() => {
                  pipAudio.playClick();
                  setShowResetConfirm(true);
                }}
                className="underline hover:text-red-400 cursor-pointer text-[10px]"
                title="Полностью очистить сохраненные данные"
              >
                ОЧИСТИТЬ ДАННЫЕ
              </button>
            </div>
          </div>
        </div>

        {/* Hardware Bottom Screws */}
        <div className="bg-[#121c13] border-t-4 border-[#1c291e] px-4 py-2 flex items-center justify-between text-[10px] text-[#4d6952] font-mono select-none">
          <div className="flex gap-1.5">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="w-1.5 h-1.5 rounded-full bg-[#202e22]" />
            ))}
          </div>
          <span>PIP-BOY STUDENT WORKSTATION · ГУМАНИТАРНАЯ РЕДАКЦИЯ</span>
          <div className="flex gap-1.5">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="w-1.5 h-1.5 rounded-full bg-[#202e22]" />
            ))}
          </div>
        </div>
      </div>

      {/* Notifications Drawer Modal */}
      {isNotifOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 bg-black/95 flex items-center justify-center p-4 z-50">
          <div className="border-2 border-[var(--crt-phosphor)] bg-[#050d06] p-4 rounded-xl max-w-md w-full box-glow text-[var(--crt-phosphor)] space-y-3 font-mono">
            <div className="flex items-center justify-between border-b border-[var(--crt-phosphor-dim)] pb-2 text-xs font-bold uppercase tracking-wider">
              <span className="flex items-center gap-1.5 text-[var(--crt-phosphor-bright)]">
                <Bell size={14} /> ЖУРНАЛ ОПОВЕЩЕНИЙ
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={onClearNotifications}
                  className="text-[10px] px-2 py-0.5 border border-zinc-700 hover:border-zinc-500 rounded cursor-pointer"
                >
                  ОЧИСТИТЬ
                </button>
                <button
                  onClick={() => setIsNotifOpen(false)}
                  className="text-xs px-2 py-0.5 border border-[var(--crt-phosphor-dim)] hover:border-[var(--crt-phosphor)] cursor-pointer"
                >
                  <X size={12} />
                </button>
              </div>
            </div>

            <div className="max-h-72 overflow-y-auto space-y-2 pr-1 text-xs">
              {notifications.length === 0 ? (
                <div className="text-center py-6 opacity-60">
                  Нет новых оповещений. Все отслеживаемые ресурсы спокойны.
                </div>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    className="p-2.5 rounded bg-black/70 border border-[var(--crt-phosphor-dim)]/50 space-y-1"
                  >
                    <div className="flex items-center justify-between text-[10px] text-amber-300">
                      <span className="font-bold">{n.title}</span>
                      <span>{new Date(n.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <div className="text-[11px] opacity-90">{n.message}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Reset Confirmation Modal */}
      {showResetConfirm && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 bg-black/95 flex items-center justify-center p-4 z-50">
          <div className="border-2 border-red-500 bg-[#0f0406] p-5 rounded-xl max-w-sm w-full text-red-300 space-y-4 font-mono shadow-[0_0_30px_rgba(239,68,68,0.4)]">
            <div className="font-bold text-sm uppercase tracking-wider text-red-400">
              ⚠️ ПОДТВЕРЖДЕНИЕ ОЧИСТКИ ДАННЫХ
            </div>
            <p className="text-xs text-red-200/90 leading-relaxed">
              Вы действительно хотите удалить все сохраненные ссылки, созданные категории и очистить профиль? Это действие необратимо.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => {
                  pipAudio.playClick();
                  setShowResetConfirm(false);
                }}
                className="px-3 py-1.5 border border-zinc-600 hover:border-zinc-400 text-zinc-300 rounded text-xs cursor-pointer"
              >
                ОТМЕНА
              </button>
              <button
                onClick={() => {
                  setShowResetConfirm(false);
                  onResetAllData();
                }}
                className="px-4 py-1.5 bg-red-600 hover:bg-red-500 text-white font-bold rounded text-xs cursor-pointer shadow-md"
              >
                ДА, ОЧИСТИТЬ ВСЁ
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
