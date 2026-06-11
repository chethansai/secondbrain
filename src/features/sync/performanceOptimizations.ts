/**
 * Performance optimization utilities for startup
 * Centralizes lazy loading, memoization helpers, and deferred initialization
 */

// Lazy loading flags to prevent duplicate imports
let aiModuleLoaded = false;
let voiceModuleLoaded = false;

/**
 * Deferred initialization helper - runs after next tick
 */
export function deferInitialization(fn: () => void): void {
  setTimeout(fn, 0);
}

/**
 * Batch multiple AsyncStorage operations to reduce I/O overhead
 */
export async function batchAsyncStorageReads<T extends Record<string, () => Promise<any>>>(
  operations: T
): Promise<{ [K in keyof T]: Awaited<ReturnType<T[K]>> }> {
  const keys = Object.keys(operations) as (keyof T)[];
  const promises = keys.map(key => operations[key]());
  const results = await Promise.all(promises);

  const resultObj = {} as { [K in keyof T]: Awaited<ReturnType<T[K]>> };
  keys.forEach((key, index) => {
    resultObj[key] = results[index];
  });

  return resultObj;
}

/**
 * Memoization cache for category tree computations
 */
const categoryTreeCache = new Map<string, any>();
const CATEGORY_TREE_CACHE_TTL = 5000; // 5 seconds

export function getCachedCategoryTree<T>(key: string, computeFn: () => T): T {
  const cached = categoryTreeCache.get(key);
  if (cached && Date.now() - cached.timestamp < CATEGORY_TREE_CACHE_TTL) {
    return cached.value;
  }

  const value = computeFn();
  categoryTreeCache.set(key, { value, timestamp: Date.now() });
  return value;
}

export function invalidateCategoryTreeCache(): void {
  categoryTreeCache.clear();
}

/**
 * Memoization cache for workspace filtering
 */
const workspaceFilterCache = new Map<string, any>();
const WORKSPACE_FILTER_CACHE_TTL = 3000; // 3 seconds

export function getCachedWorkspaceFilter<T>(key: string, computeFn: () => T): T {
  const cached = workspaceFilterCache.get(key);
  if (cached && Date.now() - cached.timestamp < WORKSPACE_FILTER_CACHE_TTL) {
    return cached.value;
  }

  const value = computeFn();
  workspaceFilterCache.set(key, { value, timestamp: Date.now() });
  return value;
}

export function invalidateWorkspaceFilterCache(): void {
  workspaceFilterCache.clear();
}

/**
 * Track AI module loading to prevent duplicate imports
 */
export function markAiModuleLoaded(): void {
  aiModuleLoaded = true;
}

export function isAiModuleLoaded(): boolean {
  return aiModuleLoaded;
}

/**
 * Track Voice module loading to prevent duplicate imports
 */
export function markVoiceModuleLoaded(): void {
  voiceModuleLoaded = true;
}

export function isVoiceModuleLoaded(): boolean {
  return voiceModuleLoaded;
}

/**
 * Performance timing helper
 */
export class PerfTimer {
  private startTime: number;
  private label: string;

  constructor(label: string) {
    this.label = label;
    this.startTime = Date.now();
    console.log(`[PERF] ${label} started`);
  }

  end(): number {
    const duration = Date.now() - this.startTime;
    console.log(`[PERF] ${this.label} completed in ${duration}ms`);
    return duration;
  }
}
