import AsyncStorage from '@react-native-async-storage/async-storage';
import { AiReviewLedger, defaultAiReviewLedger } from '../ai/aiReviewTypes';
import { parseAiReviewLedger } from './aiReviewRepository';

const localAiReviewLedgerKey = 'rnnotetaking.aiReview.ledger.v1';

export async function readLocalAiReviewLedger(): Promise<AiReviewLedger> {
  const raw = await AsyncStorage.getItem(localAiReviewLedgerKey);
  if (!raw) return defaultAiReviewLedger();
  try {
    return parseAiReviewLedger(JSON.parse(raw) as Record<string, unknown>);
  } catch {
    return defaultAiReviewLedger();
  }
}

export async function writeLocalAiReviewLedger(ledger: AiReviewLedger): Promise<void> {
  await AsyncStorage.setItem(localAiReviewLedgerKey, JSON.stringify(ledger));
}
