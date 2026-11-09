"use client";

import { Building2, Sprout } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { Logo } from "@/components/shell";
import { Button, Card, Field, Input, Select, cx } from "@/components/ui";
import { post } from "@/lib/api";
import { useSession } from "@/lib/session";
import type { Catalog, User } from "@/lib/types";
import { useAction } from "@/lib/useAction";

type Role = "FARMER" | "BUYER";

const ROLES: { value: Role; label: string; hint: string; icon: React.ElementType }[] = [
  { value: "FARMER", label: "เกษตรกร / สวน", hint: "ลงประกาศผลผลิต รับข้อเสนอ จัดสรร", icon: Sprout },
  { value: "BUYER", label: "ผู้ซื้อ", hint: "โรงงาน ผู้ส่งออก ผู้ค้าส่ง ล้ง", icon: Building2 },
];

export default function OnboardingPage() {
  const { data: catalog } = useSWR<Catalog>("/catalog");
  const { data: session } = useSWR<{ email: string; name: string }>("/auth/session");
  const { signIn } = useSession();
  const router = useRouter();
  const { run, pending } = useAction();
  const [role, setRole] = useState<Role>("FARMER");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const user = await run(
      () =>
        post<User>("/onboarding", {
          role,
          organization_name: f.get("organization_name"),
          province: f.get("province"),
          business_type: role === "BUYER" ? f.get("business_type") : null,
        }),
      "ลงทะเบียนเรียบร้อย",
    );
    if (user) {
      signIn({ ...user, auth: "google" });
      router.replace("/dashboard");
    }
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <Logo />
      <h1 className="mt-8 text-2xl font-semibold">ตั้งค่าบัญชีครั้งแรก</h1>
      <p className="mt-1 text-sm text-slate-500">
        {session ? `${session.name} · ${session.email}` : "บัญชี Google"} — ผู้ตรวจคุณภาพและผู้ดูแลระบบได้รับสิทธิ์จากผู้ดูแลเท่านั้น
      </p>
      <Card className="mt-6">
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {ROLES.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setRole(r.value)}
                className={cx(
                  "rounded-xl border p-4 text-left",
                  role === r.value ? "border-green-700 bg-green-50 ring-2 ring-green-700/20" : "border-slate-200 hover:border-slate-300",
                )}
              >
                <r.icon className="size-5 text-green-800" />
                <div className="mt-2 font-medium">{r.label}</div>
                <div className="text-xs text-slate-500">{r.hint}</div>
              </button>
            ))}
          </div>
          <Field label={role === "FARMER" ? "ชื่อสวน" : "ชื่อบริษัท / ธุรกิจ"}>
            <Input name="organization_name" required minLength={2} />
          </Field>
          <Field label="จังหวัด">
            <Select name="province" required>
              {catalog?.provinces.map((p) => <option key={p}>{p}</option>)}
            </Select>
          </Field>
          {role === "BUYER" && (
            <Field label="ประเภทธุรกิจ">
              <Select name="business_type">
                <option value="EXPORTER">ผู้ส่งออก</option>
                <option value="PROCESSOR">โรงงานแปรรูป</option>
                <option value="WHOLESALER">ผู้ค้าส่ง</option>
              </Select>
            </Field>
          )}
          <p className="text-xs text-slate-500">บัญชีธุรกิจจะอยู่ในสถานะ “รอยืนยัน” จนกว่าผู้ดูแลระบบตรวจสอบ</p>
          <Button type="submit" loading={pending} className="w-full">เริ่มใช้งาน</Button>
        </form>
      </Card>
    </div>
  );
}
