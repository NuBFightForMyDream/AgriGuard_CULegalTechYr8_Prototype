"use client";

import { ShoppingBasket } from "lucide-react";
import Link from "next/link";
import useSWR from "swr";
import { Card, Empty, ErrorState, LinkButton, PageHeader, PageSkeleton, StatusBadge, Table, Td } from "@/components/ui";
import { fmtKg, fmtRange, fmtTHB } from "@/lib/format";
import { REQUEST_STATUS, SOURCING, productName } from "@/lib/labels";
import type { PurchaseRequest } from "@/lib/types";

export default function RequestsPage() {
  const { data, error } = useSWR<PurchaseRequest[]>("/purchase-requests");
  if (error) return <ErrorState error={error} />;
  if (!data) return <PageSkeleton />;
  return (
    <>
      <PageHeader title="คำขอซื้อ" subtitle="เริ่มจากความต้องการจริง แล้วให้ระบบจับคู่สวนที่เหมาะสม" actions={<LinkButton href="/requests/new">+ สร้างคำขอซื้อ</LinkButton>} />
      <Card>
        {data.length === 0 ? (
          <Empty icon={<ShoppingBasket className="size-10" />} title="ยังไม่มีคำขอซื้อ" />
        ) : (
          <Table head={["คำขอ", "ผลผลิต", "รูปแบบ", "ได้แล้ว / ต้องการ", "เกรด", "ราคาเป้าหมาย", "ช่วงรับสินค้า", "ข้อเสนอ", "สถานะ"]}>
            {data.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <Td><Link href={`/requests/${r.id}`} className="font-medium text-green-800 hover:underline">{r.code}</Link></Td>
                <Td>{productName(r.product_type, r.variety)}</Td>
                <Td>{SOURCING[r.sourcing_mode].label}{r.max_suppliers ? ` (≤${r.max_suppliers})` : ""}</Td>
                <Td className="tabular">{fmtKg(r.fill?.confirmed_kg ?? 0)} / {fmtKg(r.quantity_kg)}</Td>
                <Td>{r.accepted_grades.join(", ")}</Td>
                <Td className="tabular">{r.target_price ? `${fmtTHB(r.target_price)}/กก.` : "—"}</Td>
                <Td>{fmtRange(r.delivery_start, r.delivery_end)}</Td>
                <Td>{r.offers_count}</Td>
                <Td><StatusBadge map={REQUEST_STATUS} value={r.status} /></Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
