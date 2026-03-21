// ============================================
// ShoreStack Vault — Zero-Knowledge Encryption Module
// ============================================
// ALL encryption/decryption logic lives here.
// Uses Web Crypto API (AES-256-GCM, PBKDF2) — native browser, no libraries.
// The vault key is NEVER transmitted to any server.

import type { PasswordOptions } from '@/types/vault';

// --- Constants ---
const KDF_ITERATIONS = 600_000;
const AES_KEY_LENGTH = 256;
const IV_LENGTH = 12; // 96 bits for AES-GCM
const SALT_LENGTH = 32; // 256 bits

// --- Helper: Convert between ArrayBuffer and Base64 ---

export function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// --- Key Derivation ---

/**
 * Derive an AES-256-GCM vault key from the master password using PBKDF2.
 * The vault key is NEVER stored or transmitted — only held in memory.
 */
export async function deriveVaultKey(
  masterPassword: string,
  salt: string,
  iterations: number = KDF_ITERATIONS
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(masterPassword);
  const saltBuffer = base64ToBuffer(salt);

  // Import master password as a PBKDF2 key
  const baseKey = await crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    'PBKDF2',
    false,
    ['deriveKey']
  );

  // Derive AES-256-GCM key
  const vaultKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBuffer,
      iterations,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: AES_KEY_LENGTH },
    false, // not extractable — cannot be exported
    ['encrypt', 'decrypt']
  );

  return vaultKey;
}

// --- Vault Item Encryption/Decryption ---

/**
 * Encrypt a vault item (login, note, card, identity).
 * Each item gets a unique IV for AES-GCM.
 * Returns base64-encoded ciphertext and IV.
 */
export async function encryptItem(
  data: object,
  vaultKey: CryptoKey
): Promise<{ encrypted: string; iv: string }> {
  const encoder = new TextEncoder();
  const plaintext = encoder.encode(JSON.stringify(data));

  // Generate unique IV for this item
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    vaultKey,
    plaintext
  );

  return {
    encrypted: bufferToBase64(ciphertext),
    iv: bufferToBase64(iv.buffer),
  };
}

/**
 * Decrypt a vault item back to its original JSON object.
 */
export async function decryptItem(
  encrypted: string,
  iv: string,
  vaultKey: CryptoKey
): Promise<object> {
  const ciphertext = base64ToBuffer(encrypted);
  const ivBuffer = new Uint8Array(base64ToBuffer(iv));

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBuffer },
    vaultKey,
    ciphertext
  );

  const decoder = new TextDecoder();
  return JSON.parse(decoder.decode(plaintext));
}

// --- HMAC Search Index ---

/**
 * Generate an HMAC-SHA256 search index for an item name.
 * This allows searching vault items without exposing the name.
 * The server sees only the HMAC hash, never the plaintext name.
 *
 * Key derivation note: The vault key is non-extractable (AES-GCM), so we cannot
 * use HKDF directly. Instead, we use AES-GCM as a PRF (pseudo-random function)
 * to derive HMAC key material. This is safe because:
 * 1. The plaintext is a fixed constant ("hmac-search-index-key") — never varies
 * 2. A single (key, IV, plaintext) triple always produces identical ciphertext
 * 3. No IV reuse vulnerability exists since only one message is ever encrypted
 * 4. The output is used solely as keying material, not as a ciphertext
 */
export async function generateSearchIndex(
  name: string,
  vaultKey: CryptoKey
): Promise<string> {
  const encoder = new TextEncoder();
  const nameBuffer = encoder.encode(name.toLowerCase().trim());

  // Derive HMAC key material using AES-GCM as a PRF.
  // The deterministic IV is intentional — see function-level comment above.
  const hmacKeyMaterial = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: new Uint8Array(IV_LENGTH) },
    vaultKey,
    encoder.encode('hmac-search-index-key')
  );

  const hmacKey = await crypto.subtle.importKey(
    'raw',
    hmacKeyMaterial,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', hmacKey, nameBuffer);
  return bufferToBase64(signature);
}

// --- Password Generator ---

const CHAR_SETS = {
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  numbers: '0123456789',
  symbols: '!@#$%^&*()_+-=[]{}|;:,.<>?',
};

const AMBIGUOUS_CHARS = 'Il1O0';

/**
 * Generate a cryptographically strong random password.
 * Uses rejection sampling to eliminate modulo bias (audit item M2).
 */
export function generatePassword(
  length: number = 20,
  options: Partial<PasswordOptions> = {}
): string {
  const opts: PasswordOptions = {
    length,
    uppercase: true,
    lowercase: true,
    numbers: true,
    symbols: true,
    excludeAmbiguous: false,
    ...options,
  };

  let charset = '';
  if (opts.uppercase) charset += CHAR_SETS.uppercase;
  if (opts.lowercase) charset += CHAR_SETS.lowercase;
  if (opts.numbers) charset += CHAR_SETS.numbers;
  if (opts.symbols) charset += CHAR_SETS.symbols;

  if (opts.excludeAmbiguous) {
    charset = charset
      .split('')
      .filter((c) => !AMBIGUOUS_CHARS.includes(c))
      .join('');
  }

  if (charset.length === 0) {
    throw new Error('At least one character set must be enabled');
  }

  // Rejection sampling: discard random bytes that would introduce modulo bias.
  // For a charset of length n, values >= (256 - (256 % n)) are biased.
  const limit = 256 - (256 % charset.length);

  let password = '';
  for (let i = 0; i < opts.length; ) {
    const byte = new Uint8Array(1);
    crypto.getRandomValues(byte);
    if (byte[0] < limit) {
      password += charset[byte[0] % charset.length];
      i++;
    }
    // else: byte is in the biased range — discard and retry
  }

  return password;
}

// --- File Encryption ---

/**
 * Encrypt a file for secure document storage.
 * Each file gets its own random AES key, which is then encrypted with the vault key.
 */
export async function encryptFile(
  file: File,
  vaultKey: CryptoKey
): Promise<{
  encryptedBuffer: ArrayBuffer;
  fileKeyEncrypted: string;
  iv: string;
}> {
  // Generate a random per-file AES key
  const fileKey = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: AES_KEY_LENGTH },
    true, // extractable so we can encrypt it with vault key
    ['encrypt', 'decrypt']
  );

  // Read file contents
  const fileBuffer = await file.arrayBuffer();

  // Encrypt file with the per-file key
  const fileIv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: fileIv },
    fileKey,
    fileBuffer
  );

  // Export the per-file key and encrypt it with the vault key
  const rawFileKey = await crypto.subtle.exportKey('raw', fileKey);
  const keyIv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encryptedFileKey = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: keyIv },
    vaultKey,
    rawFileKey
  );

  // Combine key IV + encrypted key for storage
  const combinedKeyData = new Uint8Array(keyIv.length + new Uint8Array(encryptedFileKey).length);
  combinedKeyData.set(keyIv);
  combinedKeyData.set(new Uint8Array(encryptedFileKey), keyIv.length);

  return {
    encryptedBuffer,
    fileKeyEncrypted: bufferToBase64(combinedKeyData.buffer),
    iv: bufferToBase64(fileIv.buffer),
  };
}

/**
 * Decrypt a file from storage.
 */
export async function decryptFile(
  encryptedBuffer: ArrayBuffer,
  fileKeyEncrypted: string,
  iv: string,
  vaultKey: CryptoKey
): Promise<ArrayBuffer> {
  // Split the combined key data back into IV + encrypted key
  const combinedKeyData = new Uint8Array(base64ToBuffer(fileKeyEncrypted));
  const keyIv = combinedKeyData.slice(0, IV_LENGTH);
  const encryptedFileKey = combinedKeyData.slice(IV_LENGTH);

  // Decrypt the per-file key using the vault key
  const rawFileKey = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: keyIv },
    vaultKey,
    encryptedFileKey
  );

  // Import the per-file key
  const fileKey = await crypto.subtle.importKey(
    'raw',
    rawFileKey,
    { name: 'AES-GCM', length: AES_KEY_LENGTH },
    false,
    ['decrypt']
  );

  // Decrypt the file
  const fileIv = new Uint8Array(base64ToBuffer(iv));
  return await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fileIv },
    fileKey,
    encryptedBuffer
  );
}

// --- Vault Verifier ---

/**
 * Known plaintext used to verify the master password is correct.
 * During setup, this string is encrypted with the vault key and stored as vault_verifier.
 * On unlock, we decrypt it — if it matches, the password is correct.
 */
const VAULT_VERIFIER_PLAINTEXT = 'SHORESTACK_VAULT_VERIFIED_v1';

/**
 * Create a vault verifier (encrypted known string) during master password setup.
 */
export async function createVaultVerifier(
  vaultKey: CryptoKey
): Promise<{ encrypted: string; iv: string }> {
  return encryptItem({ verifier: VAULT_VERIFIER_PLAINTEXT }, vaultKey);
}

/**
 * Verify the master password by decrypting the vault verifier.
 * Returns true if the password is correct, false otherwise.
 */
export async function verifyVaultKey(
  encrypted: string,
  iv: string,
  vaultKey: CryptoKey
): Promise<boolean> {
  try {
    const data = (await decryptItem(encrypted, iv, vaultKey)) as { verifier: string };
    return data.verifier === VAULT_VERIFIER_PLAINTEXT;
  } catch {
    return false;
  }
}

// --- Utilities ---

/**
 * Generate a random salt for KDF (used during signup).
 */
export function generateSalt(): string {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  return bufferToBase64(salt.buffer);
}

/**
 * Encrypt a filename for document storage.
 */
export async function encryptFilename(
  filename: string,
  vaultKey: CryptoKey
): Promise<{ encrypted: string; iv: string }> {
  return encryptItem({ filename }, vaultKey);
}

/**
 * Decrypt a filename from storage.
 */
export async function decryptFilename(
  encrypted: string,
  iv: string,
  vaultKey: CryptoKey
): Promise<string> {
  const data = (await decryptItem(encrypted, iv, vaultKey)) as { filename: string };
  return data.filename;
}
