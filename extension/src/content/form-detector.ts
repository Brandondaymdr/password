// ============================================
// ShoreStack Vault Extension — Form Detector
// ============================================
// Detects login forms on web pages via DOM scanning + MutationObserver.

import type { FormField } from '../shared/types';

export interface DetectedFormResult {
  fields: FormField[];
  form: HTMLFormElement | null;
}

// Scoring attributes that suggest a username/email field
const USERNAME_INDICATORS = [
  'username', 'user', 'login', 'email', 'e-mail', 'userid',
  'account', 'loginid', 'signin', 'sign-in', 'identifier',
];

const PASSWORD_INDICATORS = ['password', 'pass', 'pwd', 'passwd'];

function getUniqueSelector(el: HTMLInputElement): string {
  if (el.id) return `#${CSS.escape(el.id)}`;
  if (el.name) return `input[name="${CSS.escape(el.name)}"]`;
  // Fall back to nth-child
  const parent = el.parentElement;
  if (parent) {
    const siblings = Array.from(parent.querySelectorAll('input'));
    const index = siblings.indexOf(el);
    return `${parent.tagName.toLowerCase()} > input:nth-of-type(${index + 1})`;
  }
  return 'input';
}

function scoreAsUsername(input: HTMLInputElement): number {
  let score = 0;
  const attrs = [
    input.type,
    input.name,
    input.id,
    input.placeholder,
    input.getAttribute('autocomplete') || '',
    input.getAttribute('aria-label') || '',
  ].map((s) => s.toLowerCase());

  for (const attr of attrs) {
    for (const indicator of USERNAME_INDICATORS) {
      if (attr.includes(indicator)) score += 2;
    }
  }

  if (input.type === 'email') score += 5;
  if (input.type === 'text') score += 1;
  if (input.getAttribute('autocomplete') === 'username') score += 5;
  if (input.getAttribute('autocomplete') === 'email') score += 4;

  return score;
}

function isVisible(el: HTMLElement): boolean {
  const style = window.getComputedStyle(el);
  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    style.opacity !== '0' &&
    el.offsetWidth > 0 &&
    el.offsetHeight > 0
  );
}

export function detectLoginForms(): DetectedFormResult[] {
  const results: DetectedFormResult[] = [];

  // Find all password inputs
  const passwordInputs = Array.from(
    document.querySelectorAll<HTMLInputElement>('input[type="password"]')
  ).filter(isVisible);

  for (const passwordInput of passwordInputs) {
    const fields: FormField[] = [];

    // Find the closest form
    const form = passwordInput.closest('form') as HTMLFormElement | null;
    const container = form || passwordInput.parentElement?.parentElement?.parentElement || document.body;

    // Find username/email candidates within the same form or nearby
    const textInputs = Array.from(
      container.querySelectorAll<HTMLInputElement>(
        'input[type="text"], input[type="email"], input:not([type])'
      )
    ).filter((input) => isVisible(input) && !PASSWORD_INDICATORS.some((p) => input.type.includes(p)));

    // Score and pick the best username candidate
    let bestUsername: HTMLInputElement | null = null;
    let bestScore = 0;

    for (const input of textInputs) {
      const score = scoreAsUsername(input);
      if (score > bestScore) {
        bestScore = score;
        bestUsername = input;
      }
    }

    // If no scored match, take the text/email input closest to the password field
    if (!bestUsername && textInputs.length > 0) {
      bestUsername = textInputs[textInputs.length - 1]; // Usually the last text input before password
    }

    if (bestUsername) {
      fields.push({
        selector: getUniqueSelector(bestUsername),
        type: bestUsername.type === 'email' ? 'email' : 'username',
      });
    }

    fields.push({
      selector: getUniqueSelector(passwordInput),
      type: 'password',
    });

    results.push({ fields, form });
  }

  return results;
}

// Watch for dynamically injected forms (SPAs)
export function observeForForms(callback: (forms: DetectedFormResult[]) => void): MutationObserver {
  const observer = new MutationObserver(() => {
    const forms = detectLoginForms();
    if (forms.length > 0) {
      callback(forms);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  return observer;
}
