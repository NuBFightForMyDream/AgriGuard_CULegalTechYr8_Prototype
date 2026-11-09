"use client";

import { useState } from "react";
import { post } from "@/lib/api";
import { fmtDate, fmtKg, fmtTHB } from "@/lib/format";
import { OFFER_STATUS } from "@/lib/labels";
import type { Offer } from "@/lib/types";
import { useAction } from "@/lib/useAction";
import { TrustBadge } from "./trust";
import { Button, Empty, Field, Modal, StatusBadge, Table, Td, Textarea } from "./ui";

export function OfferPrices({ prices }: { prices: Record<string, number> }) {
  return (
    <span className="tabular">
      {Object.entries(prices)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([g, p]) => `${g} ${fmtTHB(p)}`)
        .join(" · ")}
    </span>
  );
}

/** Offers received by a farmer, with reject action. */
export function FarmerOffersTable({ offers, showListing }: { offers: Offer[]; showListing?: boolean }) {
  const [rejecting, setRejecting] = useState<Offer | null>(null);
  const { run, pending } = useAction();
  if (!offers.length) return <Empty title="ยังไม่มีข้อเสนอ" />;
  return (
    <>
      <Table head={["ผู้ซื้อ", "AgriTrust", ...(showListing ? ["ประกาศ"] : []), "ปริมาณ", "ราคา/กก.", "ชำระภายใน", "มัดจำ", "สถานะ", ""]}>
        {offers.map((o) => (
          <tr key={o.id} className="hover:bg-slate-50">
            <Td className="max-w-[220px]">
              <div className="truncate font-medium">{o.buyer.name}</div>
              <div className="text-xs text-slate-500">{o.code} · {fmtDate(o.created_at)}</div>
            </Td>
            <Td><TrustBadge trust={o.buyer_trust} orgId={o.buyer.id} /></Td>
            {showListing && <Td>{o.listing.code}</Td>}
            <Td className="tabular">{fmtKg(o.quantity_kg)}</Td>
            <Td><OfferPrices prices={o.grade_prices} /></Td>
            <Td>{o.payment_terms_days} วัน</Td>
            <Td className="tabular">{fmtTHB(o.deposit_thb)}</Td>
            <Td><StatusBadge map={OFFER_STATUS} value={o.status} /></Td>
            <Td>{o.status === "PENDING" && <Button size="sm" variant="danger" onClick={() => setRejecting(o)}>ปฏิเสธ</Button>}</Td>
          </tr>
        ))}
      </Table>
      <Modal open={!!rejecting} onClose={() => setRejecting(null)} title={`ปฏิเสธข้อเสนอ ${rejecting?.code ?? ""}`}>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const reason = new FormData(e.currentTarget).get("reason");
            const ok = await run(() => post(`/offers/${rejecting!.id}/reject`, { reason: reason || null }), "ปฏิเสธข้อเสนอแล้ว");
            if (ok) setRejecting(null);
          }}
          className="space-y-4"
        >
          <p className="text-sm text-slate-600">ผู้ซื้อ {rejecting?.buyer.name} จะเห็นว่าข้อเสนอถูกปฏิเสธ การปฏิเสธไม่กระทบ AgriTrust ของผู้ซื้อ</p>
          <Field label="เหตุผล (ไม่บังคับ)"><Textarea name="reason" /></Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setRejecting(null)}>ยกเลิก</Button>
            <Button type="submit" variant="danger" loading={pending}>ยืนยันปฏิเสธ</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
