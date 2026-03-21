'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase';
import { encryptItem, generateSearchIndex } from '@/lib/crypto';
import { VaultSession } from '@/lib/vault-session';
import { logAuditEvent } from '@/lib/audit';
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
  const [showPassword, setShowPassword] = useState(false);

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
          data: { name: loginName, username: loginUsername, password: loginPassword, url: loginUrl && !loginUrl.match(/^https?:\/\//) ? `https://${loginUrl}` : loginUrl, notes: loginNotes },
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
        await logAuditEvent('edit', editItem.id);
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
        await logAuditEvent('create', newItem?.id);
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save item');
    } finally {
      setSaving(false);
    }
  }

  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, handleEscape]);

  if (!isOpen) return null;

  const inputClass = 'block w-full rounded-sm border border-[#1b4965]/15 bg-white px-3 py-2.5 text-sm text-[#1b4965] placeholder-[#1b4965]/40 focus:border-[#5fa8a0] focus:outline-none focus:ring-1 focus:ring-[#5fa8a0]';
  const labelClass = 'block text-sm font-medium text-[#1b4965]/70 mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4 pt-16 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg rounded-sm border border-[#1b4965]/15 bg-[#fcfbf8] shadow-lg" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#1b4965]/15 px-6 py-4">
          <h2 className="text-lg font-semibold text-[#1b4965]">{isEditing ? 'Edit Item' : 'Add New Item'}</h2>
          <button onClick={onClose} className="text-[#1b4965]/40 hover:text-[#1b4965]">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSave} className="px-6 py-4">
          {error && (
            <div className="mb-4 rounded-sm border border-[#e76f51]/30 bg-[#e76f51]/10 px-4 py-3 text-sm text-[#e76f51]">
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
                    className={`rounded-sm border px-3 py-2 text-center text-sm transition-colors ${
                      itemType === type
                        ? 'border-[#5fa8a0] bg-[#5fa8a0]/10 text-[#5fa8a0]'
                        : 'border-[#1b4965]/15 text-[#1b4965]/60 hover:border-[#1b4965]/30'
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
          <label className="mb-4 flex items-center gap-2 text-sm text-[#1b4965]/70">
            <input
              type="checkbox"
              checked={favorite}
              onChange={(e) => setFavorite(e.target.checked)}
              className="rounded border-[#1b4965]/20 bg-white text-[#d97706] focus:ring-[#d97706]"
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
                  <div className="relative flex-1">
                    <input type={showPassword ? 'text' : 'password'} value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} className={`${inputClass} pr-10 font-mono`} placeholder="••••••••" />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[#1b4965]/40 hover:text-[#1b4965]"
                      tabIndex={-1}
                    >
                      {showPassword ? (
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>
                      ) : (
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
                      )}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowGenerator(!showGenerator)}
                    className="shrink-0 rounded-sm border border-[#1b4965]/15 px-3 text-sm text-[#1b4965]/60 transition-colors hover:bg-[#1b4965]/5 hover:text-[#1b4965]"
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
                <input type="text" value={loginUrl} onChange={(e) => setLoginUrl(e.target.value)} className={inputClass} placeholder="example.com" />
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
              className="flex-1 rounded-sm border border-[#1b4965]/15 px-4 py-2.5 text-sm font-medium text-[#1b4965]/70 transition-colors hover:bg-[#1b4965]/5"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-sm bg-[#5fa8a0] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#4d8f87] disabled:opacity-50"
            >
              {saving ? 'Saving...' : isEditing ? 'Update' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
