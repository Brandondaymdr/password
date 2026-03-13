import { useState, useEffect } from 'react';
import type { DecryptedVaultItem, LoginItem, SecureNoteItem, CreditCardItem, IdentityItem } from '../../shared/types';

interface ItemDetailProps {
  itemId: string;
  onBack: () => void;
}

export default function ItemDetail({ itemId, onBack }: ItemDetailProps) {
  const [item, setItem] = useState<DecryptedVaultItem | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [filling, setFilling] = useState(false);

  useEffect(() => {
    // Find the item from cached search results
    chrome.runtime.sendMessage(
      { type: 'SEARCH_VAULT', payload: { query: '' } },
      (response) => {
        const found = (response?.items || []).find(
          (i: DecryptedVaultItem) => i.id === itemId
        );
        setItem(found || null);
      }
    );
  }, [itemId]);

  async function copyToClipboard(text: string, fieldName: string) {
    await navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  }

  function handleAutofill() {
    if (!item || item.item_type !== 'login') return;
    setFilling(true);
    const login = item.data as LoginItem;

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      if (!tabId) {
        setFilling(false);
        return;
      }

      chrome.tabs.sendMessage(
        tabId,
        {
          type: 'AUTOFILL',
          payload: { username: login.username, password: login.password },
        },
        () => {
          setFilling(false);
          // Close popup after fill
          window.close();
        }
      );
    });
  }

  if (!item) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-seafoam border-t-transparent" />
      </div>
    );
  }

  const typeIcons: Record<string, string> = {
    login: '🔑',
    secure_note: '📝',
    credit_card: '💳',
    identity: '👤',
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-deep-ocean/10 px-4 py-3">
        <button
          onClick={onBack}
          className="rounded-sm p-1 text-deep-ocean/50 hover:bg-deep-ocean/5 hover:text-deep-ocean"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <span className="text-lg">{typeIcons[item.item_type]}</span>
        <h2 className="flex-1 truncate text-sm font-semibold text-deep-ocean">
          {(item.data as LoginItem).name || 'Untitled'}
        </h2>
        {item.favorite && <span className="text-sm text-amber-500">★</span>}
      </div>

      {/* Fields */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex flex-col gap-3">
          {item.item_type === 'login' && renderLoginFields(item.data as LoginItem)}
          {item.item_type === 'secure_note' && renderNoteFields(item.data as SecureNoteItem)}
          {item.item_type === 'credit_card' && renderCardFields(item.data as CreditCardItem)}
          {item.item_type === 'identity' && renderIdentityFields(item.data as IdentityItem)}
        </div>
      </div>

      {/* Autofill button for login items */}
      {item.item_type === 'login' && (
        <div className="border-t border-deep-ocean/10 p-4">
          <button
            onClick={handleAutofill}
            disabled={filling}
            className="w-full rounded-sm bg-seafoam py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#4d8f87] disabled:opacity-50"
          >
            {filling ? 'Filling...' : 'Autofill on Page'}
          </button>
        </div>
      )}
    </div>
  );

  function renderField(label: string, value: string, isSecret = false) {
    if (!value) return null;
    const displayValue = isSecret && !showPassword ? '••••••••••••' : value;

    return (
      <div className="rounded-sm border border-deep-ocean/8 bg-white p-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-medium uppercase tracking-wider text-deep-ocean/40">
            {label}
          </span>
          <div className="flex items-center gap-1">
            {isSecret && (
              <button
                onClick={() => setShowPassword(!showPassword)}
                className="rounded p-0.5 text-deep-ocean/30 hover:text-deep-ocean/60"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  {showPassword ? (
                    <>
                      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
                      <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </>
                  ) : (
                    <>
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </>
                  )}
                </svg>
              </button>
            )}
            <button
              onClick={() => copyToClipboard(value, label)}
              className="rounded p-0.5 text-deep-ocean/30 hover:text-seafoam"
            >
              {copiedField === label ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5fa8a0" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" />
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                </svg>
              )}
            </button>
          </div>
        </div>
        <p className="mt-1 break-all font-mono text-xs text-deep-ocean">{displayValue}</p>
      </div>
    );
  }

  function renderLoginFields(data: LoginItem) {
    return (
      <>
        {renderField('Username', data.username)}
        {renderField('Password', data.password, true)}
        {renderField('URL', data.url)}
        {data.notes && renderField('Notes', data.notes)}
      </>
    );
  }

  function renderNoteFields(data: SecureNoteItem) {
    return <>{renderField('Content', data.content)}</>;
  }

  function renderCardFields(data: CreditCardItem) {
    return (
      <>
        {renderField('Cardholder', data.cardholder_name)}
        {renderField('Number', data.number, true)}
        {renderField('Expiry', data.expiry)}
        {renderField('CVV', data.cvv, true)}
        {data.notes && renderField('Notes', data.notes)}
      </>
    );
  }

  function renderIdentityFields(data: IdentityItem) {
    return (
      <>
        {renderField('Name', `${data.first_name} ${data.last_name}`)}
        {renderField('Email', data.email)}
        {renderField('Phone', data.phone)}
        {data.address_line1 && renderField('Address', `${data.address_line1}${data.address_line2 ? ', ' + data.address_line2 : ''}`)}
        {data.city && renderField('City/State', `${data.city}, ${data.state} ${data.zip}`)}
      </>
    );
  }
}
