"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { FarmerOffersTable, OfferPrices } from "@/components/offers-table";
import { Button, Card, Empty, ErrorState, PageHeader, PageSkeleton, StatusBadge, SubNav, Table, Tabs, Td } from "@/components/ui";
import { post } from "@/lib/api";
import { fmtDate, fmtKg } from "@/lib/format";
import { OFFER_STATUS, productName, SUBNAV } from "@/lib/labels";
import { useSession } from "@/lib/session";
import type { Offer } from "@/lib/types";
import { useAction } from "@/lib/useAction";

export default function OffersPage() {
  const { user } = useSession();
  const { data, error } = useSWR<Offer[]>("/offers");
  const [tab, setTab] = useState<"PENDING" | "ALL">("PENDING");
  const { run, pending } = useAction();
  if (error) return <ErrorState error={error} />;
  if (!data || !user) return <PageSkeleton />;
  const shown = tab === "PENDING" ? data.filter((o) => o.status === "PENDING") : data;
  const tabs = [
    { value: "PENDING" as const, label: "รอพิจารณา", count: data.filter((o) => o.status === "PENDING").length },
    { value: "ALL" as const, label: "ทั้งหมด", count: data.length },
  ];

  if (user.role === "FARMER") {
    return (
      <>
        <SubNav items={SUBNAV.farmerOffers} />
        <PageHeader title="ข้อเสนอซื้อ" subtitle="ข้อเสนอจากผู้ซื้อสำหรับประกาศผลผลิตของคุณ — เปิด Smart Allocation เพื่อแบ่งผลผลิต" />
        <Tabs value={tab} onChange={setTab} tabs={tabs} />
        <Card><FarmerOffersTable offers={shown} showListing /></Card>
      </>
    );
  }

  return (
    <>
      <SubNav items={SUBNAV.buyerRequests} />
      <PageHeader title="ข้อเสนอของฉัน" subtitle="ข้อเสนอที่ส่งให้สวน เมื่อเกษตรกรจัดสรรแล้วจะได้ HarvestLock ให้ยืนยัน" />
      <Tabs value={tab} onChange={setTab} tabs={tabs} />
      <Card>
        {shown.length === 0 ? (
          <Empty title="ไม่มีข้อเสนอ">ค้นหาสวนจากหน้าคำขอซื้อหรือค้นหาสวน แล้วส่งข้อเสนอ</Empty>
        ) : (
          <Table head={["ข้อเสนอ", "สวน / ประกาศ", "ผลผลิต", "ปริมาณ", "ราคา/กก.", "คำขอซื้อ", "สถานะ", ""]}>
            {shown.map((o) => (
              <tr key={o.id}>
                <Td>
                  <div className="font-medium">{o.code}</div>
                  <div className="text-xs text-slate-500">{fmtDate(o.created_at)}</div>
                </Td>
                <Td className="max-w-[200px] truncate">{o.listing.farm_name} · {o.listing.code}</Td>
                <Td>{productName(o.listing.product_type, o.listing.variety)}</Td>
                <Td className="tabular">{fmtKg(o.quantity_kg)}</Td>
                <Td><OfferPrices prices={o.grade_prices} /></Td>
                <Td>{o.purchase_request_code ?? "—"}</Td>
                <Td><StatusBadge map={OFFER_STATUS} value={o.status} /></Td>
                <Td>
                  {o.status === "PENDING" ? (
                    <Button size="sm" variant="ghost" loading={pending} onClick={() => run(() => post(`/offers/${o.id}/withdraw`, {}), "ถอนข้อเสนอแล้ว")}>ถอน</Button>
                  ) : o.status === "ALLOCATED" ? (
                    <Link href="/contracts" className="text-sm text-green-800 hover:underline">ดู HarvestLock</Link>
                  ) : null}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
