import React, { useState, useEffect } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { NotesData, CategoryPath } from '../../../shared/types/notes';
import { OcrSourcePicker } from './OcrSourcePicker';
import { OcrImagePreview } from './OcrImagePreview';
import { OcrResultEditor } from './OcrResultEditor';
import { OcrErrorState } from './OcrErrorState';
import { OcrErrorBoundary } from './OcrErrorBoundary';
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
    const debugStatus = `OCR status: ${ocr.status}`;
    const debugImage = `Image: ${ocr.sourceAsset?.uri ? 'selected' : 'none'}`;
    const debugTextLen = `Text length: ${ocr.editableText.length}`;

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

    return (
      <OcrErrorBoundary onReset={ocr.reset}>
        <View style={styles.debugContainer}>
          <Text style={styles.debugText}>{debugStatus}</Text>
          <Text style={styles.debugText}>{debugImage}</Text>
          <Text style={styles.debugText}>{debugTextLen}</Text>
        </View>

        {ocr.status === 'idle' || ocr.status === 'picking' ? (
          <OcrSourcePicker
            onCamera={ocr.startCamera}
            onGallery={ocr.startGallery}
            onDocument={ocr.startDocument}
            onCancel={handleClose}
          />
        ) : null}

        {ocr.status === 'preview' && ocr.sourceAsset ? (
          <View style={styles.content}>
            <Image
              source={{ uri: ocr.sourceAsset.uri }}
              resizeMode="contain"
              style={styles.previewImage}
            />

            <Pressable onPress={ocr.runRecognition} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>Recognize Text</Text>
            </Pressable>

            <Pressable onPress={ocr.reset} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Choose Another Image</Text>
            </Pressable>
          </View>
        ) : null}

        {ocr.status === 'picking' ? (
          <View style={styles.centerContent}>
            <ActivityIndicator />
            <Text style={styles.bodyText}>Opening image picker...</Text>
          </View>
        ) : null}

        {ocr.status === 'preprocessing' ? (
          <View style={styles.centerContent}>
            <ActivityIndicator />
            <Text style={styles.bodyText}>Preparing image...</Text>
          </View>
        ) : null}

        {ocr.status === 'recognizing' ? (
          <View style={styles.centerContent}>
            <ActivityIndicator />
            <Text style={styles.bodyText}>Scanning image...</Text>
          </View>
        ) : null}

        {(ocr.status === 'review' || ocr.status === 'saving') ? (
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
            onCreateCategory={() => setCreateMode('root')}
            onCreateSubcategory={() => setCreateMode('subcategory')}
          />
        ) : null}

        {ocr.status === 'saving' ? (
          <View style={styles.centerContent}>
            <ActivityIndicator />
            <Text style={styles.bodyText}>Saving OCR text...</Text>
          </View>
        ) : null}

        {ocr.status === 'error' ? (
          <View style={styles.centerContent}>
            <Text style={styles.errorTitle}>OCR Error</Text>
            <Text style={styles.errorText}>{(ocr.error as unknown as {message?: string})?.message ?? 'Something went wrong.'}</Text>

            <Pressable onPress={() => ocr.clearError()} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>Try Again</Text>
            </Pressable>

            <Pressable onPress={handleClose} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Close</Text>
            </Pressable>
          </View>
        ) : null}

        {!['idle','picking','preview','preprocessing','recognizing','review','saving','error'].includes(ocr.status) ? (
          <View style={styles.centerContent}>
            <Text style={styles.errorTitle}>Unknown OCR state</Text>
            <Text style={styles.errorText}>Please restart OCR and try again.</Text>

            <Pressable onPress={ocr.reset} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>Reset OCR</Text>
            </Pressable>
          </View>
        ) : null}
      </OcrErrorBoundary>
    );
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
  debugContainer: {
    padding: 8,
    backgroundColor: '#fff3f3',
    borderBottomWidth: 1,
    borderBottomColor: '#e03131',
  },
  debugText: {
    color: '#e03131',
    fontSize: 12,
    marginBottom: 4,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  bodyText: {
    fontSize: 16,
    color: '#5d5b54',
    marginTop: 12,
  },
  previewImage: {
    flex: 1,
    width: '100%',
    marginBottom: 16,
    backgroundColor: '#f6f5f4',
    borderRadius: 12,
  },
  primaryButton: {
    backgroundColor: '#5645d4',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
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
  errorTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#e03131',
    marginBottom: 12,
  },
  errorText: {
    fontSize: 16,
    color: '#5d5b54',
    textAlign: 'center',
    marginBottom: 24,
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
