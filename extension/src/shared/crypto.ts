// ============================================
// ShoreStack Vault Extension — Zero-Knowledge Encryption Module
// ============================================
// Copied from lib/crypto.ts — keep in sync manually.
// Uses Web Crypto API (AES-256-GCM, PBKDF2) — native browser, no libraries.

import type { PasswordOptions } from './types';

// --- Constants ---
const KDF_ITERATIONS = 600_000;
const AES_KEY_LENGTH = 256;
const IV_LENGTH = 12; // 96 bits for AES-GCM

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

export async function deriveVaultKey(
  masterPassword: string,
  salt: string,
  iterations: number = KDF_ITERATIONS
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(masterPassword);
  const saltBuffer = base64ToBuffer(salt);

  const baseKey = await crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    'PBKDF2',
    false,
    ['deriveKey']
  );

  const vaultKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBuffer,
      iterations,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: AES_KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );

  return vaultKey;
}

// --- Vault Item Encryption/Decryption ---

export async function encryptItem(
  data: object,
  vaultKey: CryptoKey
): Promise<{ encrypted: string; iv: string }> {
  const encoder = new TextEncoder();
  const plaintext = encoder.encode(JSON.stringify(data));

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

export async function generateSearchIndex(
  name: string,
  vaultKey: CryptoKey
): Promise<string> {
  const encoder = new TextEncoder();
  const nameBuffer = encoder.encode(name.toLowerCase().trim());

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

// --- Vault Verifier ---

const VAULT_VERIFIER_PLAINTEXT = 'SHORESTACK_VAULT_VERIFIED_v1';

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

// --- Password Generator ---

const CHAR_SETS = {
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  numbers: '0123456789',
  symbols: '!@#$%^&*()_+-=[]{}|;:,.<>?',
};

const AMBIGUOUS_CHARS = 'Il1O0';

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

  const randomValues = new Uint32Array(opts.length);
  crypto.getRandomValues(randomValues);

  let password = '';
  for (let i = 0; i < opts.length; i++) {
    password += charset[randomValues[i] % charset.length];
  }

  return password;
}
