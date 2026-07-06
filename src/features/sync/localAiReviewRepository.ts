import AsyncStorage from '@react-native-async-storage/async-storage';
import { AiReviewLedger, defaultAiReviewLedger } from '../ai/aiReviewTypes';
import { parseAiReviewLedger } from './aiReviewRepository';

// Legacy anonymous key — kept for one-time migration reads only
const LEGACY_ANON_AI_REVIEW_LEDGER_KEY = 'rnnotetaking.aiReview.ledger.v1';

function aiReviewLedgerKey(uid: string | null | undefined): string {
  const prefix = uid ? `rnnotetaking.u.${uid}` : 'rnnotetaking.anon';
  return `${prefix}.aiReview.ledger.v1`;
}

export async function readLocalAiReviewLedger(uid?: string | null): Promise<AiReviewLedger> {
  const key = aiReviewLedgerKey(uid);
  let raw = await AsyncStorage.getItem(key);

  // Migrate from the old anonymous key for returning signed-in users
  if (!raw && uid) {
    const legacyRaw = await AsyncStorage.getItem(LEGACY_ANON_AI_REVIEW_LEDGER_KEY);
    if (legacyRaw) {
      raw = legacyRaw;
      // Persist under the scoped key and clean up the legacy one
      await AsyncStorage.setItem(key, legacyRaw);
      AsyncStorage.removeItem(LEGACY_ANON_AI_REVIEW_LEDGER_KEY).catch(() => undefined);
    }
  }

  if (!raw) return defaultAiReviewLedger();
  try {
    return parseAiReviewLedger(JSON.parse(raw) as Record<string, unknown>);
  } catch {
    return defaultAiReviewLedger();
  }
}

export async function writeLocalAiReviewLedger(ledger: AiReviewLedger, uid?: string | null): Promise<void> {
  await AsyncStorage.setItem(aiReviewLedgerKey(uid), JSON.stringify(ledger));
}
