// ============================================
// ShoreStack Vault Extension — Content Script
// ============================================
// Injected into all pages. Detects login forms and handles autofill messages.
// Runs in isolated world — no access to page JS variables.

import { detectLoginForms, observeForForms } from './form-detector';
import { autofillForm } from './autofill';

// --- Initial Form Detection ---

function notifyFormsDetected() {
  const forms = detectLoginForms();
  if (forms.length > 0) {
    const totalFields = forms.reduce((sum, f) => sum + f.fields.length, 0);
    chrome.runtime.sendMessage({
      type: 'FORM_DETECTED',
      payload: {
        url: window.location.href,
        fieldCount: totalFields,
      },
    });
  }
}

// Scan on load
notifyFormsDetected();

// Watch for dynamically injected forms (SPAs)
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
observeForForms(() => {
  // Debounce to avoid flooding on rapid DOM changes
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(notifyFormsDetected, 500);
});

// --- Message Handler ---

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Only accept messages from our own extension
  if (sender.id !== chrome.runtime.id) {
    sendResponse({ error: 'Unauthorized' });
    return;
  }

  switch (message.type) {
    case 'AUTOFILL': {
      const { username, password } = message.payload as {
        username: string;
        password: string;
      };
      const success = autofillForm(username, password);
      sendResponse({ success });
      break;
    }

    case 'CAPTURE_CREDENTIALS': {
      // Capture current values from detected forms
      const forms = detectLoginForms();
      if (forms.length > 0) {
        const fields = forms[0].fields;
        const credentials: { username: string; password: string } = {
          username: '',
          password: '',
        };

        for (const field of fields) {
          const el = document.querySelector<HTMLInputElement>(field.selector);
          if (el) {
            if (field.type === 'password') {
              credentials.password = el.value;
            } else {
              credentials.username = el.value;
            }
          }
        }

        sendResponse({ success: true, credentials });
      } else {
        sendResponse({ success: false });
      }
      break;
    }

    default:
      sendResponse({ error: 'Unknown message type' });
  }

  return true; // keep channel open
});

// --- Form Submit Listener (for save-credential offers) ---

document.addEventListener(
  'submit',
  (e) => {
    const form = e.target as HTMLFormElement;
    const passwordInput = form.querySelector<HTMLInputElement>('input[type="password"]');
    if (!passwordInput) return;

    // Find username field
    const textInputs = Array.from(
      form.querySelectorAll<HTMLInputElement>(
        'input[type="text"], input[type="email"], input:not([type])'
      )
    );

    const username = textInputs.length > 0 ? textInputs[textInputs.length - 1].value : '';
    const password = passwordInput.value;

    if (username || password) {
      chrome.runtime.sendMessage({
        type: 'SAVE_OFFER',
        payload: {
          url: window.location.href,
          username,
          password,
        },
      });
    }
  },
  true // capture phase to run before the form navigates
);
