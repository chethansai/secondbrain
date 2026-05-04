import { Platform } from 'react-native';

export async function copyText(text: string) {
	if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
		await navigator.clipboard.writeText(text);
		return true;
	}

	return false;
}