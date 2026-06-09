import { NativeEventEmitter, NativeModules } from 'react-native';

const { AssistantModule } = (NativeModules as any) || {};
const assistantEvents = AssistantModule ? new NativeEventEmitter(AssistantModule) : null;
type SpeechEventName = 'AssistantSpeechResult' | 'AssistantSpeechPartial' | 'AssistantSpeechError';

export const assistantBridge = {
  isSpeechRecognitionAvailable: () => Boolean(AssistantModule?.startListening),
  launchAssistant: async () => {
    if (AssistantModule && AssistantModule.launchAssistant) {
      return AssistantModule.launchAssistant();
    }
    return Promise.resolve();
  },
  startListening: async () => {
    if (AssistantModule && AssistantModule.startListening) {
      return AssistantModule.startListening();
    }
    return Promise.resolve();
  },
  stopListening: async () => {
    if (AssistantModule && AssistantModule.stopListening) {
      return AssistantModule.stopListening();
    }
    return Promise.resolve();
  },
  onSpeechEvent: (eventName: SpeechEventName, listener: (text: string) => void) => {
    if (!assistantEvents) return { remove: () => undefined };
    return assistantEvents.addListener(eventName, listener);
  },
};

export default assistantBridge;
