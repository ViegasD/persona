/**
 * Module-level upload queue that survives Next.js client-side navigation.
 * The JS runtime persists across <Link> navigations, so this singleton
 * keeps processing even when the user leaves the template page.
 */

import { uploadTemplatesAction } from '@/lib/template-actions';
import type { AdminTemplate } from '@/lib/templates-api';

export interface QueueItem {
  id: string;
  slug: string;
  filename: string;
  base64: string;
  mimeType: string;
  status: 'pending' | 'uploading' | 'done' | 'error';
  result?: AdminTemplate;
  error?: string;
}

type Listener = () => void;

let queue: QueueItem[] = [];
let processing = false;
const listeners = new Set<Listener>();
const snapshotCache = new Map<string | undefined, QueueItem[]>();

function notify() {
  snapshotCache.clear();
  listeners.forEach((fn) => fn());
}

async function processQueue() {
  if (processing) return;
  processing = true;

  while (true) {
    const item = queue.find((q) => q.status === 'pending');
    if (!item) break;

    item.status = 'uploading';
    notify();

    try {
      const result = await uploadTemplatesAction(item.slug, [
        { base64: item.base64, filename: item.filename, mimeType: item.mimeType },
      ]);
      item.status = 'done';
      item.result = result.templates[0];
      // Free memory — base64 data is no longer needed
      item.base64 = '';
    } catch (err) {
      item.status = 'error';
      item.error = err instanceof Error ? err.message : String(err);
      // Free memory even on error
      item.base64 = '';
    }

    notify();
  }

  processing = false;
}

/** Add files to the upload queue and start processing */
export function enqueueUploads(
  slug: string,
  files: Array<{ base64: string; filename: string; mimeType: string }>,
) {
  const items: QueueItem[] = files.map((f) => ({
    id: crypto.randomUUID(),
    slug,
    filename: f.filename,
    base64: f.base64,
    mimeType: f.mimeType,
    status: 'pending',
  }));

  queue = [...queue, ...items];
  notify();
  processQueue();
  return items.map((i) => i.id);
}

/** Get current queue state for a specific slug (or all) */
export function getQueue(slug?: string): QueueItem[] {
  const cached = snapshotCache.get(slug);
  if (cached) return cached;
  const result = slug ? queue.filter((q) => q.slug === slug) : [...queue];
  snapshotCache.set(slug, result);
  return result;
}

/** Remove completed/errored items for a slug */
export function clearDone(slug?: string) {
  queue = queue.filter((q) => {
    if (slug && q.slug !== slug) return true;
    return q.status !== 'done' && q.status !== 'error';
  });
  notify();
}

/** Subscribe to queue changes. Returns unsubscribe function. */
export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
