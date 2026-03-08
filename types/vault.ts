// ============================================
// ShoreStack Vault — TypeScript Types
// ============================================

export type VaultItemType = 'login' | 'secure_note' | 'credit_card' | 'identity';

export type PlanType = 'individual' | 'team' | 'custom';

export type AuditAction = 'unlock' | 'view' | 'create' | 'edit' | 'delete' | 'export';

// --- Database Row Types ---

export interface Profile {
  id: string;
  kdf_salt: string;
  kdf_iterations: number;
  hint: string | null;
  vault_verifier: string | null;
  vault_verifier_iv: string | null;
  plan: PlanType;
  stripe_customer_id: string | null;
  created_at: string;
}

export interface VaultItemRow {
  id: string;
  user_id: string;
  item_type: VaultItemType;
  encrypted_data: string;
  iv: string;
  search_index: string | null;
  favorite: boolean;
  created_at: string;
  updated_at: string;
}

export interface VaultDocumentRow {
  id: string;
  user_id: string;
  linked_item_id: string | null;
  storage_path: string;
  file_name_encrypted: string;
  file_key_encrypted: string;
  file_iv: string;
  file_size: number | null;
  created_at: string;
}

export interface AuditLogRow {
  id: string;
  user_id: string;
  action: AuditAction;
  item_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

// --- Decrypted Item Types ---

export interface LoginItem {
  name: string;
  username: string;
  password: string;
  url: string;
  notes: string;
  totp_secret?: string;
}

export interface SecureNoteItem {
  name: string;
  content: string;
}

export interface CreditCardItem {
  name: string;
  cardholder_name: string;
  number: string;
  expiry: string;
  cvv: string;
  billing_address: string;
  notes: string;
}

export interface IdentityItem {
  name: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  notes: string;
}

export type DecryptedItemData = LoginItem | SecureNoteItem | CreditCardItem | IdentityItem;

// --- Decrypted Vault Item (after client-side decryption) ---

export interface DecryptedVaultItem {
  id: string;
  item_type: VaultItemType;
  data: DecryptedItemData;
  favorite: boolean;
  created_at: string;
  updated_at: string;
}

// --- Password Generator ---

export interface PasswordOptions {
  length: number;
  uppercase: boolean;
  lowercase: boolean;
  numbers: boolean;
  symbols: boolean;
  excludeAmbiguous: boolean;
}

// --- Plan Limits ---

export const PLAN_LIMITS: Record<PlanType, { maxUsers: number; maxItems: number; maxStorageMB: number; auditLog: boolean; sharedVaults: boolean }> = {
  individual: { maxUsers: 1, maxItems: Infinity, maxStorageMB: 5120, auditLog: true, sharedVaults: false },
  team: { maxUsers: 5, maxItems: Infinity, maxStorageMB: 10240, auditLog: true, sharedVaults: true },
  custom: { maxUsers: Infinity, maxItems: Infinity, maxStorageMB: Infinity, auditLog: true, sharedVaults: true },
};
