import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface OcrErrorStateProps {
  error: { code: string; message: string };
  onRetry: () => void;
  onCancel: () => void;
}

export function OcrErrorState({ error, onRetry, onCancel }: OcrErrorStateProps) {
  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <Text style={styles.icon}>⚠️</Text>
      </View>

      <Text style={styles.title}>OCR Error</Text>

      <Text style={styles.message}>{error.message}</Text>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.secondaryButton} onPress={onCancel}>
          <Text style={styles.secondaryButtonText}>Cancel</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.primaryButton} onPress={onRetry}>
          <Text style={styles.primaryButtonText}>Try Again</Text>
        </TouchableOpacity>
      </View>
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
  iconContainer: {
    marginBottom: 16,
  },
  icon: {
    fontSize: 48,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 12,
  },
  message: {
    fontSize: 16,
    color: '#5d5b54',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  primaryButton: {
    flex: 1,
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
    flex: 1,
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
