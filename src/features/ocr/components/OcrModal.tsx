import React, { useState, useEffect } from 'react';
import { View, Text, Modal, StyleSheet, TouchableOpacity } from 'react-native';
import type { NotesData, CategoryPath } from '../../../shared/types/notes';
import { OcrSourcePicker } from './OcrSourcePicker';
import { OcrImagePreview } from './OcrImagePreview';
import { OcrResultEditor } from './OcrResultEditor';
import { OcrErrorState } from './OcrErrorState';
import { useOcrFlow } from '../hooks/useOcrFlow';
import { TextPromptModal } from '../../editor/TextPromptModal';
import { CategoryPicker } from '../../categories/CategoryPicker';
import { ModalShell } from '../../../shared/ui/ModalShell';

interface OcrModalProps {
  visible: boolean;
  defaultDestinationPath?: CategoryPath;
  data: NotesData;
  onClose: () => void;
  onSaveText: (text: string, destinationPath: CategoryPath) => Promise<void>;
  onInsertText?: (text: string) => void;
  onCreateRootCategory?: (name: string) => Promise<CategoryPath | null>;
  onCreateSubcategory?: (parentPath: CategoryPath, name: string) => Promise<CategoryPath | null>;
}

export function OcrModal({
  visible,
  defaultDestinationPath,
  data,
  onClose,
  onSaveText,
  onInsertText,
  onCreateRootCategory,
  onCreateSubcategory,
}: OcrModalProps) {
  const ocr = useOcrFlow({
    defaultDestinationPath,
    onSaveText,
    onInsertText,
  });

  const [categoryPickerVisible, setCategoryPickerVisible] = useState(false);
  const [createMode, setCreateMode] = useState<'root' | 'subcategory' | null>(null);

  useEffect(() => {
    if (visible && defaultDestinationPath) {
      ocr.setDestinationPath(defaultDestinationPath);
    }
  }, [visible, defaultDestinationPath]);

  const handleClose = () => {
    ocr.reset();
    setCategoryPickerVisible(false);
    setCreateMode(null);
    onClose();
  };

  const handleChooseCategory = () => {
    setCategoryPickerVisible(true);
  };

  const handleCategorySelected = (path: CategoryPath) => {
    ocr.setDestinationPath(path);
    setCategoryPickerVisible(false);
  };

  const handleCreateRoot = async (name: string) => {
    if (!onCreateRootCategory) return;
    const path = await onCreateRootCategory(name);
    if (path) {
      ocr.setDestinationPath(path);
    }
    setCreateMode(null);
  };

  const handleCreateSubcategory = async (name: string) => {
    if (!onCreateSubcategory) return;
    const parentPath = ocr.destinationPath.length > 0 ? ocr.destinationPath : [];
    const path = await onCreateSubcategory(parentPath, name);
    if (path) {
      ocr.setDestinationPath(path);
    }
    setCreateMode(null);
  };

  const renderContent = () => {
    if (ocr.error) {
      return (
        <OcrErrorState
          error={ocr.error}
          onRetry={() => {
            ocr.clearError();
          }}
          onCancel={handleClose}
        />
      );
    }

    switch (ocr.status) {
      case 'idle':
      case 'picking':
        return (
          <OcrSourcePicker
            onCamera={ocr.startCamera}
            onGallery={ocr.startGallery}
            onDocument={ocr.startDocument}
            onCancel={handleClose}
          />
        );

      case 'preview':
        return ocr.sourceAsset ? (
          <OcrImagePreview
            asset={ocr.sourceAsset}
            onRecognize={ocr.runRecognition}
            onRetake={() => {
              ocr.reset();
            }}
          />
        ) : null;

      case 'preprocessing':
      case 'recognizing':
        return (
          <View style={styles.processingContainer}>
            <Text style={styles.processingText}>
              {ocr.status === 'preprocessing' ? 'Preprocessing image...' : 'Recognizing text...'}
            </Text>
          </View>
        );

      case 'review':
      case 'saving':
        return (
          <OcrResultEditor
            text={ocr.editableText}
            onTextChange={ocr.setEditableText}
            onSave={ocr.saveAsNote}
            onInsert={onInsertText ? ocr.insertIntoEditor : undefined}
            onCopy={ocr.copyText}
            onCancel={handleClose}
            isSaving={ocr.status === 'saving'}
            destinationPath={ocr.destinationPath}
            onChooseDestination={handleChooseCategory}
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

      <TextPromptModal
        visible={createMode !== null}
        title={createMode === 'root' ? 'New root category' : 'New subcategory'}
        label="Category name"
        submitLabel="Create"
        onClose={() => setCreateMode(null)}
        onSubmit={async (name) => {
          if (createMode === 'root') {
            await handleCreateRoot(name);
          } else {
            await handleCreateSubcategory(name);
          }
          return true;
        }}
      />

      <ModalShell
        visible={categoryPickerVisible}
        title="Choose destination category"
        onClose={() => setCategoryPickerVisible(false)}
      >
        <CategoryPicker
          data={data}
          selectedPath={ocr.destinationPath.length > 0 ? ocr.destinationPath : null}
          onSelect={handleCategorySelected}
        />
      </ModalShell>
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
  processingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  processingText: {
    fontSize: 16,
    color: '#5d5b54',
  },
});
