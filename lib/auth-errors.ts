// ============================================
// ShoreStack Vault — Auth Error Normalization
// ============================================
// Maps raw Supabase auth error messages to user-friendly strings.
// Prevents user enumeration and avoids exposing internal details.

const ERROR_MAP: Record<string, string> = {
  'Invalid login credentials': 'Email or password is incorrect.',
  'Email not confirmed': 'Please check your email to confirm your account.',
  'User already registered': 'An account with this email already exists.',
  'Signup requires a valid password': 'Please enter a valid password.',
  'Email rate limit exceeded': 'Too many attempts. Please try again later.',
  'For security purposes, you can only request this after': 'Too many attempts. Please try again later.',
  'User not found': 'Email or password is incorrect.',
  'Invalid Refresh Token: Refresh Token Not Found': 'Your session has expired. Please sign in again.',
};

export function normalizeAuthError(message: string): string {
  // Check for exact matches
  if (ERROR_MAP[message]) return ERROR_MAP[message];

  // Check for partial matches (some Supabase errors include dynamic content)
  for (const [key, value] of Object.entries(ERROR_MAP)) {
    if (message.includes(key)) return value;
  }

  // Default: generic error to avoid leaking implementation details
  return 'Something went wrong. Please try again.';
}
