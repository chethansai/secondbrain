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
