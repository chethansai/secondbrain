export type OcrSourceKind = 'camera' | 'gallery' | 'document';

export type OcrFlowStatus =
  | 'idle'
  | 'picking'
  | 'preview'
  | 'preprocessing'
  | 'recognizing'
  | 'review'
  | 'saving'
  | 'error';

export interface OcrImageAsset {
  uri: string;
  width?: number;
  height?: number;
  fileName?: string | null;
  mimeType?: string | null;
  sourceKind: OcrSourceKind;
  processedUri?: string;
}

export interface OcrTextLine {
  text: string;
  confidence?: number;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface OcrTextBlock {
  text: string;
  lines: OcrTextLine[];
  confidence?: number;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface OcrResult {
  fullText: string;
  blocks: OcrTextBlock[];
  engine: 'mlkit' | 'apple-vision' | 'mock' | 'unsupported';
  sourceUri: string;
  processedUri?: string;
  createdAt: number;
}

export interface OcrSaveRequest {
  destinationPath: string[];
  text: string;
  appendHistory?: boolean;
}

export type OcrEngineErrorCode =
  | 'ocr_unsupported'
  | 'ocr_permission_denied'
  | 'ocr_no_text_found'
  | 'ocr_file_not_found'
  | 'ocr_image_too_large'
  | 'ocr_engine_failed'
  | 'ocr_cancelled';
