import { registerRootComponent } from 'expo';
import App from './App';
import { defineAiNotificationBackgroundTask, defineAiNotificationHeadlessTask } from './src/features/sync/aiNotificationRunner';

defineAiNotificationBackgroundTask();
defineAiNotificationHeadlessTask();

registerRootComponent(App);