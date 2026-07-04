import type { Track } from "@/api/types";

/**
 * Per-parameter VK Mix buffers.
 *
 * VK's mix endpoint returns tracks for a given mood/familiarity/language combo.
 * We keep a separate buffer for every combo so that:
 *  - switching parameters never serves tracks fetched for a *different* combo;
 *  - re-selecting a combo we already fetched serves instantly from memory
 *    without hitting VK again.
 *
 * The store is module-scoped, so buffers survive route remounts and live for the
 * whole app session (until restart).
 */
export interface MixBucket {
  /** Surplus tracks fetched ahead of playback, kept until app restart. */
  buffer: Track[];
  /** Every track id ever fetched for this combo — used to dedupe. */
  seenIds: Set<number>;
}

const buckets = new Map<string, MixBucket>();

export function mixKey(mood: string, familiarity: string, language: string): string {
  return `${mood}|${familiarity}|${language}`;
}

/** Returns the buffer for a parameter combo, creating it on first use. */
export function getMixBucket(mood: string, familiarity: string, language: string): MixBucket {
  const key = mixKey(mood, familiarity, language);
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { buffer: [], seenIds: new Set<number>() };
    buckets.set(key, bucket);
  }
  return bucket;
}
