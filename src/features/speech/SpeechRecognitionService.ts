import { Platform } from 'react-native';
import assistantBridge from '../assistant/assistantBridge';

type SpeechRecognitionCallbacks = {
  onPartialTranscript?: (transcript: string) => void;
  onFinalTranscript?: (transcript: string) => void;
  onError?: (message: string) => void;
};

type Subscription = { remove: () => void };

let webRecognition: any = null;
let nativeSubscriptions: Subscription[] = [];

export const SpeechRecognitionService = {
  async startListening(callbacks: SpeechRecognitionCallbacks) {
    await stopListening();

    if (Platform.OS === 'web') {
      startWebListening(callbacks);
      return;
    }

    if (!assistantBridge.isSpeechRecognitionAvailable()) {
      callbacks.onError?.('Speech recognition is not available on this device.');
      return;
    }

    nativeSubscriptions = [
      assistantBridge.onSpeechEvent('AssistantSpeechPartial', (text) => callbacks.onPartialTranscript?.(text)),
      assistantBridge.onSpeechEvent('AssistantSpeechResult', (text) => callbacks.onFinalTranscript?.(text)),
      assistantBridge.onSpeechEvent('AssistantSpeechError', (text) => callbacks.onError?.(formatNativeSpeechError(text))),
    ];
    await assistantBridge.startListening();
  },

  async stopListening() {
    await stopListening();
  },
};

async function stopListening() {
  stopWebListening();
  nativeSubscriptions.forEach((subscription) => subscription.remove());
  nativeSubscriptions = [];
  await assistantBridge.stopListening().catch(() => undefined);
}

function startWebListening(callbacks: SpeechRecognitionCallbacks) {
  const SpeechRecognition = (globalThis as any).SpeechRecognition ?? (globalThis as any).webkitSpeechRecognition;
  if (!SpeechRecognition) {
    callbacks.onError?.('Speech recognition is not available in this browser.');
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = 'en-US';
  recognition.onresult = (event: any) => {
    let partialText = '';
    let finalText = '';
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      const transcript = result?.[0]?.transcript?.trim();
      if (!transcript) continue;
      if (result.isFinal) finalText = `${finalText} ${transcript}`.trim();
      else partialText = `${partialText} ${transcript}`.trim();
    }
    if (partialText) callbacks.onPartialTranscript?.(partialText);
    if (finalText) callbacks.onFinalTranscript?.(finalText);
  };
  recognition.onerror = (event: any) => {
    callbacks.onError?.(typeof event?.error === 'string' ? event.error : 'Speech recognition failed.');
  };
  recognition.onend = () => {
    webRecognition = null;
  };
  webRecognition = recognition;
  recognition.start();
}

function stopWebListening() {
  if (!webRecognition) return;
  const recognition = webRecognition;
  webRecognition = null;
  recognition.onresult = null;
  recognition.onerror = null;
  recognition.onend = null;
  try {
    recognition.stop();
  } catch {
    try {
      recognition.abort();
    } catch {
    }
  }
}

function formatNativeSpeechError(code: string) {
  const labels: Record<string, string> = {
    '1': 'Network timeout while listening.',
    '2': 'Network error while listening.',
    '3': 'Audio recording error.',
    '4': 'Speech server error.',
    '5': 'Speech recognition client error.',
    '6': 'No speech input was heard.',
    '7': 'No matching speech result.',
    '8': 'Speech recognizer is busy.',
    '9': 'Microphone permission is required.',
  };
  return labels[code] ?? 'Speech recognition failed.';
}

export default SpeechRecognitionService;
