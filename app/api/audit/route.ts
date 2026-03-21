import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action, item_id } = body;

    const validActions = ['unlock', 'view', 'create', 'edit', 'delete', 'export', 'biometric_enrolled', 'biometric_removed'];
    if (!action || typeof action !== 'string' || !validActions.includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    // Validate item_id is a UUID if provided
    if (item_id && (typeof item_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item_id))) {
      return NextResponse.json({ error: 'Invalid item_id' }, { status: 400 });
    }

    // Get IP and user agent from request headers
    const ip_address = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || null;
    const user_agent = request.headers.get('user-agent') || null;

    const { error } = await supabase.from('vault_audit_log').insert({
      user_id: user.id,
      action,
      item_id: item_id || null,
      ip_address,
      user_agent,
    });

    if (error) {
      console.error('[Audit] Insert failed:', error.message);
      return NextResponse.json({ error: 'Failed to log audit event' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is on pro plan
    const { data: profile } = await supabase
      .from('profiles')
      .select('plan')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const { data: logs, error } = await supabase
      .from('vault_audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      console.error('[Audit] Fetch failed:', error.message);
      return NextResponse.json({ error: 'Failed to fetch audit logs' }, { status: 500 });
    }

    return NextResponse.json({ logs });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
