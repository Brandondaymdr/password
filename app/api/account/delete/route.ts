// ============================================
// ShoreStack Vault — Account Deletion API
// ============================================
// Server-side endpoint that actually deletes all user data.
// Uses the Supabase service role to delete the auth user.

import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase-server';
import { getStripe } from '@/lib/stripe';
import { NextResponse } from 'next/server';

export async function POST() {
  try {
    // Get the authenticated user via session cookie
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const userId = user.id;

    // Use admin client (service role) to perform deletions
    const admin = createAdminClient();

    // Cancel any active Stripe subscriptions before deleting data
    const { data: profile } = await admin.from('profiles').select('stripe_customer_id').eq('id', userId).single();
    if (profile?.stripe_customer_id) {
      try {
        const subscriptions = await getStripe().subscriptions.list({
          customer: profile.stripe_customer_id,
          status: 'active',
        });
        for (const sub of subscriptions.data) {
          await getStripe().subscriptions.cancel(sub.id);
        }
      } catch (stripeErr) {
        console.error('Failed to cancel Stripe subscriptions:', stripeErr);
        // Continue with deletion even if Stripe cancellation fails
        // The subscription will expire naturally without a valid customer
      }
    }

    // 1. Delete storage objects (vault-documents bucket)
    const { data: docs } = await admin
      .from('vault_documents')
      .select('storage_path')
      .eq('user_id', userId);

    if (docs && docs.length > 0) {
      await admin.storage
        .from('vault-documents')
        .remove(docs.map((d: { storage_path: string }) => d.storage_path));
    }

    // 2. Delete vault_documents rows
    const { error: docsError } = await admin.from('vault_documents').delete().eq('user_id', userId);
    if (docsError) console.error('Failed to delete vault_documents:', docsError.message);

    // 3. Delete vault_items rows
    const { error: itemsError } = await admin.from('vault_items').delete().eq('user_id', userId);
    if (itemsError) console.error('Failed to delete vault_items:', itemsError.message);

    // 4. Delete vault_audit_log rows
    const { error: auditError } = await admin.from('vault_audit_log').delete().eq('user_id', userId);
    if (auditError) console.error('Failed to delete vault_audit_log:', auditError.message);

    // 5. Delete profiles row
    const { error: profilesError } = await admin.from('profiles').delete().eq('id', userId);
    if (profilesError) console.error('Failed to delete profiles:', profilesError.message);

    // 6. Delete the auth user itself
    const { error: deleteUserError } = await admin.auth.admin.deleteUser(userId);
    if (deleteUserError) {
      console.error('[Account Delete] Failed to delete auth user:', deleteUserError);
      return NextResponse.json(
        { error: 'Failed to delete auth user. Some data may have been removed.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[Account Delete] Unexpected error:', err);
    return NextResponse.json({ error: 'Account deletion failed' }, { status: 500 });
  }
}
