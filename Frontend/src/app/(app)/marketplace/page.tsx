"use client";

import { Search, Store } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";
import { RequestCard } from "@/components/explore-cards";
import { Card, Chips, Empty, ErrorState, Input, PageHeader, PageSkeleton } from "@/components/ui";
import { PRODUCT, productName } from "@/lib/labels";
import type { PurchaseRequest } from "@/lib/types";

export default function MarketplacePage() {
  const { data, error } = useSWR<PurchaseRequest[]>("/purchase-requests");
  const [product, setProduct] = useState("");
  const [q, setQ] = useState("");
  if (error) return <ErrorState error={error} />;
  if (!data) return <PageSkeleton />;
  const products = [...new Set(data.map((r) => r.product_type))];
  const needle = q.trim().toLowerCase();
  const shown = [...data]
    .filter(
      (r) =>
        (!product || r.product_type === product) &&
        (!needle || [r.buyer.name, r.destination_province, productName(r.product_type, r.variety), r.code].some((s) => s.toLowerCase().includes(needle))),
    )
    .sort((a, b) => (b.best_match?.score ?? -1) - (a.best_match?.score ?? -1));
  return (
    <>
      <PageHeader title="ค้นหาผู้ซื้อ" subtitle="คำขอซื้อที่เปิดอยู่ เรียงตามความเข้ากันได้กับผลผลิตของคุณ (heuristic ไม่ใช่ AI)" />
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาชื่อผู้ซื้อ จังหวัด หรือผลผลิต" className="rounded-full py-2.5 pl-10" aria-label="ค้นหาผู้ซื้อ" />
      </div>
      <Chips
        className="mb-5"
        value={product}
        onChange={setProduct}
        items={[{ value: "", label: "ทั้งหมด", count: data.length }, ...products.map((p) => ({ value: p, label: PRODUCT[p] ?? p, count: data.filter((r) => r.product_type === p).length }))]}
      />
      {shown.length === 0 ? (
        <Card><Empty icon={<Store className="size-10" />} title="ไม่พบคำขอซื้อที่ค้นหา" /></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{shown.map((r) => <RequestCard key={r.id} r={r} />)}</div>
      )}
    </>
  );
}
