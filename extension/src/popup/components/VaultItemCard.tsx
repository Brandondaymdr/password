import type { DecryptedVaultItem, LoginItem } from '../../shared/types';

interface VaultItemCardProps {
  item: DecryptedVaultItem;
  onClick: () => void;
}

const typeIcons: Record<string, string> = {
  login: '🔑',
  secure_note: '📝',
  credit_card: '💳',
  identity: '👤',
};

export default function VaultItemCard({ item, onClick }: VaultItemCardProps) {
  const data = item.data as LoginItem;
  const name = data.name || 'Untitled';
  const subtitle =
    item.item_type === 'login'
      ? data.username || data.url || ''
      : item.item_type === 'credit_card'
        ? '•••• ' + ((item.data as { number?: string }).number || '').slice(-4)
        : '';

  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-sm px-3 py-2.5 text-left transition-colors hover:bg-deep-ocean/5"
    >
      <span className="text-base">{typeIcons[item.item_type] || '📄'}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-deep-ocean">{name}</p>
        {subtitle && (
          <p className="truncate text-[10px] text-deep-ocean/45">{subtitle}</p>
        )}
      </div>
      {item.favorite && <span className="text-xs text-amber-500">★</span>}
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="flex-shrink-0 text-deep-ocean/20"
      >
        <path d="M9 18l6-6-6-6" />
      </svg>
    </button>
  );
}
