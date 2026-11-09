"use client";

import { Truck } from "lucide-react";
import Link from "next/link";
import useSWR from "swr";
import { Card, Empty, ErrorState, PageHeader, PageSkeleton, StatusBadge, Table, Td } from "@/components/ui";
import { fmtDate, fmtDateTime, fmtKg } from "@/lib/format";
import { LOT_STATUS, productName } from "@/lib/labels";
import { useSession } from "@/lib/session";
import type { Lot } from "@/lib/types";

export default function DeliveriesPage() {
  const { user } = useSession();
  const { data, error } = useSWR<Lot[]>("/lots");
  if (error) return <ErrorState error={error} />;
  if (!data || !user) return <PageSkeleton />;
  return (
    <>
      <PageHeader
        title={user.role === "BUYER" ? "สินค้าที่กำลังมา" : "เก็บเกี่ยว & ขนส่ง"}
        subtitle="แต่ละล็อตเชื่อมกับสวน ประกาศ สัญญา ผู้ซื้อ การขนส่ง ผลตรวจ และการชำระเงิน"
      />
      <Card>
        {data.length === 0 ? (
          <Empty icon={<Truck className="size-10" />} title="ยังไม่มีล็อต">ล็อตถูกสร้างเมื่อเกษตรกรบันทึกการเก็บเกี่ยวของสัญญาที่ยืนยันแล้ว</Empty>
        ) : (
          <Table head={["ล็อต", "สัญญา", "ผลผลิต", "สวน → ผู้ซื้อ", "เก็บเกี่ยว", "สุทธิ / รับจริง", "ส่ง / รับ", "สถานะ"]}>
            {data.map((l) => (
              <tr key={l.id} className="hover:bg-slate-50">
                <Td className="font-medium">{l.code}</Td>
                <Td><Link href={`/contracts/${l.contract_id}`} className="text-green-800 hover:underline">{l.contract_code}</Link></Td>
                <Td>{productName(l.product_type, l.variety)}</Td>
                <Td className="max-w-[240px] truncate">{l.farmer.name} → {l.buyer.name}</Td>
                <Td>{fmtDate(l.harvest_date)} · <span className="tabular">{fmtKg(l.harvested_kg)}</span></Td>
                <Td className="tabular">{fmtKg(l.net_kg)} / {fmtKg(l.received_kg)}</Td>
                <Td className="text-xs text-slate-600">{fmtDateTime(l.dispatched_at)}<br />{fmtDateTime(l.received_at)}</Td>
                <Td><StatusBadge map={LOT_STATUS} value={l.status} /></Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
