import type {
  OcrImageAsset,
  OcrResult,
  OcrEngineErrorCode,
} from '../types';
import { recognizeTextNative, isNativeOcrSupported } from '../native/OcrNativeModule';

export interface OcrEngine {
  isSupported(): Promise<boolean>;
  recognizeImage(asset: OcrImageAsset): Promise<OcrResult>;
}

class MockOcrEngine implements OcrEngine {
  async isSupported(): Promise<boolean> {
    return true;
  }

  async recognizeImage(asset: OcrImageAsset): Promise<OcrResult> {
    if (!asset.uri) {
      throw createOcrError('ocr_file_not_found', 'Image URI is missing');
    }

    await new Promise((resolve) => setTimeout(resolve, 800));

    const mockText = 'Sample extracted text from image.\nLine two of OCR result.\n\nParagraph break preserved.';

    return {
      fullText: mockText,
      blocks: [
        {
          text: mockText,
          lines: [
            { text: 'Sample extracted text from image.' },
            { text: 'Line two of OCR result.' },
            { text: '' },
            { text: 'Paragraph break preserved.' },
          ],
          confidence: 0.95,
        },
      ],
      engine: 'mock',
      sourceUri: asset.uri,
      processedUri: (asset as any).processedUri,
      createdAt: Date.now(),
    };
  }
}

class AndroidMlKitEngine implements OcrEngine {
  async isSupported(): Promise<boolean> {
    return isNativeOcrSupported();
  }

  async recognizeImage(asset: OcrImageAsset): Promise<OcrResult> {
    return recognizeTextNative(asset);
  }
}

function createOcrError(code: OcrEngineErrorCode, message: string): Error {
  const error = new Error(message);
  (error as any).code = code;
  return error;
}

function createEngine(): OcrEngine {
  if (isNativeOcrSupported()) {
    return new AndroidMlKitEngine();
  }
  return new MockOcrEngine();
}

export const ocrEngine: OcrEngine = createEngine();

export function getOcrErrorMessage(error: unknown): {
  code: OcrEngineErrorCode;
  message: string;
} {
  if (error instanceof Error) {
    const code = (error as any).code as OcrEngineErrorCode | undefined;

    if (code) {
      return { code, message: error.message };
    }

    if (error.message.includes('permission')) {
      return {
        code: 'ocr_permission_denied',
        message: 'Camera or media permission was denied. Please grant access in Settings.',
      };
    }

    if (error.message.includes('PDF')) {
      return {
        code: 'ocr_file_not_found',
        message: error.message,
      };
    }

    return {
      code: 'ocr_engine_failed',
      message: error.message || 'OCR engine failed to process the image.',
    };
  }

  return {
    code: 'ocr_engine_failed',
    message: 'An unknown error occurred during OCR processing.',
  };
}
