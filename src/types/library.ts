export type LibraryFileType = 'pdf' | 'docx' | 'doc' | 'pptx' | 'ppt' | 'ppx' | 'txt' | 'md';

export type TargetLanguageCode = 'ru' | 'en' | 'de' | 'fr' | 'es' | 'zh';

export type TranslatorDisplayMode = 'parallel' | 'translated' | 'original';

export interface LibrarySubject {
  id: string;
  name: string;
  color: 'emerald' | 'amber' | 'cyan' | 'fuchsia' | 'rose' | 'violet';
  source: 'schedule' | 'grades' | 'custom';
  createdAt: number;
}

export interface LibraryPageTranslation {
  targetLang: TargetLanguageCode;
  translatedText: string;
  detectedLang: string;
  academicNotes?: string;
  keyTerms: Array<{
    term: string;
    translation: string;
    note: string;
  }>;
  translatedAt: number;
}

export type OcrEngineType = 'gemini-vision' | 'tesseract-local' | 'pdf-native-hybrid';

export interface LibraryPage {
  pageNumber: number;
  title?: string;
  content: string;
  bullets?: string[];
  speakerNotes?: string;
  isScannedPage?: boolean;
  isOcrRecognized?: boolean;
  ocrEngine?: OcrEngineType;
  ocrConfidence?: number;
  pageImageDataUrl?: string;
  translations?: Partial<Record<TargetLanguageCode, LibraryPageTranslation>>;
}

export interface LibraryDocument {
  id: string;
  title: string;
  author?: string;
  subjectId: string;
  fileName: string;
  fileType: LibraryFileType;
  fileSize: number;
  addedAt: number;
  lastOpenedAt: number;
  currentPage: number;
  totalPages: number;
  pages: LibraryPage[];
  bookmarks: number[];
  notes: Record<number, string>;
  hasRawBlob?: boolean;
  isScannedPdf?: boolean;
  ocrPagesCount?: number;
}

export const TARGET_LANGUAGES: Array<{ code: TargetLanguageCode; label: string; short: string }> = [
  { code: 'ru', label: 'Русский (Академический)', short: 'RU' },
  { code: 'en', label: 'English (Academic)', short: 'EN' },
  { code: 'de', label: 'Deutsch (Wissenschaftlich)', short: 'DE' },
  { code: 'fr', label: 'Français (Académique)', short: 'FR' },
  { code: 'es', label: 'Español (Académico)', short: 'ES' },
  { code: 'zh', label: '中文 (学术汉语)', short: 'ZH' }
];

export const SUBJECT_COLOR_STYLES: Record<
  LibrarySubject['color'],
  { border: string; bg: string; text: string; dot: string; badge: string }
> = {
  emerald: {
    border: 'border-emerald-500/60',
    bg: 'bg-emerald-950/35',
    text: 'text-emerald-300',
    dot: 'bg-emerald-400',
    badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
  },
  amber: {
    border: 'border-amber-500/60',
    bg: 'bg-amber-950/35',
    text: 'text-amber-300',
    dot: 'bg-amber-400',
    badge: 'bg-amber-500/20 text-amber-300 border-amber-500/50'
  },
  cyan: {
    border: 'border-cyan-500/60',
    bg: 'bg-cyan-950/35',
    text: 'text-cyan-300',
    dot: 'bg-cyan-400',
    badge: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50'
  },
  fuchsia: {
    border: 'border-fuchsia-500/60',
    bg: 'bg-fuchsia-950/35',
    text: 'text-fuchsia-300',
    dot: 'bg-fuchsia-400',
    badge: 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/50'
  },
  rose: {
    border: 'border-rose-500/60',
    bg: 'bg-rose-950/35',
    text: 'text-rose-300',
    dot: 'bg-rose-400',
    badge: 'bg-rose-500/20 text-rose-300 border-rose-500/50'
  },
  violet: {
    border: 'border-violet-500/60',
    bg: 'bg-violet-950/35',
    text: 'text-violet-300',
    dot: 'bg-violet-400',
    badge: 'bg-violet-500/20 text-violet-300 border-violet-500/50'
  }
};
