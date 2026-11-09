import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const googleEnabled = Boolean(url && key);
export const demoLoginEnabled = process.env.NEXT_PUBLIC_DEMO_LOGIN !== "false";

let client: SupabaseClient | null = null;

/** Browser Supabase client (PKCE). Only the publishable key lives here; never the secret key. */
export function supabase(): SupabaseClient | null {
  if (!googleEnabled) return null;
  client ??= createClient(url!, key!, {
    auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  return client;
}

export async function accessToken(): Promise<string | null> {
  const s = supabase();
  if (!s) return null;
  const { data } = await s.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function signInWithGoogle() {
  const s = supabase();
  if (!s) throw new Error("ยังไม่ได้ตั้งค่า Google sign-in");
  const { error } = await s.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}/auth/callback` },
  });
  if (error) throw error;
}
