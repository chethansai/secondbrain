import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import type { OcrImageAsset } from '../types';

interface OcrImagePreviewProps {
  asset: OcrImageAsset;
  onRecognize: () => void;
  onRetake: () => void;
}

export function OcrImagePreview({
  asset,
  onRecognize,
  onRetake,
}: OcrImagePreviewProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Image Preview</Text>

      <View style={styles.imageContainer}>
        <Image source={{ uri: asset.uri }} style={styles.image} resizeMode="contain" />
      </View>

      {asset.width && asset.height && (
        <Text style={styles.dimensions}>
          {asset.width} × {asset.height} px
        </Text>
      )}

      <View style={styles.actions}>
        <TouchableOpacity style={styles.primaryButton} onPress={onRecognize}>
          <Text style={styles.primaryButtonText}>Recognize Text</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryButton} onPress={onRetake}>
          <Text style={styles.secondaryButtonText}>Retake / Choose Another</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#5d5b54',
    marginBottom: 12,
  },
  imageContainer: {
    flex: 1,
    backgroundColor: '#f6f5f4',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e3df',
    overflow: 'hidden',
    marginBottom: 12,
  },
  image: {
    flex: 1,
    width: '100%',
  },
  dimensions: {
    fontSize: 12,
    color: '#787671',
    textAlign: 'center',
    marginBottom: 24,
  },
  actions: {
    gap: 12,
  },
  primaryButton: {
    backgroundColor: '#5645d4',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#c8c4be',
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#1a1a1a',
    fontSize: 16,
    fontWeight: '500',
  },
});
