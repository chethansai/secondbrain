import { NativeModules } from 'react-native';

const { AssistantModule } = (NativeModules as any) || {};

export const assistantBridge = {
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
};

export default assistantBridge;
