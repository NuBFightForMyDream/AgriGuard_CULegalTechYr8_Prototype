"use client";

import { CalendarRange, MapPin, Search } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";
import { InventoryBar } from "@/components/inventory";
import { OfferDialog } from "@/components/offer-dialog";
import { Button, Card, Empty, ErrorState, PageHeader, PageSkeleton, Select, StatusBadge } from "@/components/ui";
import { fmtKg, fmtRange, fmtTHB } from "@/lib/format";
import { INVENTORY_STATUS, PRODUCT, productName } from "@/lib/labels";
import type { Listing } from "@/lib/types";

export default function FarmsPage() {
  const { data, error } = useSWR<Listing[]>("/listings");
  const [product, setProduct] = useState("");
  const [offerFor, setOfferFor] = useState<Listing | null>(null);
  if (error) return <ErrorState error={error} />;
  if (!data) return <PageSkeleton />;
  const shown = data.filter((l) => !product || l.product_type === product);
  const products = [...new Set(data.map((l) => l.product_type))];
  return (
    <>
      <PageHeader
        title="ค้นหาสวน"
        subtitle="ผลผลิตที่สวนประกาศไว้ล่วงหน้า — แนะนำให้เริ่มจากคำขอซื้อเพื่อให้ระบบจับคู่และจัดอันดับให้"
        actions={
          <Select value={product} onChange={(e) => setProduct(e.target.value)} className="w-44">
            <option value="">ทุกผลผลิต</option>
            {products.map((p) => <option key={p} value={p}>{PRODUCT[p] ?? p}</option>)}
          </Select>
        }
      />
      {shown.length === 0 ? (
        <Card><Empty icon={<Search className="size-10" />} title="ไม่พบผลผลิต" /></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((l) => (
            <div key={l.id} className="flex flex-col rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold">{l.farm.name}</div>
                  <div className="text-sm text-slate-500">{productName(l.product_type, l.variety)}</div>
                </div>
                <StatusBadge map={INVENTORY_STATUS} value={l.inventory.status} />
              </div>
              <div className="mt-3 space-y-1 text-sm text-slate-600">
                <div className="inline-flex items-center gap-1"><CalendarRange className="size-4 text-slate-400" />{fmtRange(l.harvest_start, l.harvest_end)}</div>
                <div className="inline-flex items-center gap-1 sm:ml-4"><MapPin className="size-4 text-slate-400" />{l.farm.province}</div>
                <div>เกรด {l.expected_grades.join(", ")}{l.price_min && ` · คาด ${fmtTHB(l.price_min)}–${fmtTHB(l.price_max)}/กก.`}</div>
              </div>
              <div className="mt-3 text-sm">คงเหลือ <b className="tabular">{fmtKg(l.inventory.available_kg)}</b> จาก {fmtKg(l.estimated_qty_kg)}</div>
              <div className="mt-2"><InventoryBar inv={l.inventory} showLegend={false} /></div>
              <div className="mt-auto pt-4">
                <Button size="sm" className="w-full" disabled={l.inventory.available_kg <= 0} onClick={() => setOfferFor(l)}>ส่งข้อเสนอ</Button>
              </div>
            </div>
          ))}
        </div>
      )}
      <OfferDialog listing={offerFor} onClose={() => setOfferFor(null)} />
    </>
  );
}
