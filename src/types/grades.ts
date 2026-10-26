/**
 * Type definitions for Smart Grade Calculator (Умный калькулятор оценок)
 * Pure client-side with LocalStorage persistence.
 */

export interface GradeScaleThreshold {
  id: string;
  label: string; // e.g. "Отлично", "Хорошо", "Удовл.", "Зачёт", "A", "B"
  minScore: number; // Minimum threshold required
}

export interface ScheduleSubjectStats {
  classesCount: number;
  lessonTypes: string[]; // e.g. ['Лекция', 'Практика']
  classrooms: string[]; // e.g. ['1201', '1226']
  subgroups: string[]; // e.g. ['1', '2']
  days: string[]; // e.g. ['ПН', 'ЧТ']
}

export interface SubjectItem {
  id: string;
  name: string; // Subject title, e.g. "История", "Философия", "Высшая математика"
  teacherName?: string; // Full name(s) of the professor / teacher(s)
  maxScore: number; // Maximum possible points, e.g. 100, 60, 50, 5
  currentScore: number; // Current earned points (0 or entered by user)
  scale: GradeScaleThreshold[]; // Custom scale ordered from highest to lowest or threshold values
  targetScaleId?: string | null; // Selected target grade id (only reset via explicit button)
  customTargetScore?: number | null; // Optional custom target score if specified directly
  notes?: string;
  scheduleKey?: string; // Canonical normalized key linking this subject to schedule rows
  scheduleStats?: ScheduleSubjectStats; // Aggregated info from schedule classes
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
