import JSZip from 'jszip';
import {
  LibraryDocument,
  LibraryFileType,
  LibraryPage,
  LibrarySubject,
  SUBJECT_COLOR_STYLES
} from '../types/library';
import { ScheduleClass } from '../types/schedule';
import { SubjectItem } from '../types/grades';
import {
  OcrProgressCallback,
  parsePdfWithAutomaticOcr
} from './pdfOcrEngine';

export const LIBRARY_STORAGE_KEYS = {
  DOCS_META: 'pipboy_library_docs_v1',
  SUBJECTS: 'pipboy_library_subjects_v1',
  DELETED_SYNC_NAMES: 'pipboy_library_deleted_sync_v1'
};

const IDB_NAME = 'pipboy_library_idb_v1';
const IDB_VERSION = 1;
const IDB_STORE_DOCS = 'library_docs_full';

const COLOR_POOL: LibrarySubject['color'][] = [
  'emerald',
  'amber',
  'cyan',
  'fuchsia',
  'rose',
  'violet'
];

function openLibraryIDB(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE_DOCS)) {
          db.createObjectStore(IDB_STORE_DOCS, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function saveDocPayloadToIDB(
  id: string,
  pages: LibraryPage[],
  rawBlob?: Blob | null
): Promise<boolean> {
  const db = await openLibraryIDB();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE_DOCS, 'readwrite');
      const store = tx.objectStore(IDB_STORE_DOCS);
      store.put({
        id,
        pages,
        rawBlob: rawBlob || null,
        updatedAt: Date.now()
      });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

export async function loadDocPayloadFromIDB(
  id: string
): Promise<{ pages: LibraryPage[]; rawBlob: Blob | null } | null> {
  const db = await openLibraryIDB();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE_DOCS, 'readonly');
      const store = tx.objectStore(IDB_STORE_DOCS);
      const req = store.get(id);
      req.onsuccess = () => {
        if (req.result) {
          resolve({
            pages: Array.isArray(req.result.pages) ? req.result.pages : [],
            rawBlob: req.result.rawBlob || null
          });
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function deleteDocPayloadFromIDB(id: string): Promise<void> {
  const db = await openLibraryIDB();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE_DOCS, 'readwrite');
      const store = tx.objectStore(IDB_STORE_DOCS);
      store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function clearAllLibraryData(): Promise<void> {
  try {
    localStorage.removeItem(LIBRARY_STORAGE_KEYS.DOCS_META);
    localStorage.removeItem(LIBRARY_STORAGE_KEYS.SUBJECTS);
    localStorage.removeItem(LIBRARY_STORAGE_KEYS.DELETED_SYNC_NAMES);
  } catch {}

  const db = await openLibraryIDB();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE_DOCS, 'readwrite');
      const store = tx.objectStore(IDB_STORE_DOCS);
      store.clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

/**
 * Synchronizes subjects from Schedule & Grades Calculator and merges them with user-edited Library subjects.
 */
export function getMergedLibrarySubjects(): LibrarySubject[] {
  let savedSubjects: LibrarySubject[] = [];
  let deletedSyncNames: string[] = [];

  try {
    const raw = localStorage.getItem(LIBRARY_STORAGE_KEYS.SUBJECTS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) savedSubjects = parsed;
    }
  } catch {}

  try {
    const delRaw = localStorage.getItem(LIBRARY_STORAGE_KEYS.DELETED_SYNC_NAMES);
    if (delRaw) {
      const parsed = JSON.parse(delRaw);
      if (Array.isArray(parsed)) deletedSyncNames = parsed;
    }
  } catch {}

  const deletedSet = new Set(deletedSyncNames.map((n) => n.trim().toLowerCase()));
  const existingNamesMap = new Map<string, LibrarySubject>();
  for (const sub of savedSubjects) {
    existingNamesMap.set(sub.name.trim().toLowerCase(), sub);
  }

  let changed = false;

  // 1. Pull subjects from Schedule ('pipboy_schedule_classes_v1')
  try {
    const schedStr = localStorage.getItem('pipboy_schedule_classes_v1');
    if (schedStr) {
      const parsed: ScheduleClass[] = JSON.parse(schedStr);
      if (Array.isArray(parsed)) {
        const mockNames = new Set([
          'История отечественной культуры',
          'Латинский язык (Семинар)',
          'Сравнительное языкознание',
          'Философия и методология науки',
          'Источниковедение и архивоведение',
          'История литературы',
          'Культурология и семиотика'
        ]);
        for (const cls of parsed) {
          if (cls.id?.startsWith('class-') && mockNames.has(cls.subject)) continue;
          const name = (cls.subject || '').trim();
          const key = name.toLowerCase();
          if (name && !deletedSet.has(key) && !existingNamesMap.has(key)) {
            const newSub: LibrarySubject = {
              id: `sub-sched-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              name,
              color: COLOR_POOL[savedSubjects.length % COLOR_POOL.length],
              source: 'schedule',
              createdAt: Date.now()
            };
            savedSubjects.push(newSub);
            existingNamesMap.set(key, newSub);
            changed = true;
          }
        }
      }
    }
  } catch {}

  // 2. Pull subjects from Grades Calculator ('pipboy_grades_subjects_v1')
  try {
    const gradesStr = localStorage.getItem('pipboy_grades_subjects_v1');
    if (gradesStr) {
      const parsed: SubjectItem[] = JSON.parse(gradesStr);
      if (Array.isArray(parsed)) {
        for (const g of parsed) {
          const name = (g.name || '').trim();
          const key = name.toLowerCase();
          if (name && !deletedSet.has(key) && !existingNamesMap.has(key)) {
            const newSub: LibrarySubject = {
              id: `sub-grade-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              name,
              color: COLOR_POOL[savedSubjects.length % COLOR_POOL.length],
              source: 'grades',
              createdAt: Date.now()
            };
            savedSubjects.push(newSub);
            existingNamesMap.set(key, newSub);
            changed = true;
          }
        }
      }
    }
  } catch {}

  if (changed) {
    try {
      localStorage.setItem(LIBRARY_STORAGE_KEYS.SUBJECTS, JSON.stringify(savedSubjects));
    } catch {}
  }

  return savedSubjects;
}

export function saveLibrarySubjectsList(
  subjects: LibrarySubject[],
  newlyDeletedName?: string
): void {
  try {
    localStorage.setItem(LIBRARY_STORAGE_KEYS.SUBJECTS, JSON.stringify(subjects));
    if (newlyDeletedName) {
      const delRaw = localStorage.getItem(LIBRARY_STORAGE_KEYS.DELETED_SYNC_NAMES);
      const list: string[] = delRaw ? JSON.parse(delRaw) : [];
      const normalized = newlyDeletedName.trim().toLowerCase();
      if (!list.includes(normalized)) {
        list.push(normalized);
        localStorage.setItem(LIBRARY_STORAGE_KEYS.DELETED_SYNC_NAMES, JSON.stringify(list));
      }
    }
  } catch {}
}

/**
 * Loads all saved documents metadata from localStorage and hydrates pages from IndexedDB.
 */
export async function loadAllLibraryDocuments(): Promise<LibraryDocument[]> {
  let metaDocs: LibraryDocument[] = [];
  try {
    const raw = localStorage.getItem(LIBRARY_STORAGE_KEYS.DOCS_META);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) metaDocs = parsed;
    }
  } catch {}

  const hydrated: LibraryDocument[] = [];
  for (const doc of metaDocs) {
    const idbPayload = await loadDocPayloadFromIDB(doc.id);
    if (idbPayload && idbPayload.pages.length > 0) {
      const ocrCount = idbPayload.pages.filter((p) => p.isOcrRecognized).length;
      const hasScans = idbPayload.pages.some((p) => p.isScannedPage);
      hydrated.push({
        ...doc,
        pages: idbPayload.pages,
        totalPages: idbPayload.pages.length,
        isScannedPdf: Boolean(doc.isScannedPdf || hasScans),
        ocrPagesCount: ocrCount || doc.ocrPagesCount || 0
      });
    } else {
      hydrated.push({
        ...doc,
        pages: Array.isArray(doc.pages) && doc.pages.length > 0 ? doc.pages : [
          {
            pageNumber: 1,
            title: doc.title,
            content: 'Текст документа готов к чтению.'
          }
        ]
      });
    }
  }

  return hydrated;
}

/**
 * Saves or updates a LibraryDocument in localStorage + IndexedDB.
 */
export async function saveLibraryDocument(
  doc: LibraryDocument,
  rawBlob?: Blob | null
): Promise<void> {
  // If rawBlob is not explicitly passed on an update, preserve existing rawBlob in IndexedDB
  let blobToSave = rawBlob;
  if (blobToSave === undefined) {
    const existingPayload = await loadDocPayloadFromIDB(doc.id);
    blobToSave = existingPayload?.rawBlob || null;
  }

  // 1. Save full pages (including any scan preview images) and binary blob to IndexedDB
  await saveDocPayloadToIDB(doc.id, doc.pages, blobToSave);

  // 2. Save metadata + lightweight pages backup (without heavy base64 scan previews) to localStorage
  const sanitizeDocForLocalStorage = (d: LibraryDocument): LibraryDocument => ({
    ...d,
    pages: d.pages.map((p) => {
      if (!p.pageImageDataUrl) return p;
      const { pageImageDataUrl, ...restPage } = p;
      return restPage;
    })
  });

  let currentList: LibraryDocument[] = [];
  try {
    const raw = localStorage.getItem(LIBRARY_STORAGE_KEYS.DOCS_META);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) currentList = parsed;
    }
  } catch {}

  const sanitizedDoc = sanitizeDocForLocalStorage(doc);
  const idx = currentList.findIndex((d) => d.id === sanitizedDoc.id);
  const nextList =
    idx >= 0
      ? currentList.map((d) => (d.id === sanitizedDoc.id ? sanitizedDoc : d))
      : [sanitizedDoc, ...currentList];

  try {
    localStorage.setItem(LIBRARY_STORAGE_KEYS.DOCS_META, JSON.stringify(nextList));
  } catch {
    // If localStorage quota is exceeded due to large page text, store compact metadata in localStorage
    // while keeping full pages in IndexedDB
    const compactList = nextList.map((d) => ({
      ...d,
      pages: d.pages.slice(0, 3)
    }));
    try {
      localStorage.setItem(LIBRARY_STORAGE_KEYS.DOCS_META, JSON.stringify(compactList));
    } catch {}
  }
}

export async function removeLibraryDocument(id: string): Promise<void> {
  await deleteDocPayloadFromIDB(id);
  try {
    const raw = localStorage.getItem(LIBRARY_STORAGE_KEYS.DOCS_META);
    if (raw) {
      const parsed: LibraryDocument[] = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const filtered = parsed.filter((d) => d.id !== id);
        localStorage.setItem(LIBRARY_STORAGE_KEYS.DOCS_META, JSON.stringify(filtered));
      }
    }
  } catch {}
}

/**
 * Detects normalized LibraryFileType from file name or MIME type.
 */
export function detectLibraryFileType(file: File): LibraryFileType {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (ext === 'pdf') return 'pdf';
  if (ext === 'docx') return 'docx';
  if (ext === 'doc') return 'doc';
  if (ext === 'pptx') return 'pptx';
  if (ext === 'ppt') return 'ppt';
  if (ext === 'ppx') return 'ppx';
  if (ext === 'md' || ext === 'markdown') return 'md';
  return 'txt';
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

/**
 * Parses a Word (.docx) OpenXML zip archive directly in the browser using JSZip.
 */
async function parseDocxWithJSZip(file: File): Promise<LibraryPage[]> {
  const zip = await JSZip.loadAsync(file);
  const docXmlFile = zip.file('word/document.xml');
  if (!docXmlFile) {
    throw new Error('В архиве DOCX не найден word/document.xml');
  }

  const xmlText = await docXmlFile.async('string');
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, 'application/xml');

  const paragraphsNodes = Array.from(xmlDoc.getElementsByTagNameNS('*', 'p'));
  const blocks: Array<{ text: string; isHeading: boolean }> = [];

  for (const pNode of paragraphsNodes) {
    const styleNodes = Array.from(pNode.getElementsByTagNameNS('*', 'pStyle'));
    const styleVal = styleNodes[0]?.getAttribute('w:val') || styleNodes[0]?.getAttribute('val') || '';
    const isHeading = /Heading|Заголовок|Title|Subtitle/i.test(styleVal);

    const textNodes = Array.from(pNode.getElementsByTagNameNS('*', 't'));
    const lineText = textNodes.map((t) => t.textContent || '').join('').trim();

    if (lineText) {
      blocks.push({ text: lineText, isHeading });
    }
  }

  if (blocks.length === 0) {
    return [
      {
        pageNumber: 1,
        title: `${file.name} — Страница 1`,
        content: 'Документ Word не содержит текстовых абзацев или состоит только из графических объектов.'
      }
    ];
  }

  // Group paragraphs into readable pages (~320 words per page, or split on major headings if page already has content)
  const pages: LibraryPage[] = [];
  let currentParagraphs: string[] = [];
  let currentWordCount = 0;
  let currentTitle = 'Раздел 1';

  const flushPage = () => {
    if (currentParagraphs.length === 0) return;
    const pageNum = pages.length + 1;
    pages.push({
      pageNumber: pageNum,
      title: currentTitle || `Страница ${pageNum}`,
      content: currentParagraphs.join('\n\n')
    });
    currentParagraphs = [];
    currentWordCount = 0;
  };

  for (const block of blocks) {
    const wordsInBlock = block.text.split(/\s+/).length;
    if (block.isHeading && currentWordCount >= 120) {
      flushPage();
      currentTitle = block.text.slice(0, 90);
    } else if (block.isHeading && currentParagraphs.length === 0) {
      currentTitle = block.text.slice(0, 90);
    }

    currentParagraphs.push(block.text);
    currentWordCount += wordsInBlock;

    if (currentWordCount >= 320) {
      flushPage();
      currentTitle = `Страница ${pages.length + 1}`;
    }
  }

  flushPage();
  return pages;
}

/**
 * Parses a PowerPoint (.pptx / .ppx) OpenXML zip archive directly in the browser using JSZip.
 * Extracts slide titles, bullet points, and speaker notes per slide.
 */
async function parsePptxOrPpxWithJSZip(file: File): Promise<LibraryPage[]> {
  const zip = await JSZip.loadAsync(file);
  const slidePaths = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/i.test(p))
    .sort((a, b) => {
      const numA = parseInt(a.match(/slide(\d+)\.xml/i)?.[1] || '0', 10);
      const numB = parseInt(b.match(/slide(\d+)\.xml/i)?.[1] || '0', 10);
      return numA - numB;
    });

  if (slidePaths.length === 0) {
    throw new Error('Слайды в архиве презентации не найдены');
  }

  const parser = new DOMParser();
  const pages: LibraryPage[] = [];

  for (let i = 0; i < slidePaths.length; i++) {
    const slidePath = slidePaths[i];
    const slideNum = i + 1;
    const xmlStr = await zip.file(slidePath)!.async('string');
    const xmlDoc = parser.parseFromString(xmlStr, 'application/xml');

    const pNodes = Array.from(xmlDoc.getElementsByTagNameNS('*', 'p'));
    const lines: string[] = [];

    for (const pNode of pNodes) {
      const tNodes = Array.from(pNode.getElementsByTagNameNS('*', 't'));
      const text = tNodes.map((t) => t.textContent || '').join('').trim();
      if (text) {
        lines.push(text);
      }
    }

    // Check for speaker notes in ppt/notesSlides/notesSlide{N}.xml
    let speakerNotes = '';
    const notesPath = `ppt/notesSlides/notesSlide${slideNum}.xml`;
    const notesFile = zip.file(notesPath);
    if (notesFile) {
      try {
        const notesXml = await notesFile.async('string');
        const notesDoc = parser.parseFromString(notesXml, 'application/xml');
        const notePNodes = Array.from(notesDoc.getElementsByTagNameNS('*', 'p'));
        const noteLines: string[] = [];
        for (const np of notePNodes) {
          const ntNodes = Array.from(np.getElementsByTagNameNS('*', 't'));
          const nText = ntNodes.map((t) => t.textContent || '').join('').trim();
          if (nText && nText !== String(slideNum)) {
            noteLines.push(nText);
          }
        }
        speakerNotes = noteLines.join('\n').trim();
      } catch {}
    }

    const slideTitle = lines[0] ? `Слайд ${slideNum}: ${lines[0].slice(0, 75)}` : `Слайд ${slideNum}`;
    const bullets = lines.length > 1 ? lines.slice(1) : lines;
    const bodyText =
      lines.length > 0
        ? lines.join('\n\n')
        : `Слайд ${slideNum} (визуальный/графический слайд без текстовых блоков)`;

    pages.push({
      pageNumber: slideNum,
      title: slideTitle,
      content: bodyText,
      bullets,
      speakerNotes: speakerNotes || undefined
    });
  }

  return pages;
}

/**
 * Parses plain text or Markdown (.txt, .md) into structured pages.
 */
async function parsePlainTextFile(file: File): Promise<LibraryPage[]> {
  const rawText = await file.text();
  const normalized = rawText.replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    return [
      {
        pageNumber: 1,
        title: `${file.name} — Страница 1`,
        content: 'Файл пуст.'
      }
    ];
  }

  const paragraphs = normalized.split(/\n{2,}/);
  const pages: LibraryPage[] = [];
  let currentChunk: string[] = [];
  let wordCount = 0;
  let currentHeading = '';

  const flush = () => {
    if (currentChunk.length === 0) return;
    const num = pages.length + 1;
    pages.push({
      pageNumber: num,
      title: currentHeading || `Страница ${num}`,
      content: currentChunk.join('\n\n')
    });
    currentChunk = [];
    wordCount = 0;
  };

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;
    const isHeading = /^#{1,3}\s+/.test(trimmed) || (trimmed.length < 70 && trimmed === trimmed.toUpperCase() && /[A-ZА-ЯЁ]/.test(trimmed));
    const words = trimmed.split(/\s+/).length;

    if (isHeading && wordCount >= 140) {
      flush();
      currentHeading = trimmed.replace(/^#{1,3}\s+/, '').slice(0, 80);
    } else if (isHeading && currentChunk.length === 0) {
      currentHeading = trimmed.replace(/^#{1,3}\s+/, '').slice(0, 80);
    }

    currentChunk.push(trimmed);
    wordCount += words;

    if (wordCount >= 320) {
      flush();
      currentHeading = '';
    }
  }

  flush();
  return pages;
}

/**
 * Parses any supported file (.pdf, .docx, .doc, .pptx, .ppt, .ppx, .txt, .md)
 * into structured LibraryPage[] for the in-app Reader and Translator.
 * For PDFs (including scanned PDFs without a text layer), automatically inspects pages
 * via PDF.js and runs OCR (Server Gemini Vision + Local Tesseract.js fallback).
 */
export async function parseUploadedLibraryFile(
  file: File,
  onProgress?: OcrProgressCallback
): Promise<{
  fileType: LibraryFileType;
  pages: LibraryPage[];
  isScannedPdf?: boolean;
  ocrPagesCount?: number;
}> {
  const fileType = detectLibraryFileType(file);

  // 1. Plain text / Markdown
  if (fileType === 'txt' || fileType === 'md') {
    onProgress?.(`Чтение текстового документа «${file.name}»...`);
    const pages = await parsePlainTextFile(file);
    return { fileType, pages };
  }

  // 2. Word .docx (OpenXML zip)
  if (fileType === 'docx') {
    try {
      onProgress?.(`Извлечение разделов и абзацев из Word (${file.name})...`);
      const pages = await parseDocxWithJSZip(file);
      if (pages.length > 0) return { fileType, pages };
    } catch {
      // Fallback to server parser below if file is non-standard
    }
  }

  // 3. Presentations .pptx and .ppx (try OpenXML zip first)
  if (fileType === 'pptx' || fileType === 'ppx') {
    try {
      onProgress?.(`Извлечение слайдов и заметок докладчика из презентации (${file.name})...`);
      const pages = await parsePptxOrPpxWithJSZip(file);
      if (pages.length > 0) return { fileType, pages };
    } catch {
      // If .ppx is XML/text or binary, fall through to text/server extraction
    }
  }

  // 4. PDF Documents: Use PDF.js page-by-page inspection + Automatic OCR for scanned (image) pages
  if (fileType === 'pdf') {
    try {
      const pdfResult = await parsePdfWithAutomaticOcr(file, file.name, onProgress);
      if (pdfResult.pages.length > 0) {
        return {
          fileType: 'pdf',
          pages: pdfResult.pages,
          isScannedPdf: pdfResult.isScannedPdf,
          ocrPagesCount: pdfResult.ocrPagesCount
        };
      }
    } catch {
      // If PDF.js fails on an unusual PDF header, fall through to server multimodal OCR below
    }
  }

  // 5. Server-assisted extraction & OCR fallback for .pdf, .doc, .ppt, or fallback .ppx/.docx
  try {
    onProgress?.(`Серверная обработка и OCR документа «${file.name}»...`);
    const base64Data = await fileToBase64(file);
    const res = await fetch('/api/library/parse-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: file.name,
        fileType,
        base64Data
      })
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.pages) && data.pages.length > 0) {
        const ocrCount = data.pages.filter((p: any) => p.isOcrRecognized).length;
        return {
          fileType,
          pages: data.pages,
          isScannedPdf: Boolean(data.isScannedPdf || ocrCount > 0),
          ocrPagesCount: ocrCount
        };
      }
    }
  } catch {}

  // 6. Final safe fallback
  return {
    fileType,
    pages: [
      {
        pageNumber: 1,
        title: `${file.name} — Страница 1`,
        content: `Файл «${file.name}» (${fileType.toUpperCase()}) загружен в Библиотеку студента.`
      }
    ]
  };
}

export { SUBJECT_COLOR_STYLES, COLOR_POOL };
