"use client";

import { SearchX } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { MatchCard } from "@/components/match-card";
import { OfferDialog } from "@/components/offer-dialog";
import { OfferPrices } from "@/components/offers-table";
import { FillProgress, SourcingBadge } from "@/components/sourcing";
import { Button, Card, DL, Empty, ErrorState, PageHeader, PageSkeleton, StatusBadge, Table, Td } from "@/components/ui";
import { post } from "@/lib/api";
import { fmtKg, fmtRange, fmtTHB } from "@/lib/format";
import { OFFER_STATUS, REQUEST_STATUS, productName } from "@/lib/labels";
import type { Listing, Match, PurchaseRequest } from "@/lib/types";
import { useAction } from "@/lib/useAction";

type Matches = { model_version: string; recommendations: Match[]; excluded: { listing_code: string; farm_name: string; unmet: string[] }[] };

export default function RequestDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: r, error } = useSWR<PurchaseRequest>(`/purchase-requests/${id}`);
  const { data: matches } = useSWR<Matches>(`/purchase-requests/${id}/matches`);
  const [offerFor, setOfferFor] = useState<Listing | null>(null);
  const { run, pending } = useAction();
  if (error) return <ErrorState error={error} />;
  if (!r) return <PageSkeleton />;

  return (
    <>
      <PageHeader
        eyebrow={r.code}
        title={`${productName(r.product_type, r.variety)} · ${fmtKg(r.quantity_kg)}`}
        subtitle={`รับสินค้า ${fmtRange(r.delivery_start, r.delivery_end)} · ส่งที่ ${r.destination_province}`}
        actions={
          <>
            <SourcingBadge r={r} />
            <StatusBadge map={REQUEST_STATUS} value={r.status} />
            {(r.status === "OPEN" || r.status === "PARTIALLY_FILLED") && (
              <Button size="sm" variant="ghost" loading={pending} onClick={() => run(() => post(`/purchase-requests/${r.id}/cancel`, {}), "ยกเลิกคำขอซื้อแล้ว")}>ยกเลิกคำขอ</Button>
            )}
          </>
        }
      />
      <Card title="ความคืบหน้าการจัดหา" className="mb-6">
        <FillProgress r={r} />
        {r.accepting_offers === false && r.closed_reason && <p className="mt-3 text-sm text-slate-600">ปิดรับข้อเสนอแล้ว: {r.closed_reason}</p>}
        {r.sourcing_mode === "SINGLE" && r.accepting_offers !== false && (
          <p className="mt-3 text-xs text-slate-500">ซื้อจากผู้ขายรายเดียว: ส่งข้อเสนอให้หลายสวนเพื่อเทียบได้ แต่เมื่อคุณลงนามสัญญากับสวนใดแล้ว ข้อเสนอและการจองของสวนอื่นจะถูกปิดอัตโนมัติ</p>
        )}
      </Card>
      <Card title="รายละเอียดคำขอ">
        <DL
          cols={3}
          items={[
            ["เกรดที่รับ", r.accepted_grades.join(", ")],
            ["ปริมาณขั้นต่ำ", fmtKg(r.min_quantity_kg)],
            ["ราคาเป้าหมาย", r.target_price ? `${fmtTHB(r.target_price)}/กก.` : "—"],
            ["ชำระเงิน", `ภายใน ${r.payment_terms_days} วันหลังตรวจรับ`],
            ["ข้อกำหนดคุณภาพ", r.quality_notes ?? "—"],
          ]}
        />
      </Card>

      <div className="mb-3 mt-8 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">สวนที่แนะนำ</h2>
        <span className="text-xs text-slate-500">
          {matches?.model_version} · กรองเงื่อนไขบังคับก่อน แล้วจัดอันดับด้วยสูตรถ่วงน้ำหนัก (ไม่ใช่ AI)
        </span>
      </div>
      {!matches ? (
        <PageSkeleton />
      ) : matches.recommendations.length === 0 ? (
        <Card><Empty icon={<SearchX className="size-10" />} title="ยังไม่มีสวนที่ตรงเงื่อนไขทั้งหมด">ลองขยายช่วงรับสินค้า ลดปริมาณขั้นต่ำ หรือรับเกรดเพิ่ม</Empty></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {matches.recommendations.map((m) => <MatchCard key={m.listing.id} m={m} onOffer={r.accepting_offers === false ? undefined : () => setOfferFor(m.listing)} />)}
        </div>
      )}
      {matches && matches.excluded.length > 0 && (
        <Card title="สวนที่ไม่ผ่านเงื่อนไขบังคับ" className="mt-6">
          <ul className="space-y-2 text-sm">
            {matches.excluded.map((x) => (
              <li key={x.listing_code}><b>{x.farm_name}</b> ({x.listing_code}): <span className="text-slate-600">{x.unmet.join(" · ")}</span></li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="ข้อเสนอที่ส่งแล้วสำหรับคำขอนี้" className="mt-6">
        {r.offers?.length ? (
          <Table head={["ข้อเสนอ", "สวน", "ปริมาณ", "ราคา", "สถานะ"]}>
            {r.offers.map((o) => (
              <tr key={o.id}>
                <Td className="font-medium">{o.code}</Td>
                <Td>{o.listing.farm_name}</Td>
                <Td className="tabular">{fmtKg(o.quantity_kg)}</Td>
                <Td><OfferPrices prices={o.grade_prices} /></Td>
                <Td><StatusBadge map={OFFER_STATUS} value={o.status} /></Td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty title="ยังไม่ได้ส่งข้อเสนอ" />
        )}
      </Card>
      <OfferDialog listing={offerFor} request={r} onClose={() => setOfferFor(null)} />
    </>
  );
}
