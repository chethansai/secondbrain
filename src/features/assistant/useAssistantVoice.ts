import { useState } from 'react';
import assistantBridge from './assistantBridge';

export function useAssistantVoice() {
  const [isListening, setIsListening] = useState(false);

  const start = async () => {
    setIsListening(true);
    try {
      await assistantBridge.startListening();
    } catch (e) {
      setIsListening(false);
      throw e;
    }
  };

  const stop = async () => {
    try {
      await assistantBridge.stopListening();
    } finally {
      setIsListening(false);
    }
  };

  return { isListening, start, stop } as const;
}

export default useAssistantVoice;
