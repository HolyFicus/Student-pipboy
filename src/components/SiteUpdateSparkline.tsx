import React, { useState, useMemo } from 'react';
import { MonitoredLink, SiteCheckHistoryPoint } from '../types/pipboy';
import { Activity, Zap, ShieldCheck, Clock } from 'lucide-react';

interface SiteUpdateSparklineProps {
  link: MonitoredLink;
  variant?: 'compact' | 'detailed';
}

const MAX_SLOTS = 14;

/**
 * Builds normalized check history points from link.checkHistory, falling back gracefully
 * to real diffHistory and lastChecked metadata if checkHistory is not yet populated.
 */
export function buildSiteCheckSeries(link: MonitoredLink): SiteCheckHistoryPoint[] {
  if (link.checkHistory && link.checkHistory.length > 0) {
    return [...link.checkHistory]
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-MAX_SLOTS);
  }

  const baseWords = link.writtenContent?.wordCount || 0;
  const baseSections = link.writtenContent?.detectedSections?.length || 1;
  const points: SiteCheckHistoryPoint[] = [];

  const diffsAsc = [...(link.diffHistory || [])].sort((a, b) => a.timestamp - b.timestamp);

  diffsAsc.forEach((d, idx) => {
    points.push({
      id: d.id || `diff-pt-${idx}`,
      timestamp: d.timestamp,
      hasChanged: true,
      reachable: true,
      wordCount: baseWords,
      wordDelta: d.newText ? Math.max(1, d.newText.split(/\s+/).filter(Boolean).length) : 12,
      sectionsCount: baseSections,
      changeType: d.changeType === 'ADDED' || d.changeType === 'REMOVED' ? d.changeType : 'MODIFIED',
      summary: d.summary
    });
  });

  if (link.lastChecked) {
    const lastDiffTs = diffsAsc.length > 0 ? diffsAsc[diffsAsc.length - 1].timestamp : 0;
    if (Math.abs(link.lastChecked - lastDiffTs) > 1500) {
      points.push({
        id: `last-chk-${link.lastChecked}`,
        timestamp: link.lastChecked,
        hasChanged: link.status === 'CHANGED' && diffsAsc.length === 0,
        reachable: true,
        wordCount: baseWords,
        wordDelta: 0,
        sectionsCount: baseSections,
        changeType: points.length === 0 ? 'BASELINE' : 'UNCHANGED',
        summary:
          points.length === 0
            ? `Первичная проверка (~${baseWords} слов)`
            : `Проверка без изменений (~${baseWords} слов)`
      });
    }
  }

  return points.slice(-MAX_SLOTS);
}

export const SiteUpdateSparkline: React.FC<SiteUpdateSparklineProps> = ({
  link,
  variant = 'compact'
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const series = useMemo(() => buildSiteCheckSeries(link), [link]);

  // Compute normalized Y values (0.18 to 0.92) representing update intensity + word delta
  const plottedPoints = useMemo(() => {
    if (series.length === 0) return [];

    const maxWordCount = Math.max(...series.map((p) => p.wordCount || 0), 1);
    const maxAbsDelta = Math.max(...series.map((p) => Math.abs(p.wordDelta || 0)), 1);

    return series.map((pt, index) => {
      // Base level reflects relative text volume (0.22 - 0.38), spikes on real changes (0.72 - 0.94)
      const wordRatio = (pt.wordCount || 0) / maxWordCount;
      let intensity = 0.24 + wordRatio * 0.14;

      if (pt.changeType === 'BASELINE') {
        intensity = 0.44;
      } else if (pt.hasChanged) {
        const deltaBoost = Math.min(0.22, (Math.abs(pt.wordDelta || 0) / maxAbsDelta) * 0.22);
        intensity = 0.72 + deltaBoost;
      } else if (!pt.reachable) {
        intensity = 0.16;
      }

      return {
        ...pt,
        index,
        intensity: Math.max(0.15, Math.min(0.95, intensity))
      };
    });
  }, [series]);

  const totalChecks = series.length;
  const changedChecksCount = series.filter((s) => s.hasChanged).length;
  const activePoint =
    hoveredIdx !== null && plottedPoints[hoveredIdx]
      ? plottedPoints[hoveredIdx]
      : plottedPoints[plottedPoints.length - 1] || null;

  const svgWidth = variant === 'detailed' ? 320 : 196;
  const svgHeight = variant === 'detailed' ? 48 : 34;
  const padX = 8;
  const padY = 5;
  const usableW = svgWidth - padX * 2;
  const usableH = svgHeight - padY * 2;

  const coords = plottedPoints.map((pt, idx) => {
    const x =
      plottedPoints.length === 1
        ? padX + usableW / 2
        : padX + (idx / Math.max(1, MAX_SLOTS - 1)) * usableW;
    const y = padY + usableH * (1 - pt.intensity);
    return { x, y, pt };
  });

  const polylinePoints = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const areaPath =
    coords.length > 1
      ? `M ${coords[0].x.toFixed(1)},${(svgHeight - padY).toFixed(1)} ` +
        coords.map((c) => `L ${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ') +
        ` L ${coords[coords.length - 1].x.toFixed(1)},${(svgHeight - padY).toFixed(1)} Z`
      : '';

  const formatShortTime = (ts: number) => {
    try {
      return new Date(ts).toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch {
      return '—';
    }
  };

  return (
    <div className="bg-black/65 border border-[var(--crt-phosphor-dim)]/50 rounded-md px-2.5 py-2 font-mono space-y-1.5">
      {/* Header Row: Title + Summary Counters */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[10px]">
        <div className="flex items-center gap-1.5 text-[var(--crt-phosphor-bright)] font-bold uppercase tracking-wider">
          <Activity size={12} className="text-[var(--crt-phosphor)] shrink-0" />
          <span>АКТИВНОСТЬ ПРОВЕРОК И ОБНОВЛЕНИЙ (SPARKLINE)</span>
        </div>

        <div className="flex items-center gap-2 text-[10px]">
          <span className="px-1.5 py-0.2 rounded bg-black/80 border border-[var(--crt-phosphor-dim)]/50 text-[var(--crt-phosphor)]">
            Проверок: <strong>{totalChecks}</strong>
          </span>
          <span
            className={`px-1.5 py-0.2 rounded border font-bold ${
              changedChecksCount > 0
                ? 'bg-amber-950/70 border-amber-500/70 text-amber-300'
                : 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
            }`}
          >
            Обновлений: {changedChecksCount}
          </span>
        </div>
      </div>

      {/* Sparkline Graph + Interactive Readout */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        {/* SVG Oscilloscope Sparkline */}
        <div
          className="relative bg-[#030904] border border-[var(--crt-phosphor-dim)]/60 rounded px-1.5 py-1 flex items-center shrink-0 overflow-hidden"
          onMouseLeave={() => setHoveredIdx(null)}
        >
          <svg
            width={svgWidth}
            height={svgHeight}
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            className="overflow-visible select-none"
          >
            <defs>
              <linearGradient id={`spark-grad-${variant}-${link.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--crt-phosphor)" stopOpacity="0.38" />
                <stop offset="100%" stopColor="var(--crt-phosphor)" stopOpacity="0.02" />
              </linearGradient>
            </defs>

            {/* CRT Subtle Grid Lines */}
            <line
              x1={padX}
              y1={padY + usableH * 0.25}
              x2={svgWidth - padX}
              y2={padY + usableH * 0.25}
              stroke="var(--crt-phosphor-dim)"
              strokeOpacity="0.22"
              strokeDasharray="2 2"
            />
            <line
              x1={padX}
              y1={padY + usableH * 0.68}
              x2={svgWidth - padX}
              y2={padY + usableH * 0.68}
              stroke="var(--crt-phosphor-dim)"
              strokeOpacity="0.3"
              strokeDasharray="2 2"
            />

            {/* Empty / Single check baseline guide */}
            {coords.length <= 1 && (
              <line
                x1={padX}
                y1={padY + usableH * 0.6}
                x2={svgWidth - padX}
                y2={padY + usableH * 0.6}
                stroke="var(--crt-phosphor)"
                strokeOpacity="0.4"
                strokeWidth="1.2"
              />
            )}

            {/* Area Fill */}
            {areaPath && <path d={areaPath} fill={`url(#spark-grad-${variant}-${link.id})`} />}

            {/* Vertical stems for each check */}
            {coords.map(({ x, y, pt }, idx) => (
              <line
                key={`stem-${pt.id}-${idx}`}
                x1={x}
                y1={svgHeight - padY}
                x2={x}
                y2={y}
                stroke={pt.hasChanged ? '#fbbf24' : 'var(--crt-phosphor)'}
                strokeOpacity={hoveredIdx === idx ? '0.85' : pt.hasChanged ? '0.55' : '0.25'}
                strokeWidth={pt.hasChanged ? '1.8' : '1'}
              />
            ))}

            {/* Sparkline Connecting Polyline */}
            {coords.length > 1 && (
              <polyline
                fill="none"
                stroke="var(--crt-phosphor-bright)"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={polylinePoints}
              />
            )}

            {/* Check Nodes (Interactive) */}
            {coords.map(({ x, y, pt }, idx) => {
              const isSelected = hoveredIdx === idx || (hoveredIdx === null && idx === coords.length - 1);
              const nodeColor = pt.hasChanged
                ? '#fbbf24'
                : pt.changeType === 'BASELINE'
                ? '#38bdf8'
                : 'var(--crt-phosphor-bright)';

              return (
                <g
                  key={`node-${pt.id}-${idx}`}
                  className="cursor-pointer"
                  onMouseEnter={() => setHoveredIdx(idx)}
                >
                  {/* Invisible larger hit target */}
                  <circle cx={x} cy={y} r={7} fill="transparent" />

                  {/* Pulse ring for changed points or active selection */}
                  {(pt.hasChanged || isSelected) && (
                    <circle
                      cx={x}
                      cy={y}
                      r={isSelected ? 4.8 : 4}
                      fill="none"
                      stroke={nodeColor}
                      strokeOpacity={isSelected ? '0.9' : '0.45'}
                      strokeWidth="1"
                    />
                  )}

                  <circle
                    cx={x}
                    cy={y}
                    r={pt.hasChanged ? 3 : isSelected ? 2.8 : 2.1}
                    fill={nodeColor}
                  />
                </g>
              );
            })}
          </svg>
        </div>

        {/* Metadata Readout for Hovered / Latest Point */}
        <div className="flex-1 min-w-0 text-[10px] space-y-0.5 bg-black/50 border border-[var(--crt-phosphor-dim)]/30 rounded px-2.5 py-1.5">
          {activePoint ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <span className="font-bold flex items-center gap-1 text-[var(--crt-phosphor-bright)]">
                  {activePoint.hasChanged ? (
                    <>
                      <Zap size={11} className="text-amber-400 shrink-0" />
                      <span className="text-amber-300 uppercase">
                        ИЗМЕНЕНИЕ ТЕКСТА ({activePoint.changeType || 'MODIFIED'})
                      </span>
                    </>
                  ) : activePoint.changeType === 'BASELINE' ? (
                    <>
                      <ShieldCheck size={11} className="text-sky-400 shrink-0" />
                      <span className="text-sky-300 uppercase">БАЗОВЫЙ СНИМОК СТРАНИЦЫ</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck size={11} className="text-emerald-400 shrink-0" />
                      <span className="text-emerald-300 uppercase">БЕЗ ИЗМЕНЕНИЙ (СТАБИЛЬНО)</span>
                    </>
                  )}
                </span>

                <span className="opacity-75 flex items-center gap-1 font-mono">
                  <Clock size={10} />
                  {formatShortTime(activePoint.timestamp)}
                  {activePoint.latencyMs ? ` • ${activePoint.latencyMs} мс` : ''}
                </span>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] opacity-85 pt-0.5">
                <span className="truncate font-sans">
                  {activePoint.summary || `Объем текста: ~${activePoint.wordCount} слов`}
                </span>
                <span className="font-mono shrink-0">
                  ~{activePoint.wordCount} сл.
                  {activePoint.wordDelta !== 0 && (
                    <strong
                      className={`ml-1 ${
                        activePoint.wordDelta > 0 ? 'text-emerald-400' : 'text-amber-400'
                      }`}
                    >
                      ({activePoint.wordDelta > 0 ? `+${activePoint.wordDelta}` : activePoint.wordDelta})
                    </strong>
                  )}
                </span>
              </div>
            </>
          ) : (
            <div className="opacity-65 py-1">
              Нет данных о проверках. Нажмите «ПРОВЕРИТЬ ИЗМЕНЕНИЯ ПИСЬМЕННЫХ ДАННЫХ» для построения графика.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
