// ============================================
// ShoreStack Vault Extension — TypeScript Types
// ============================================
// Copied from types/vault.ts — keep in sync manually.

export type VaultItemType = 'login' | 'secure_note' | 'credit_card' | 'identity';

export type PlanType = 'personal' | 'plus';

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

export interface DecryptedVaultItem {
  id: string;
  item_type: VaultItemType;
  data: DecryptedItemData;
  favorite: boolean;
  created_at: string;
  updated_at: string;
}

export interface PasswordOptions {
  length: number;
  uppercase: boolean;
  lowercase: boolean;
  numbers: boolean;
  symbols: boolean;
  excludeAmbiguous: boolean;
}

// --- Extension Message Types ---

export type ExtensionMessageType =
  | 'LOGIN'
  | 'LOGOUT'
  | 'UNLOCK'
  | 'LOCK'
  | 'GET_STATUS'
  | 'GET_CREDENTIALS'
  | 'SEARCH_VAULT'
  | 'AUTOFILL'
  | 'CAPTURE_CREDENTIALS'
  | 'FORM_DETECTED'
  | 'SAVE_OFFER'
  | 'SAVE_CREDENTIAL'
  | 'GENERATE_PASSWORD'
  | 'GET_PENDING_SAVE'
  | 'CONFIRM_SAVE'
  | 'DISMISS_SAVE';

export interface ExtensionMessage {
  type: ExtensionMessageType;
  payload?: unknown;
}

export interface VaultStatus {
  isAuthenticated: boolean;
  isUnlocked: boolean;
  itemCount: number;
}

export interface FormField {
  selector: string;
  type: 'username' | 'password' | 'email';
  value?: string;
}

export interface DetectedForm {
  url: string;
  fields: FormField[];
}
