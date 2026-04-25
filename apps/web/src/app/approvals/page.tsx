import { fetchPendingApprovals } from '@/lib/storefront-api';
import { ApprovalCard } from '@/components/approval-card';

export default async function ApprovalsPage() {
  let items;
  try {
    items = await fetchPendingApprovals();
  } catch {
    return (
      <div className="text-center py-20">
        <p className="text-[var(--error)] text-lg font-medium">Erro ao carregar aprovações</p>
        <p className="text-[var(--muted-foreground)] mt-2">
          Verifique se STOREFRONT_API_URL e STOREFRONT_ADMIN_KEY estão configurados.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold">Fila de Aprovação</h2>
          <p className="text-sm text-[var(--muted-foreground)] mt-1">
            {items.length === 0
              ? 'Nenhum item aguardando aprovação.'
              : `${items.length} ${items.length === 1 ? 'item aguardando' : 'itens aguardando'} aprovação.`}
          </p>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-16 text-[var(--muted-foreground)]">
          <p className="text-4xl mb-4">✅</p>
          <p>Tudo aprovado!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {items.map((item) => (
            <ApprovalCard key={item.item_id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
