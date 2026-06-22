import { AppState, AppStateStatus } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import type { OcrImageAsset, OcrSourceKind } from '../types';

function normalizePickedAsset(
  asset: {
    uri?: string | null;
    width?: number | null;
    height?: number | null;
    fileName?: string | null;
    name?: string | null;
    mimeType?: string | null;
  },
  sourceKind: OcrSourceKind,
): OcrImageAsset {
  if (!asset.uri) {
    throw new Error('No image URI was returned.');
  }

  if (sourceKind === 'document' && asset.mimeType && !asset.mimeType.startsWith('image/')) {
    throw new Error('Please choose an image file for OCR.');
  }

  return {
    uri: asset.uri,
    width: typeof asset.width === 'number' ? asset.width : undefined,
    height: typeof asset.height === 'number' ? asset.height : undefined,
    fileName: asset.fileName ?? asset.name ?? null,
    mimeType: asset.mimeType ?? null,
    sourceKind,
  };
}

export async function recoverPendingImagePickerResult(): Promise<OcrImageAsset | null> {
  try {
    const pending = await ImagePicker.getPendingResultAsync();

    if (!pending || (Array.isArray(pending) && pending.length === 0)) {
      return null;
    }

    if (!Array.isArray(pending)) {
      if ('code' in pending) {
        throw new Error(pending.message || 'Image picker failed.');
      }
      if (pending.canceled) {
        return null;
      }
      const asset = pending.assets?.[0];
      if (!asset) {
        throw new Error('Pending image picker result had no image.');
      }
      return normalizePickedAsset(asset, 'gallery');
    }

    const firstResult = pending[0];
    if (!firstResult) {
      return null;
    }

    if ('code' in firstResult) {
      throw new Error(firstResult.message || 'Image picker failed.');
    }

    if (firstResult.canceled) {
      return null;
    }

    const asset = firstResult.assets?.[0];
    if (!asset) {
      throw new Error('Pending image picker result had no image.');
    }

    return normalizePickedAsset(asset, 'gallery');
  } catch (error) {
    console.error('[OCR] pending picker recovery failed', error);
    throw error instanceof Error
      ? error
      : new Error('Could not recover image picker result.');
  }
}

export async function captureImageForOcr(): Promise<OcrImageAsset | null> {
  try {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();

    if (status !== 'granted') {
      throw new Error('Camera permission denied');
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 1,
      exif: false,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return null;
    }

    const asset = result.assets[0];

    return {
      uri: asset.uri,
      width: asset.width,
      height: asset.height,
      fileName: asset.fileName ?? null,
      mimeType: asset.mimeType ?? null,
      sourceKind: 'camera' as OcrSourceKind,
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes('permission')) {
      throw error;
    }
    return null;
  }
}

export async function pickImageForOcr(): Promise<OcrImageAsset | null> {
  try {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (status !== 'granted') {
      throw new Error('Media library permission denied');
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 1,
      exif: false,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return null;
    }

    const asset = result.assets[0];

    return {
      uri: asset.uri,
      width: asset.width,
      height: asset.height,
      fileName: asset.fileName ?? null,
      mimeType: asset.mimeType ?? null,
      sourceKind: 'gallery' as OcrSourceKind,
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes('permission')) {
      throw error;
    }
    return null;
  }
}

export async function pickDocumentImageForOcr(): Promise<OcrImageAsset | null> {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['image/*'],
      copyToCacheDirectory: true,
      multiple: false,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return null;
    }

    const asset = result.assets[0];

    if (asset.mimeType && asset.mimeType.includes('pdf')) {
      throw new Error('PDF OCR is not supported in this version. Choose an image.');
    }

    return {
      uri: asset.uri,
      width: undefined,
      height: undefined,
      fileName: asset.name ?? null,
      mimeType: asset.mimeType ?? null,
      sourceKind: 'document' as OcrSourceKind,
    };
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('PDF')) {
        throw error;
      }
    }
    return null;
  }
}
