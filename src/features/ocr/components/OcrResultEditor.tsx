import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';

interface OcrResultEditorProps {
  text: string;
  onTextChange: (text: string) => void;
  onSave: () => void;
  onInsert?: () => void;
  onCopy: () => void;
  onCancel: () => void;
  isSaving: boolean;
}

export function OcrResultEditor({
  text,
  onTextChange,
  onSave,
  onInsert,
  onCopy,
  onCancel,
  isSaving,
}: OcrResultEditorProps) {
  const isEmpty = text.trim().length === 0;
  const charCount = text.length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.label}>Extracted Text</Text>
        <Text style={styles.charCount}>{charCount} chars</Text>
      </View>

      <TextInput
        style={styles.textInput}
        value={text}
        onChangeText={onTextChange}
        multiline
        placeholder="OCR result will appear here..."
        placeholderTextColor="#787671"
        editable={!isSaving}
      />

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.secondaryButton, styles.flexButton]}
          onPress={onCopy}
          disabled={isEmpty || isSaving}
        >
          <Text style={styles.secondaryButtonText}>Copy</Text>
        </TouchableOpacity>

        {onInsert && (
          <TouchableOpacity
            style={[styles.secondaryButton, styles.flexButton]}
            onPress={onInsert}
            disabled={isEmpty || isSaving}
          >
            <Text style={styles.secondaryButtonText}>Insert into Editor</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[
            styles.primaryButton,
            styles.flexButton,
            (isEmpty || isSaving) && styles.disabledButton,
          ]}
          onPress={onSave}
          disabled={isEmpty || isSaving}
        >
          {isSaving ? (
            <ActivityIndicator color="#ffffff" size="small" />
          ) : (
            <Text style={styles.primaryButtonText}>Save to Notes</Text>
          )}
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.cancelButton} onPress={onCancel} disabled={isSaving}>
        <Text style={styles.cancelText}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#5d5b54',
  },
  charCount: {
    fontSize: 12,
    color: '#787671',
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#c8c4be',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#1a1a1a',
    textAlignVertical: 'top',
    backgroundColor: '#ffffff',
    minHeight: 200,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  flexButton: {
    flex: 1,
  },
  primaryButton: {
    backgroundColor: '#5645d4',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#c8c4be',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  secondaryButtonText: {
    color: '#1a1a1a',
    fontSize: 14,
    fontWeight: '500',
  },
  disabledButton: {
    opacity: 0.5,
  },
  cancelButton: {
    marginTop: 16,
    alignItems: 'center',
  },
  cancelText: {
    color: '#787671',
    fontSize: 16,
  },
});
