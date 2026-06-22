import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface OcrSourcePickerProps {
  onCamera: () => void;
  onGallery: () => void;
  onDocument: () => void;
  onCancel: () => void;
}

export function OcrSourcePicker({
  onCamera,
  onGallery,
  onDocument,
  onCancel,
}: OcrSourcePickerProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.description}>
        Take a photo or choose an image to extract text.
      </Text>

      <View style={styles.buttonGroup}>
        <TouchableOpacity style={styles.primaryButton} onPress={onCamera}>
          <Text style={styles.primaryButtonText}>Take Photo</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryButton} onPress={onGallery}>
          <Text style={styles.secondaryButtonText}>Choose Image</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryButton} onPress={onDocument}>
          <Text style={styles.secondaryButtonText}>Choose File</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
        <Text style={styles.cancelText}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  description: {
    fontSize: 16,
    color: '#5d5b54',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  buttonGroup: {
    width: '100%',
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
  cancelButton: {
    marginTop: 24,
  },
  cancelText: {
    color: '#787671',
    fontSize: 16,
  },
});
