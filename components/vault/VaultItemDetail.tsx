'use client';

import { useState } from 'react';
import type { DecryptedVaultItem, LoginItem, SecureNoteItem, CreditCardItem, IdentityItem } from '@/types/vault';

interface VaultItemDetailProps {
  item: DecryptedVaultItem;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export default function VaultItemDetail({ item, onClose, onEdit, onDelete }: VaultItemDetailProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function copyToClipboard(value: string, field: string) {
    await navigator.clipboard.writeText(value);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  }

  function CopyButton({ value, field }: { value: string; field: string }) {
    if (!value) return null;
    return (
      <button
        onClick={() => copyToClipboard(value, field)}
        className="shrink-0 text-gray-500 hover:text-emerald-400"
        title="Copy"
      >
        {copiedField === field ? (
          <svg className="h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
        ) : (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9.75a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
          </svg>
        )}
      </button>
    );
  }

  function Field({ label, value, secret, mono }: { label: string; value: string; secret?: boolean; mono?: boolean }) {
    if (!value) return null;
    const displayed = secret && !showPassword ? '••••••••••••' : value;

    return (
      <div className="flex items-start justify-between gap-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-gray-500">{label}</p>
          <p className={`mt-0.5 break-all text-sm ${mono ? 'font-mono' : ''} ${secret && !showPassword ? 'text-gray-500' : 'text-white'}`}>
            {displayed}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {secret && (
            <button
              onClick={() => setShowPassword(!showPassword)}
              className="text-gray-500 hover:text-white"
              title={showPassword ? 'Hide' : 'Show'}
            >
              {showPassword ? (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
                </svg>
              ) : (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                </svg>
              )}
            </button>
          )}
          <CopyButton value={value} field={label} />
        </div>
      </div>
    );
  }

  const data = item.data;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-16 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-800 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold">{'name' in data ? data.name : 'Item'}</h2>
            <p className="text-xs text-gray-500">{item.item_type.replace('_', ' ')}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onEdit} className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-800" title="Edit">
              Edit
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-white">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Fields */}
        <div className="divide-y divide-gray-800 px-6">
          {item.item_type === 'login' && (
            <>
              <Field label="Username / Email" value={(data as LoginItem).username} mono />
              <Field label="Password" value={(data as LoginItem).password} secret mono />
              <Field label="URL" value={(data as LoginItem).url} />
              <Field label="Notes" value={(data as LoginItem).notes} />
            </>
          )}

          {item.item_type === 'secure_note' && (
            <div className="py-3">
              <p className="text-xs text-gray-500">Content</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-white">{(data as SecureNoteItem).content}</p>
            </div>
          )}

          {item.item_type === 'credit_card' && (
            <>
              <Field label="Cardholder" value={(data as CreditCardItem).cardholder_name} />
              <Field label="Card Number" value={(data as CreditCardItem).number} secret mono />
              <Field label="Expiry" value={(data as CreditCardItem).expiry} />
              <Field label="CVV" value={(data as CreditCardItem).cvv} secret mono />
              <Field label="Billing Address" value={(data as CreditCardItem).billing_address} />
              <Field label="Notes" value={(data as CreditCardItem).notes} />
            </>
          )}

          {item.item_type === 'identity' && (
            <>
              <Field label="Name" value={`${(data as IdentityItem).first_name} ${(data as IdentityItem).last_name}`.trim()} />
              <Field label="Email" value={(data as IdentityItem).email} />
              <Field label="Phone" value={(data as IdentityItem).phone} />
              <Field label="Address" value={[
                (data as IdentityItem).address_line1,
                (data as IdentityItem).address_line2,
                [(data as IdentityItem).city, (data as IdentityItem).state, (data as IdentityItem).zip].filter(Boolean).join(', '),
                (data as IdentityItem).country,
              ].filter(Boolean).join('\n')} />
              <Field label="Notes" value={(data as IdentityItem).notes} />
            </>
          )}
        </div>

        {/* Delete section */}
        <div className="border-t border-gray-800 px-6 py-4">
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="text-sm text-red-400 hover:text-red-300"
            >
              Delete this item
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <p className="text-sm text-red-400">Are you sure?</p>
              <button
                onClick={onDelete}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
              >
                Yes, Delete
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-800"
              >
                Cancel
              </button>
            </div>
          )}
          <p className="mt-1 text-xs text-gray-600">
            Updated {new Date(item.updated_at).toLocaleDateString()}
          </p>
        </div>
      </div>
    </div>
  );
}
