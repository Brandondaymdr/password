// ============================================
// ShoreStack Vault Extension — Autofill
// ============================================
// Fills detected login forms with decrypted credentials.
// Uses native input value setter to work with React/Vue/Angular apps.

export function fillField(input: HTMLInputElement, value: string): void {
  // Focus the input first
  input.focus();

  // Use native setter to bypass React/Vue synthetic event systems
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value'
  )?.set;

  if (nativeInputValueSetter) {
    nativeInputValueSetter.call(input, value);
  } else {
    input.value = value;
  }

  // Dispatch events that frameworks listen for
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
}

export function autofillForm(
  username: string,
  password: string
): boolean {
  // Find password field
  const passwordInputs = Array.from(
    document.querySelectorAll<HTMLInputElement>('input[type="password"]')
  ).filter((el) => {
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetWidth > 0;
  });

  if (passwordInputs.length === 0) return false;

  const passwordInput = passwordInputs[0];
  const form = passwordInput.closest('form');
  const container = form || passwordInput.parentElement?.parentElement?.parentElement || document.body;

  // Find username/email field
  const textInputs = Array.from(
    container.querySelectorAll<HTMLInputElement>(
      'input[type="text"], input[type="email"], input:not([type])'
    )
  ).filter((el) => {
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetWidth > 0;
  });

  // Fill username if we found a field
  if (textInputs.length > 0 && username) {
    fillField(textInputs[textInputs.length - 1], username);
  }

  // Fill password
  fillField(passwordInput, password);

  return true;
}
