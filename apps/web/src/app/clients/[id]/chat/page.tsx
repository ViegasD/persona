import { fetchLead, fetchMessages } from '@/lib/api';
import { ChatView } from './chat-view';

interface ChatPageProps {
  params: Promise<{ id: string }>;
}

export default async function ChatPage({ params }: ChatPageProps) {
  const { id } = await params;

  try {
    const [lead, { messages }] = await Promise.all([
      fetchLead(id),
      fetchMessages(id, 100),
    ]);

    const session = lead.sessions[0];

    return (
      <div className="-mx-4 -my-6">
        <ChatView
          lead={lead}
          initialMessages={messages}
          aiEnabled={session?.aiEnabled ?? true}
        />
      </div>
    );
  } catch {
    return (
      <div className="text-center py-20">
        <p className="text-[var(--error)] text-lg font-medium">Erro ao carregar chat</p>
        <p className="text-[var(--muted-foreground)] mt-2">
          O cliente pode não existir ou o backend está indisponível.
        </p>
      </div>
    );
  }
}
