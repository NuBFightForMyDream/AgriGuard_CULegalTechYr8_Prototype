"use client";

import { Info } from "lucide-react";
import Link from "next/link";
import useSWR from "swr";
import { TrustBadge } from "@/components/trust";
import { Badge, Card, ErrorState, PageHeader, PageSkeleton } from "@/components/ui";
import type { Org, TrustSummary } from "@/lib/types";

type Row = Org & { trust: TrustSummary; contracts: number; signals: { code: string; severity: "high" | "medium" | "info"; message: string }[] };
const TONE = { high: "red", medium: "amber", info: "gray" } as const;

export default function RiskPage() {
  const { data, error } = useSWR<Row[]>("/admin/risk");
  if (error) return <ErrorState error={error} />;
  if (!data) return <PageSkeleton />;
  const sorted = [...data].sort((a, b) => b.signals.filter((s) => s.severity !== "info").length - a.signals.filter((s) => s.severity !== "info").length);
  return (
    <>
      <PageHeader title="Trust & Risk Monitoring" subtitle="สัญญาณจากกฎตรวจจับความผิดปกติสำหรับให้คนตรวจทาน — ไม่ใช่คำตัดสิน และไม่หักคะแนนอัตโนมัติ" />
      <div className="mb-4 flex gap-2 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600">
        <Info className="mt-0.5 size-4 shrink-0" />
        กฎที่ใช้: ปฏิเสธ/ปล่อยให้การจองหมดอายุซ้ำ, ข้อพิพาทที่ตรวจสอบแล้วว่าผู้ซื้อผิด, ปฏิเสธสินค้าเกิน 15%, ใช้ไฟล์หลักฐานเดียวกันซ้ำข้ามสัญญา (เทียบ SHA-256)
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {sorted.map((r) => (
          <Card key={r.id} title={<Link href={`/buyers/${r.id}`} className="hover:text-green-800">{r.name}</Link>} action={<TrustBadge trust={r.trust} />}>
            <div className="text-xs text-slate-500">{r.contracts} สัญญาในระบบ · {r.verified ? "ยืนยันธุรกิจแล้ว" : "ยังไม่ยืนยันธุรกิจ"}</div>
            {r.signals.length ? (
              <ul className="mt-3 space-y-2 text-sm">
                {r.signals.map((s) => (
                  <li key={s.code} className="flex items-start gap-2"><Badge tone={TONE[s.severity]}>{s.severity}</Badge><span>{s.message}</span></li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-green-800">ไม่พบสัญญาณผิดปกติ</p>
            )}
          </Card>
        ))}
      </div>
    </>
  );
}
