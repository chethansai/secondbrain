import { NativeModules, Platform } from 'react-native';

export type OverlayAction = 'none' | 'openTextInput' | 'openApp' | 'openAppAssistant' | 'hideOverlay';

export type FloatingOverlaySettings = {
  opacity: number;
  size: number;
  tapAction: OverlayAction;
  swipeLeftAction: OverlayAction;
  swipeDownAction: OverlayAction;
};

export type FloatingOverlayNativeSettings = FloatingOverlaySettings & {
  permissionGranted: boolean;
};

const defaultSettings: FloatingOverlaySettings = {
  opacity: 0.86,
  size: 58,
  tapAction: 'openTextInput',
  swipeLeftAction: 'openTextInput',
  swipeDownAction: 'hideOverlay',
};

type OverlayNativeModule = {
  isOverlayPermissionGranted: () => Promise<boolean>;
  requestOverlayPermission: () => Promise<boolean>;
  startOverlay: () => Promise<boolean>;
  stopOverlay: () => Promise<boolean>;
  updateOverlaySettings: (settings: Partial<FloatingOverlaySettings>) => Promise<boolean>;
  resetOverlayPlacement: () => Promise<boolean>;
  readOverlaySettings: () => Promise<FloatingOverlayNativeSettings>;
  startTeleprompter: (text: string, durationMs: number, speed: number, textSize: number) => Promise<boolean>;
  stopTeleprompter: () => Promise<boolean>;
  readTeleprompterState: () => Promise<TeleprompterState>;
  updateTeleprompterSettings: (settings: any) => Promise<boolean>;
};

const overlayModule = NativeModules.OverlayModule as OverlayNativeModule | undefined;

export const overlayActionLabels: Record<OverlayAction, string> = {
  none: 'Do nothing',
  openTextInput: 'Open text input',
  openApp: 'Open app',
  openAppAssistant: 'Open categories',
  hideOverlay: 'Hide overlay',
};

export const overlayTapActions: OverlayAction[] = ['openTextInput', 'openApp', 'openAppAssistant', 'none'];

export const overlayActions = Object.keys(overlayActionLabels) as OverlayAction[];

export function isFloatingOverlayAvailable() {
  return Platform.OS === 'android' && Boolean(overlayModule);
}

export async function readFloatingOverlaySettings(): Promise<FloatingOverlayNativeSettings> {
  if (!isFloatingOverlayAvailable() || !overlayModule) return { ...defaultSettings, permissionGranted: false };
  const settings = await overlayModule.readOverlaySettings();
  return normalizeNativeSettings(settings);
}

export async function requestFloatingOverlayPermission() {
  if (!isFloatingOverlayAvailable() || !overlayModule) return false;
  return overlayModule.requestOverlayPermission();
}

export async function refreshFloatingOverlayPermission() {
  if (!isFloatingOverlayAvailable() || !overlayModule) return false;
  return overlayModule.isOverlayPermissionGranted();
}

export async function startFloatingOverlay() {
  if (!isFloatingOverlayAvailable() || !overlayModule) return false;
  return overlayModule.startOverlay();
}

export async function stopFloatingOverlay() {
  if (!isFloatingOverlayAvailable() || !overlayModule) return false;
  return overlayModule.stopOverlay();
}

export async function updateFloatingOverlaySettings(settings: Partial<FloatingOverlaySettings>) {
  if (!isFloatingOverlayAvailable() || !overlayModule) return false;
  return overlayModule.updateOverlaySettings(normalizeSettings(settings));
}

export async function resetFloatingOverlayPlacement() {
  if (!isFloatingOverlayAvailable() || !overlayModule) return false;
  return overlayModule.resetOverlayPlacement();
}

function normalizeNativeSettings(settings: Partial<FloatingOverlayNativeSettings>): FloatingOverlayNativeSettings {
  return {
    ...defaultSettings,
    ...normalizeSettings(settings),
    permissionGranted: Boolean(settings.permissionGranted),
  };
}

function normalizeSettings(settings: Partial<FloatingOverlaySettings>): Partial<FloatingOverlaySettings> {
  const next: Partial<FloatingOverlaySettings> = {};
  if (typeof settings.opacity === 'number') next.opacity = Math.max(0.25, Math.min(1, settings.opacity));
  if (typeof settings.size === 'number') next.size = Math.max(42, Math.min(86, settings.size));
  if (settings.tapAction) next.tapAction = normalizeAction(settings.tapAction);
  if (settings.swipeLeftAction) next.swipeLeftAction = normalizeAction(settings.swipeLeftAction);
  if (settings.swipeDownAction) next.swipeDownAction = normalizeAction(settings.swipeDownAction);
  return next;
}

function normalizeAction(action: string): OverlayAction {
  return overlayActions.includes(action as OverlayAction) ? action as OverlayAction : 'none';
}

export type TeleprompterDuration = '1s' | '5s' | '10s' | '30s' | '1m' | '5m' | '10m' | '30m' | '1h' | '2h' | '4h' | '8h' | '12h' | '24h' | 'unlimited';

export type TeleprompterState = {
  isRunning: boolean;
  text: string;
  speed: number;
  textSize: number;
  durationMs: number;
  remaining: string;
  permissionGranted: boolean;
};

export const durationOptions: Array<{label: string; value: number}> = [
  { label: '1 Second', value: 1000 },
  { label: '5 Seconds', value: 5000 },
  { label: '10 Seconds', value: 10000 },
  { label: '30 Seconds', value: 30000 },
  { label: '1 Minute', value: 60000 },
  { label: '5 Minutes', value: 300000 },
  { label: '10 Minutes', value: 600000 },
  { label: '30 Minutes', value: 1800000 },
  { label: '1 Hour', value: 3600000 },
  { label: '2 Hours', value: 7200000 },
  { label: '4 Hours', value: 14400000 },
  { label: '8 Hours', value: 28800000 },
  { label: '12 Hours', value: 43200000 },
  { label: '24 Hours', value: 86400000 },
  { label: 'Unlimited', value: -1 },
];

export async function startTeleprompter(text: string, durationMs: number, speed = 34, textSize = 14): Promise<boolean> {
  if (!isFloatingOverlayAvailable() || !overlayModule) return false;
  try {
    return await overlayModule.startTeleprompter(text, durationMs, speed, textSize);
  } catch {
    return false;
  }
}

export async function stopTeleprompter(): Promise<boolean> {
  if (!isFloatingOverlayAvailable() || !overlayModule) return false;
  try {
    return await overlayModule.stopTeleprompter();
  } catch {
    return false;
  }
}

export async function readTeleprompterState(): Promise<TeleprompterState> {
  if (!isFloatingOverlayAvailable() || !overlayModule) {
    return { isRunning: false, text: '', speed: 34, textSize: 14, durationMs: -1, remaining: '00:00:00', permissionGranted: false };
  }
  try {
    return await overlayModule.readTeleprompterState();
  } catch {
    return { isRunning: false, text: '', speed: 34, textSize: 14, durationMs: -1, remaining: '00:00:00', permissionGranted: false };
  }
}

export async function updateTeleprompterSettings(settings: {speed?: number; textSize?: number; durationMs?: number}): Promise<boolean> {
  if (!isFloatingOverlayAvailable() || !overlayModule) return false;
  try {
    return await overlayModule.updateTeleprompterSettings(settings);
  } catch {
    return false;
  }
}
