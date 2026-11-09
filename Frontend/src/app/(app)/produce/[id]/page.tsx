"use client";

import { SplitSquareHorizontal } from "lucide-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { InventoryBar } from "@/components/inventory";
import { FarmerOffersTable } from "@/components/offers-table";
import { OrdersTable } from "@/components/orders";
import { ShortfallButton } from "@/components/shortfall";
import { Card, DL, ErrorState, LinkButton, PageHeader, PageSkeleton, StatusBadge } from "@/components/ui";
import { fmtKg, fmtRange, fmtTHB } from "@/lib/format";
import { INVENTORY_STATUS, productName } from "@/lib/labels";
import type { Listing } from "@/lib/types";

export default function ListingDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: l, error } = useSWR<Listing>(`/listings/${id}`);
  if (error) return <ErrorState error={error} />;
  if (!l) return <PageSkeleton />;
  const inv = l.inventory;
  return (
    <>
      <PageHeader
        eyebrow={`${l.code} · ${l.farm.name}`}
        title={productName(l.product_type, l.variety)}
        subtitle={`เก็บเกี่ยว ${fmtRange(l.harvest_start, l.harvest_end)} · ${l.farm.province}`}
        actions={
          <>
            <ShortfallButton listing={l} />
            {l.pending_offers > 0 && inv.available_kg > 0 && (
              <LinkButton href={`/allocation/${l.id}`}>
                <SplitSquareHorizontal className="size-4" />
                จัดสรรผลผลิต ({l.pending_offers} ข้อเสนอ)
              </LinkButton>
            )}
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="สถานะผลผลิต" className="lg:col-span-2" action={<StatusBadge map={INVENTORY_STATUS} value={inv.status} />}>
          <InventoryBar inv={inv} />
          <div className="mt-5">
            <DL
              cols={3}
              items={[
                ["ประมาณการ", fmtKg(inv.estimated_kg)],
                ["ยังไม่ผูกพัน", fmtKg(inv.available_kg)],
                ["จองชั่วคราว", fmtKg(inv.reserved_kg)],
                ["ทำสัญญาแล้ว", fmtKg(inv.contracted_kg)],
                ["เก็บเกี่ยวจริง", fmtKg(inv.harvested_kg)],
                ["ส่งมอบแล้ว", fmtKg(inv.delivered_kg)],
                ["ผ่านการตรวจ", fmtKg(inv.accepted_kg)],
                ["ถูกปฏิเสธ", fmtKg(inv.rejected_kg)],
              ]}
            />
          </div>
        </Card>
        <Card title="รายละเอียดประกาศ">
          <DL
            cols={1}
            items={[
              ["เกรดที่คาดว่าจะได้", l.expected_grades.join(", ")],
              ["ราคาคาดหวัง", l.price_min ? `${fmtTHB(l.price_min)} – ${fmtTHB(l.price_max)} / กก.` : "—"],
              ["หมายเหตุ", l.notes ?? "—"],
            ]}
          />
        </Card>
      </div>
      <Card title="ข้อเสนอซื้อ" className="mt-6">
        <FarmerOffersTable offers={l.offers ?? []} />
      </Card>
      <Card title="สัญญา HarvestLock ของประกาศนี้" className="mt-6">
        <OrdersTable orders={l.contracts ?? []} role="FARMER" />
      </Card>
    </>
  );
}
