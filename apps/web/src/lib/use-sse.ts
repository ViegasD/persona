'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

export interface ChatMessage {
  id: string;
  leadId: string;
  direction: 'INBOUND' | 'OUTBOUND';
  content: string;
  messageType: string;
  createdAt: string;
}

interface SSEHookResult {
  messages: ChatMessage[];
  aiToggled: { leadId: string; enabled: boolean } | null;
  connected: boolean;
}

/**
 * Hook for Server-Sent Events from the admin backend.
 * @param leadId – subscribe to per-lead messages (optional)
 */
export function useSSE(leadId?: string): SSEHookResult {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [aiToggled, setAiToggled] = useState<{ leadId: string; enabled: boolean } | null>(null);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  const addMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => {
      // Deduplicate by id
      if (prev.some((m) => m.id === msg.id)) return prev;
      return [...prev, msg];
    });
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (leadId) params.set('leadId', leadId);

    const url = `/manager/api/events${params.toString() ? `?${params}` : ''}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    es.addEventListener('message', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.event === 'ai:toggled') {
          setAiToggled({ leadId: data.leadId, enabled: data.enabled });
        } else if (data.direction) {
          addMessage(data as ChatMessage);
        }
      } catch { /* ignore parse errors */ }
    });

    es.addEventListener('lead:updated', () => {
      // We can use this to refresh the lead list (Phase 4)
    });

    return () => {
      es.close();
      esRef.current = null;
      setConnected(false);
    };
  }, [leadId, addMessage]);

  return { messages, aiToggled, connected };
}
