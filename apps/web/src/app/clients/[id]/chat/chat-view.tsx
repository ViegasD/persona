'use client';

import {
  useState, useRef, useEffect, useCallback, useMemo,
  type FormEvent, type KeyboardEvent,
} from 'react';
import Link from 'next/link';
import type { AdminLead, ChatMessage } from '@/lib/api';
import { useChatPolling } from '@/lib/use-chat-polling';
import { sendMessageAction, toggleAiAction } from '@/lib/actions';

/* ── helpers ────────────────────────────────────────────── */

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'Hoje';
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

function sameGroup(a: ChatMessage, b: ChatMessage) {
  if (a.direction !== b.direction) return false;
  const ta = new Date(a.createdAt);
  const tb = new Date(b.createdAt);
  return (
    ta.getFullYear() === tb.getFullYear() &&
    ta.getMonth() === tb.getMonth() &&
    ta.getDate() === tb.getDate() &&
    ta.getHours() === tb.getHours() &&
    ta.getMinutes() === tb.getMinutes()
  );
}

function sameDay(a: string, b: string) {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

/** Check if the scroll container is near the bottom (within threshold px). */
function isNearBottom(el: HTMLElement, threshold = 150) {
  return el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
}

/* ── types ──────────────────────────────────────────────── */

interface ChatViewProps {
  lead: AdminLead;
  initialMessages: ChatMessage[];
  aiEnabled: boolean;
}

/* ── main component ─────────────────────────────────────── */

export function ChatView({ lead, initialMessages, aiEnabled: initialAi }: ChatViewProps) {
  const [allMessages, setAllMessages] = useState<ChatMessage[]>(initialMessages);
  const [aiOn, setAiOn] = useState(initialAi);
  const [sending, setSending] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const initializedRef = useRef(false);

  // Scroll tracking — like Chatwoot's hasUserScrolled / isProgrammaticScroll
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [unseenCount, setUnseenCount] = useState(0);
  const programmaticScrollRef = useRef(false);
  const prevMsgCountRef = useRef(allMessages.length);

  const polling = useChatPolling(lead.id, 3_000) as ReturnType<typeof useChatPolling> & {
    registerKnown: (msgs: ChatMessage[]) => void;
  };

  useEffect(() => {
    if (!initializedRef.current && initialMessages.length > 0) {
      polling.registerKnown(initialMessages);
      initializedRef.current = true;
    }
  }, [initialMessages, polling]);

  // Merge polled messages
  useEffect(() => {
    if (polling.messages.length === 0) return;
    setAllMessages((prev) => {
      const ids = new Set(prev.map((m) => m.id));
      const newMsgs = polling.messages.filter((m) => !ids.has(m.id));
      return newMsgs.length > 0 ? [...prev, ...newMsgs] : prev;
    });
  }, [polling.messages]);

  // Smart scroll: auto-scroll only when user is already at bottom
  useEffect(() => {
    const newCount = allMessages.length;
    const added = newCount - prevMsgCountRef.current;
    prevMsgCountRef.current = newCount;

    if (added <= 0) return;

    if (isAtBottom) {
      programmaticScrollRef.current = true;
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    } else {
      // User scrolled up — show unseen badge instead of forcing scroll
      setUnseenCount((c) => c + added);
    }
  }, [allMessages, isAtBottom]);

  // Initial scroll to bottom on mount
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'auto' });
  }, []);

  // Track scroll position
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    if (programmaticScrollRef.current) {
      programmaticScrollRef.current = false;
      setIsAtBottom(true);
      return;
    }

    const atBottom = isNearBottom(el);
    setIsAtBottom(atBottom);

    // If user scrolled back to bottom, clear unseen badge
    if (atBottom) setUnseenCount(0);
  }, []);

  // Jump-to-bottom handler
  const scrollToBottom = useCallback(() => {
    programmaticScrollRef.current = true;
    setUnseenCount(0);
    setIsAtBottom(true);
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  /* Precompute grouping flags */
  const groupFlags = useMemo(() => {
    return allMessages.map((msg, i) => {
      const next = allMessages[i + 1];
      const prev = allMessages[i - 1];
      return {
        isFirstOfGroup: !prev || !sameGroup(prev, msg),
        isLastOfGroup: !next || !sameGroup(msg, next),
        showDateSep: !prev || !sameDay(prev.createdAt, msg.createdAt),
      };
    });
  }, [allMessages]);

  // Auto-resize textarea
  const resizeTextarea = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, []);

  useEffect(() => { resizeTextarea(); }, [input, resizeTextarea]);

  const doSend = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;

    setSending(true);
    setInput('');

    const optimisticMsg: ChatMessage = {
      id: `opt-${Date.now()}`,
      direction: 'OUTBOUND',
      messageType: 'text',
      content: text,
      createdAt: new Date().toISOString(),
    };
    setAllMessages((prev) => [...prev, optimisticMsg]);

    // Always scroll to bottom after sending own message
    programmaticScrollRef.current = true;
    setIsAtBottom(true);
    setUnseenCount(0);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);

    try {
      await sendMessageAction(lead.id, text);
    } catch {
      setAllMessages((prev) => prev.filter((m) => m.id !== optimisticMsg.id));
      setInput(text);
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  }, [input, sending, lead.id]);

  const handleSubmit = useCallback((e: FormEvent) => {
    e.preventDefault();
    doSend();
  }, [doSend]);

  // Enter sends, Shift+Enter inserts newline
  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      doSend();
    }
  }, [doSend]);

  const handleToggleAi = useCallback(async () => {
    setToggling(true);
    try {
      const result = await toggleAiAction(lead.id, !aiOn);
      setAiOn(result.aiEnabled);
    } catch { /* keep */ }
    setToggling(false);
  }, [aiOn, lead.id]);

  const initial = (lead.name ?? lead.phone).charAt(0).toUpperCase();

  return (
    <div className="flex flex-col h-[calc(100dvh-49px)] max-w-3xl mx-auto overflow-hidden">
      {/* ── Header ── */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] flex-shrink-0 bg-[var(--background)]">
        <div className="flex items-center gap-3">
          <Link
            href={`/clients/${lead.id}`}
            className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-[var(--muted)] transition-colors text-[var(--muted-foreground)]"
            title="Voltar"
          >
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
          </Link>
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold"
            style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
          >
            {initial}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-sm truncate">{lead.name ?? 'Sem nome'}</h2>
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: polling.connected ? 'var(--success)' : 'var(--error)' }}
                title={polling.connected ? 'Conectado' : 'Desconectado'}
              />
            </div>
            <p className="text-xs text-[var(--muted-foreground)] truncate">{lead.phone}</p>
          </div>
        </div>

        <button
          onClick={handleToggleAi}
          disabled={toggling}
          className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors disabled:opacity-50"
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
      </header>

      {/* ── Message list ── */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-4 bg-[var(--muted)] relative"
      >
        {allMessages.length === 0 && (
          <p className="text-center text-[var(--muted-foreground)] py-20 text-sm">
            Nenhuma mensagem ainda.
          </p>
        )}

        {allMessages.map((msg, i) => {
          const flags = groupFlags[i];
          return (
            <div key={msg.id}>
              {flags.showDateSep && (
                <div className="flex justify-center my-4">
                  <span className="text-[11px] font-medium text-[var(--muted-foreground)] bg-[var(--background)] shadow-sm rounded-full px-3 py-1">
                    {fmtDate(msg.createdAt)}
                  </span>
                </div>
              )}
              <MessageBubble
                message={msg}
                isFirstOfGroup={flags.isFirstOfGroup}
                isLastOfGroup={flags.isLastOfGroup}
                leadInitial={initial}
              />
            </div>
          );
        })}

        <div ref={bottomRef} />
      </div>

      {/* ── Scroll-to-bottom / unseen messages button ── */}
      {!isAtBottom && (
        <div className="relative">
          <button
            onClick={scrollToBottom}
            className="absolute -top-12 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1.5 rounded-full shadow-lg text-xs font-medium transition-all z-10"
            style={{ background: 'var(--background)', color: 'var(--foreground)', border: '1px solid var(--border)' }}
          >
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3"/></svg>
            {unseenCount > 0 && (
              <span
                className="flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[10px] font-bold px-1"
                style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
              >
                {unseenCount > 99 ? '99+' : unseenCount}
              </span>
            )}
          </button>
        </div>
      )}

      {/* ── Reply box ── */}
      <form
        onSubmit={handleSubmit}
        className="flex items-end gap-2 px-4 py-3 border-t border-[var(--border)] bg-[var(--background)] flex-shrink-0"
      >
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Digite uma mensagem..."
          rows={1}
          className="flex-1 px-4 py-2.5 rounded-2xl border border-[var(--border)] bg-[var(--muted)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent placeholder:text-[var(--muted-foreground)] resize-none leading-normal"
          style={{ maxHeight: 160 }}
        />
        <button
          type="submit"
          disabled={!input.trim() || sending}
          className="flex items-center justify-center w-10 h-10 rounded-full transition-opacity disabled:opacity-30 flex-shrink-0"
          style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
          title="Enviar"
        >
          {sending ? (
            <span className="text-sm">…</span>
          ) : (
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M22 2L11 13"/><path strokeLinecap="round" strokeLinejoin="round" d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>
          )}
        </button>
      </form>
    </div>
  );
}

/* ── Message bubble ─────────────────────────────────────── */

interface BubbleProps {
  message: ChatMessage;
  isFirstOfGroup: boolean;
  isLastOfGroup: boolean;
  leadInitial: string;
}

function MessageBubble({ message, isFirstOfGroup, isLastOfGroup, leadInitial }: BubbleProps) {
  const isOutbound = message.direction === 'OUTBOUND';

  const meta = (message.metadata ?? {}) as Record<string, unknown>;
  const s3Key = meta.s3Key as string | undefined;
  const generatedImages = meta.generatedImages as string[] | undefined;
  const referenceImages = meta.referenceImages as string[] | undefined;
  const hasImage = message.messageType === 'image' && !!s3Key;
  const hasGeneratedGrid = Array.isArray(generatedImages) && generatedImages.length > 0;
  const hasComparison = hasGeneratedGrid && Array.isArray(referenceImages) && referenceImages.length > 0;

  // Chatwoot-style radius: rounded-xl base, smaller corner on the speaker's side
  const radiusClass = isOutbound
    ? `rounded-xl ${isLastOfGroup ? 'rounded-br-sm' : ''} ${!isFirstOfGroup ? 'rounded-tr-sm' : ''}`
    : `rounded-xl ${isLastOfGroup ? 'rounded-bl-sm' : ''} ${!isFirstOfGroup ? 'rounded-tl-sm' : ''}`;

  const spacingClass = isLastOfGroup ? 'mb-3' : 'mb-0.5';

  return (
    <div className={`flex items-end gap-2 ${isOutbound ? 'justify-end' : 'justify-start'} ${spacingClass}`}>
      {/* Avatar — inbound, only on last of group */}
      {!isOutbound && (
        <div className={`w-6 h-6 flex-shrink-0 ${isLastOfGroup ? '' : 'invisible'}`}>
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold"
            style={{ background: 'var(--border)', color: 'var(--muted-foreground)' }}
          >
            {leadInitial}
          </div>
        </div>
      )}

      <div
        className={`text-sm ${radiusClass} overflow-hidden`}
        style={{
          background: isOutbound ? 'var(--primary)' : 'var(--background)',
          color: isOutbound ? 'var(--primary-foreground)' : 'var(--foreground)',
          boxShadow: '0 1px 2px rgba(0,0,0,.06)',
          ...(hasImage || hasGeneratedGrid ? { padding: 0 } : { padding: '10px 16px' }),
          ...(hasComparison ? { maxWidth: '95%' } : { maxWidth: '32rem' }),
        }}
      >
        {/* Single inbound image */}
        {hasImage && (
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/manager/api/images/${s3Key}`}
              alt="Foto enviada"
              className="block w-full max-w-[280px] rounded-t-xl"
              loading="lazy"
            />
            {message.content && message.content !== '[image]' && (
              <p className="px-4 py-2 whitespace-pre-wrap break-words leading-relaxed">{message.content}</p>
            )}
          </div>
        )}

        {/* Generated images with reference comparison */}
        {hasGeneratedGrid && (
          <div>
            {hasComparison && (
              <div className="p-2 pb-1">
                <p className="text-[11px] font-medium mb-1.5 px-1" style={{ opacity: 0.7 }}>Fotos enviadas</p>
                <div className="flex gap-1 overflow-x-auto">
                  {referenceImages!.map((key) => (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      key={key}
                      src={`/manager/api/images/${key}`}
                      alt="Foto de referência"
                      className="flex-shrink-0 w-20 h-20 object-cover rounded-md"
                      loading="lazy"
                    />
                  ))}
                </div>
              </div>
            )}
            <div className="p-2 pt-1">
              {hasComparison && (
                <p className="text-[11px] font-medium mb-1.5 px-1" style={{ opacity: 0.7 }}>Fotos geradas</p>
              )}
              <div className={`grid gap-1 ${generatedImages!.length <= 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                {generatedImages!.map((key) => (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    key={key}
                    src={`/manager/api/images/${key}`}
                    alt="Foto gerada"
                    className="block w-full aspect-[3/4] object-cover rounded-md"
                    loading="lazy"
                  />
                ))}
              </div>
            </div>
            {message.content && (
              <p className="px-4 py-2 whitespace-pre-wrap break-words leading-relaxed">{message.content}</p>
            )}
          </div>
        )}

        {/* Plain text */}
        {!hasImage && !hasGeneratedGrid && (
          <p className="whitespace-pre-wrap break-words leading-relaxed">{message.content}</p>
        )}

        {isLastOfGroup && (
          <p
            className={`text-[10px] text-right ${hasImage || hasGeneratedGrid ? 'px-3 pb-2' : 'mt-1'}`}
            style={{ opacity: 0.55 }}
          >
            {fmtTime(message.createdAt)}
          </p>
        )}
      </div>

      {/* Avatar — outbound, only on last of group */}
      {isOutbound && (
        <div className={`w-6 h-6 flex-shrink-0 ${isLastOfGroup ? '' : 'invisible'}`}>
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold"
            style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
          >
            A
          </div>
        </div>
      )}
    </div>
  );
}
