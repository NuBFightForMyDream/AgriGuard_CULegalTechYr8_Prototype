"use client";

import { SplitSquareHorizontal } from "lucide-react";
import useSWR from "swr";
import { InventoryBar } from "@/components/inventory";
import { Card, Empty, ErrorState, LinkButton, PageHeader, PageSkeleton } from "@/components/ui";
import { fmtKg, fmtRange } from "@/lib/format";
import { productName } from "@/lib/labels";
import type { Listing } from "@/lib/types";

export default function AllocationIndex() {
  const { data, error } = useSWR<Listing[]>("/listings");
  if (error) return <ErrorState error={error} />;
  if (!data) return <PageSkeleton />;
  const ready = data.filter((l) => l.pending_offers > 0 && l.inventory.available_kg > 0);
  return (
    <>
      <PageHeader title="Smart Allocation" subtitle="แบ่งผลผลิตหนึ่งรอบให้ผู้ซื้อหลายราย โดยไม่จองเกินผลผลิตที่ยังไม่ผูกพัน" />
      {ready.length === 0 ? (
        <Card><Empty icon={<SplitSquareHorizontal className="size-10" />} title="ยังไม่มีประกาศที่รอจัดสรร">ประกาศจะปรากฏที่นี่เมื่อมีข้อเสนอซื้อและยังมีผลผลิตที่ยังไม่ผูกพัน</Empty></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {ready.map((l) => (
            <Card key={l.id} title={`${productName(l.product_type, l.variety)} · ${l.code}`} action={<LinkButton href={`/allocation/${l.id}`} size="sm">เปิดพื้นที่จัดสรร</LinkButton>}>
              <div className="mb-3 text-sm text-slate-600">
                ยังไม่ผูกพัน <b className="tabular">{fmtKg(l.inventory.available_kg)}</b> · ข้อเสนอ {l.pending_offers} ราย · เก็บเกี่ยว {fmtRange(l.harvest_start, l.harvest_end)}
              </div>
              <InventoryBar inv={l.inventory} />
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
