'use client';

import { useState, useRef, useEffect, useCallback, type FormEvent } from 'react';
import Link from 'next/link';
import type { AdminLead, ChatMessage } from '@/lib/api';
import { useChatPolling } from '@/lib/use-chat-polling';
import { sendMessageAction, toggleAiAction } from '@/lib/actions';

function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

interface ChatViewProps {
  lead: AdminLead;
  initialMessages: ChatMessage[];
  aiEnabled: boolean;
}

export function ChatView({ lead, initialMessages, aiEnabled: initialAi }: ChatViewProps) {
  const [allMessages, setAllMessages] = useState<ChatMessage[]>(initialMessages);
  const [aiOn, setAiOn] = useState(initialAi);
  const [sending, setSending] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);

  const polling = useChatPolling(lead.id, 3_000) as ReturnType<typeof useChatPolling> & {
    registerKnown: (msgs: ChatMessage[]) => void;
  };

  // Register initial messages so polling skips them
  useEffect(() => {
    if (!initializedRef.current && initialMessages.length > 0) {
      polling.registerKnown(initialMessages);
      initializedRef.current = true;
    }
  }, [initialMessages, polling]);

  // Merge polled messages into local state
  useEffect(() => {
    if (polling.messages.length === 0) return;
    setAllMessages((prev) => {
      const ids = new Set(prev.map((m) => m.id));
      const newMsgs = polling.messages.filter((m) => !ids.has(m.id));
      return newMsgs.length > 0 ? [...prev, ...newMsgs] : prev;
    });
  }, [polling.messages]);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [allMessages]);

  const handleSend = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const text = input.trim();
      if (!text || sending) return;

      setSending(true);
      setInput('');

      // Optimistic: add message immediately
      const optimisticMsg: ChatMessage = {
        id: `opt-${Date.now()}`,
        direction: 'OUTBOUND',
        messageType: 'text',
        content: text,
        createdAt: new Date().toISOString(),
      };
      setAllMessages((prev) => [...prev, optimisticMsg]);

      try {
        await sendMessageAction(lead.id, text);
      } catch {
        // Remove optimistic message on error, restore input
        setAllMessages((prev) => prev.filter((m) => m.id !== optimisticMsg.id));
        setInput(text);
      } finally {
        setSending(false);
      }
    },
    [input, sending, lead.id],
  );

  const handleToggleAi = useCallback(async () => {
    setToggling(true);
    try {
      const result = await toggleAiAction(lead.id, !aiOn);
      setAiOn(result.aiEnabled);
    } catch { /* keep current state */ }
    setToggling(false);
  }, [aiOn, lead.id]);

  return (
    <div className="flex flex-col h-[calc(100vh-2rem)] max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--border)] pb-3 mb-2 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Link
            href={`/clients/${lead.id}`}
            className="text-sm text-[var(--primary)] hover:underline"
          >
            ← Voltar
          </Link>
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold"
            style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
          >
            {(lead.name ?? lead.phone).charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 className="font-semibold text-sm">{lead.name ?? 'Sem nome'}</h2>
            <p className="text-xs text-[var(--muted-foreground)]">{lead.phone}</p>
          </div>
          {/* Connection indicator */}
          <span
            className="w-2 h-2 rounded-full ml-1"
            style={{ background: polling.connected ? 'var(--success)' : 'var(--error)' }}
            title={polling.connected ? 'Conectado' : 'Desconectado'}
          />
        </div>

        {/* AI toggle */}
        <button
          onClick={handleToggleAi}
          disabled={toggling}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50"
          style={{
            borderColor: aiOn ? 'var(--success)' : 'var(--error)',
            color: aiOn ? 'var(--success)' : 'var(--error)',
          }}
        >
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: aiOn ? 'var(--success)' : 'var(--error)' }}
          />
          IA {aiOn ? 'Ligada' : 'Desligada'}
        </button>
      </div>

      {/* Messages */}
      <div ref={containerRef} className="flex-1 overflow-y-auto space-y-2 py-2 px-1">
        {allMessages.length === 0 && (
          <p className="text-center text-[var(--muted-foreground)] py-12 text-sm">
            Nenhuma mensagem ainda.
          </p>
        )}
        {allMessages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="flex gap-2 pt-2 pb-1 border-t border-[var(--border)] flex-shrink-0">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Enviar mensagem..."
          className="flex-1 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
        />
        <button
          type="submit"
          disabled={!input.trim() || sending}
          className="px-4 py-2 rounded-lg text-sm font-medium transition-opacity disabled:opacity-40"
          style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
        >
          {sending ? '...' : 'Enviar'}
        </button>
      </form>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isOutbound = message.direction === 'OUTBOUND';

  return (
    <div className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
      <div
        className="max-w-[75%] rounded-xl px-3 py-2 text-sm"
        style={{
          background: isOutbound ? '#dcf8c6' : 'var(--muted)',
          color: isOutbound ? '#111' : 'var(--foreground)',
        }}
      >
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
        <p
          className="text-[10px] mt-1 text-right opacity-60"
          style={{ color: isOutbound ? '#555' : 'var(--muted-foreground)' }}
        >
          {fmtTime(message.createdAt)}
        </p>
      </div>
    </div>
  );
}
