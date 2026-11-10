"use client";

import { Search } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";
import { ListingCard } from "@/components/explore-cards";
import { OfferDialog } from "@/components/offer-dialog";
import { Card, Chips, Empty, ErrorState, Input, LinkButton, PageHeader, PageSkeleton } from "@/components/ui";
import { PRODUCT, productName } from "@/lib/labels";
import type { Listing } from "@/lib/types";

export default function FarmsPage() {
  const { data, error } = useSWR<Listing[]>("/listings");
  const [product, setProduct] = useState("");
  const [q, setQ] = useState("");
  const [offerFor, setOfferFor] = useState<Listing | null>(null);
  if (error) return <ErrorState error={error} />;
  if (!data) return <PageSkeleton />;
  const products = [...new Set(data.map((l) => l.product_type))];
  const needle = q.trim().toLowerCase();
  const shown = data.filter(
    (l) =>
      (!product || l.product_type === product) &&
      (!needle || [l.farm.name, l.farm.province, productName(l.product_type, l.variety), l.code].some((s) => s.toLowerCase().includes(needle))),
  );
  return (
    <>
      <PageHeader
        title="ค้นหาสวน"
        subtitle="ผลผลิตที่สวนประกาศขายล่วงหน้า — ส่งข้อเสนอหรือทักแชทคุยกับสวนได้ทันที"
        actions={<LinkButton href="/requests/new" variant="secondary">ให้ระบบจับคู่จากคำขอซื้อ</LinkButton>}
      />
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาชื่อสวน จังหวัด หรือผลผลิต" className="rounded-full py-2.5 pl-10" aria-label="ค้นหาสวน" />
      </div>
      <Chips
        className="mb-5"
        value={product}
        onChange={setProduct}
        items={[{ value: "", label: "ทั้งหมด", count: data.length }, ...products.map((p) => ({ value: p, label: PRODUCT[p] ?? p, count: data.filter((l) => l.product_type === p).length }))]}
      />
      {shown.length === 0 ? (
        <Card><Empty icon={<Search className="size-10" />} title="ไม่พบผลผลิตที่ค้นหา" /></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((l) => <ListingCard key={l.id} l={l} onOffer={() => setOfferFor(l)} />)}
        </div>
      )}
      <OfferDialog listing={offerFor} onClose={() => setOfferFor(null)} />
    </>
  );
}
