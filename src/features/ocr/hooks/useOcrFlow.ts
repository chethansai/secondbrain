import { useState, useCallback, useEffect } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import type {
  OcrFlowStatus,
  OcrImageAsset,
  OcrResult,
  OcrSourceKind,
} from '../types';
import {
  captureImageForOcr,
  pickImageForOcr,
  pickDocumentImageForOcr,
  recoverPendingImagePickerResult,
} from '../services/ocrImageSource';
import { preprocessImageForOcr } from '../services/ocrImagePreprocess';
import { ocrEngine, getOcrErrorMessage } from '../services/ocrEngine';
import { normalizeOcrText, hasUsableOcrText } from '../services/ocrTextCleanup';

interface UseOcrFlowParams {
  defaultDestinationPath?: string[];
  onSaveText: (text: string, destinationPath: string[]) => Promise<void>;
  onInsertText?: (text: string) => void;
}

interface UseOcrFlowReturn {
  status: OcrFlowStatus;
  sourceAsset: OcrImageAsset | null;
  processedAsset: OcrImageAsset | null;
  result: OcrResult | null;
  editableText: string;
  destinationPath: string[];
  error: { code: string; message: string } | null;

  startCamera: () => Promise<void>;
  startGallery: () => Promise<void>;
  startDocument: () => Promise<void>;
  runRecognition: () => Promise<void>;
  setEditableText: (text: string) => void;
  setDestinationPath: (path: string[]) => void;
  saveAsNote: () => Promise<void>;
  insertIntoEditor: () => void;
  copyText: () => void;
  reset: () => void;
  clearError: () => void;
}

export function useOcrFlow(params: UseOcrFlowParams): UseOcrFlowReturn {
  const { defaultDestinationPath, onSaveText, onInsertText } = params;

  const [status, setStatus] = useState<OcrFlowStatus>('idle');
  const [sourceAsset, setSourceAsset] = useState<OcrImageAsset | null>(null);
  const [processedAsset, setProcessedAsset] = useState<OcrImageAsset | null>(null);
  const [result, setResult] = useState<OcrResult | null>(null);
  const [editableText, setEditableText] = useState('');
  const [destinationPath, setDestinationPath] = useState<string[]>(
    defaultDestinationPath ?? []
  );
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [isRecovering, setIsRecovering] = useState(false);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const reset = useCallback(() => {
    setStatus('idle');
    setSourceAsset(null);
    setProcessedAsset(null);
    setResult(null);
    setEditableText('');
    setDestinationPath(defaultDestinationPath ?? []);
    setError(null);
    setIsRecovering(false);
  }, [defaultDestinationPath]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active' && status === 'picking' && !isRecovering) {
        setIsRecovering(true);
        try {
          const recoveredAsset = await recoverPendingImagePickerResult();
          if (recoveredAsset) {
            setSourceAsset(recoveredAsset);
            setStatus('preview');
          } else {
            setStatus('idle');
          }
        } catch (recoveryError) {
          const { message } = getOcrErrorMessage(recoveryError);
          setError({ code: 'ocr_engine_failed', message });
          setStatus('error');
        } finally {
          setIsRecovering(false);
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [status, isRecovering]);

  const handleError = useCallback((err: unknown) => {
    const { code, message } = getOcrErrorMessage(err);
    setError({ code, message });
    setStatus('error');
  }, []);

  const startCamera = useCallback(async () => {
    setStatus('picking');
    setError(null);

    try {
      const asset = await captureImageForOcr();
      if (asset) {
        setSourceAsset(asset);
        setStatus('preview');
      } else {
        setStatus('idle');
      }
    } catch (err) {
      handleError(err);
    }
  }, [handleError]);

  const startGallery = useCallback(async () => {
    setStatus('picking');
    setError(null);

    try {
      const asset = await pickImageForOcr();
      if (asset) {
        setSourceAsset(asset);
        setStatus('preview');
      } else {
        setStatus('idle');
      }
    } catch (err) {
      handleError(err);
    }
  }, [handleError]);

  const startDocument = useCallback(async () => {
    setStatus('picking');
    setError(null);

    try {
      const asset = await pickDocumentImageForOcr();
      if (asset) {
        setSourceAsset(asset);
        setStatus('preview');
      } else {
        setStatus('idle');
      }
    } catch (err) {
      handleError(err);
    }
  }, [handleError]);

  const runRecognition = useCallback(async () => {
    if (!sourceAsset) {
      handleError(new Error('No image selected'));
      return;
    }

    setStatus('preprocessing');
    setError(null);

    try {
      const processed = await preprocessImageForOcr(sourceAsset);
      setProcessedAsset(processed);

      setStatus('recognizing');

      const ocrResult = await ocrEngine.recognizeImage(processed);
      setResult(ocrResult);

      const cleaned = normalizeOcrText(ocrResult.fullText);
      setEditableText(cleaned);

      setStatus('review');
    } catch (err) {
      handleError(err);
    }
  }, [sourceAsset, handleError]);

  const saveAsNote = useCallback(async () => {
    if (!hasUsableOcrText(editableText)) {
      setError({
        code: 'ocr_no_text_found',
        message: 'OCR text is empty. Please edit before saving.',
      });
      return;
    }

    if (destinationPath.length === 0) {
      return;
    }

    setStatus('saving');
    setError(null);

    try {
      const cleaned = normalizeOcrText(editableText);
      await onSaveText(cleaned, destinationPath);
      reset();
    } catch (err) {
      handleError(err);
    }
  }, [editableText, destinationPath, onSaveText, reset, handleError]);

  const insertIntoEditor = useCallback(() => {
    if (onInsertText && hasUsableOcrText(editableText)) {
      const cleaned = normalizeOcrText(editableText);
      onInsertText(cleaned);
      reset();
    }
  }, [editableText, onInsertText, reset]);

  const copyText = useCallback(() => {
    if (hasUsableOcrText(editableText)) {
      const cleaned = normalizeOcrText(editableText);
    }
  }, [editableText]);

  return {
    status,
    sourceAsset,
    processedAsset,
    result,
    editableText,
    destinationPath,
    error,
    startCamera,
    startGallery,
    startDocument,
    runRecognition,
    setEditableText,
    setDestinationPath,
    saveAsNote,
    insertIntoEditor,
    copyText,
    reset,
    clearError,
  };
}
