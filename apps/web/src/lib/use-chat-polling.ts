'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { ChatMessage } from '@/lib/api';

interface PollResult {
  messages: ChatMessage[];
  connected: boolean;
}

/**
 * Polls the message history every `interval` ms and returns new messages.
 */
export function useChatPolling(leadId: string, interval = 3_000): PollResult {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const knownIds = useRef(new Set<string>());
  const latestTs = useRef<string | null>(null);

  const poll = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (latestTs.current) params.set('after', latestTs.current);

      const res = await fetch(`/manager/api/messages/${encodeURIComponent(leadId)}?${params}`);
      if (!res.ok) { setConnected(false); return; }

      const data: { messages: ChatMessage[] } = await res.json();
      setConnected(true);

      const fresh = data.messages.filter((m) => !knownIds.current.has(m.id));
      if (fresh.length > 0) {
        for (const m of fresh) knownIds.current.add(m.id);
        // Track the latest timestamp for next poll
        const newest = fresh[fresh.length - 1];
        if (!latestTs.current || new Date(newest.createdAt) > new Date(latestTs.current)) {
          latestTs.current = newest.createdAt;
        }
        setMessages((prev) => [...prev, ...fresh]);
      }
    } catch {
      setConnected(false);
    }
  }, [leadId]);

  useEffect(() => {
    // Reset on leadId change
    knownIds.current = new Set();
    latestTs.current = null;
    setMessages([]);

    // First poll immediately
    poll();
    const id = setInterval(poll, interval);
    return () => clearInterval(id);
  }, [leadId, interval, poll]);

  /** Register IDs that are already known (e.g. initial messages from SSR). */
  const registerKnown = useCallback((msgs: ChatMessage[]) => {
    for (const m of msgs) knownIds.current.add(m.id);
    if (msgs.length > 0) {
      const last = msgs[msgs.length - 1];
      if (!latestTs.current || new Date(last.createdAt) > new Date(latestTs.current)) {
        latestTs.current = last.createdAt;
      }
    }
  }, []);

  return { messages, connected, registerKnown } as PollResult & { registerKnown: (msgs: ChatMessage[]) => void };
}
