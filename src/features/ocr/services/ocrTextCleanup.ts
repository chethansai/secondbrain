import type { OcrEngineErrorCode } from '../types';

export function normalizeOcrText(raw: string): string {
  if (!raw || typeof raw !== 'string') {
    return '';
  }

  let text = raw;

  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  text = text.trim();

  text = text.replace(/[ \t]+$/gm, '');

  text = text.replace(/\n{3,}/g, '\n\n');

  return text;
}

export function hasUsableOcrText(text: string): boolean {
  if (!text || typeof text !== 'string') {
    return false;
  }

  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return false;
  }

  const onlyWhitespace = /^\s*$/.test(trimmed);
  if (onlyWhitespace) {
    return false;
  }

  return true;
}

export function buildOcrNoteText(
  text: string,
  options?: { includePrefix?: boolean }
): string {
  const cleaned = normalizeOcrText(text);

  if (!hasUsableOcrText(cleaned)) {
    return '';
  }

  if (options?.includePrefix) {
    return `[OCR]\n${cleaned}`;
  }

  return cleaned;
}

export function validateOcrText(text: string): {
  valid: boolean;
  errorCode?: OcrEngineErrorCode;
  message?: string;
} {
  if (!text || typeof text !== 'string') {
    return {
      valid: false,
      errorCode: 'ocr_no_text_found',
      message: 'No text provided for OCR validation.',
    };
  }

  const cleaned = normalizeOcrText(text);

  if (!hasUsableOcrText(cleaned)) {
    return {
      valid: false,
      errorCode: 'ocr_no_text_found',
      message: 'OCR text is empty or contains only whitespace after cleanup.',
    };
  }

  return { valid: true };
}
