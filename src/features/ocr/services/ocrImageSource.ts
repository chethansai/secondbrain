import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import type { OcrImageAsset, OcrSourceKind } from '../types';

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
