import * as ImageManipulator from 'expo-image-manipulator';
import type { OcrImageAsset } from '../types';

const MAX_WIDTH = 2200;
const MAX_HEIGHT = 3000;
const JPEG_QUALITY = 0.9;

export async function preprocessImageForOcr(
  asset: OcrImageAsset
): Promise<OcrImageAsset> {
  if (!asset.uri) {
    throw new Error('Invalid image asset: missing URI');
  }

  const { width, height } = asset;

  if (!width || !height) {
    return { ...asset, processedUri: undefined };
  }

  let targetWidth = width;
  let targetHeight = height;
  let needsResize = false;

  if (width > MAX_WIDTH) {
    const ratio = MAX_WIDTH / width;
    targetWidth = MAX_WIDTH;
    targetHeight = Math.floor(height * ratio);
    needsResize = true;
  }

  if (targetHeight > MAX_HEIGHT) {
    const ratio = MAX_HEIGHT / targetHeight;
    targetHeight = MAX_HEIGHT;
    targetWidth = Math.floor(targetWidth * ratio);
    needsResize = true;
  }

  if (!needsResize) {
    return { ...asset, processedUri: undefined };
  }

  try {
    const result = await ImageManipulator.manipulateAsync(
      asset.uri,
      [
        {
          resize: {
            width: targetWidth,
            height: targetHeight,
          },
        },
      ],
      {
        compress: JPEG_QUALITY,
        format: ImageManipulator.SaveFormat.JPEG,
      }
    );

    return {
      ...asset,
      uri: result.uri,
      width: result.width,
      height: result.height,
      processedUri: result.uri,
    };
  } catch (error) {
    console.warn('Image preprocessing failed, using original:', error);
    return asset;
  }
}

export function shouldPreprocess(width?: number, height?: number): boolean {
  if (!width || !height) {
    return false;
  }

  return width > MAX_WIDTH || height > MAX_HEIGHT;
}
