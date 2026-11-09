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
import type { Role, User } from "@/lib/types";

const ROLE_HINT: Record<Role, string> = {
  FARMER: "ลงประกาศผลผลิต เปรียบเทียบผู้ซื้อ จัดสรร และติดตามเงิน",
  BUYER: "สร้างคำขอซื้อ จับคู่สวน ส่งข้อเสนอ ยืนยัน HarvestLock",
  INSPECTOR: "รับล็อตที่ส่งถึง บันทึกผล GradeProof",
  ADMIN: "ภาพรวมแพลตฟอร์ม ธุรกรรม และ Audit log",
};

export default function LoginPage() {
  const { data: users, error, isLoading, mutate } = useSWR<User[]>("/demo/users");
  const { signIn } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [resetting, setResetting] = useState(false);

  const choose = (u: User) => {
    signIn(u);
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
          เลือกผู้ใช้เดโมเพื่อเข้าสู่ระบบ (Phase 1 ยังไม่ใช้ Google sign-in) — สถานการณ์ตัวอย่าง: สวนกรีนวัลเลย์มีมะม่วงน้ำดอกไม้
          5,000 กก. และผู้ซื้อ 3 รายยื่นข้อเสนอรวม 7,500 กก.
        </p>

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

        <div className="mt-10 flex flex-wrap items-center gap-3 border-t border-slate-200 pt-6 text-sm text-slate-500">
          <Button variant="secondary" size="sm" onClick={reset} loading={resetting}>
            <RotateCcw className="size-4" />
            รีเซ็ตข้อมูลเดโม
          </Button>
          ล้างธุรกรรมทั้งหมดและกลับไปเริ่มสถานการณ์ตัวอย่างใหม่
        </div>
      </div>
    </div>
  );
}
