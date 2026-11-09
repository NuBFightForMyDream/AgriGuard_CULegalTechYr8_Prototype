"use client";

import { ArrowRight, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { Logo } from "@/components/shell";
import { useToast } from "@/components/toast";
import { Badge, Button, ErrorState, Skeleton } from "@/components/ui";
import { post } from "@/lib/api";
import { ACTOR_TONE, ROLE } from "@/lib/labels";
import { useSession } from "@/lib/session";
import { demoLoginEnabled, googleEnabled, signInWithGoogle } from "@/lib/supabase";
import type { Role, User } from "@/lib/types";

const ROLE_HINT: Record<Role, string> = {
  FARMER: "ลงประกาศผลผลิต เปรียบเทียบผู้ซื้อ จัดสรร และติดตามเงิน",
  BUYER: "สร้างคำขอซื้อ จับคู่สวน ส่งข้อเสนอ ยืนยัน HarvestLock",
  INSPECTOR: "รับล็อตที่ส่งถึง บันทึกผล GradeProof",
  ADMIN: "ภาพรวมแพลตฟอร์ม ธุรกรรม และ Audit log",
};

export default function LoginPage() {
  const { data: users, error, isLoading, mutate } = useSWR<User[]>(demoLoginEnabled ? "/demo/users" : null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const { signIn } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [resetting, setResetting] = useState(false);

  const choose = (u: User) => {
    signIn({ ...u, auth: "demo" });
    router.push("/dashboard");
  };

  async function reset() {
    setResetting(true);
    try {
      await post("/demo/reset");
      await mutate();
      toast("success", "รีเซ็ตข้อมูลเดโมเรียบร้อย");
    } catch (e) {
      toast("error", e instanceof Error ? e.message : String(e));
    } finally {
      setResetting(false);
    }
  }

  const groups: Role[] = ["FARMER", "BUYER", "INSPECTOR", "ADMIN"];

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-canvas">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:py-16">
        <Logo />
        <h1 className="mt-8 max-w-2xl text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
          ลดความไม่แน่นอนก่อนเก็บเกี่ยว และมีหลักฐานตรวจสอบได้ทุกขั้นตอน
        </h1>
        <p className="mt-3 max-w-2xl text-slate-600">
          เข้าสู่ระบบด้วยบัญชี Google หรือเลือกผู้ใช้เดโม — สถานการณ์ตัวอย่าง: สวนกรีนวัลเลย์มีมะม่วงน้ำดอกไม้ 5,000 กก.
          และผู้ซื้อ 3 รายยื่นข้อเสนอรวม 7,500 กก.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            disabled={!googleEnabled}
            loading={googleLoading}
            title={googleEnabled ? undefined : "ตั้งค่า NEXT_PUBLIC_SUPABASE_URL และ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ก่อน"}
            onClick={async () => {
              setGoogleLoading(true);
              try {
                await signInWithGoogle();
              } catch (e) {
                toast("error", e instanceof Error ? e.message : String(e));
                setGoogleLoading(false);
              }
            }}
          >
            <GoogleIcon />
            เข้าสู่ระบบด้วย Google
          </Button>
          {!googleEnabled && <span className="text-xs text-slate-500">Google sign-in ยังไม่ได้ตั้งค่าในสภาพแวดล้อมนี้</span>}
        </div>

        {error && <div className="mt-8"><ErrorState error={error} /></div>}
        <div className="mt-8 space-y-8">
          {isLoading &&
            [0, 1].map((i) => <Skeleton key={i} className="h-32" />)}
          {users &&
            groups.map((role) => {
              const list = users.filter((u) => u.role === role);
              if (!list.length) return null;
              return (
                <section key={role}>
                  <div className="mb-3 flex items-baseline gap-3">
                    <h2 className="font-semibold text-slate-900">{ROLE[role]}</h2>
                    <span className="text-sm text-slate-500">{ROLE_HINT[role]}</span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {list.map((u) => (
                      <button
                        key={u.id}
                        onClick={() => choose(u)}
                        className="group flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-green-700 hover:shadow-sm"
                      >
                        <div className="min-w-0">
                          <div className="font-medium text-slate-900">{u.name}</div>
                          <div className="truncate text-sm text-slate-500">{u.organization.name}</div>
                          <div className="mt-2">
                            <Badge tone={ACTOR_TONE[u.role]}>{u.title ?? ROLE[u.role]}</Badge>
                          </div>
                        </div>
                        <ArrowRight className="mt-1 size-4 shrink-0 text-slate-300 group-hover:text-green-700" />
                      </button>
                    ))}
                  </div>
                </section>
              );
            })}
        </div>

        {demoLoginEnabled && (
        <div className="mt-10 flex flex-wrap items-center gap-3 border-t border-slate-200 pt-6 text-sm text-slate-500">
          <Button variant="secondary" size="sm" onClick={reset} loading={resetting}>
            <RotateCcw className="size-4" />
            รีเซ็ตข้อมูลเดโม
          </Button>
          ล้างธุรกรรมทั้งหมดและกลับไปเริ่มสถานการณ์ตัวอย่างใหม่
        </div>
        )}
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path fill="#4285F4" d="M22.6 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.8 3.3-8.1z" />
      <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.8 14.2a6.6 6.6 0 0 1 0-4.3V7.1H2.1a11 11 0 0 0 0 9.9l3.7-2.8z" />
      <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.1l3.7 2.8c.9-2.6 3.3-4.5 6.2-4.5z" />
    </svg>
  );
}
