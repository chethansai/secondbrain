import React, { useState } from 'react';
import { View, Text, Modal, StyleSheet, TouchableOpacity } from 'react-native';
import type { NotesData } from '../../../shared/types/notes';
import type { OcrFlowStatus, OcrImageAsset, OcrResult } from '../types';
import { OcrSourcePicker } from './OcrSourcePicker';
import { OcrImagePreview } from './OcrImagePreview';
import { OcrResultEditor } from './OcrResultEditor';
import { OcrErrorState } from './OcrErrorState';

interface OcrModalProps {
  visible: boolean;
  defaultDestinationPath?: string[];
  data: NotesData;
  onClose: () => void;
  onSaveText: (text: string, destinationPath: string[]) => Promise<void>;
  onInsertText?: (text: string) => void;
}

export function OcrModal({
  visible,
  defaultDestinationPath,
  data,
  onClose,
  onSaveText,
  onInsertText,
}: OcrModalProps) {
  const [status, setStatus] = useState<OcrFlowStatus>('idle');
  const [sourceAsset, setSourceAsset] = useState<OcrImageAsset | null>(null);
  const [result, setResult] = useState<OcrResult | null>(null);
  const [editableText, setEditableText] = useState('');
  const [destinationPath, setDestinationPath] = useState<string[]>(
    defaultDestinationPath ?? []
  );
  const [error, setError] = useState<{ code: string; message: string } | null>(null);

  const handleClose = () => {
    resetState();
    onClose();
  };

  const resetState = () => {
    setStatus('idle');
    setSourceAsset(null);
    setResult(null);
    setEditableText('');
    setDestinationPath(defaultDestinationPath ?? []);
    setError(null);
  };

  const renderContent = () => {
    if (error) {
      return (
        <OcrErrorState
          error={error}
          onRetry={() => {
            setError(null);
            setStatus('idle');
          }}
          onCancel={handleClose}
        />
      );
    }

    switch (status) {
      case 'idle':
      case 'picking':
        return (
          <OcrSourcePicker
            onCamera={async () => {}}
            onGallery={async () => {}}
            onDocument={async () => {}}
            onCancel={handleClose}
          />
        );

      case 'preview':
        return sourceAsset ? (
          <OcrImagePreview
            asset={sourceAsset}
            onRecognize={async () => {}}
            onRetake={() => {
              setStatus('idle');
              setSourceAsset(null);
            }}
          />
        ) : null;

      case 'review':
      case 'saving':
        return (
          <OcrResultEditor
            text={editableText}
            onTextChange={setEditableText}
            onSave={async () => {}}
            onInsert={onInsertText ? () => {} : undefined}
            onCopy={() => {}}
            onCancel={handleClose}
            isSaving={status === 'saving'}
          />
        );

      default:
        return null;
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={handleClose}
      transparent={false}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Scan text</Text>
          <TouchableOpacity onPress={handleClose}>
            <Text style={styles.closeButton}>Close</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.content}>{renderContent()}</View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e3df',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  closeButton: {
    fontSize: 16,
    color: '#5645d4',
  },
  content: {
    flex: 1,
    padding: 16,
  },
});
