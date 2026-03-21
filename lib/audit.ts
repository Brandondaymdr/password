// ============================================
// ShoreStack Vault — Audit Log Helper
// ============================================
// Routes all audit writes through the server endpoint to capture IP and user agent.
// Client-side direct inserts to vault_audit_log are deprecated.

export async function logAuditEvent(action: string, itemId?: string): Promise<void> {
  try {
    await fetch('/api/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, item_id: itemId }),
    });
  } catch {
    // Audit logging should never block the user's operation
    console.warn('Failed to log audit event:', action);
  }
}
