import { useEffect } from 'react';
import { BackHandler, Platform } from 'react-native';

type UseWorkspaceBackHandlerOptions = {
  tab: string;
  pathLength: number;
  promptOpen: boolean;
  editorOpen: boolean;
  moveOpen: boolean;
  deleteOpen: boolean;
  onClosePrompt: () => void;
  onCloseEditor: () => void;
  onCloseMove: () => void;
  onCloseDelete: () => void;
  onBackToWorkspace: () => void;
  onBackPath: () => void;
};

export function useWorkspaceBackHandler({
  tab,
  pathLength,
  promptOpen,
  editorOpen,
  moveOpen,
  deleteOpen,
  onClosePrompt,
  onCloseEditor,
  onCloseMove,
  onCloseDelete,
  onBackToWorkspace,
  onBackPath,
}: UseWorkspaceBackHandlerOptions) {
  useEffect(() => {
    if (Platform.OS === 'web') return undefined;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (deleteOpen) {
        onCloseDelete();
        return true;
      }
      if (moveOpen) {
        onCloseMove();
        return true;
      }
      if (editorOpen) {
        onCloseEditor();
        return true;
      }
      if (promptOpen) {
        onClosePrompt();
        return true;
      }
      if (tab !== 'workspace') {
        onBackToWorkspace();
        return true;
      }
      if (pathLength > 0) {
        onBackPath();
        return true;
      }
      return false;
    });

    return () => subscription.remove();
  }, [deleteOpen, editorOpen, moveOpen, onBackPath, onBackToWorkspace, onCloseDelete, onCloseEditor, onCloseMove, onClosePrompt, pathLength, promptOpen, tab]);
}