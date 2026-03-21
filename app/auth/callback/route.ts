import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  // Validate redirect target to prevent open redirect attacks
  const rawNext = searchParams.get('next') ?? '/dashboard';
  const allowedPaths = ['/dashboard', '/setup', '/settings', '/documents'];
  const next = allowedPaths.includes(rawNext) ? rawNext : '/dashboard';

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Return to login on error
  return NextResponse.redirect(`${origin}/login`);
}
