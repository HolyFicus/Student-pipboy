/**
 * Type definitions for Smart Grade Calculator (Умный калькулятор оценок)
 * Pure client-side with LocalStorage persistence.
 */

export interface GradeScaleThreshold {
  id: string;
  label: string; // e.g. "Отлично", "Хорошо", "Удовл.", "Зачёт", "A", "B"
  minScore: number; // Minimum threshold required
}

export interface SubjectItem {
  id: string;
  name: string; // Subject title, e.g. "История", "Философия", "Высшая математика"
  teacherName?: string; // Full name of the professor / teacher, e.g. "Иванов Иван Иванович"
  maxScore: number; // Maximum possible points, e.g. 100, 60, 50, 5
  currentScore: number; // Current earned points (0 or entered by user)
  scale: GradeScaleThreshold[]; // Custom scale ordered from highest to lowest or threshold values
  targetScaleId?: string | null; // Selected target grade id (only reset via explicit button)
  customTargetScore?: number | null; // Optional custom target score if specified directly
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface GradeScalePreset {
  id: string;
  name: string;
  description: string;
  defaultMaxScore: number;
  scale: { label: string; minScore: number }[];
}

export interface GradeAiAnalysisResult {
  advice: string;
  shortSummary: string;
  pointsNeeded: number;
  remainingMax: number;
  requiredRatePercent: number;
  isAchievable: boolean;
  status: 'EXCEEDED' | 'POSSIBLE' | 'IMPOSSIBLE' | 'NO_TARGET';
}
