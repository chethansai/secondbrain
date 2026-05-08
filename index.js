import { registerRootComponent } from 'expo';
import App from './App';
import { defineAiNotificationBackgroundTask } from './src/features/sync/aiNotificationRunner';

defineAiNotificationBackgroundTask();

registerRootComponent(App);