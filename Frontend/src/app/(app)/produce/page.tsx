"use client";

import { CalendarRange, MapPin, Sprout } from "lucide-react";
import Link from "next/link";
import useSWR from "swr";
import { InventoryBar } from "@/components/inventory";
import { Badge, Card, Empty, ErrorState, LinkButton, PageHeader, PageSkeleton, StatusBadge } from "@/components/ui";
import { fmtKg, fmtRange, fmtTHB } from "@/lib/format";
import { INVENTORY_STATUS, productName } from "@/lib/labels";
import type { Listing } from "@/lib/types";

export default function ProducePage() {
  const { data, error } = useSWR<Listing[]>("/listings");
  if (error) return <ErrorState error={error} />;
  if (!data) return <PageSkeleton />;
  return (
    <>
      <PageHeader
        title="ผลผลิตของฉัน"
        subtitle="ปริมาณประมาณการไม่ใช่สินค้าคงคลังจริง — ระบบแยกปริมาณที่จอง ทำสัญญา เก็บเกี่ยว และส่งมอบจริง"
        actions={<LinkButton href="/produce/new">+ ลงประกาศผลผลิต</LinkButton>}
      />
      {data.length === 0 ? (
        <Card><Empty icon={<Sprout className="size-10" />} title="ยังไม่มีประกาศผลผลิต">ลงประกาศผลผลิตที่คาดว่าจะเก็บเกี่ยว เพื่อให้ผู้ซื้อยื่นข้อเสนอ</Empty></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {data.map((l) => (
            <Link key={l.id} href={`/produce/${l.id}`} className="block rounded-3xl bg-white p-5 ring-1 ring-slate-900/[0.05] transition hover:shadow-md hover:ring-green-800/25">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs text-slate-500">{l.code}</div>
                  <div className="text-lg font-semibold text-slate-900">{productName(l.product_type, l.variety)}</div>
                </div>
                <StatusBadge map={INVENTORY_STATUS} value={l.inventory.status} />
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
                <span className="inline-flex items-center gap-1"><CalendarRange className="size-4 text-slate-400" />{fmtRange(l.harvest_start, l.harvest_end)}</span>
                <span className="inline-flex items-center gap-1"><MapPin className="size-4 text-slate-400" />{l.farm.province}</span>
                <span>เกรด {l.expected_grades.join(", ")}</span>
              </div>
              <div className="mt-4 flex items-baseline justify-between text-sm">
                <span className="text-slate-500">ประมาณการ <span className="tabular font-semibold text-slate-900">{fmtKg(l.estimated_qty_kg)}</span></span>
                {l.price_min && <span className="text-slate-500">คาด {fmtTHB(l.price_min)}–{fmtTHB(l.price_max)}/กก.</span>}
              </div>
              <div className="mt-2"><InventoryBar inv={l.inventory} /></div>
              {l.pending_offers > 0 && <Badge tone="amber" className="mt-3">ข้อเสนอรอพิจารณา {l.pending_offers} รายการ</Badge>}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
