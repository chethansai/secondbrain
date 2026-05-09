import * as Clipboard from 'expo-clipboard';

export async function copyText(text: string) {
  await Clipboard.setStringAsync(text);
  return true;
}

export async function readText() {
  return Clipboard.getStringAsync();
}