"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import type { User } from "@/lib/types";

type SessionInfo = { onboarding_required: boolean; user: User | null };

export default function AuthCallback() {
  const router = useRouter();
  const { signIn } = useSession();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        const s = supabase();
        const code = new URLSearchParams(window.location.search).get("code");
        if (!s || !code) throw new Error("ไม่พบรหัสยืนยันจาก Google");
        const { error } = await s.auth.exchangeCodeForSession(code);
        if (error) throw error;
        const info = await api<SessionInfo>("/auth/session");
        if (info.onboarding_required || !info.user) router.replace("/onboarding");
        else {
          signIn({ ...info.user, auth: "google" });
          router.replace("/dashboard");
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [router, signIn]);

  return (
    <div className="flex min-h-screen items-center justify-center p-6 text-sm text-slate-600">
      {error ? (
        <div className="max-w-md rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
          เข้าสู่ระบบไม่สำเร็จ: {error}{" "}
          <Link href="/login" className="underline">กลับไปหน้าเข้าสู่ระบบ</Link>
        </div>
      ) : (
        <span className="inline-flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" />
          กำลังเข้าสู่ระบบด้วย Google…
        </span>
      )}
    </div>
  );
}
