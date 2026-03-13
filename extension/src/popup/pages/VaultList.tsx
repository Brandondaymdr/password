import { useState, useEffect } from 'react';
import type { DecryptedVaultItem, LoginItem } from '../../shared/types';
import SearchBar from '../components/SearchBar';
import VaultItemCard from '../components/VaultItemCard';

interface VaultListProps {
  onSelectItem: (id: string) => void;
  onLock: () => void;
  onGenerator: () => void;
}

export default function VaultList({ onSelectItem, onLock, onGenerator }: VaultListProps) {
  const [items, setItems] = useState<DecryptedVaultItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentUrl, setCurrentUrl] = useState('');

  useEffect(() => {
    // Get current tab URL
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const url = tabs[0]?.url || '';
      setCurrentUrl(url);
      loadItems(url);
    });
  }, []);

  function loadItems(url: string) {
    setLoading(true);
    // First get URL-matched credentials, then all items
    chrome.runtime.sendMessage(
      { type: 'GET_CREDENTIALS', payload: { url } },
      (credResponse) => {
        const matchedIds = new Set(
          (credResponse?.items || []).map((i: DecryptedVaultItem) => i.id)
        );

        chrome.runtime.sendMessage(
          { type: 'SEARCH_VAULT', payload: { query: '' } },
          (allResponse) => {
            setLoading(false);
            const allItems = allResponse?.items || [];
            // Sort: URL-matched items first, then favorites, then alphabetical
            allItems.sort((a: DecryptedVaultItem, b: DecryptedVaultItem) => {
              const aMatched = matchedIds.has(a.id) ? 0 : 1;
              const bMatched = matchedIds.has(b.id) ? 0 : 1;
              if (aMatched !== bMatched) return aMatched - bMatched;
              if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
              const aName = (a.data as LoginItem).name || '';
              const bName = (b.data as LoginItem).name || '';
              return aName.localeCompare(bName);
            });
            setItems(allItems);
          }
        );
      }
    );
  }

  function handleSearch(query: string) {
    setSearchQuery(query);
    if (!query.trim()) {
      loadItems(currentUrl);
      return;
    }
    setLoading(true);
    chrome.runtime.sendMessage(
      { type: 'SEARCH_VAULT', payload: { query } },
      (response) => {
        setLoading(false);
        setItems(response?.items || []);
      }
    );
  }

  // Client-side filter for instant feedback
  const filteredItems = searchQuery.trim()
    ? items
    : items.filter((item) => {
        if (!searchQuery) return true;
        const name = ((item.data as LoginItem).name || '').toLowerCase();
        const username = ((item.data as LoginItem).username || '').toLowerCase();
        const q = searchQuery.toLowerCase();
        return name.includes(q) || username.includes(q);
      });

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-deep-ocean/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <svg width="20" height="20" viewBox="0 0 28 28" fill="none">
            <circle cx="14" cy="14" r="12" fill="#1b4965" />
            <rect x="10" y="13" width="8" height="7" rx="1" fill="#5fa8a0" />
            <path d="M11.5 13V10.5a2.5 2.5 0 015 0V13" stroke="#fcfbf8" strokeWidth="1.5" fill="none" />
          </svg>
          <h1 className="text-sm font-semibold text-deep-ocean">Vault</h1>
          <span className="rounded-sm bg-deep-ocean/8 px-1.5 py-0.5 text-[10px] text-deep-ocean/60">
            {items.length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {/* Generator button */}
          <button
            onClick={onGenerator}
            className="rounded-sm p-1.5 text-deep-ocean/40 hover:bg-deep-ocean/5 hover:text-deep-ocean/70"
            title="Password Generator"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
          </button>
          {/* Lock button */}
          <button
            onClick={onLock}
            className="rounded-sm p-1.5 text-deep-ocean/40 hover:bg-deep-ocean/5 hover:text-coral"
            title="Lock Vault"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-4 py-2">
        <SearchBar value={searchQuery} onChange={handleSearch} />
      </div>

      {/* Item List */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-seafoam border-t-transparent" />
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-xs text-deep-ocean/40">
              {searchQuery ? 'No items match your search' : 'No items in vault'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {filteredItems.map((item) => (
              <VaultItemCard
                key={item.id}
                item={item}
                onClick={() => onSelectItem(item.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
