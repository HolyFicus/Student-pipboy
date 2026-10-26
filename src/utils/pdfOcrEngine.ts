import * as pdfjsLib from 'pdfjs-dist';
import { createWorker } from 'tesseract.js';
import { LibraryPage, OcrEngineType } from '../types/library';

// Configure PDF.js worker for Vite bundler
try {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();
} catch {
  // Fallback if worker URL resolution fails in non-standard environments
}

export type OcrProgressCallback = (statusText: string, current?: number, total?: number) => void;

interface RenderedScanPage {
  pageNumber: number;
  imageDataUrl: string;
  mimeType: string;
}

/**
 * Extracts structured text from a PDF.js page's text layer, preserving line breaks and paragraphs.
 */
async function extractDigitalTextFromPdfPage(page: any): Promise<string> {
  try {
    const textContent = await page.getTextContent();
    const items: any[] = Array.isArray(textContent?.items) ? textContent.items : [];
    if (items.length === 0) return '';

    const lines: string[] = [];
    let currentLine = '';
    let lastY: number | null = null;

    for (const item of items) {
      const str = typeof item.str === 'string' ? item.str : '';
      if (!str) continue;

      const y = Array.isArray(item.transform) ? Number(item.transform[5]) : null;
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 4.5) {
        if (currentLine.trim()) {
          lines.push(currentLine.trim());
        }
        // Larger vertical gap indicates paragraph break
        if (Math.abs(y - lastY) > 14 && lines.length > 0) {
          lines.push('');
        }
        currentLine = str;
      } else {
        if (currentLine && !currentLine.endsWith(' ') && !str.startsWith(' ')) {
          currentLine += ' ';
        }
        currentLine += str;
      }

      if (y !== null) {
        lastY = y;
      }
    }

    if (currentLine.trim()) {
      lines.push(currentLine.trim());
    }

    return lines
      .join('\n')
      .replace(/(\w)-\n(\w)/g, '$1$2')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  } catch {
    return '';
  }
}

/**
 * Determines whether extracted text from a PDF page is sufficient digital text
 * or if the page is a scan (image) that requires OCR.
 */
export function isPageTextMeaningful(text: string): boolean {
  if (!text) return false;
  const clean = text.replace(/\s+/g, '');
  // Must have at least 30 alphanumeric/Cyrillic/Latin characters to count as a digital text page
  const readableChars = (clean.match(/[A-Za-zА-Яа-яЁё0-9]/g) || []).length;
  return readableChars >= 30;
}

/**
 * Renders a PDF.js page onto an HTML5 Canvas with gentle contrast enhancement for OCR accuracy
 * and returns a base64 JPEG data URL.
 */
async function renderPdfPageToDataUrl(page: any, targetScale = 1.75): Promise<string> {
  const baseViewport = page.getViewport({ scale: 1 });
  const maxDim = Math.max(baseViewport.width, baseViewport.height, 1);
  // Cap maximum dimension to ~1600px so memory and payload size stay optimal while keeping crisp text
  const effectiveScale = Math.min(targetScale, 1600 / maxDim);
  const viewport = page.getViewport({ scale: Math.max(1.15, effectiveScale) });

  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable');
  }

  // Fill white background before rendering PDF page (important for transparent scan layers)
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({
    canvasContext: ctx,
    canvas,
    viewport
  } as any).promise;

  // Apply gentle contrast stretching to make faded book scans sharper for OCR
  try {
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;
    const contrast = 1.18; // 18% contrast boost
    const intercept = 128 * (1 - contrast);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.min(255, Math.max(0, data[i] * contrast + intercept));
      data[i + 1] = Math.min(255, Math.max(0, data[i + 1] * contrast + intercept));
      data[i + 2] = Math.min(255, Math.max(0, data[i + 2] * contrast + intercept));
    }
    ctx.putImageData(imgData, 0, 0);
  } catch {
    // Ignore if canvas pixel manipulation is restricted
  }

  return canvas.toDataURL('image/jpeg', 0.84);
}

/**
 * Runs OCR on a batch of rendered scan pages using the server Gemini Vision OCR endpoint first,
 * and falls back to client-side Tesseract.js (rus+eng) if server AI is unavailable.
 */
async function recognizeRenderedPagesBatch(
  renderedPages: RenderedScanPage[],
  fileName: string,
  onProgress?: OcrProgressCallback
): Promise<Map<number, { title: string; content: string; bullets?: string[]; engine: OcrEngineType; confidence: number }>> {
  const resultMap = new Map<
    number,
    { title: string; content: string; bullets?: string[]; engine: OcrEngineType; confidence: number }
  >();

  if (renderedPages.length === 0) return resultMap;

  // 1. Try Server-Side Gemini Vision OCR in batches of 4 pages
  const batchSize = 4;
  const unresolvedPages: RenderedScanPage[] = [];

  for (let i = 0; i < renderedPages.length; i += batchSize) {
    const batch = renderedPages.slice(i, i + batchSize);
    const pageNumsLabel = batch.map((b) => b.pageNumber).join(', ');
    onProgress?.(
      `ИИ-распознавание сканов (OCR): стр. ${pageNumsLabel} (${Math.min(i + batch.length, renderedPages.length)}/${renderedPages.length})...`,
      i + 1,
      renderedPages.length
    );

    try {
      const res = await fetch('/api/library/ocr-pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName,
          pages: batch.map((b) => ({
            pageNumber: b.pageNumber,
            imageBase64: b.imageDataUrl,
            mimeType: b.mimeType
          }))
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.pages) && data.pages.length > 0) {
          for (let idx = 0; idx < batch.length; idx++) {
            const reqPage = batch[idx];
            const matched =
              data.pages.find((p: any) => Number(p.pageNumber) === reqPage.pageNumber) ||
              data.pages[idx];

            if (matched && String(matched.content || '').trim().length > 0) {
              resultMap.set(reqPage.pageNumber, {
                title: String(matched.title || `Страница ${reqPage.pageNumber} (OCR)`),
                content: String(matched.content).trim(),
                bullets: Array.isArray(matched.bullets) ? matched.bullets : undefined,
                engine: 'gemini-vision',
                confidence: Number(matched.ocrConfidence) || 96
              });
            } else {
              unresolvedPages.push(reqPage);
            }
          }
          continue;
        }
      }
      // If server returned non-200 or empty, queue batch for local Tesseract fallback
      unresolvedPages.push(...batch);
    } catch {
      unresolvedPages.push(...batch);
    }
  }

  // 2. Client-Side Tesseract.js Fallback for any pages not resolved by Server Vision OCR
  if (unresolvedPages.length > 0) {
    let worker: any = null;
    try {
      onProgress?.('Запуск локального OCR-модуля (Tesseract RUS+ENG)...', 0, unresolvedPages.length);
      worker = await createWorker(['rus', 'eng']);

      for (let i = 0; i < unresolvedPages.length; i++) {
        const item = unresolvedPages[i];
        onProgress?.(
          `Локальное OCR-распознавание скана: стр. ${item.pageNumber} (${i + 1}/${unresolvedPages.length})...`,
          i + 1,
          unresolvedPages.length
        );

        const ret = await worker.recognize(item.imageDataUrl);
        const rawText = String(ret?.data?.text || '')
          .replace(/(\w)-\n(\w)/g, '$1$2')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
        const confidence = Math.round(Number(ret?.data?.confidence) || 85);

        if (rawText.length > 0) {
          const firstLine = rawText.split('\n')[0]?.trim().slice(0, 75) || '';
          resultMap.set(item.pageNumber, {
            title: firstLine.length > 4 ? `Стр. ${item.pageNumber}: ${firstLine}` : `Страница ${item.pageNumber} (OCR)`,
            content: rawText,
            engine: 'tesseract-local',
            confidence
          });
        } else {
          resultMap.set(item.pageNumber, {
            title: `Страница ${item.pageNumber} (Скан)`,
            content: `[Страница ${item.pageNumber}: на скане не обнаружено печатного текста или страница содержит только графическую иллюстрацию.]`,
            engine: 'tesseract-local',
            confidence: 50
          });
        }
      }
    } catch {
      for (const item of unresolvedPages) {
        if (!resultMap.has(item.pageNumber)) {
          resultMap.set(item.pageNumber, {
            title: `Страница ${item.pageNumber} (Скан)`,
            content: `Скан страницы ${item.pageNumber}. Нажмите «OCR СТРАНИЦЫ» в верхней панели читалки для повторного распознавания.`,
            engine: 'tesseract-local',
            confidence: 0
          });
        }
      }
    } finally {
      if (worker) {
        try {
          await worker.terminate();
        } catch {}
      }
    }
  }

  return resultMap;
}

/**
 * Full PDF Parser + Automatic Scanned Page OCR Pipeline.
 * Inspects every page of the PDF via PDF.js:
 * - Digital pages with embedded text are extracted immediately.
 * - Scanned (image-only) pages are rendered to high-contrast images and passed through OCR
 *   so full-text search and the automatic translator work across all pages.
 */
export async function parsePdfWithAutomaticOcr(
  fileOrBlob: File | Blob,
  fileName: string,
  onProgress?: OcrProgressCallback
): Promise<{
  pages: LibraryPage[];
  isScannedPdf: boolean;
  ocrPagesCount: number;
}> {
  onProgress?.(`Анализ структуры PDF «${fileName}»...`);
  const arrayBuffer = await fileOrBlob.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdfDoc = await loadingTask.promise;

  try {
    const totalPages = Math.min(pdfDoc.numPages || 1, 80); // Support up to 80 pages in client inspection
    const initialPages: LibraryPage[] = [];
    const pagesNeedingOcr: Array<{ pageNumber: number; pdfPage: any }> = [];

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      onProgress?.(`Проверка текстового слоя PDF: стр. ${pageNum} из ${totalPages}...`, pageNum, totalPages);
      const pdfPage = await pdfDoc.getPage(pageNum);
      const digitalText = await extractDigitalTextFromPdfPage(pdfPage);

      if (isPageTextMeaningful(digitalText)) {
        const firstLine = digitalText.split('\n')[0]?.trim().slice(0, 75) || '';
        initialPages.push({
          pageNumber: pageNum,
          title: firstLine.length > 4 ? firstLine : `Страница ${pageNum}`,
          content: digitalText,
          isScannedPage: false,
          isOcrRecognized: false
        });
      } else {
        pagesNeedingOcr.push({ pageNumber: pageNum, pdfPage });
        initialPages.push({
          pageNumber: pageNum,
          title: `Страница ${pageNum} (Скан)`,
          content: '',
          isScannedPage: true,
          isOcrRecognized: false
        });
      }
    }

    if (pagesNeedingOcr.length === 0) {
      return {
        pages: initialPages,
        isScannedPdf: false,
        ocrPagesCount: 0
      };
    }

    // Render scanned pages to images for OCR (up to 30 scanned pages automatically on upload;
    // any remaining pages can also be OCR'd on-demand inside the Reader with 1 click)
    const autoOcrLimit = Math.min(pagesNeedingOcr.length, 30);
    const renderedScans: RenderedScanPage[] = [];
    const imageByPageNum = new Map<number, string>();

    for (let i = 0; i < autoOcrLimit; i++) {
      const { pageNumber, pdfPage } = pagesNeedingOcr[i];
      onProgress?.(
        `Подготовка скана стр. ${pageNumber} к оптическому распознаванию (OCR) (${i + 1}/${autoOcrLimit})...`,
        i + 1,
        autoOcrLimit
      );
      try {
        const dataUrl = await renderPdfPageToDataUrl(pdfPage, 1.75);
        renderedScans.push({
          pageNumber,
          imageDataUrl: dataUrl,
          mimeType: 'image/jpeg'
        });
        // Keep compact preview for the first 15 scanned pages so storage remains fast
        if (i < 15) {
          imageByPageNum.set(pageNumber, dataUrl);
        }
      } catch {
        // Continue with remaining pages
      }
    }

    const ocrResultsMap = await recognizeRenderedPagesBatch(renderedScans, fileName, onProgress);
    let recognizedCount = 0;

    const finalPages: LibraryPage[] = initialPages.map((p) => {
      if (!p.isScannedPage) return p;

      const ocrData = ocrResultsMap.get(p.pageNumber);
      const previewImg = imageByPageNum.get(p.pageNumber);

      if (ocrData && ocrData.content) {
        recognizedCount++;
        return {
          ...p,
          title: ocrData.title || `Страница ${p.pageNumber} (OCR)`,
          content: ocrData.content,
          bullets: ocrData.bullets,
          isScannedPage: true,
          isOcrRecognized: true,
          ocrEngine: ocrData.engine,
          ocrConfidence: ocrData.confidence,
          pageImageDataUrl: previewImg
        };
      }

      return {
        ...p,
        title: `Страница ${p.pageNumber} (Скан)`,
        content: `Скан-страница №${p.pageNumber}. Нажмите кнопку «РАСПОЗНАТЬ ТЕКСТ (OCR)» в верхней панели читалки, чтобы распознать текст этой страницы для поиска и автоперевода.`,
        isScannedPage: true,
        isOcrRecognized: false,
        pageImageDataUrl: previewImg
      };
    });

    return {
      pages: finalPages,
      isScannedPdf: true,
      ocrPagesCount: recognizedCount
    };
  } finally {
    try {
      await loadingTask.destroy();
    } catch {}
  }
}

/**
 * On-demand OCR for a single page inside the Reader (works even if the page already had partial text
 * or if the user wants to re-scan a specific page at high resolution).
 */
export async function recognizeSinglePdfPageOcr(
  pdfBlob: Blob,
  pageNumber: number,
  fileName: string,
  onProgress?: OcrProgressCallback
): Promise<{
  title: string;
  content: string;
  bullets?: string[];
  ocrEngine: OcrEngineType;
  ocrConfidence: number;
  pageImageDataUrl: string;
}> {
  onProgress?.(`Рендеринг скана страницы №${pageNumber} в высоком разрешении...`, 1, 2);
  const arrayBuffer = await pdfBlob.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdfDoc = await loadingTask.promise;

  try {
    const clampedPage = Math.max(1, Math.min(pdfDoc.numPages, pageNumber));
    const pdfPage = await pdfDoc.getPage(clampedPage);
    const dataUrl = await renderPdfPageToDataUrl(pdfPage, 2.0);

    onProgress?.(`Распознавание текста (OCR) страницы №${clampedPage}...`, 2, 2);
    const ocrMap = await recognizeRenderedPagesBatch(
      [
        {
          pageNumber: clampedPage,
          imageDataUrl: dataUrl,
          mimeType: 'image/jpeg'
        }
      ],
      fileName,
      onProgress
    );

    const res = ocrMap.get(clampedPage);
    return {
      title: res?.title || `Страница ${clampedPage} (OCR)`,
      content:
        res?.content ||
        `[Текст на странице №${clampedPage} не обнаружен или страница содержит только графику.]`,
      bullets: res?.bullets,
      ocrEngine: res?.engine || 'gemini-vision',
      ocrConfidence: res?.confidence || 95,
      pageImageDataUrl: dataUrl
    };
  } finally {
    try {
      await loadingTask.destroy();
    } catch {}
  }
}

/**
 * On-demand OCR for all scanned/unrecognized pages (or all pages if forceAll=true) of an opened PDF in the Reader.
 */
export async function recognizeAllPdfPagesInReader(
  pdfBlob: Blob,
  existingPages: LibraryPage[],
  fileName: string,
  forceAll = false,
  onProgress?: OcrProgressCallback
): Promise<LibraryPage[]> {
  const arrayBuffer = await pdfBlob.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdfDoc = await loadingTask.promise;

  try {
    const numPages = Math.min(pdfDoc.numPages, 80);

    const targetPageNumbers: number[] = [];
    for (let pNum = 1; pNum <= numPages; pNum++) {
      const existing = existingPages.find((p) => p.pageNumber === pNum);
      const needsOcr =
        forceAll ||
        !existing ||
        (existing.isScannedPage && !existing.isOcrRecognized) ||
        !isPageTextMeaningful(existing.content) ||
        existing.content.includes('Этот PDF содержит графические сканы') ||
        existing.content.includes('Нажмите кнопку «РАСПОЗНАТЬ ТЕКСТ (OCR)»');

      if (needsOcr) {
        targetPageNumbers.push(pNum);
      }
    }

    if (targetPageNumbers.length === 0) {
      // If all pages were already recognized, re-run on current pages anyway if requested
      for (let pNum = 1; pNum <= Math.min(numPages, 25); pNum++) {
        targetPageNumbers.push(pNum);
      }
    }

    const renderedScans: RenderedScanPage[] = [];
    const imageMap = new Map<number, string>();

    for (let i = 0; i < targetPageNumbers.length; i++) {
      const pNum = targetPageNumbers[i];
      onProgress?.(
        `Рендеринг скана стр. ${pNum} (${i + 1}/${targetPageNumbers.length})...`,
        i + 1,
        targetPageNumbers.length
      );
      try {
        const pdfPage = await pdfDoc.getPage(pNum);
        const dataUrl = await renderPdfPageToDataUrl(pdfPage, 1.85);
        renderedScans.push({
          pageNumber: pNum,
          imageDataUrl: dataUrl,
          mimeType: 'image/jpeg'
        });
        if (i < 15) {
          imageMap.set(pNum, dataUrl);
        }
      } catch {
        // Ignore single page render failure
      }
    }

    const ocrMap = await recognizeRenderedPagesBatch(renderedScans, fileName, onProgress);

    const updatedPages: LibraryPage[] = [];
    for (let pNum = 1; pNum <= Math.max(numPages, existingPages.length); pNum++) {
      const existing = existingPages.find((p) => p.pageNumber === pNum);
      const ocrRes = ocrMap.get(pNum);
      const previewImg = imageMap.get(pNum) || existing?.pageImageDataUrl;

      if (ocrRes && ocrRes.content) {
        updatedPages.push({
          ...(existing || { pageNumber: pNum }),
          pageNumber: pNum,
          title: ocrRes.title || existing?.title || `Страница ${pNum} (OCR)`,
          content: ocrRes.content,
          bullets: ocrRes.bullets || existing?.bullets,
          isScannedPage: true,
          isOcrRecognized: true,
          ocrEngine: ocrRes.engine,
          ocrConfidence: ocrRes.confidence,
          pageImageDataUrl: previewImg,
          // Clear stale translations if page content was replaced by fresh OCR
          translations: existing?.isOcrRecognized ? existing.translations : undefined
        });
      } else if (existing) {
        updatedPages.push(existing);
      }
    }

    return updatedPages;
  } finally {
    try {
      await loadingTask.destroy();
    } catch {}
  }
}
