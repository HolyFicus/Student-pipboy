import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  LibraryDocument,
  LibraryFileType,
  LibraryPageTranslation,
  LibrarySubject,
  SUBJECT_COLOR_STYLES,
  TARGET_LANGUAGES,
  TargetLanguageCode,
  TranslatorDisplayMode
} from '../types/library';
import {
  COLOR_POOL,
  getMergedLibrarySubjects,
  loadAllLibraryDocuments,
  loadDocPayloadFromIDB,
  parseUploadedLibraryFile,
  removeLibraryDocument,
  saveLibraryDocument,
  saveLibrarySubjectsList
} from '../utils/libraryStore';
import {
  recognizeAllPdfPagesInReader,
  recognizeSinglePdfPageOcr
} from '../utils/pdfOcrEngine';
import { pipAudio } from '../utils/audio';
import { useModalScrollLock } from '../utils/useModalScrollLock';
import {
  BookOpen,
  Upload,
  FolderPlus,
  Languages,
  Bookmark,
  StickyNote,
  Search,
  Maximize2,
  Minimize2,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Edit3,
  Plus,
  X,
  FileText,
  Presentation,
  FileSpreadsheet,
  Sparkles,
  Check,
  RefreshCw,
  Columns,
  Smartphone,
  ZoomIn,
  ZoomOut,
  ListFilter,
  Eye,
  GraduationCap,
  Calendar,
  Calculator,
  ScanText
} from 'lucide-react';

interface TabLibraryProps {
  onSendNotification?: (title: string, message: string) => void;
}

export const TabLibrary: React.FC<TabLibraryProps> = ({ onSendNotification }) => {
  // Documents & Subjects State
  const [documents, setDocuments] = useState<LibraryDocument[]>([]);
  const [subjects, setSubjects] = useState<LibrarySubject[]>(() => getMergedLibrarySubjects());
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState<string>('ALL');
  const [selectedFormatFilter, setSelectedFormatFilter] = useState<string>('ALL');
  const [shelfSearchQuery, setShelfSearchQuery] = useState<string>('');
  const [isLoadingDocs, setIsLoadingDocs] = useState<boolean>(true);

  // Active Reader Document State
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [currentPageNum, setCurrentPageNum] = useState<number>(1);
  const [fontSizePx, setFontSizePx] = useState<number>(16);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [forceLandscapeLayout, setForceLandscapeLayout] = useState<boolean>(false);
  const [isDeviceLandscapeMobile, setIsDeviceLandscapeMobile] = useState<boolean>(false);
  const [showNativePdfPreview, setShowNativePdfPreview] = useState<boolean>(false);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [rawPdfBlob, setRawPdfBlob] = useState<Blob | null>(null);
  const [isRunningReaderOcr, setIsRunningReaderOcr] = useState<boolean>(false);
  const [readerOcrStatus, setReaderOcrStatus] = useState<string>('');
  const [showScanPageImage, setShowScanPageImage] = useState<boolean>(false);

  // Automatic Translator State in Reader
  const [autoTranslateEnabled, setAutoTranslateEnabled] = useState<boolean>(false);
  const [targetLang, setTargetLang] = useState<TargetLanguageCode>('ru');
  const [translatorDisplayMode, setTranslatorDisplayMode] = useState<TranslatorDisplayMode>('parallel');
  const [isTranslatingPage, setIsTranslatingPage] = useState<boolean>(false);
  const [translationError, setTranslationError] = useState<string | null>(null);

  // Reader Drawers: Search, Bookmarks/TOC, Page Notes
  const [activeReaderDrawer, setActiveReaderDrawer] = useState<'NONE' | 'SEARCH' | 'BOOKMARKS' | 'NOTES'>('NONE');
  const [inBookSearchQuery, setInBookSearchQuery] = useState<string>('');
  const [pageNoteDraft, setPageNoteDraft] = useState<string>('');
  const [noteSavedToast, setNoteSavedToast] = useState<boolean>(false);

  // Modals: Upload File, Create Text Note, Subject Manager
  const [isUploadModalOpen, setIsUploadModalOpen] = useState<boolean>(false);
  const [isSubjectModalOpen, setIsSubjectModalOpen] = useState<boolean>(false);
  const [uploadPendingFiles, setUploadPendingFiles] = useState<File[]>([]);
  const [uploadCustomTitle, setUploadCustomTitle] = useState<string>('');
  const [uploadAuthor, setUploadAuthor] = useState<string>('');
  const [uploadSubjectId, setUploadSubjectId] = useState<string>('UNASSIGNED');
  const [isParsingUpload, setIsParsingUpload] = useState<boolean>(false);
  const [uploadProgressText, setUploadProgressText] = useState<string>('');
  const [uploadModeTab, setUploadModeTab] = useState<'FILE' | 'TEXT'>('FILE');
  const [manualTextTitle, setManualTextTitle] = useState<string>('');
  const [manualTextBody, setManualTextBody] = useState<string>('');

  // Subject Manager Form State
  const [newSubjectName, setNewSubjectName] = useState<string>('');
  const [newSubjectColor, setNewSubjectColor] = useState<LibrarySubject['color']>('emerald');
  const [editingSubjectId, setEditingSubjectId] = useState<string | null>(null);
  const [editingSubjectName, setEditingSubjectName] = useState<string>('');
  const [editingSubjectColor, setEditingSubjectColor] = useState<LibrarySubject['color']>('emerald');

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const readerContainerRef = useRef<HTMLDivElement | null>(null);

  useModalScrollLock(isUploadModalOpen || isSubjectModalOpen || isFullscreen);

  // Detect screen orientation (especially smartphone horizontal rotation)
  useEffect(() => {
    const checkOrientation = () => {
      if (typeof window === 'undefined') return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const isHorizontalMobile = w > h && h <= 620;
      setIsDeviceLandscapeMobile(isHorizontalMobile);
    };
    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);
    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, []);

  // Load saved documents on mount & sync subjects from Schedule and Grades
  useEffect(() => {
    let mounted = true;
    const init = async () => {
      setIsLoadingDocs(true);
      const syncedSubjects = getMergedLibrarySubjects();
      const loadedDocs = await loadAllLibraryDocuments();
      if (mounted) {
        setSubjects(syncedSubjects);
        setDocuments(loadedDocs);
        setIsLoadingDocs(false);
      }
    };
    init();
    return () => {
      mounted = false;
    };
  }, []);

  const activeDoc = useMemo(
    () => documents.find((d) => d.id === activeDocId) || null,
    [documents, activeDocId]
  );

  const activePage = useMemo(() => {
    if (!activeDoc || !activeDoc.pages.length) return null;
    return (
      activeDoc.pages.find((p) => p.pageNumber === currentPageNum) ||
      activeDoc.pages[Math.min(Math.max(0, currentPageNum - 1), activeDoc.pages.length - 1)] ||
      activeDoc.pages[0]
    );
  }, [activeDoc, currentPageNum]);

  // Sync pageNoteDraft when page or document changes
  useEffect(() => {
    if (!activeDoc) {
      setPageNoteDraft('');
      return;
    }
    const existingNote = activeDoc.notes?.[currentPageNum] || '';
    setPageNoteDraft(existingNote);
  }, [activeDoc, currentPageNum]);

  // Load PDF blob URL when viewing a PDF document
  useEffect(() => {
    let revokedUrl: string | null = null;
    if (!activeDoc || activeDoc.fileType !== 'pdf') {
      setPdfBlobUrl(null);
      setRawPdfBlob(null);
      setShowNativePdfPreview(false);
      setShowScanPageImage(false);
      return;
    }

    loadDocPayloadFromIDB(activeDoc.id).then((payload) => {
      if (payload?.rawBlob) {
        const url = URL.createObjectURL(payload.rawBlob);
        revokedUrl = url;
        setPdfBlobUrl(url);
        setRawPdfBlob(payload.rawBlob);
      } else {
        setPdfBlobUrl(null);
        setRawPdfBlob(null);
      }
    });

    return () => {
      if (revokedUrl) {
        URL.revokeObjectURL(revokedUrl);
      }
    };
  }, [activeDoc?.id, activeDoc?.fileType]);

  // Helper to update a document in state and storage
  const updateDocumentInStore = useCallback(async (updatedDoc: LibraryDocument) => {
    setDocuments((prev) => prev.map((d) => (d.id === updatedDoc.id ? updatedDoc : d)));
    await saveLibraryDocument(updatedDoc);
  }, []);

  // Translate current page via /api/ai/translate and cache result in activeDoc
  const translateCurrentPage = useCallback(
    async (forceRefresh = false) => {
      if (!activeDoc || !activePage) return;
      const existingTranslation = activePage.translations?.[targetLang];
      if (existingTranslation && !forceRefresh) return;

      const textToTranslate = [
        activePage.title ? `${activePage.title}` : '',
        activePage.content || '',
        activePage.speakerNotes ? `\n[Заметки докладчика]: ${activePage.speakerNotes}` : ''
      ]
        .filter(Boolean)
        .join('\n\n')
        .trim();

      if (!textToTranslate) return;

      setIsTranslatingPage(true);
      setTranslationError(null);

      try {
        const subjectObj = subjects.find((s) => s.id === activeDoc.subjectId);
        const contextLabel = `${activeDoc.title}${subjectObj ? ` (Предмет: ${subjectObj.name})` : ''}, стр./слайд ${activePage.pageNumber}`;

        const res = await fetch('/api/ai/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: textToTranslate,
            targetLang,
            context: contextLabel
          })
        });

        if (!res.ok) {
          throw new Error('Не удалось получить ответ от модуля перевода.');
        }

        const data = await res.json();
        const newTranslation: LibraryPageTranslation = {
          targetLang,
          translatedText: data.translatedText || textToTranslate,
          detectedLang: data.detectedLang || 'Автоопределение',
          academicNotes: data.academicNotes || '',
          keyTerms: Array.isArray(data.keyTerms) ? data.keyTerms : [],
          translatedAt: Date.now()
        };

        const updatedPages = activeDoc.pages.map((p) =>
          p.pageNumber === activePage.pageNumber
            ? {
                ...p,
                translations: {
                  ...(p.translations || {}),
                  [targetLang]: newTranslation
                }
              }
            : p
        );

        const updatedDoc: LibraryDocument = {
          ...activeDoc,
          pages: updatedPages
        };

        await updateDocumentInStore(updatedDoc);
      } catch (err: any) {
        setTranslationError(err?.message || 'Ошибка автоматического перевода страницы.');
      } finally {
        setIsTranslatingPage(false);
      }
    },
    [activeDoc, activePage, targetLang, subjects, updateDocumentInStore]
  );

  // Trigger automatic translation when autoTranslateEnabled is ON and page/language/content changes
  useEffect(() => {
    if (activeDoc && activePage && autoTranslateEnabled) {
      translateCurrentPage(false);
    }
  }, [
    activeDoc?.id,
    activePage?.pageNumber,
    activePage?.content,
    autoTranslateEnabled,
    targetLang,
    translateCurrentPage
  ]);

  // Run high-accuracy OCR on the current PDF page inside the Reader
  const handleRunCurrentPageOcr = useCallback(async () => {
    if (!activeDoc || !activePage || !rawPdfBlob || isRunningReaderOcr) return;
    pipAudio.playClick();
    setIsRunningReaderOcr(true);
    setReaderOcrStatus(`Подготовка скана стр. №${activePage.pageNumber}...`);

    try {
      const ocrRes = await recognizeSinglePdfPageOcr(
        rawPdfBlob,
        activePage.pageNumber,
        activeDoc.fileName,
        (msg) => setReaderOcrStatus(msg)
      );

      const updatedPages = activeDoc.pages.map((p) =>
        p.pageNumber === activePage.pageNumber
          ? {
              ...p,
              title: ocrRes.title,
              content: ocrRes.content,
              bullets: ocrRes.bullets,
              isScannedPage: true,
              isOcrRecognized: true,
              ocrEngine: ocrRes.ocrEngine,
              ocrConfidence: ocrRes.ocrConfidence,
              pageImageDataUrl: ocrRes.pageImageDataUrl,
              translations: undefined // Reset translation so fresh OCR text is translated
            }
          : p
      );

      const ocrCount = updatedPages.filter((p) => p.isOcrRecognized).length;
      const updatedDoc: LibraryDocument = {
        ...activeDoc,
        pages: updatedPages,
        isScannedPdf: true,
        ocrPagesCount: ocrCount
      };

      await updateDocumentInStore(updatedDoc);
      pipAudio.playSuccess();
      setShowNativePdfPreview(false);
    } catch {
      setReaderOcrStatus('Ошибка при распознавании страницы.');
    } finally {
      setIsRunningReaderOcr(false);
      setTimeout(() => setReaderOcrStatus(''), 2500);
    }
  }, [activeDoc, activePage, rawPdfBlob, isRunningReaderOcr, updateDocumentInStore]);

  // Run OCR across all scanned/unrecognized pages of the current PDF inside the Reader
  const handleRunAllPagesOcr = useCallback(async () => {
    if (!activeDoc || !rawPdfBlob || isRunningReaderOcr) return;
    pipAudio.playClick();
    setIsRunningReaderOcr(true);
    setReaderOcrStatus('Запуск пакетного OCR-распознавания всех сканов документа...');

    try {
      const updatedPages = await recognizeAllPdfPagesInReader(
        rawPdfBlob,
        activeDoc.pages,
        activeDoc.fileName,
        false,
        (msg) => setReaderOcrStatus(msg)
      );

      const ocrCount = updatedPages.filter((p) => p.isOcrRecognized).length;
      const updatedDoc: LibraryDocument = {
        ...activeDoc,
        pages: updatedPages,
        totalPages: updatedPages.length,
        isScannedPdf: true,
        ocrPagesCount: ocrCount
      };

      await updateDocumentInStore(updatedDoc);
      pipAudio.playSuccess();
      setShowNativePdfPreview(false);
      if (onSendNotification) {
        onSendNotification(
          'OCR РАСПОЗНАВАНИЕ ЗАВЕРШЕНО',
          `В документе «${activeDoc.title}» распознано ${ocrCount} стр. Поиск и автопереводчик активны.`
        );
      }
    } catch {
      setReaderOcrStatus('Ошибка при пакетном OCR документа.');
    } finally {
      setIsRunningReaderOcr(false);
      setTimeout(() => setReaderOcrStatus(''), 2500);
    }
  }, [activeDoc, rawPdfBlob, isRunningReaderOcr, updateDocumentInStore, onSendNotification]);

  // Navigate to a specific page and persist currentPage
  const goToPage = useCallback(
    async (pageNumber: number) => {
      if (!activeDoc) return;
      const clamped = Math.max(1, Math.min(activeDoc.totalPages, pageNumber));
      pipAudio.playClick();
      setCurrentPageNum(clamped);

      if (activeDoc.currentPage !== clamped) {
        const updated: LibraryDocument = {
          ...activeDoc,
          currentPage: clamped,
          lastOpenedAt: Date.now()
        };
        await updateDocumentInStore(updated);
      }
    },
    [activeDoc, updateDocumentInStore]
  );

  // Keyboard navigation in Reader (ArrowLeft / ArrowRight / Escape)
  useEffect(() => {
    if (!activeDoc) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (currentPageNum < activeDoc.totalPages) {
          goToPage(currentPageNum + 1);
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (currentPageNum > 1) {
          goToPage(currentPageNum - 1);
        }
      } else if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeDoc, currentPageNum, isFullscreen, goToPage]);

  // Toggle Bookmark on current page
  const handleToggleBookmark = async () => {
    if (!activeDoc) return;
    pipAudio.playClick();
    const exists = activeDoc.bookmarks.includes(currentPageNum);
    const nextBookmarks = exists
      ? activeDoc.bookmarks.filter((b) => b !== currentPageNum)
      : [...activeDoc.bookmarks, currentPageNum].sort((a, b) => a - b);

    const updated: LibraryDocument = {
      ...activeDoc,
      bookmarks: nextBookmarks
    };
    await updateDocumentInStore(updated);
  };

  // Save Note for current page
  const handleSavePageNote = async () => {
    if (!activeDoc) return;
    pipAudio.playSuccess();
    const nextNotes = { ...(activeDoc.notes || {}) };
    const trimmed = pageNoteDraft.trim();
    if (trimmed) {
      nextNotes[currentPageNum] = trimmed;
    } else {
      delete nextNotes[currentPageNum];
    }

    const updated: LibraryDocument = {
      ...activeDoc,
      notes: nextNotes
    };
    await updateDocumentInStore(updated);
    setNoteSavedToast(true);
    setTimeout(() => setNoteSavedToast(false), 2000);
  };

  // Handle File Selection in Upload Modal
  const handleFilesSelected = (filesList: FileList | null) => {
    if (!filesList || filesList.length === 0) return;
    const arr = Array.from(filesList);
    setUploadPendingFiles(arr);
    if (arr.length === 1 && !uploadCustomTitle) {
      const cleanName = arr[0].name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
      setUploadCustomTitle(cleanName);
    }
  };

  // Process & Upload Files into Library
  const handleConfirmUpload = async (e: React.FormEvent) => {
    e.preventDefault();

    if (uploadModeTab === 'TEXT') {
      const title = manualTextTitle.trim() || 'Конспект лекции';
      const body = manualTextBody.trim();
      if (!body) return;

      setIsParsingUpload(true);
      setUploadProgressText('Формирование страниц конспекта...');
      try {
        const virtualFile = new File([body], `${title}.txt`, { type: 'text/plain' });
        const { pages } = await parseUploadedLibraryFile(virtualFile);
        const newDoc: LibraryDocument = {
          id: `libdoc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          title,
          fileName: `${title}.txt`,
          fileType: 'txt',
          fileSize: virtualFile.size,
          subjectId: uploadSubjectId || 'UNASSIGNED',
          author: uploadAuthor.trim() || undefined,
          addedAt: Date.now(),
          lastOpenedAt: Date.now(),
          currentPage: 1,
          totalPages: pages.length,
          pages,
          bookmarks: [],
          notes: {},
          hasRawBlob: false
        };

        await saveLibraryDocument(newDoc, null);
        setDocuments((prev) => [newDoc, ...prev]);
        pipAudio.playSuccess();
        setIsUploadModalOpen(false);
        setManualTextTitle('');
        setManualTextBody('');
        setActiveDocId(newDoc.id);
        setCurrentPageNum(1);
      } finally {
        setIsParsingUpload(false);
        setUploadProgressText('');
      }
      return;
    }

    if (uploadPendingFiles.length === 0) return;
    setIsParsingUpload(true);

    try {
      let lastCreatedDoc: LibraryDocument | null = null;

      for (let i = 0; i < uploadPendingFiles.length; i++) {
        const file = uploadPendingFiles[i];
        setUploadProgressText(
          `Обработка и верстка файла (${i + 1}/${uploadPendingFiles.length}): ${file.name}...`
        );

        const { fileType, pages, isScannedPdf, ocrPagesCount } = await parseUploadedLibraryFile(
          file,
          (progressMsg) => {
            setUploadProgressText(
              uploadPendingFiles.length > 1
                ? `[${i + 1}/${uploadPendingFiles.length}] ${progressMsg}`
                : progressMsg
            );
          }
        );
        const docTitle =
          uploadPendingFiles.length === 1 && uploadCustomTitle.trim()
            ? uploadCustomTitle.trim()
            : file.name.replace(/\.[^.]+$/, '');

        const newDoc: LibraryDocument = {
          id: `libdoc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          title: docTitle,
          fileName: file.name,
          fileType,
          fileSize: file.size,
          subjectId: uploadSubjectId !== 'ALL' ? uploadSubjectId : 'UNASSIGNED',
          author: uploadAuthor.trim() || undefined,
          addedAt: Date.now(),
          lastOpenedAt: Date.now(),
          currentPage: 1,
          totalPages: pages.length,
          pages,
          bookmarks: [],
          notes: {},
          hasRawBlob: fileType === 'pdf',
          isScannedPdf: Boolean(isScannedPdf),
          ocrPagesCount: ocrPagesCount || 0
        };

        await saveLibraryDocument(newDoc, fileType === 'pdf' ? file : null);
        setDocuments((prev) => [newDoc, ...prev]);
        lastCreatedDoc = newDoc;
      }

      pipAudio.playSuccess();
      if (onSendNotification && lastCreatedDoc) {
        const ocrNote =
          lastCreatedDoc.ocrPagesCount && lastCreatedDoc.ocrPagesCount > 0
            ? ` (OCR распознано сканов: ${lastCreatedDoc.ocrPagesCount} стр.)`
            : '';
        onSendNotification(
          'ФАЙЛ ДОБАВЛЕН В БИБЛИОТЕКУ',
          `Материал «${lastCreatedDoc.title}» (${lastCreatedDoc.totalPages} стр./слайдов)${ocrNote} готов к чтению, поиску и переводу.`
        );
      }

      setUploadPendingFiles([]);
      setUploadCustomTitle('');
      setUploadAuthor('');
      setIsUploadModalOpen(false);

      if (lastCreatedDoc) {
        setActiveDocId(lastCreatedDoc.id);
        setCurrentPageNum(1);
      }
    } finally {
      setIsParsingUpload(false);
      setUploadProgressText('');
    }
  };

  // Subject Management Handlers
  const handleAddSubject = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newSubjectName.trim();
    if (!trimmed) return;
    pipAudio.playSuccess();

    const created: LibrarySubject = {
      id: `sub-custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: trimmed,
      color: newSubjectColor,
      source: 'custom',
      createdAt: Date.now()
    };

    const next = [...subjects, created];
    setSubjects(next);
    saveLibrarySubjectsList(next);
    setNewSubjectName('');
    setNewSubjectColor(COLOR_POOL[next.length % COLOR_POOL.length]);
  };

  const handleSaveEditedSubject = (id: string) => {
    const trimmed = editingSubjectName.trim();
    if (!trimmed) return;
    pipAudio.playSuccess();
    const next = subjects.map((s) =>
      s.id === id ? { ...s, name: trimmed, color: editingSubjectColor } : s
    );
    setSubjects(next);
    saveLibrarySubjectsList(next);
    setEditingSubjectId(null);
  };

  const handleDeleteSubject = async (subject: LibrarySubject) => {
    pipAudio.playClick();
    const next = subjects.filter((s) => s.id !== subject.id);
    setSubjects(next);
    saveLibrarySubjectsList(next, subject.name);

    if (selectedSubjectFilter === subject.id) {
      setSelectedSubjectFilter('ALL');
    }

    // Reassign documents from deleted subject to UNASSIGNED
    const affectedDocs = documents.filter((d) => d.subjectId === subject.id);
    for (const doc of affectedDocs) {
      const updated = { ...doc, subjectId: 'UNASSIGNED' };
      await saveLibraryDocument(updated);
    }
    setDocuments((prev) =>
      prev.map((d) => (d.subjectId === subject.id ? { ...d, subjectId: 'UNASSIGNED' } : d))
    );
  };

  const handleResyncSubjectsFromApp = () => {
    pipAudio.playSuccess();
    const merged = getMergedLibrarySubjects();
    setSubjects(merged);
  };

  const handleAssignDocSubject = async (docId: string, newSubjectId: string) => {
    pipAudio.playClick();
    const target = documents.find((d) => d.id === docId);
    if (!target) return;
    const updated: LibraryDocument = { ...target, subjectId: newSubjectId };
    await updateDocumentInStore(updated);
  };

  const handleDeleteDocument = async (docId: string) => {
    pipAudio.playClick();
    await removeLibraryDocument(docId);
    setDocuments((prev) => prev.filter((d) => d.id !== docId));
    if (activeDocId === docId) {
      setActiveDocId(null);
    }
  };

  // Filtered documents on the shelf
  const filteredDocuments = useMemo(() => {
    return documents.filter((doc) => {
      if (selectedSubjectFilter !== 'ALL' && doc.subjectId !== selectedSubjectFilter) {
        return false;
      }
      if (selectedFormatFilter !== 'ALL') {
        if (selectedFormatFilter === 'PDF' && doc.fileType !== 'pdf') return false;
        if (selectedFormatFilter === 'WORD' && doc.fileType !== 'docx' && doc.fileType !== 'doc')
          return false;
        if (
          selectedFormatFilter === 'PPT' &&
          doc.fileType !== 'pptx' &&
          doc.fileType !== 'ppt' &&
          doc.fileType !== 'ppx'
        )
          return false;
        if (selectedFormatFilter === 'TXT' && doc.fileType !== 'txt' && doc.fileType !== 'md')
          return false;
      }
      if (shelfSearchQuery.trim()) {
        const q = shelfSearchQuery.toLowerCase();
        const inTitle = doc.title.toLowerCase().includes(q);
        const inAuthor = (doc.author || '').toLowerCase().includes(q);
        const inFile = doc.fileName.toLowerCase().includes(q);
        const inPages = doc.pages.some((p) => p.content.toLowerCase().includes(q));
        return inTitle || inAuthor || inFile || inPages;
      }
      return true;
    });
  }, [documents, selectedSubjectFilter, selectedFormatFilter, shelfSearchQuery]);

  // Search matches inside active document (including OCR-recognized pages and translated text)
  const inBookSearchResults = useMemo(() => {
    if (!activeDoc || !inBookSearchQuery.trim()) return [];
    const q = inBookSearchQuery.trim().toLowerCase();
    const matches: Array<{
      pageNumber: number;
      title: string;
      snippet: string;
      isOcr?: boolean;
    }> = [];

    for (const page of activeDoc.pages) {
      const contentLower = (page.content || '').toLowerCase();
      const idx = contentLower.indexOf(q);
      const titleIdx = (page.title || '').toLowerCase().indexOf(q);
      if (idx !== -1 || titleIdx !== -1) {
        const start = Math.max(0, (idx !== -1 ? idx : 0) - 45);
        const end = Math.min(page.content.length, (idx !== -1 ? idx : 0) + q.length + 75);
        const snippet =
          (start > 0 ? '...' : '') +
          page.content.slice(start, end).replace(/\n+/g, ' ') +
          (end < page.content.length ? '...' : '');
        matches.push({
          pageNumber: page.pageNumber,
          title: page.title || `Страница ${page.pageNumber}`,
          snippet,
          isOcr: Boolean(page.isOcrRecognized)
        });
      }
    }
    return matches;
  }, [activeDoc, inBookSearchQuery]);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} Б`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} МБ`;
  };

  const getFileBadge = (type: LibraryFileType) => {
    switch (type) {
      case 'pdf':
        return {
          label: 'PDF',
          cls: 'bg-rose-950/70 border-rose-500/60 text-rose-300',
          icon: <FileText size={13} />
        };
      case 'docx':
      case 'doc':
        return {
          label: type.toUpperCase(),
          cls: 'bg-cyan-950/70 border-cyan-500/60 text-cyan-300',
          icon: <FileSpreadsheet size={13} />
        };
      case 'pptx':
      case 'ppt':
      case 'ppx':
        return {
          label: type.toUpperCase(),
          cls: 'bg-amber-950/70 border-amber-500/60 text-amber-300',
          icon: <Presentation size={13} />
        };
      default:
        return {
          label: type.toUpperCase(),
          cls: 'bg-emerald-950/70 border-emerald-500/60 text-emerald-300',
          icon: <BookOpen size={13} />
        };
    }
  };

  const isPresentationDoc =
    activeDoc?.fileType === 'pptx' ||
    activeDoc?.fileType === 'ppt' ||
    activeDoc?.fileType === 'ppx';

  const isHorizontalReaderActive = isDeviceLandscapeMobile || forceLandscapeLayout;
  const currentTranslation = activePage?.translations?.[targetLang] || null;

  // Render Reader Interface (either normal in-tab or fullscreen portal)
  const renderReaderView = () => {
    if (!activeDoc || !activePage) return null;

    const badge = getFileBadge(activeDoc.fileType);
    const docSubject = subjects.find((s) => s.id === activeDoc.subjectId);
    const isBookmarked = activeDoc.bookmarks.includes(currentPageNum);
    const hasNoteOnPage = Boolean(activeDoc.notes?.[currentPageNum]);
    const progressPct = Math.round((currentPageNum / Math.max(1, activeDoc.totalPages)) * 100);

    const readerInner = (
      <div
        ref={readerContainerRef}
        className={`flex flex-col font-mono text-[var(--crt-phosphor)] ${
          isFullscreen
            ? 'fixed inset-0 z-50 bg-[#040b05] p-2 sm:p-4 overflow-hidden'
            : 'bg-[#050e07] border-2 border-[var(--crt-phosphor-dim)] rounded-xl p-2.5 sm:p-4 min-h-[72vh]'
        }`}
      >
        {/* Top Compact Toolbar — adapts automatically when phone is rotated to landscape */}
        <div
          className={`flex flex-wrap items-center justify-between gap-2 border-b border-[var(--crt-phosphor-dim)] ${
            isHorizontalReaderActive ? 'pb-1.5 mb-2' : 'pb-3 mb-3'
          }`}
        >
          {/* Back & Document Title */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <button
              onClick={() => {
                pipAudio.playClick();
                setIsFullscreen(false);
                setActiveDocId(null);
              }}
              className="min-h-[40px] px-2.5 sm:px-3 py-1.5 bg-[#102113] hover:bg-[#19331e] border border-[var(--crt-phosphor)] rounded text-xs font-extrabold uppercase flex items-center gap-1.5 cursor-pointer shrink-0"
              title="Вернуться на полку библиотеки"
            >
              <ChevronLeft size={15} />
              <span className={isHorizontalReaderActive ? 'hidden sm:inline' : ''}>К ПОЛКЕ</span>
            </button>

            <span
              className={`px-2 py-0.5 text-[10px] font-extrabold border rounded flex items-center gap-1 shrink-0 ${badge.cls}`}
            >
              {badge.icon}
              {badge.label}
            </span>

            <div className="min-w-0 flex-1">
              <div className="font-extrabold text-xs sm:text-sm text-[var(--crt-phosphor-bright)] truncate">
                {activeDoc.title}
              </div>
              {!isHorizontalReaderActive && (
                <div className="flex flex-wrap items-center gap-2 text-[10px] opacity-75">
                  <span>{ docSubject ? `Предмет: ${docSubject.name}` : 'Без предмета' }</span>
                  {activeDoc.author && <span>• Автор: {activeDoc.author}</span>}
                  <span>• {progressPct}% прочитано</span>
                </div>
              )}
            </div>
          </div>

          {/* Dedicated Automatic Translator Toggle Button + Language + Layout */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            {/* MAIN AUTO-TRANSLATOR TOGGLE BUTTON */}
            <button
              onClick={() => {
                pipAudio.playClick();
                const nextState = !autoTranslateEnabled;
                setAutoTranslateEnabled(nextState);
              }}
              className={`min-h-[40px] px-3 py-1.5 rounded font-extrabold text-xs uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-all border ${
                autoTranslateEnabled
                  ? 'bg-amber-400 text-black border-amber-300 shadow-[0_0_15px_rgba(251,191,36,0.45)]'
                  : 'bg-[#102013] hover:bg-[#18301d] text-[var(--crt-phosphor-bright)] border-[var(--crt-phosphor-dim)]'
              }`}
              title="Автоматический перевод текущей страницы при чтении и перелистывании"
            >
              <Languages size={15} />
              <span>АВТОПЕРЕВОДЧИК: {autoTranslateEnabled ? 'ВКЛ' : 'ВЫКЛ'}</span>
            </button>

            {autoTranslateEnabled && (
              <>
                <select
                  value={targetLang}
                  onChange={(e) => {
                    pipAudio.playClick();
                    setTargetLang(e.target.value as TargetLanguageCode);
                  }}
                  className="min-h-[40px] bg-black border border-amber-400/70 text-amber-300 rounded px-2 py-1 text-xs font-bold cursor-pointer"
                  title="Целевой язык автоматического перевода"
                >
                  {TARGET_LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      → {l.short} ({l.label})
                    </option>
                  ))}
                </select>

                {/* Display Mode: Parallel vs Translated Only */}
                <div className="flex items-center border border-amber-500/50 rounded overflow-hidden bg-black/60">
                  <button
                    onClick={() => {
                      pipAudio.playClick();
                      setTranslatorDisplayMode('parallel');
                    }}
                    className={`min-h-[38px] px-2.5 py-1 text-[10px] font-extrabold uppercase flex items-center gap-1 cursor-pointer ${
                      translatorDisplayMode === 'parallel'
                        ? 'bg-amber-400 text-black'
                        : 'text-amber-300 hover:bg-amber-950/40'
                    }`}
                    title="Параллельный режим: оригинал и перевод рядом"
                  >
                    <Columns size={12} />
                    <span className="hidden md:inline">ПАРАЛЛЕЛЬНО</span>
                  </button>
                  <button
                    onClick={() => {
                      pipAudio.playClick();
                      setTranslatorDisplayMode('translated');
                    }}
                    className={`min-h-[38px] px-2.5 py-1 text-[10px] font-extrabold uppercase cursor-pointer ${
                      translatorDisplayMode === 'translated'
                        ? 'bg-amber-400 text-black'
                        : 'text-amber-300 hover:bg-amber-950/40'
                    }`}
                    title="Показать только переведенный текст текущей страницы"
                  >
                    ТОЛЬКО ПЕРЕВОД
                  </button>
                </div>
              </>
            )}

            {/* Scanned PDF OCR Controls + Native PDF View Toggle */}
            {activeDoc.fileType === 'pdf' && rawPdfBlob && (
              <div className="flex items-center gap-1">
                <button
                  onClick={handleRunCurrentPageOcr}
                  disabled={isRunningReaderOcr}
                  className={`min-h-[40px] px-2.5 py-1 rounded border text-[11px] font-extrabold uppercase flex items-center gap-1 cursor-pointer transition-all disabled:opacity-50 ${
                    activePage.isOcrRecognized
                      ? 'bg-cyan-950/60 border-cyan-400/70 text-cyan-200 hover:bg-cyan-900/50'
                      : 'bg-cyan-400 text-black border-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.35)]'
                  }`}
                  title="Распознать текст (OCR) со скана текущей страницы для поиска и автопереводчика"
                >
                  <ScanText size={14} className={isRunningReaderOcr ? 'animate-pulse' : ''} />
                  <span>
                    {isRunningReaderOcr
                      ? 'OCR...'
                      : activePage.isOcrRecognized
                        ? `OCR СТР. #${currentPageNum} ✓`
                        : `OCR СКАНА СТР. #${currentPageNum}`}
                  </span>
                </button>

                <button
                  onClick={handleRunAllPagesOcr}
                  disabled={isRunningReaderOcr}
                  className="min-h-[40px] px-2 py-1 rounded border border-cyan-500/50 hover:border-cyan-300 bg-cyan-950/30 text-cyan-300 text-[10px] font-bold uppercase hidden md:flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  title="Распознать текст (OCR) на всех скан-страницах этого PDF-документа"
                >
                  <Sparkles size={12} />
                  <span>OCR ВСЕГО PDF</span>
                </button>
              </div>
            )}

            {/* Native PDF View Toggle (only if fileType === 'pdf' and blob available) */}
            {activeDoc.fileType === 'pdf' && pdfBlobUrl && (
              <button
                onClick={() => {
                  pipAudio.playClick();
                  setShowNativePdfPreview(!showNativePdfPreview);
                }}
                className={`min-h-[40px] px-2.5 py-1 rounded border text-[11px] font-bold flex items-center gap-1 cursor-pointer ${
                  showNativePdfPreview
                    ? 'bg-rose-500 text-black border-rose-300'
                    : 'border-rose-500/50 text-rose-300 hover:bg-rose-950/40'
                }`}
                title="Переключить встроенный просмотр оригинального PDF-файла"
              >
                <Eye size={14} />
                <span className="hidden sm:inline">
                  {showNativePdfPreview ? 'ТЕКСТ И ПЕРЕВОД' : 'ОРИГИНАЛ PDF'}
                </span>
              </button>
            )}

            {/* Reader Utility Buttons: Bookmark, Notes, Search, Landscape Orientation, Font Size, Fullscreen */}
            <div className="flex items-center gap-1">
              <button
                onClick={handleToggleBookmark}
                className={`min-w-[40px] min-h-[40px] p-2 rounded border flex items-center justify-center cursor-pointer transition-colors ${
                  isBookmarked
                    ? 'bg-amber-400 text-black border-amber-300'
                    : 'border-[var(--crt-phosphor-dim)] text-[var(--crt-phosphor)] hover:border-[var(--crt-phosphor)]'
                }`}
                title={isBookmarked ? 'Удалить закладку со страницы' : 'Поставить закладку на эту страницу'}
              >
                <Bookmark size={15} />
              </button>

              <button
                onClick={() => {
                  pipAudio.playClick();
                  setActiveReaderDrawer(activeReaderDrawer === 'BOOKMARKS' ? 'NONE' : 'BOOKMARKS');
                }}
                className={`min-h-[40px] px-2.5 py-1.5 rounded border text-xs font-bold flex items-center gap-1 cursor-pointer ${
                  activeReaderDrawer === 'BOOKMARKS'
                    ? 'bg-[var(--crt-phosphor)] text-black border-[var(--crt-phosphor)]'
                    : 'border-[var(--crt-phosphor-dim)] text-[var(--crt-phosphor)] hover:border-[var(--crt-phosphor)]'
                }`}
                title="Оглавление и список закладок"
              >
                <ListFilter size={14} />
                <span className="text-[10px]">{activeDoc.bookmarks.length}</span>
              </button>

              <button
                onClick={() => {
                  pipAudio.playClick();
                  setActiveReaderDrawer(activeReaderDrawer === 'NOTES' ? 'NONE' : 'NOTES');
                }}
                className={`min-h-[40px] px-2.5 py-1.5 rounded border text-xs font-bold flex items-center gap-1 cursor-pointer ${
                  activeReaderDrawer === 'NOTES' || hasNoteOnPage
                    ? 'bg-emerald-400 text-black border-emerald-300'
                    : 'border-[var(--crt-phosphor-dim)] text-[var(--crt-phosphor)] hover:border-[var(--crt-phosphor)]'
                }`}
                title="Заметки студента к текущей странице"
              >
                <StickyNote size={14} />
              </button>

              <button
                onClick={() => {
                  pipAudio.playClick();
                  setActiveReaderDrawer(activeReaderDrawer === 'SEARCH' ? 'NONE' : 'SEARCH');
                }}
                className={`min-w-[40px] min-h-[40px] p-2 rounded border flex items-center justify-center cursor-pointer ${
                  activeReaderDrawer === 'SEARCH'
                    ? 'bg-[var(--crt-phosphor)] text-black border-[var(--crt-phosphor)]'
                    : 'border-[var(--crt-phosphor-dim)] text-[var(--crt-phosphor)] hover:border-[var(--crt-phosphor)]'
                }`}
                title="Поиск по тексту документа"
              >
                <Search size={15} />
              </button>

              {/* Horizontal / Landscape Layout Switcher for Phone & PC */}
              <button
                onClick={() => {
                  pipAudio.playClick();
                  setForceLandscapeLayout(!forceLandscapeLayout);
                }}
                className={`min-w-[40px] min-h-[40px] p-2 rounded border flex items-center justify-center cursor-pointer ${
                  isHorizontalReaderActive
                    ? 'bg-cyan-400 text-black border-cyan-300'
                    : 'border-[var(--crt-phosphor-dim)] text-[var(--crt-phosphor)] hover:border-[var(--crt-phosphor)]'
                }`}
                title="Горизонтальный двухколоночный режим (адаптация под поворот смартфона и широкий экран)"
              >
                <Smartphone size={15} className={isHorizontalReaderActive ? 'rotate-90 transition-transform' : 'transition-transform'} />
              </button>

              {/* Font Zoom Controls */}
              <button
                onClick={() => {
                  pipAudio.playClick();
                  setFontSizePx((prev) => Math.max(13, prev - 2));
                }}
                className="hidden sm:flex min-w-[38px] min-h-[40px] p-1.5 rounded border border-[var(--crt-phosphor-dim)] hover:border-[var(--crt-phosphor)] items-center justify-center cursor-pointer"
                title="Уменьшить шрифт"
              >
                <ZoomOut size={14} />
              </button>
              <button
                onClick={() => {
                  pipAudio.playClick();
                  setFontSizePx((prev) => Math.min(26, prev + 2));
                }}
                className="hidden sm:flex min-w-[38px] min-h-[40px] p-1.5 rounded border border-[var(--crt-phosphor-dim)] hover:border-[var(--crt-phosphor)] items-center justify-center cursor-pointer"
                title="Увеличить шрифт"
              >
                <ZoomIn size={14} />
              </button>

              {/* Fullscreen Toggle */}
              <button
                onClick={() => {
                  pipAudio.playClick();
                  setIsFullscreen(!isFullscreen);
                }}
                className={`min-w-[40px] min-h-[40px] p-2 rounded border flex items-center justify-center cursor-pointer ${
                  isFullscreen
                    ? 'bg-[var(--crt-phosphor)] text-black border-[var(--crt-phosphor)]'
                    : 'border-[var(--crt-phosphor-dim)] text-[var(--crt-phosphor)] hover:border-[var(--crt-phosphor)]'
                }`}
                title={isFullscreen ? 'Выйти из полноэкранного режима (Esc)' : 'Полноэкранный режим чтения'}
              >
                {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
              </button>
            </div>
          </div>
        </div>

        {/* Collapsible Reader Drawer: Search / Bookmarks & TOC / Page Notes */}
        {activeReaderDrawer !== 'NONE' && (
          <div className="mb-3 p-3 rounded-lg bg-black/85 border border-[var(--crt-phosphor)] shadow-lg space-y-2.5">
            {activeReaderDrawer === 'SEARCH' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold uppercase text-[var(--crt-phosphor-bright)] flex items-center gap-1.5">
                    <Search size={14} /> ПОИСК ПО ВСЕМ СТРАНИЦАМ И СЛАЙДАМ
                  </span>
                  <button
                    onClick={() => setActiveReaderDrawer('NONE')}
                    className="p-1 border border-zinc-700 hover:border-zinc-400 rounded cursor-pointer"
                  >
                    <X size={13} />
                  </button>
                </div>
                <input
                  type="text"
                  value={inBookSearchQuery}
                  onChange={(e) => setInBookSearchQuery(e.target.value)}
                  placeholder="Введите слово, термин или цитату для поиска в книге..."
                  className="w-full bg-[#061108] border border-[var(--crt-phosphor-dim)] focus:border-[var(--crt-phosphor)] rounded px-3 py-2 text-xs text-[var(--crt-phosphor-bright)] outline-none"
                  autoFocus
                />
                {inBookSearchQuery.trim() && (
                  <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1">
                    {inBookSearchResults.length === 0 ? (
                      <div className="text-xs opacity-65 py-2 flex flex-wrap items-center justify-between gap-2">
                        <span>Совпадений в документе не найдено.</span>
                        {activeDoc.fileType === 'pdf' && rawPdfBlob && (
                          <button
                            onClick={handleRunAllPagesOcr}
                            disabled={isRunningReaderOcr}
                            className="px-2.5 py-1 rounded bg-cyan-400 text-black font-extrabold text-[10px] uppercase cursor-pointer"
                          >
                            Запустить OCR всех скан-страниц
                          </button>
                        )}
                      </div>
                    ) : (
                      inBookSearchResults.map((res) => (
                        <button
                          key={res.pageNumber}
                          onClick={() => {
                            goToPage(res.pageNumber);
                            setActiveReaderDrawer('NONE');
                          }}
                          className="w-full text-left p-2 rounded bg-[#0b190d] hover:bg-[#142c18] border border-[var(--crt-phosphor-dim)]/50 transition-colors cursor-pointer"
                        >
                          <div className="flex items-center justify-between text-[11px] font-bold text-amber-300">
                            <span className="flex items-center gap-1.5">
                              <span>{res.title}</span>
                              {res.isOcr && (
                                <span className="px-1.5 py-0.5 rounded bg-cyan-950 border border-cyan-400/60 text-cyan-300 text-[9px] uppercase">
                                  OCR
                                </span>
                              )}
                            </span>
                            <span>Стр./Слайд #{res.pageNumber}</span>
                          </div>
                          <div className="text-[11px] opacity-85 mt-0.5 line-clamp-2">{res.snippet}</div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}

            {activeReaderDrawer === 'BOOKMARKS' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold uppercase text-amber-300 flex items-center gap-1.5">
                    <Bookmark size={14} /> ЗАКЛАДКИ ({activeDoc.bookmarks.length}) И ОГЛАВЛЕНИЕ ({activeDoc.totalPages})
                  </span>
                  <button
                    onClick={() => setActiveReaderDrawer('NONE')}
                    className="p-1 border border-zinc-700 hover:border-zinc-400 rounded cursor-pointer"
                  >
                    <X size={13} />
                  </button>
                </div>

                {activeDoc.bookmarks.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pb-2 border-b border-zinc-800">
                    {activeDoc.bookmarks.map((bPage) => (
                      <button
                        key={bPage}
                        onClick={() => {
                          goToPage(bPage);
                          setActiveReaderDrawer('NONE');
                        }}
                        className={`px-2.5 py-1 rounded text-xs font-bold border cursor-pointer flex items-center gap-1 ${
                          bPage === currentPageNum
                            ? 'bg-amber-400 text-black border-amber-300'
                            : 'bg-amber-950/40 text-amber-300 border-amber-500/40 hover:border-amber-400'
                        }`}
                      >
                        <Bookmark size={11} />
                        Стр. {bPage}
                      </button>
                    ))}
                  </div>
                )}

                <div className="max-h-44 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1.5 pr-1">
                  {activeDoc.pages.map((p) => (
                    <button
                      key={p.pageNumber}
                      onClick={() => {
                        goToPage(p.pageNumber);
                        setActiveReaderDrawer('NONE');
                      }}
                      className={`text-left px-2.5 py-1.5 rounded text-xs border truncate cursor-pointer ${
                        p.pageNumber === currentPageNum
                          ? 'bg-[var(--crt-phosphor)] text-black font-extrabold border-[var(--crt-phosphor)]'
                          : 'bg-[#08130a] border-[var(--crt-phosphor-dim)]/40 hover:border-[var(--crt-phosphor)]'
                      }`}
                    >
                      #{p.pageNumber} • {p.title || `Страница ${p.pageNumber}`}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {activeReaderDrawer === 'NOTES' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold uppercase text-emerald-300 flex items-center gap-1.5">
                    <StickyNote size={14} /> ЗАМЕТКА К СТРАНИЦЕ / СЛАЙДУ #{currentPageNum}
                  </span>
                  <button
                    onClick={() => setActiveReaderDrawer('NONE')}
                    className="p-1 border border-zinc-700 hover:border-zinc-400 rounded cursor-pointer"
                  >
                    <X size={13} />
                  </button>
                </div>
                <textarea
                  rows={3}
                  value={pageNoteDraft}
                  onChange={(e) => setPageNoteDraft(e.target.value)}
                  placeholder="Запишите тезисы к семинару, цитату или комментарий по этой странице..."
                  className="w-full bg-[#061108] border border-[var(--crt-phosphor-dim)] focus:border-[var(--crt-phosphor)] rounded p-2.5 text-xs text-[var(--crt-phosphor-bright)] outline-none"
                />
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-emerald-400">
                    {noteSavedToast ? '✓ Заметка сохранена в памяти книги' : 'Привязано к стр. #' + currentPageNum}
                  </span>
                  <button
                    onClick={handleSavePageNote}
                    className="px-3 py-1.5 bg-emerald-400 hover:bg-emerald-300 text-black font-extrabold rounded text-xs cursor-pointer flex items-center gap-1"
                  >
                    <Check size={14} /> СОХРАНИТЬ ЗАМЕТКУ
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Live OCR Status Banner inside Reader when running OCR */}
        {(isRunningReaderOcr || readerOcrStatus) && (
          <div className="mb-2.5 px-3 py-2 rounded-lg bg-cyan-950/60 border border-cyan-400/70 text-cyan-200 text-xs flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-bold">
              <RefreshCw size={14} className={isRunningReaderOcr ? 'animate-spin text-cyan-300' : 'text-cyan-300'} />
              <span>{readerOcrStatus || 'Оптическое распознавание текста (OCR) сканов...'}</span>
            </div>
            <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-cyan-400/20 text-cyan-300 font-extrabold">
              МОДУЛЬ OCR PIP-BOY
            </span>
          </div>
        )}

        {/* Main Reading Viewport — Adapts to PC, Smartphone Portrait, and Smartphone Horizontal (Landscape) */}
        <div className="flex-1 overflow-y-auto pr-1">
          {showNativePdfPreview && pdfBlobUrl ? (
            <div className="w-full h-[68vh] bg-zinc-900 rounded-lg overflow-hidden border border-[var(--crt-phosphor-dim)]">
              <object
                data={`${pdfBlobUrl}#page=${currentPageNum}`}
                type="application/pdf"
                className="w-full h-full"
              >
                <iframe
                  src={`${pdfBlobUrl}#page=${currentPageNum}`}
                  title={activeDoc.title}
                  className="w-full h-full border-0"
                />
              </object>
            </div>
          ) : (
            <div
              className={`grid gap-3 sm:gap-4 ${
                autoTranslateEnabled && translatorDisplayMode === 'parallel'
                  ? isHorizontalReaderActive
                    ? 'grid-cols-2'
                    : 'grid-cols-1 lg:grid-cols-2'
                  : 'grid-cols-1'
              }`}
            >
              {/* LEFT / PRIMARY PANE: Original Text or Presentation Slide (hidden only if user picked 'translated' only) */}
              {(!autoTranslateEnabled || translatorDisplayMode !== 'translated') && (
                <div
                  className={`rounded-xl border p-4 sm:p-6 transition-all ${
                    isPresentationDoc
                      ? 'bg-gradient-to-br from-[#08160b] to-[#040c06] border-amber-500/50 shadow-[0_0_25px_rgba(0,0,0,0.6)]'
                      : 'bg-[#071309]/90 border-[var(--crt-phosphor-dim)]'
                  }`}
                >
                  {/* Page / Slide Header */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--crt-phosphor-dim)]/60 pb-2.5 mb-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-[var(--crt-phosphor)]/15 border border-[var(--crt-phosphor)]/40 text-[11px] font-extrabold text-[var(--crt-phosphor-bright)]">
                        {isPresentationDoc
                          ? `СЛАЙД ${activePage.pageNumber} / ${activeDoc.totalPages}`
                          : `СТР. ${activePage.pageNumber} / ${activeDoc.totalPages}`}
                      </span>
                      <h3 className="font-extrabold text-sm sm:text-base text-[var(--crt-phosphor-bright)]">
                        {activePage.title ||
                          (isPresentationDoc
                            ? `Слайд ${activePage.pageNumber}`
                            : `Страница ${activePage.pageNumber}`)}
                      </h3>
                      {activePage.isOcrRecognized && (
                        <span
                          className="px-2 py-0.5 rounded bg-cyan-950/80 border border-cyan-400/60 text-cyan-300 text-[10px] font-extrabold uppercase flex items-center gap-1"
                          title={`Текст распознан со скана (${activePage.ocrEngine === 'tesseract-local' ? 'Локальный OCR' : 'ИИ Vision OCR'})`}
                        >
                          <ScanText size={11} />
                          <span>
                            OCR РАСПОЗНАНО
                            {activePage.ocrConfidence ? ` (${activePage.ocrConfidence}%)` : ''}
                          </span>
                        </span>
                      )}
                      {activePage.isScannedPage && !activePage.isOcrRecognized && (
                        <span className="px-2 py-0.5 rounded bg-amber-950/80 border border-amber-400/60 text-amber-300 text-[10px] font-extrabold uppercase">
                          СКАН-СТРАНИЦА
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {activePage.pageImageDataUrl && (
                        <button
                          onClick={() => {
                            pipAudio.playClick();
                            setShowScanPageImage(!showScanPageImage);
                          }}
                          className={`px-2 py-0.5 rounded border text-[10px] font-bold uppercase cursor-pointer ${
                            showScanPageImage
                              ? 'bg-cyan-400 text-black border-cyan-300'
                              : 'border-cyan-500/50 text-cyan-300 hover:bg-cyan-950/40'
                          }`}
                        >
                          {showScanPageImage ? 'СКРЫТЬ СКАН' : 'ПОКАЗАТЬ СКАН'}
                        </button>
                      )}
                      <span className="text-[10px] uppercase tracking-wider opacity-60">ОРИГИНАЛ</span>
                    </div>
                  </div>

                  {/* Optional Collapsible Scan Image Preview above OCR text */}
                  {showScanPageImage && activePage.pageImageDataUrl && (
                    <div className="mb-4 p-2 rounded-lg bg-black/70 border border-cyan-500/40 space-y-1.5">
                      <div className="flex items-center justify-between text-[10px] text-cyan-300 font-bold uppercase px-1">
                        <span>Оригинальное изображение скана страницы #{activePage.pageNumber}</span>
                        <button
                          onClick={() => setShowScanPageImage(false)}
                          className="underline cursor-pointer"
                        >
                          Свернуть
                        </button>
                      </div>
                      <img
                        src={activePage.pageImageDataUrl}
                        alt={`Скан страницы ${activePage.pageNumber}`}
                        className="max-h-[46vh] w-auto mx-auto rounded border border-zinc-700 object-contain bg-white"
                      />
                    </div>
                  )}

                  {/* Slide Bullets View for PPTX / PPX / PPT vs Book Paragraphs */}
                  {isPresentationDoc && Array.isArray(activePage.bullets) && activePage.bullets.length > 0 ? (
                    <div className="space-y-3" style={{ fontSize: `${fontSizePx}px` }}>
                      <ul className="space-y-2.5 list-disc list-inside text-[var(--crt-phosphor-bright)] leading-relaxed">
                        {activePage.bullets.map((bullet, bIdx) => (
                          <li
                            key={bIdx}
                            className="p-2 rounded bg-black/40 border-l-2 border-amber-400 pl-3"
                          >
                            {bullet}
                          </li>
                        ))}
                      </ul>

                      {activePage.speakerNotes && (
                        <div className="mt-4 p-3 rounded-lg bg-amber-950/25 border border-amber-500/40 text-xs text-amber-200 space-y-1">
                          <div className="font-extrabold uppercase tracking-wider text-[10px] text-amber-400">
                            ЗАМЕТКИ ДОКЛАДЧИКА К СЛАЙДУ:
                          </div>
                          <div className="whitespace-pre-line leading-relaxed">
                            {activePage.speakerNotes}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div
                      className="space-y-4 leading-relaxed text-[var(--crt-phosphor-bright)] whitespace-pre-line font-sans"
                      style={{ fontSize: `${fontSizePx}px`, lineHeight: 1.68 }}
                    >
                      {activePage.content}
                    </div>
                  )}

                  {/* Quick CTA if page is an unrecognized scan */}
                  {activeDoc.fileType === 'pdf' &&
                    rawPdfBlob &&
                    (activePage.isScannedPage && !activePage.isOcrRecognized) && (
                      <div className="mt-4 p-3 rounded-lg bg-cyan-950/35 border border-cyan-400/60 flex flex-wrap items-center justify-between gap-2 text-xs text-cyan-200">
                        <span>
                          Эта страница PDF является сканом (картинкой). Запустите OCR для распознавания текста, поиска и перевода.
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={handleRunCurrentPageOcr}
                            disabled={isRunningReaderOcr}
                            className="px-3 py-1.5 rounded bg-cyan-400 text-black font-extrabold text-xs uppercase cursor-pointer flex items-center gap-1.5"
                          >
                            <ScanText size={14} />
                            <span>РАСПОЗНАТЬ СТРАНИЦУ (OCR)</span>
                          </button>
                          <button
                            onClick={handleRunAllPagesOcr}
                            disabled={isRunningReaderOcr}
                            className="px-3 py-1.5 rounded border border-cyan-400 text-cyan-300 font-bold text-xs uppercase cursor-pointer"
                          >
                            OCR ВСЕГО ДОКУМЕНТА
                          </button>
                        </div>
                      </div>
                    )}

                  {/* Student's Saved Note Indicator on this Page */}
                  {activeDoc.notes?.[currentPageNum] && (
                    <div className="mt-5 p-3 rounded-lg bg-emerald-950/30 border border-emerald-500/50 text-xs text-emerald-200">
                      <div className="font-extrabold uppercase text-[10px] text-emerald-400 mb-1 flex items-center gap-1">
                        <StickyNote size={12} /> ВАША ЗАМЕТКА К СТРАНИЦЕ #{currentPageNum}:
                      </div>
                      <div className="whitespace-pre-line">{activeDoc.notes[currentPageNum]}</div>
                    </div>
                  )}
                </div>
              )}

              {/* RIGHT / PARALLEL PANE: Automatic Academic Translator Output */}
              {autoTranslateEnabled && (
                <div className="rounded-xl border-2 border-amber-400/70 bg-[#0b1309] p-4 sm:p-6 flex flex-col justify-between space-y-4 shadow-[0_0_25px_rgba(251,191,36,0.12)]">
                  <div className="space-y-4">
                    {/* Translator Header */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-500/40 pb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-amber-400 text-black text-[10px] font-extrabold uppercase flex items-center gap-1">
                          <Sparkles size={11} /> АВТОПЕРЕВОД ({targetLang.toUpperCase()})
                        </span>
                        {currentTranslation?.detectedLang && (
                          <span className="text-[11px] text-amber-300/90 font-bold">
                            Исходный: {currentTranslation.detectedLang}
                          </span>
                        )}
                      </div>

                      <button
                        onClick={() => {
                          pipAudio.playClick();
                          translateCurrentPage(true);
                        }}
                        disabled={isTranslatingPage}
                        className="px-2.5 py-1 rounded border border-amber-400/60 hover:bg-amber-400/20 text-amber-300 text-[10px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                        title="Обновить перевод текущей страницы"
                      >
                        <RefreshCw size={11} className={isTranslatingPage ? 'animate-spin' : ''} />
                        <span>ОБНОВИТЬ</span>
                      </button>
                    </div>

                    {/* Translation Body */}
                    {isTranslatingPage ? (
                      <div className="py-12 flex flex-col items-center justify-center text-center space-y-3 text-amber-300">
                        <RefreshCw size={26} className="animate-spin text-amber-400" />
                        <div className="text-xs font-extrabold uppercase tracking-wider">
                          Выполняется академический перевод страницы #{activePage.pageNumber}...
                        </div>
                        <p className="text-[11px] opacity-75 max-w-sm">
                          Сохраняем структуру абзацев, научную терминологию и формируем глоссарий терминов.
                        </p>
                      </div>
                    ) : translationError ? (
                      <div className="p-4 rounded-lg bg-red-950/40 border border-red-500/50 text-xs text-red-300 space-y-2">
                        <div className="font-bold">{translationError}</div>
                        <button
                          onClick={() => translateCurrentPage(true)}
                          className="px-3 py-1 bg-red-500 text-black font-bold rounded text-xs cursor-pointer"
                        >
                          ПОВТОРИТЬ ПОПЫТКУ
                        </button>
                      </div>
                    ) : currentTranslation ? (
                      <>
                        <div
                          className="leading-relaxed text-amber-100 whitespace-pre-line font-sans"
                          style={{ fontSize: `${fontSizePx}px`, lineHeight: 1.68 }}
                        >
                          {currentTranslation.translatedText}
                        </div>

                        {currentTranslation.academicNotes && (
                          <div className="p-3 rounded-lg bg-amber-950/30 border border-amber-500/40 text-xs text-amber-200/90">
                            <span className="font-extrabold uppercase text-amber-400 block text-[10px] mb-0.5">
                              ПРИМЕЧАНИЕ ПЕРЕВОДЧИКА:
                            </span>
                            {currentTranslation.academicNotes}
                          </div>
                        )}

                        {Array.isArray(currentTranslation.keyTerms) &&
                          currentTranslation.keyTerms.length > 0 && (
                            <div className="space-y-1.5 pt-2 border-t border-amber-500/30">
                              <div className="text-[10px] font-extrabold uppercase tracking-wider text-amber-400">
                                АКАДЕМИЧЕСКИЙ ГЛОССАРИЙ СТРАНИЦЫ:
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {currentTranslation.keyTerms.map((kt, idx) => (
                                  <div
                                    key={idx}
                                    className="p-2 rounded bg-black/60 border border-amber-500/30 text-xs"
                                  >
                                    <div className="font-extrabold text-amber-300">
                                      {kt.term} → {kt.translation}
                                    </div>
                                    {kt.note && (
                                      <div className="text-[10px] text-amber-100/75 mt-0.5">
                                        {kt.note}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                      </>
                    ) : (
                      <div className="py-8 text-center text-xs text-amber-300/70">
                        Нажмите «Обновить», чтобы перевести текущую страницу.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom Thumb-Friendly Pagination Bar (44px+ touch targets for smartphone portrait & landscape) */}
        <div
          className={`flex flex-wrap items-center justify-between gap-2 border-t border-[var(--crt-phosphor-dim)] ${
            isHorizontalReaderActive ? 'pt-1.5 mt-2' : 'pt-3 mt-3'
          }`}
        >
          <button
            onClick={() => goToPage(currentPageNum - 1)}
            disabled={currentPageNum <= 1}
            className="min-h-[44px] px-3 sm:px-4 py-2 rounded bg-[#102214] hover:bg-[#193520] disabled:opacity-40 border border-[var(--crt-phosphor)] text-xs font-extrabold uppercase flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
          >
            <ChevronLeft size={16} />
            <span>{isPresentationDoc ? 'ПРЕД. СЛАЙД' : 'ПРЕД. СТР.'}</span>
          </button>

          {/* Direct Page Slider & Jump Input */}
          <div className="flex items-center gap-2 sm:gap-3 flex-1 max-w-md mx-auto justify-center">
            <input
              type="range"
              min={1}
              max={Math.max(1, activeDoc.totalPages)}
              value={currentPageNum}
              onChange={(e) => goToPage(Number(e.target.value))}
              className="hidden sm:block flex-1 accent-[var(--crt-phosphor)] cursor-pointer"
            />
            <div className="flex items-center gap-1.5 text-xs font-bold">
              <span>{isPresentationDoc ? 'Слайд' : 'Стр.'}</span>
              <input
                type="number"
                min={1}
                max={activeDoc.totalPages}
                value={currentPageNum}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val)) goToPage(val);
                }}
                className="w-14 min-h-[38px] text-center bg-black border border-[var(--crt-phosphor-dim)] rounded px-1 py-0.5 text-xs font-extrabold text-[var(--crt-phosphor-bright)]"
              />
              <span>из {activeDoc.totalPages}</span>
            </div>
          </div>

          <button
            onClick={() => goToPage(currentPageNum + 1)}
            disabled={currentPageNum >= activeDoc.totalPages}
            className="min-h-[44px] px-3 sm:px-4 py-2 rounded bg-[var(--crt-phosphor)] hover:opacity-90 disabled:opacity-40 text-black text-xs font-extrabold uppercase flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed shadow-md"
          >
            <span>{isPresentationDoc ? 'СЛЕД. СЛАЙД' : 'СЛЕД. СТР.'}</span>
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    );

    if (isFullscreen && typeof document !== 'undefined') {
      return createPortal(readerInner, document.body);
    }

    return readerInner;
  };

  // If a document is currently open in the Reader, render the Reader View
  if (activeDoc && activePage) {
    return renderReaderView();
  }

  return (
    <div className="space-y-4 font-mono">
      {/* Top Library Header Banner */}
      <div className="border-2 border-[var(--crt-phosphor-dim)] bg-[#061108]/90 rounded-xl p-3.5 sm:p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <BookOpen size={18} className="text-[var(--crt-phosphor-bright)]" />
            <h2 className="text-sm sm:text-base font-extrabold uppercase tracking-wider text-[var(--crt-phosphor-bright)]">
              БИБЛИОТЕКА СТУДЕНТА • ЧИТАЛКА И АВТОПЕРЕВОДЧИК
            </h2>
          </div>
          <p className="text-xs opacity-80 leading-relaxed max-w-3xl">
            Загружайте учебники, монографии, статьи и презентации в форматах{' '}
            <span className="text-[var(--crt-phosphor-bright)] font-bold">
              PDF, Word (DOCX/DOC), Презентации (PPTX/PPT/PPX), TXT/MD
            </span>
            . Распределяйте книги по предметам и читайте со встроенным{' '}
            <span className="text-amber-300 font-bold">параллельным автопереводчиком</span> на ПК и смартфоне (включая горизонтальный поворот экрана).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            onClick={() => {
              pipAudio.playClick();
              setIsSubjectModalOpen(true);
            }}
            className="min-h-[42px] px-3.5 py-2 rounded border border-[var(--crt-phosphor)] bg-[#0f2213] hover:bg-[#17331d] text-xs font-extrabold uppercase flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <FolderPlus size={15} />
            <span>ПРЕДМЕТЫ ({subjects.length})</span>
          </button>

          <button
            onClick={() => {
              pipAudio.playClick();
              setUploadModeTab('FILE');
              setIsUploadModalOpen(true);
            }}
            className="min-h-[42px] px-4 py-2 rounded bg-[var(--crt-phosphor)] hover:opacity-90 text-black text-xs font-extrabold uppercase flex items-center gap-1.5 cursor-pointer shadow-lg"
          >
            <Upload size={15} />
            <span>+ ЗАГРУЗИТЬ КНИГУ / ПРЕЗЕНТАЦИЮ</span>
          </button>
        </div>
      </div>

      {/* Subject Filter Strip (Auto-synced from Schedule & Grades + User Custom Subjects) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-wider opacity-80">
          <span className="font-bold flex items-center gap-1.5">
            <GraduationCap size={14} /> ДЕЛЕНИЕ ПО ПРЕДМЕТАМ (ПОД РЕДАКЦИЕЙ СТУДЕНТА):
          </span>
          <button
            onClick={() => {
              pipAudio.playClick();
              setIsSubjectModalOpen(true);
            }}
            className="underline hover:text-[var(--crt-phosphor-bright)] cursor-pointer text-[11px] font-bold"
          >
            Редактировать предметы →
          </button>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
          <button
            onClick={() => {
              pipAudio.playClick();
              setSelectedSubjectFilter('ALL');
            }}
            className={`min-h-[38px] px-3 py-1.5 rounded text-xs font-extrabold uppercase whitespace-nowrap border cursor-pointer transition-all ${
              selectedSubjectFilter === 'ALL'
                ? 'bg-[var(--crt-phosphor)] text-black border-[var(--crt-phosphor)] shadow-md'
                : 'bg-[#08140a] border-[var(--crt-phosphor-dim)]/60 text-[var(--crt-phosphor)] hover:border-[var(--crt-phosphor)]'
            }`}
          >
            ВСЕ МАТЕРИАЛЫ ({documents.length})
          </button>

          {subjects.map((sub) => {
            const count = documents.filter((d) => d.subjectId === sub.id).length;
            const isSelected = selectedSubjectFilter === sub.id;
            const style = SUBJECT_COLOR_STYLES[sub.color] || SUBJECT_COLOR_STYLES.emerald;

            return (
              <button
                key={sub.id}
                onClick={() => {
                  pipAudio.playClick();
                  setSelectedSubjectFilter(sub.id);
                }}
                className={`min-h-[38px] px-3 py-1.5 rounded text-xs font-bold whitespace-nowrap border cursor-pointer flex items-center gap-1.5 transition-all ${
                  isSelected
                    ? 'bg-[var(--crt-phosphor)] text-black border-[var(--crt-phosphor)] font-extrabold shadow-md'
                    : `${style.bg} ${style.border} ${style.text} hover:opacity-90`
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${isSelected ? 'bg-black' : style.dot}`} />
                <span>{sub.name}</span>
                <span className="text-[10px] opacity-80">({count})</span>
              </button>
            );
          })}

          <button
            onClick={() => {
              pipAudio.playClick();
              setSelectedSubjectFilter('UNASSIGNED');
            }}
            className={`min-h-[38px] px-3 py-1.5 rounded text-xs font-bold whitespace-nowrap border cursor-pointer transition-all ${
              selectedSubjectFilter === 'UNASSIGNED'
                ? 'bg-[var(--crt-phosphor)] text-black border-[var(--crt-phosphor)]'
                : 'bg-zinc-900/70 border-zinc-700 text-zinc-300 hover:border-zinc-500'
            }`}
          >
            Без предмета ({documents.filter((d) => d.subjectId === 'UNASSIGNED' || !d.subjectId).length})
          </button>
        </div>
      </div>

      {/* Format Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 bg-[#061108] border border-[var(--crt-phosphor-dim)]/60 p-2.5 rounded-lg">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {[
            { id: 'ALL', label: 'Все форматы' },
            { id: 'PDF', label: 'PDF книги' },
            { id: 'WORD', label: 'Word (DOCX/DOC)' },
            { id: 'PPT', label: 'Презентации (PPTX/PPX)' },
            { id: 'TXT', label: 'Конспекты (TXT/MD)' }
          ].map((fmt) => (
            <button
              key={fmt.id}
              onClick={() => {
                pipAudio.playClick();
                setSelectedFormatFilter(fmt.id);
              }}
              className={`min-h-[36px] px-2.5 py-1 rounded text-[11px] font-bold uppercase whitespace-nowrap cursor-pointer border ${
                selectedFormatFilter === fmt.id
                  ? 'bg-amber-400 text-black border-amber-300 font-extrabold'
                  : 'border-[var(--crt-phosphor-dim)]/50 text-[var(--crt-phosphor)]/80 hover:border-[var(--crt-phosphor)]'
              }`}
            >
              {fmt.label}
            </button>
          ))}
        </div>

        <div className="relative flex-1 sm:max-w-xs">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--crt-phosphor)]/60"
          />
          <input
            type="text"
            value={shelfSearchQuery}
            onChange={(e) => setShelfSearchQuery(e.target.value)}
            placeholder="Поиск по названию, автору или тексту..."
            className="w-full min-h-[38px] pl-8 pr-3 py-1.5 bg-black border border-[var(--crt-phosphor-dim)] focus:border-[var(--crt-phosphor)] rounded text-xs text-[var(--crt-phosphor-bright)] outline-none"
          />
        </div>
      </div>

      {/* Books & Presentations Grid */}
      {isLoadingDocs ? (
        <div className="py-16 text-center text-xs opacity-75">
          Загрузка хранилища Библиотеки студента...
        </div>
      ) : filteredDocuments.length === 0 ? (
        <div className="border-2 border-dashed border-[var(--crt-phosphor-dim)] rounded-xl p-8 sm:p-12 text-center space-y-4 bg-[#050e07]/60">
          <div className="w-12 h-12 rounded-full bg-[var(--crt-phosphor)]/10 border border-[var(--crt-phosphor)] flex items-center justify-center mx-auto">
            <BookOpen size={24} className="text-[var(--crt-phosphor-bright)]" />
          </div>
          <div className="space-y-1.5 max-w-lg mx-auto">
            <h3 className="text-sm sm:text-base font-extrabold uppercase text-[var(--crt-phosphor-bright)]">
              {documents.length === 0
                ? 'Ваша библиотека студента пока пуста'
                : 'В выбранной категории нет материалов'}
            </h3>
            <p className="text-xs opacity-75 leading-relaxed">
              Загрузите файлы с компьютера или телефона в форматах{' '}
              <strong>PDF, Word (.docx, .doc), Презентации (.pptx, .ppt, .ppx) или TXT/MD</strong>.
              Вы сможете читать их прямо в интерфейсе терминала, распределять по учебным предметам и включать{' '}
              <strong>автоматический переводчик</strong> одной кнопкой.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              onClick={() => {
                pipAudio.playClick();
                setUploadModeTab('FILE');
                setIsUploadModalOpen(true);
              }}
              className="min-h-[44px] px-5 py-2.5 bg-[var(--crt-phosphor)] text-black font-extrabold rounded-lg text-xs uppercase cursor-pointer flex items-center gap-2 shadow-lg"
            >
              <Upload size={16} />
              <span>ЗАГРУЗИТЬ ФАЙЛ (PDF / WORD / PPTX / PPX)</span>
            </button>
            <button
              onClick={() => {
                pipAudio.playClick();
                setUploadModeTab('TEXT');
                setIsUploadModalOpen(true);
              }}
              className="min-h-[44px] px-4 py-2.5 border border-[var(--crt-phosphor)] hover:bg-[var(--crt-phosphor)]/15 text-[var(--crt-phosphor-bright)] font-bold rounded-lg text-xs uppercase cursor-pointer flex items-center gap-2"
            >
              <Plus size={15} />
              <span>ВСТАВИТЬ ТЕКСТ / КОНСПЕКТ</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
          {filteredDocuments.map((doc) => {
            const badge = getFileBadge(doc.fileType);
            const progressPct = Math.round((doc.currentPage / Math.max(1, doc.totalPages)) * 100);
            const notesCount = Object.keys(doc.notes || {}).length;

            return (
              <div
                key={doc.id}
                className="border-2 border-[var(--crt-phosphor-dim)] hover:border-[var(--crt-phosphor)] bg-[#061208] rounded-xl p-4 flex flex-col justify-between gap-3 transition-all shadow-md"
              >
                <div className="space-y-2.5">
                  {/* Top Row: Format Badge, OCR Badge, File Size & Delete */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`px-2.5 py-0.5 text-[10px] font-extrabold border rounded flex items-center gap-1.5 ${badge.cls}`}
                      >
                        {badge.icon}
                        {badge.label}
                      </span>
                      {doc.isScannedPdf && (
                        <span
                          className="px-2 py-0.5 text-[9px] font-extrabold border rounded bg-cyan-950/70 border-cyan-500/60 text-cyan-300 flex items-center gap-1"
                          title="Сканированный PDF с распознанным текстом (OCR)"
                        >
                          <ScanText size={11} />
                          <span>
                            OCR {doc.ocrPagesCount ? `(${doc.ocrPagesCount})` : 'СКАН'}
                          </span>
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-[10px] opacity-70">
                      <span>{formatFileSize(doc.fileSize)}</span>
                      <span>•</span>
                      <span>
                        {doc.totalPages}{' '}
                        {doc.fileType === 'pptx' || doc.fileType === 'ppt' || doc.fileType === 'ppx'
                          ? 'слайдов'
                          : 'стр.'}
                      </span>
                      <button
                        onClick={() => handleDeleteDocument(doc.id)}
                        className="p-1 text-zinc-400 hover:text-red-400 cursor-pointer"
                        title="Удалить файл из библиотеки"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Title & Author */}
                  <div>
                    <h3
                      onClick={() => {
                        pipAudio.playClick();
                        setActiveDocId(doc.id);
                        setCurrentPageNum(doc.currentPage || 1);
                      }}
                      className="font-extrabold text-sm sm:text-base text-[var(--crt-phosphor-bright)] hover:underline cursor-pointer line-clamp-2"
                    >
                      {doc.title}
                    </h3>
                    {doc.author && (
                      <div className="text-[11px] opacity-75 mt-0.5">Автор: {doc.author}</div>
                    )}
                  </div>

                  {/* Subject Selector directly on card */}
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-[10px] uppercase opacity-70 shrink-0">Предмет:</span>
                    <select
                      value={doc.subjectId || 'UNASSIGNED'}
                      onChange={(e) => handleAssignDocSubject(doc.id, e.target.value)}
                      className="flex-1 min-h-[34px] bg-black/80 border border-[var(--crt-phosphor-dim)] rounded px-2 py-1 text-[11px] font-bold text-[var(--crt-phosphor-bright)] cursor-pointer"
                    >
                      <option value="UNASSIGNED">Без предмета</option>
                      {subjects.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Reading Progress Bar */}
                  <div className="space-y-1 pt-1">
                    <div className="flex items-center justify-between text-[10px] opacity-85">
                      <span>
                        Прогресс: стр. {doc.currentPage} из {doc.totalPages} ({progressPct}%)
                      </span>
                      <div className="flex items-center gap-2">
                        {doc.bookmarks.length > 0 && (
                          <span className="text-amber-300 flex items-center gap-0.5">
                            <Bookmark size={10} /> {doc.bookmarks.length}
                          </span>
                        )}
                        {notesCount > 0 && (
                          <span className="text-emerald-300 flex items-center gap-0.5">
                            <StickyNote size={10} /> {notesCount}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="w-full h-1.5 bg-black rounded-full overflow-hidden border border-[var(--crt-phosphor-dim)]/40">
                      <div
                        className="h-full bg-[var(--crt-phosphor)] transition-all"
                        style={{ width: `${Math.min(100, Math.max(4, progressPct))}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Action Buttons: Open Reader & Open with Auto-Translator ON */}
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[var(--crt-phosphor-dim)]/40">
                  <button
                    onClick={() => {
                      pipAudio.playClick();
                      setAutoTranslateEnabled(false);
                      setActiveDocId(doc.id);
                      setCurrentPageNum(doc.currentPage || 1);
                    }}
                    className="min-h-[42px] px-3 py-2 rounded bg-[var(--crt-phosphor)] hover:opacity-90 text-black font-extrabold text-xs uppercase flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <BookOpen size={14} />
                    <span>ЧИТАТЬ</span>
                  </button>

                  <button
                    onClick={() => {
                      pipAudio.playClick();
                      setAutoTranslateEnabled(true);
                      setActiveDocId(doc.id);
                      setCurrentPageNum(doc.currentPage || 1);
                    }}
                    className="min-h-[42px] px-3 py-2 rounded bg-amber-400/15 hover:bg-amber-400/25 border border-amber-400/70 text-amber-300 font-extrabold text-xs uppercase flex items-center justify-center gap-1.5 cursor-pointer"
                    title="Открыть книгу сразу с включенным параллельным автопереводчиком"
                  >
                    <Languages size={14} />
                    <span>+ ПЕРЕВОДЧИК</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL 1: Upload File (PDF, DOCX, DOC, PPTX, PPT, PPX, TXT, MD) or Paste Lecture Text */}
      {isUploadModalOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="fixed inset-0 bg-black/90 flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto">
            <div className="border-2 border-[var(--crt-phosphor)] bg-[#050e07] p-4 sm:p-6 rounded-xl max-w-lg w-full text-[var(--crt-phosphor)] font-mono space-y-4 shadow-2xl my-auto">
              <div className="flex items-center justify-between border-b border-[var(--crt-phosphor-dim)] pb-2.5">
                <span className="font-extrabold text-xs sm:text-sm uppercase tracking-wider text-[var(--crt-phosphor-bright)] flex items-center gap-2">
                  <Upload size={16} /> ДОБАВЛЕНИЕ В БИБЛИОТЕКУ СТУДЕНТА
                </span>
                <button
                  onClick={() => setIsUploadModalOpen(false)}
                  className="p-1 border border-[var(--crt-phosphor-dim)] hover:border-[var(--crt-phosphor)] rounded cursor-pointer"
                >
                  <X size={15} />
                </button>
              </div>

              {/* Switch between File Upload and Direct Text/Lecture Paste */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setUploadModeTab('FILE')}
                  className={`min-h-[40px] py-2 rounded text-xs font-extrabold uppercase border cursor-pointer ${
                    uploadModeTab === 'FILE'
                      ? 'bg-[var(--crt-phosphor)] text-black border-[var(--crt-phosphor)]'
                      : 'border-[var(--crt-phosphor-dim)] text-[var(--crt-phosphor)]'
                  }`}
                >
                  ЗАГРУЗИТЬ ФАЙЛ
                </button>
                <button
                  type="button"
                  onClick={() => setUploadModeTab('TEXT')}
                  className={`min-h-[40px] py-2 rounded text-xs font-extrabold uppercase border cursor-pointer ${
                    uploadModeTab === 'TEXT'
                      ? 'bg-[var(--crt-phosphor)] text-black border-[var(--crt-phosphor)]'
                      : 'border-[var(--crt-phosphor-dim)] text-[var(--crt-phosphor)]'
                  }`}
                >
                  ВСТАВИТЬ ТЕКСТ / СТАТЬЮ
                </button>
              </div>

              <form onSubmit={handleConfirmUpload} className="space-y-3.5">
                {uploadModeTab === 'FILE' ? (
                  <>
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        handleFilesSelected(e.dataTransfer.files);
                      }}
                      className="border-2 border-dashed border-[var(--crt-phosphor)]/70 hover:border-[var(--crt-phosphor)] bg-[#08160b] rounded-xl p-5 text-center cursor-pointer transition-colors space-y-2"
                    >
                      <Upload size={26} className="mx-auto text-[var(--crt-phosphor-bright)]" />
                      <div className="text-xs font-extrabold uppercase text-[var(--crt-phosphor-bright)]">
                        Нажмите для выбора файла или перетащите сюда
                      </div>
                      <div className="text-[11px] opacity-75">
                        Поддерживаются: <strong>.PDF, .DOCX, .DOC, .PPTX, .PPT, .PPX, .TXT, .MD</strong>
                      </div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept=".pdf,.doc,.docx,.ppt,.pptx,.ppx,.txt,.md,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain"
                        onChange={(e) => handleFilesSelected(e.target.files)}
                        className="hidden"
                      />
                    </div>

                    {uploadPendingFiles.length > 0 && (
                      <div className="p-2.5 rounded bg-black/70 border border-[var(--crt-phosphor-dim)] space-y-1 text-xs">
                        <div className="font-bold text-emerald-300">
                          Выбрано файлов: {uploadPendingFiles.length}
                        </div>
                        {uploadPendingFiles.map((f, i) => (
                          <div key={i} className="flex items-center justify-between text-[11px] opacity-90">
                            <span className="truncate">{f.name}</span>
                            <span className="shrink-0 ml-2">{formatFileSize(f.size)}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {uploadPendingFiles.length <= 1 && (
                      <div>
                        <label className="block text-[11px] uppercase font-bold mb-1">
                          Название книги / документа (можно изменить):
                        </label>
                        <input
                          type="text"
                          value={uploadCustomTitle}
                          onChange={(e) => setUploadCustomTitle(e.target.value)}
                          placeholder="Например: Фуко М. — Археология знания"
                          className="w-full min-h-[40px] bg-black border border-[var(--crt-phosphor-dim)] rounded px-3 py-1.5 text-xs text-[var(--crt-phosphor-bright)] outline-none"
                        />
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div>
                      <label className="block text-[11px] uppercase font-bold mb-1">
                        Заголовок конспекта / иностранной статьи:
                      </label>
                      <input
                        type="text"
                        required
                        value={manualTextTitle}
                        onChange={(e) => setManualTextTitle(e.target.value)}
                        placeholder="Например: Seminar Reading — Hermeneutics & Historical Memory"
                        className="w-full min-h-[40px] bg-black border border-[var(--crt-phosphor-dim)] rounded px-3 py-1.5 text-xs text-[var(--crt-phosphor-bright)] outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] uppercase font-bold mb-1">
                        Текст материала (автоматически разобьется на страницы для чтения и перевода):
                      </label>
                      <textarea
                        rows={6}
                        required
                        value={manualTextBody}
                        onChange={(e) => setManualTextBody(e.target.value)}
                        placeholder="Вставьте сюда текст книги, статьи на иностранном языке или лекционный материал..."
                        className="w-full bg-black border border-[var(--crt-phosphor-dim)] rounded p-3 text-xs text-[var(--crt-phosphor-bright)] outline-none"
                      />
                    </div>
                  </>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] uppercase font-bold mb-1">
                      Учебный предмет:
                    </label>
                    <select
                      value={uploadSubjectId}
                      onChange={(e) => setUploadSubjectId(e.target.value)}
                      className="w-full min-h-[40px] bg-black border border-[var(--crt-phosphor-dim)] rounded px-2.5 py-1.5 text-xs text-[var(--crt-phosphor-bright)]"
                    >
                      <option value="UNASSIGNED">Без предмета</option>
                      {subjects.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] uppercase font-bold mb-1">
                      Автор / Преподаватель (опц.):
                    </label>
                    <input
                      type="text"
                      value={uploadAuthor}
                      onChange={(e) => setUploadAuthor(e.target.value)}
                      placeholder="Автор или лектор"
                      className="w-full min-h-[40px] bg-black border border-[var(--crt-phosphor-dim)] rounded px-3 py-1.5 text-xs text-[var(--crt-phosphor-bright)] outline-none"
                    />
                  </div>
                </div>

                {isParsingUpload && (
                  <div className="p-3 rounded bg-amber-950/40 border border-amber-400/60 text-amber-300 text-xs flex items-center gap-2">
                    <RefreshCw size={15} className="animate-spin shrink-0" />
                    <span>{uploadProgressText || 'Обработка документа...'}</span>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsUploadModalOpen(false)}
                    className="min-h-[42px] px-4 py-2 border border-zinc-600 rounded text-xs cursor-pointer"
                  >
                    ОТМЕНА
                  </button>
                  <button
                    type="submit"
                    disabled={
                      isParsingUpload ||
                      (uploadModeTab === 'FILE' && uploadPendingFiles.length === 0) ||
                      (uploadModeTab === 'TEXT' && !manualTextBody.trim())
                    }
                    className="min-h-[42px] px-5 py-2 bg-[var(--crt-phosphor)] hover:opacity-90 disabled:opacity-40 text-black font-extrabold rounded text-xs uppercase cursor-pointer"
                  >
                    {isParsingUpload ? 'ЗАГРУЗКА...' : 'СОХРАНИТЬ И ОТКРЫТЬ'}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* MODAL 2: Subject Manager (Auto-sync from Schedule & Grades + User Custom Edit/Add/Delete) */}
      {isSubjectModalOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="fixed inset-0 bg-black/90 flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto">
            <div className="border-2 border-[var(--crt-phosphor)] bg-[#050e07] p-4 sm:p-6 rounded-xl max-w-xl w-full text-[var(--crt-phosphor)] font-mono space-y-4 shadow-2xl my-auto">
              <div className="flex items-center justify-between border-b border-[var(--crt-phosphor-dim)] pb-2.5">
                <span className="font-extrabold text-xs sm:text-sm uppercase tracking-wider text-[var(--crt-phosphor-bright)] flex items-center gap-2">
                  <FolderPlus size={16} /> УПРАВЛЕНИЕ ПРЕДМЕТАМИ БИБЛИОТЕКИ
                </span>
                <button
                  onClick={() => setIsSubjectModalOpen(false)}
                  className="p-1 border border-[var(--crt-phosphor-dim)] hover:border-[var(--crt-phosphor)] rounded cursor-pointer"
                >
                  <X size={15} />
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 bg-[#09180c] border border-[var(--crt-phosphor-dim)]/50 p-2.5 rounded-lg text-xs">
                <span className="opacity-85">
                  Предметы автоматически подтягиваются из вашего Расписания и Калькулятора оценок, а также редактируются вручную.
                </span>
                <button
                  onClick={handleResyncSubjectsFromApp}
                  className="px-3 py-1.5 bg-[var(--crt-phosphor)]/20 hover:bg-[var(--crt-phosphor)]/30 border border-[var(--crt-phosphor)] rounded text-[11px] font-bold flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <RefreshCw size={12} />
                  <span>СИНХРОНИЗИРОВАТЬ С РАСПИСАНИЕМ И БРС</span>
                </button>
              </div>

              {/* Add New Subject Form */}
              <form onSubmit={handleAddSubject} className="space-y-2.5 bg-black/60 p-3 rounded-lg border border-[var(--crt-phosphor-dim)]/60">
                <div className="text-xs font-extrabold uppercase text-[var(--crt-phosphor-bright)]">
                  + ДОБАВИТЬ НОВЫЙ ПРЕДМЕТ
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={newSubjectName}
                    onChange={(e) => setNewSubjectName(e.target.value)}
                    placeholder="Название предмета (напр.: История философии)"
                    className="flex-1 min-h-[40px] bg-[#061108] border border-[var(--crt-phosphor-dim)] rounded px-3 py-1.5 text-xs text-[var(--crt-phosphor-bright)] outline-none"
                  />
                  <select
                    value={newSubjectColor}
                    onChange={(e) => setNewSubjectColor(e.target.value as LibrarySubject['color'])}
                    className="min-h-[40px] bg-[#061108] border border-[var(--crt-phosphor-dim)] rounded px-2.5 py-1.5 text-xs font-bold"
                  >
                    <option value="emerald">Изумрудный</option>
                    <option value="amber">Янтарный</option>
                    <option value="cyan">Голубой</option>
                    <option value="fuchsia">Сиреневый</option>
                    <option value="rose">Рубиновый</option>
                    <option value="violet">Фиолетовый</option>
                  </select>
                  <button
                    type="submit"
                    className="min-h-[40px] px-4 py-1.5 bg-[var(--crt-phosphor)] text-black font-extrabold rounded text-xs uppercase cursor-pointer"
                  >
                    ДОБАВИТЬ
                  </button>
                </div>
              </form>

              {/* Existing Subjects List */}
              <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                {subjects.length === 0 ? (
                  <div className="text-center py-6 text-xs opacity-65">
                    Список предметов пока пуст. Добавьте предмет выше или заполните Расписание / Оценки.
                  </div>
                ) : (
                  subjects.map((sub) => {
                    const isEditing = editingSubjectId === sub.id;
                    const style = SUBJECT_COLOR_STYLES[sub.color] || SUBJECT_COLOR_STYLES.emerald;
                    const count = documents.filter((d) => d.subjectId === sub.id).length;

                    return (
                      <div
                        key={sub.id}
                        className="p-2.5 rounded-lg bg-[#08140a] border border-[var(--crt-phosphor-dim)]/60 flex flex-wrap items-center justify-between gap-2"
                      >
                        {isEditing ? (
                          <div className="flex flex-wrap items-center gap-2 flex-1">
                            <input
                              type="text"
                              value={editingSubjectName}
                              onChange={(e) => setEditingSubjectName(e.target.value)}
                              className="flex-1 min-h-[36px] bg-black border border-[var(--crt-phosphor)] rounded px-2.5 py-1 text-xs"
                            />
                            <select
                              value={editingSubjectColor}
                              onChange={(e) =>
                                setEditingSubjectColor(e.target.value as LibrarySubject['color'])
                              }
                              className="min-h-[36px] bg-black border border-[var(--crt-phosphor)] rounded px-2 py-1 text-xs"
                            >
                              <option value="emerald">Изумрудный</option>
                              <option value="amber">Янтарный</option>
                              <option value="cyan">Голубой</option>
                              <option value="fuchsia">Сиреневый</option>
                              <option value="rose">Рубиновый</option>
                              <option value="violet">Фиолетовый</option>
                            </select>
                            <button
                              onClick={() => handleSaveEditedSubject(sub.id)}
                              className="px-3 py-1 bg-emerald-400 text-black font-extrabold rounded text-xs cursor-pointer"
                            >
                              ОК
                            </button>
                            <button
                              onClick={() => setEditingSubjectId(null)}
                              className="px-2 py-1 border border-zinc-600 rounded text-xs cursor-pointer"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${style.dot}`} />
                              <span className="font-bold text-xs text-[var(--crt-phosphor-bright)] truncate">
                                {sub.name}
                              </span>
                              <span className="text-[10px] opacity-70">({count} кн.)</span>
                              {sub.source === 'schedule' && (
                                <span className="px-1.5 py-0.5 rounded bg-emerald-950/60 border border-emerald-500/40 text-[9px] text-emerald-300 flex items-center gap-1">
                                  <Calendar size={9} /> Из расписания
                                </span>
                              )}
                              {sub.source === 'grades' && (
                                <span className="px-1.5 py-0.5 rounded bg-amber-950/60 border border-amber-500/40 text-[9px] text-amber-300 flex items-center gap-1">
                                  <Calculator size={9} /> Из оценок
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => {
                                  setEditingSubjectId(sub.id);
                                  setEditingSubjectName(sub.name);
                                  setEditingSubjectColor(sub.color);
                                }}
                                className="p-1.5 border border-[var(--crt-phosphor-dim)] hover:border-[var(--crt-phosphor)] rounded cursor-pointer"
                                title="Переименовать предмет или сменить цвет"
                              >
                                <Edit3 size={13} />
                              </button>
                              <button
                                onClick={() => handleDeleteSubject(sub)}
                                className="p-1.5 border border-red-500/40 hover:border-red-400 text-red-300 rounded cursor-pointer"
                                title="Удалить предмет"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={() => setIsSubjectModalOpen(false)}
                  className="min-h-[40px] px-5 py-2 bg-[var(--crt-phosphor)] text-black font-extrabold rounded text-xs uppercase cursor-pointer"
                >
                  ГОТОВО
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
