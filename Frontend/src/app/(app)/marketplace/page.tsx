"use client";

import { CalendarRange, MapPin, Store } from "lucide-react";
import Link from "next/link";
import useSWR from "swr";
import { TrustBadge } from "@/components/trust";
import { Badge, Card, Empty, ErrorState, PageHeader, PageSkeleton } from "@/components/ui";
import { fmtKg, fmtRange, fmtTHB } from "@/lib/format";
import { BUSINESS_TYPE, productName } from "@/lib/labels";
import type { PurchaseRequest } from "@/lib/types";

export default function MarketplacePage() {
  const { data, error } = useSWR<PurchaseRequest[]>("/purchase-requests");
  if (error) return <ErrorState error={error} />;
  if (!data) return <PageSkeleton />;
  const sorted = [...data].sort((a, b) => (b.best_match?.score ?? -1) - (a.best_match?.score ?? -1));
  return (
    <>
      <PageHeader title="ตลาดคำขอซื้อ" subtitle="คำขอซื้อที่เปิดอยู่จากผู้ซื้อ เรียงตามความเข้ากันได้กับผลผลิตของคุณ (heuristic ไม่ใช่ AI)" />
      {sorted.length === 0 ? (
        <Card><Empty icon={<Store className="size-10" />} title="ยังไม่มีคำขอซื้อที่เปิดอยู่" /></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {sorted.map((r) => (
            <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs text-slate-500">{r.code}</div>
                  <div className="text-lg font-semibold">{productName(r.product_type, r.variety)} · {fmtKg(r.quantity_kg)}</div>
                </div>
                {r.best_match ? (
                  <Badge tone="green">เข้ากับ {r.best_match.listing_code} · {r.best_match.score.toFixed(0)}/100</Badge>
                ) : (
                  <Badge tone="gray">ไม่ตรงกับผลผลิตของคุณ</Badge>
                )}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">{r.buyer.name}</span>
                {r.buyer.business_type && <span className="text-slate-500">{BUSINESS_TYPE[r.buyer.business_type]}</span>}
                {r.buyer_trust && <TrustBadge trust={r.buyer_trust} orgId={r.buyer.id} />}
              </div>
              <div className="mt-3 grid gap-1 text-sm text-slate-600 sm:grid-cols-2">
                <span className="inline-flex items-center gap-1"><CalendarRange className="size-4 text-slate-400" />รับ {fmtRange(r.delivery_start, r.delivery_end)}</span>
                <span className="inline-flex items-center gap-1"><MapPin className="size-4 text-slate-400" />ส่งที่ {r.destination_province}</span>
                <span>เกรด {r.accepted_grades.join(", ")} · ขั้นต่ำ {fmtKg(r.min_quantity_kg)}</span>
                <span>ราคาเป้าหมาย {r.target_price ? `${fmtTHB(r.target_price)}/กก.` : "—"} · ชำระใน {r.payment_terms_days} วัน</span>
              </div>
              {r.best_match && (
                <p className="mt-3 text-sm text-slate-500">
                  ผู้ซื้อเป็นฝ่ายยื่นข้อเสนอ — ข้อเสนอจะเข้ามาที่{" "}
                  <Link href={`/produce/${r.best_match.listing_id}`} className="text-green-800 hover:underline">ประกาศ {r.best_match.listing_code}</Link>
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
