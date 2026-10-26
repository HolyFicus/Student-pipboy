import { SubjectItem, GradeScaleThreshold, GradeAiAnalysisResult } from '../types/grades';

/**
 * Calculates current math metrics for a subject.
 */
export function calculateSubjectMetrics(subject: SubjectItem): {
  currentScore: number;
  maxScore: number;
  remainingScore: number;
  completionPercent: number;
  targetThreshold: GradeScaleThreshold | null;
  pointsNeeded: number;
  requiredRatePercent: number;
  isAchievable: boolean;
  status: 'EXCEEDED' | 'POSSIBLE' | 'IMPOSSIBLE' | 'NO_TARGET';
} {
  const current = Math.max(0, subject.currentScore || 0);
  const max = Math.max(1, subject.maxScore || 100);
  const remainingScore = Math.max(0, max - current);
  const completionPercent = Math.min(100, Math.round((current / max) * 100));

  let targetThreshold: GradeScaleThreshold | null = null;
  if (subject.targetScaleId && subject.scale && subject.scale.length > 0) {
    targetThreshold = subject.scale.find((s) => s.id === subject.targetScaleId) || null;
  }

  if (!targetThreshold) {
    return {
      currentScore: current,
      maxScore: max,
      remainingScore,
      completionPercent,
      targetThreshold: null,
      pointsNeeded: 0,
      requiredRatePercent: 0,
      isAchievable: true,
      status: 'NO_TARGET'
    };
  }

  const targetScore = targetThreshold.minScore;
  const pointsNeeded = Math.max(0, targetScore - current);

  if (current >= targetScore) {
    return {
      currentScore: current,
      maxScore: max,
      remainingScore,
      completionPercent,
      targetThreshold,
      pointsNeeded: 0,
      requiredRatePercent: 0,
      isAchievable: true,
      status: 'EXCEEDED'
    };
  }

  if (pointsNeeded > remainingScore) {
    return {
      currentScore: current,
      maxScore: max,
      remainingScore,
      completionPercent,
      targetThreshold,
      pointsNeeded,
      requiredRatePercent: Math.round((pointsNeeded / (remainingScore || 1)) * 100),
      isAchievable: false,
      status: 'IMPOSSIBLE'
    };
  }

  const requiredRatePercent =
    remainingScore > 0 ? Math.round((pointsNeeded / remainingScore) * 100) : 100;

  return {
    currentScore: current,
    maxScore: max,
    remainingScore,
    completionPercent,
    targetThreshold,
    pointsNeeded,
    requiredRatePercent,
    isAchievable: true,
    status: 'POSSIBLE'
  };
}

/**
 * Generate instantaneous deterministic fallback / baseline advice
 * in case offline or AI response delay occurs.
 */
export function getLocalDeterministicAnalysis(subject: SubjectItem): GradeAiAnalysisResult {
  const metrics = calculateSubjectMetrics(subject);

  if (!metrics.targetThreshold) {
    return {
      advice: `У дисциплины «${subject.name}» ещё не выбрана целевая оценка. Выберите желаемый рубеж (например: «${
        subject.scale[0]?.label || 'Отлично'
      }»), чтобы рассчитать дефицит баллов и процент успешности для оставшихся заданий.`,
      shortSummary: 'Целевой рубеж не выбран',
      pointsNeeded: 0,
      remainingMax: metrics.remainingScore,
      requiredRatePercent: 0,
      isAchievable: true,
      status: 'NO_TARGET'
    };
  }

  const targetLabel = metrics.targetThreshold.label;
  const targetMin = metrics.targetThreshold.minScore;

  if (metrics.status === 'EXCEEDED') {
    return {
      advice: `🎯 Цель «${targetLabel}» (порог ${targetMin} б.) уже достигнута! У вас набрано ${metrics.currentScore} из ${metrics.maxScore} баллов (${metrics.completionPercent}%). Вы можете зафиксировать результат или повысить планку.`,
      shortSummary: `Цель «${targetLabel}» уже достигнута`,
      pointsNeeded: 0,
      remainingMax: metrics.remainingScore,
      requiredRatePercent: 0,
      isAchievable: true,
      status: 'EXCEEDED'
    };
  }

  if (metrics.status === 'IMPOSSIBLE') {
    const deficitOverMax = metrics.pointsNeeded - metrics.remainingScore;
    return {
      advice: `⚠️ До рубежа «${targetLabel}» (${targetMin} б.) математически не хватает ${metrics.pointsNeeded} баллов, однако до конца курса можно набрать максимум ${metrics.remainingScore} б. Дефицит составляет ${deficitOverMax} б. Рекомендуется выбрать рубеж ниже (например, «${
        subject.scale.find((s) => s.minScore <= metrics.currentScore + metrics.remainingScore)?.label || 'Хорошо'
      }») или уточнить у преподавателя${subject.teacherName ? ` (${subject.teacherName})` : ''} возможность добора бонусных баллов за доклады/научную работу.`,
      shortSummary: `Цель «${targetLabel}» математически недостижима`,
      pointsNeeded: metrics.pointsNeeded,
      remainingMax: metrics.remainingScore,
      requiredRatePercent: metrics.requiredRatePercent,
      isAchievable: false,
      status: 'IMPOSSIBLE'
    };
  }

  return {
    advice: `До оценки «${targetLabel}» (${targetMin} б.) осталось набрать ${metrics.pointsNeeded} баллов из ${metrics.remainingScore} оставшихся. Минимальный средний результат на оставшихся заданиях: ${metrics.requiredRatePercent}%.`,
    shortSummary: `Осталось набрать ${metrics.pointsNeeded} из ${metrics.remainingScore} б. (${metrics.requiredRatePercent}%)`,
    pointsNeeded: metrics.pointsNeeded,
    remainingMax: metrics.remainingScore,
    requiredRatePercent: metrics.requiredRatePercent,
    isAchievable: true,
    status: 'POSSIBLE'
  };
}
