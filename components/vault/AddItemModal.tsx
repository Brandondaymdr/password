'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase';
import { encryptItem, generateSearchIndex } from '@/lib/crypto';
import { VaultSession } from '@/lib/vault-session';
import PasswordGenerator from './PasswordGenerator';
import type {
  VaultItemType,
  LoginItem,
  SecureNoteItem,
  CreditCardItem,
  IdentityItem,
} from '@/types/vault';

interface AddItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  editItem?: {
    id: string;
    item_type: VaultItemType;
    data: LoginItem | SecureNoteItem | CreditCardItem | IdentityItem;
    favorite: boolean;
  } | null;
}

export default function AddItemModal({ isOpen, onClose, onSaved, editItem }: AddItemModalProps) {
  const isEditing = !!editItem;
  const [itemType, setItemType] = useState<VaultItemType>(editItem?.item_type || 'login');
  const [favorite, setFavorite] = useState(editItem?.favorite || false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showGenerator, setShowGenerator] = useState(false);

  // Login fields
  const [loginName, setLoginName] = useState((editItem?.data as LoginItem)?.name || '');
  const [loginUsername, setLoginUsername] = useState((editItem?.data as LoginItem)?.username || '');
  const [loginPassword, setLoginPassword] = useState((editItem?.data as LoginItem)?.password || '');
  const [loginUrl, setLoginUrl] = useState((editItem?.data as LoginItem)?.url || '');
  const [loginNotes, setLoginNotes] = useState((editItem?.data as LoginItem)?.notes || '');

  // Secure note fields
  const [noteName, setNoteName] = useState((editItem?.data as SecureNoteItem)?.name || '');
  const [noteContent, setNoteContent] = useState((editItem?.data as SecureNoteItem)?.content || '');

  // Credit card fields
  const [cardName, setCardName] = useState((editItem?.data as CreditCardItem)?.name || '');
  const [cardHolder, setCardHolder] = useState((editItem?.data as CreditCardItem)?.cardholder_name || '');
  const [cardNumber, setCardNumber] = useState((editItem?.data as CreditCardItem)?.number || '');
  const [cardExpiry, setCardExpiry] = useState((editItem?.data as CreditCardItem)?.expiry || '');
  const [cardCvv, setCardCvv] = useState((editItem?.data as CreditCardItem)?.cvv || '');
  const [cardBilling, setCardBilling] = useState((editItem?.data as CreditCardItem)?.billing_address || '');
  const [cardNotes, setCardNotes] = useState((editItem?.data as CreditCardItem)?.notes || '');

  // Identity fields
  const [idName, setIdName] = useState((editItem?.data as IdentityItem)?.name || '');
  const [idFirst, setIdFirst] = useState((editItem?.data as IdentityItem)?.first_name || '');
  const [idLast, setIdLast] = useState((editItem?.data as IdentityItem)?.last_name || '');
  const [idEmail, setIdEmail] = useState((editItem?.data as IdentityItem)?.email || '');
  const [idPhone, setIdPhone] = useState((editItem?.data as IdentityItem)?.phone || '');
  const [idAddr1, setIdAddr1] = useState((editItem?.data as IdentityItem)?.address_line1 || '');
  const [idAddr2, setIdAddr2] = useState((editItem?.data as IdentityItem)?.address_line2 || '');
  const [idCity, setIdCity] = useState((editItem?.data as IdentityItem)?.city || '');
  const [idState, setIdState] = useState((editItem?.data as IdentityItem)?.state || '');
  const [idZip, setIdZip] = useState((editItem?.data as IdentityItem)?.zip || '');
  const [idCountry, setIdCountry] = useState((editItem?.data as IdentityItem)?.country || '');
  const [idNotes, setIdNotes] = useState((editItem?.data as IdentityItem)?.notes || '');

  const supabase = createClient();

  function buildItemData(): { data: object; name: string } {
    switch (itemType) {
      case 'login':
        return {
          data: { name: loginName, username: loginUsername, password: loginPassword, url: loginUrl, notes: loginNotes },
          name: loginName,
        };
      case 'secure_note':
        return {
          data: { name: noteName, content: noteContent },
          name: noteName,
        };
      case 'credit_card':
        return {
          data: { name: cardName, cardholder_name: cardHolder, number: cardNumber, expiry: cardExpiry, cvv: cardCvv, billing_address: cardBilling, notes: cardNotes },
          name: cardName,
        };
      case 'identity':
        return {
          data: { name: idName, first_name: idFirst, last_name: idLast, email: idEmail, phone: idPhone, address_line1: idAddr1, address_line2: idAddr2, city: idCity, state: idState, zip: idZip, country: idCountry, notes: idNotes },
          name: idName,
        };
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);

    try {
      const vaultKey = VaultSession.get();
      if (!vaultKey) {
        setError('Vault is locked. Please unlock first.');
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError('Not authenticated');
        return;
      }

      const { data: itemData, name } = buildItemData();

      if (!name.trim()) {
        setError('Name is required');
        setSaving(false);
        return;
      }

      // Encrypt the item data
      const { encrypted, iv } = await encryptItem(itemData, vaultKey);

      // Generate searchable HMAC index from the name
      const searchIndex = await generateSearchIndex(name, vaultKey);

      if (isEditing && editItem) {
        // Update existing item
        const { error: updateError } = await supabase
          .from('vault_items')
          .update({
            item_type: itemType,
            encrypted_data: encrypted,
            iv,
            search_index: searchIndex,
            favorite,
          })
          .eq('id', editItem.id);

        if (updateError) throw updateError;

        // Audit log
        await supabase.from('vault_audit_log').insert({
          user_id: user.id,
          action: 'edit',
          item_id: editItem.id,
        });
      } else {
        // Create new item
        const { data: newItem, error: insertError } = await supabase
          .from('vault_items')
          .insert({
            user_id: user.id,
            item_type: itemType,
            encrypted_data: encrypted,
            iv,
            search_index: searchIndex,
            favorite,
          })
          .select('id')
          .single();

        if (insertError) throw insertError;

        // Audit log
        await supabase.from('vault_audit_log').insert({
          user_id: user.id,
          action: 'create',
          item_id: newItem?.id,
        });
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save item');
    } finally {
      setSaving(false);
    }
  }

  if (!isOpen) return null;

  const inputClass = 'block w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500';
  const labelClass = 'block text-sm font-medium text-gray-400 mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-16 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-800 px-6 py-4">
          <h2 className="text-lg font-semibold">{isEditing ? 'Edit Item' : 'Add New Item'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSave} className="px-6 py-4">
          {error && (
            <div className="mb-4 rounded-lg border border-red-800 bg-red-900/30 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          {/* Item type selector (only when creating) */}
          {!isEditing && (
            <div className="mb-4">
              <label className={labelClass}>Type</label>
              <div className="grid grid-cols-4 gap-2">
                {([
                  { type: 'login' as const, label: 'Login', icon: '🔑' },
                  { type: 'secure_note' as const, label: 'Note', icon: '📝' },
                  { type: 'credit_card' as const, label: 'Card', icon: '💳' },
                  { type: 'identity' as const, label: 'Identity', icon: '👤' },
                ]).map(({ type, label, icon }) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setItemType(type)}
                    className={`rounded-lg border px-3 py-2 text-center text-sm transition-colors ${
                      itemType === type
                        ? 'border-emerald-500 bg-emerald-900/30 text-emerald-300'
                        : 'border-gray-700 text-gray-400 hover:border-gray-600'
                    }`}
                  >
                    <span className="block text-lg">{icon}</span>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Favorite toggle */}
          <label className="mb-4 flex items-center gap-2 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={favorite}
              onChange={(e) => setFavorite(e.target.checked)}
              className="rounded border-gray-600 bg-gray-700 text-yellow-500 focus:ring-yellow-500"
            />
            Mark as favorite
          </label>

          {/* === LOGIN FORM === */}
          {itemType === 'login' && (
            <div className="space-y-3">
              <div>
                <label className={labelClass}>Name *</label>
                <input type="text" value={loginName} onChange={(e) => setLoginName(e.target.value)} className={inputClass} placeholder="e.g. Google, Netflix" required />
              </div>
              <div>
                <label className={labelClass}>Username / Email</label>
                <input type="text" value={loginUsername} onChange={(e) => setLoginUsername(e.target.value)} className={inputClass} placeholder="user@example.com" />
              </div>
              <div>
                <label className={labelClass}>Password</label>
                <div className="flex gap-2">
                  <input type="text" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} className={`${inputClass} flex-1 font-mono`} placeholder="••••••••" />
                  <button
                    type="button"
                    onClick={() => setShowGenerator(!showGenerator)}
                    className="shrink-0 rounded-lg border border-gray-600 px-3 text-sm text-gray-400 transition-colors hover:bg-gray-700 hover:text-white"
                  >
                    Generate
                  </button>
                </div>
                {showGenerator && (
                  <div className="mt-2">
                    <PasswordGenerator onSelect={(pw) => { setLoginPassword(pw); setShowGenerator(false); }} />
                  </div>
                )}
              </div>
              <div>
                <label className={labelClass}>URL</label>
                <input type="url" value={loginUrl} onChange={(e) => setLoginUrl(e.target.value)} className={inputClass} placeholder="https://example.com" />
              </div>
              <div>
                <label className={labelClass}>Notes</label>
                <textarea value={loginNotes} onChange={(e) => setLoginNotes(e.target.value)} className={`${inputClass} resize-none`} rows={2} placeholder="Optional notes..." />
              </div>
            </div>
          )}

          {/* === SECURE NOTE FORM === */}
          {itemType === 'secure_note' && (
            <div className="space-y-3">
              <div>
                <label className={labelClass}>Title *</label>
                <input type="text" value={noteName} onChange={(e) => setNoteName(e.target.value)} className={inputClass} placeholder="Note title" required />
              </div>
              <div>
                <label className={labelClass}>Content</label>
                <textarea value={noteContent} onChange={(e) => setNoteContent(e.target.value)} className={`${inputClass} resize-none`} rows={6} placeholder="Your secure note..." />
              </div>
            </div>
          )}

          {/* === CREDIT CARD FORM === */}
          {itemType === 'credit_card' && (
            <div className="space-y-3">
              <div>
                <label className={labelClass}>Card Name *</label>
                <input type="text" value={cardName} onChange={(e) => setCardName(e.target.value)} className={inputClass} placeholder="e.g. Chase Visa" required />
              </div>
              <div>
                <label className={labelClass}>Cardholder Name</label>
                <input type="text" value={cardHolder} onChange={(e) => setCardHolder(e.target.value)} className={inputClass} placeholder="Name on card" />
              </div>
              <div>
                <label className={labelClass}>Card Number</label>
                <input type="text" value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} className={`${inputClass} font-mono`} placeholder="1234 5678 9012 3456" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Expiry</label>
                  <input type="text" value={cardExpiry} onChange={(e) => setCardExpiry(e.target.value)} className={inputClass} placeholder="MM/YY" />
                </div>
                <div>
                  <label className={labelClass}>CVV</label>
                  <input type="text" value={cardCvv} onChange={(e) => setCardCvv(e.target.value)} className={`${inputClass} font-mono`} placeholder="123" />
                </div>
              </div>
              <div>
                <label className={labelClass}>Billing Address</label>
                <textarea value={cardBilling} onChange={(e) => setCardBilling(e.target.value)} className={`${inputClass} resize-none`} rows={2} placeholder="Address..." />
              </div>
              <div>
                <label className={labelClass}>Notes</label>
                <textarea value={cardNotes} onChange={(e) => setCardNotes(e.target.value)} className={`${inputClass} resize-none`} rows={2} placeholder="Optional notes..." />
              </div>
            </div>
          )}

          {/* === IDENTITY FORM === */}
          {itemType === 'identity' && (
            <div className="space-y-3">
              <div>
                <label className={labelClass}>Identity Name *</label>
                <input type="text" value={idName} onChange={(e) => setIdName(e.target.value)} className={inputClass} placeholder="e.g. Personal, Work" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>First Name</label>
                  <input type="text" value={idFirst} onChange={(e) => setIdFirst(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Last Name</label>
                  <input type="text" value={idLast} onChange={(e) => setIdLast(e.target.value)} className={inputClass} />
                </div>
              </div>
              <div>
                <label className={labelClass}>Email</label>
                <input type="email" value={idEmail} onChange={(e) => setIdEmail(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Phone</label>
                <input type="tel" value={idPhone} onChange={(e) => setIdPhone(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Address Line 1</label>
                <input type="text" value={idAddr1} onChange={(e) => setIdAddr1(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Address Line 2</label>
                <input type="text" value={idAddr2} onChange={(e) => setIdAddr2(e.target.value)} className={inputClass} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={labelClass}>City</label>
                  <input type="text" value={idCity} onChange={(e) => setIdCity(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>State</label>
                  <input type="text" value={idState} onChange={(e) => setIdState(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>ZIP</label>
                  <input type="text" value={idZip} onChange={(e) => setIdZip(e.target.value)} className={inputClass} />
                </div>
              </div>
              <div>
                <label className={labelClass}>Country</label>
                <input type="text" value={idCountry} onChange={(e) => setIdCountry(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Notes</label>
                <textarea value={idNotes} onChange={(e) => setIdNotes(e.target.value)} className={`${inputClass} resize-none`} rows={2} />
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-gray-700 px-4 py-2.5 text-sm font-medium text-gray-300 transition-colors hover:bg-gray-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : isEditing ? 'Update' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
