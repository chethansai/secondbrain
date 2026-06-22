import { NativeModules, Platform } from 'react-native';
import type { OcrImageAsset, OcrResult, OcrEngineErrorCode } from '../types';

interface NativeOcrResult {
  fullText: string;
  blocks: Array<{
    text: string;
    lines: Array<{ text: string; confidence?: number }>;
  }>;
}

interface NativeOcrModule {
  recognizeTextFromImage(uri: string): Promise<NativeOcrResult>;
}

const { OcrModule } = NativeModules as { OcrModule?: NativeOcrModule };

export async function recognizeTextNative(
  asset: OcrImageAsset
): Promise<OcrResult> {
  if (Platform.OS !== 'android') {
    throw createOcrError(
      'ocr_unsupported',
      'Native OCR is only available on Android in this build.'
    );
  }

  if (!OcrModule || typeof OcrModule.recognizeTextFromImage !== 'function') {
    throw createOcrError(
      'ocr_unsupported',
      'OCR native module is not available in this build.'
    );
  }

  if (!asset.uri) {
    throw createOcrError('ocr_file_not_found', 'Image URI is missing');
  }

  try {
    const nativeResult = await OcrModule.recognizeTextFromImage(asset.uri);

    return {
      fullText: nativeResult.fullText,
      blocks: nativeResult.blocks.map((block) => ({
        text: block.text,
        lines: block.lines.map((line) => ({
          text: line.text,
          confidence: line.confidence,
        })),
        confidence: undefined,
      })),
      engine: 'mlkit',
      sourceUri: asset.uri,
      processedUri: asset.processedUri,
      createdAt: Date.now(),
    };
  } catch (error: any) {
    const code = mapNativeErrorCode(error);
    throw createOcrError(code, error?.message || 'Native OCR failed');
  }
}

function mapNativeErrorCode(error: any): OcrEngineErrorCode {
  const message = error?.message?.toLowerCase() || '';

  if (message.includes('permission')) {
    return 'ocr_permission_denied';
  }
  if (message.includes('file not found') || message.includes('uri')) {
    return 'ocr_file_not_found';
  }
  if (message.includes('no text') || message.includes('empty')) {
    return 'ocr_no_text_found';
  }
  if (message.includes('large') || message.includes('size')) {
    return 'ocr_image_too_large';
  }
  if (message.includes('cancel')) {
    return 'ocr_cancelled';
  }

  return 'ocr_engine_failed';
}

function createOcrError(code: OcrEngineErrorCode, message: string): Error {
  const error = new Error(message);
  (error as any).code = code;
  return error;
}

export function isNativeOcrSupported(): boolean {
  return Platform.OS === 'android' && !!OcrModule;
}
