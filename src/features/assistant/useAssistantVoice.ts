import { useEffect, useState } from 'react';
import assistantBridge from './assistantBridge';

type VoiceListener = {
  onResult?: (text: string) => void;
  onPartial?: (text: string) => void;
  onError?: (message: string) => void;
};

export function useAssistantVoice(listener: VoiceListener = {}) {
  const [isListening, setIsListening] = useState(false);

  useEffect(() => {
    const resultSub = assistantBridge.onSpeechEvent('AssistantSpeechResult', (text) => listener.onResult?.(text));
    const partialSub = assistantBridge.onSpeechEvent('AssistantSpeechPartial', (text) => listener.onPartial?.(text));
    const errorSub = assistantBridge.onSpeechEvent('AssistantSpeechError', (text) => listener.onError?.(text));
    return () => {
      resultSub.remove();
      partialSub.remove();
      errorSub.remove();
    };
  }, [listener.onError, listener.onPartial, listener.onResult]);

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
