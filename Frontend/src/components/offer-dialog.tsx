"use client";

import { useState } from "react";
import { post } from "@/lib/api";
import { fmtKg, fmtRange } from "@/lib/format";
import { productName } from "@/lib/labels";
import type { Listing, Offer, PurchaseRequest } from "@/lib/types";
import { useAction } from "@/lib/useAction";
import { Button, Field, Input, Modal, Textarea } from "./ui";

export function OfferDialog({ listing, request, onClose }: { listing: Listing | null; request?: PurchaseRequest; onClose: () => void }) {
  const { run, pending } = useAction();
  const [prices, setPrices] = useState<Record<string, string>>({});
  if (!listing) return null;

  const grades = listing.expected_grades.filter((g) => !request || request.accepted_grades.includes(g));
  const single = request?.sourcing_mode === "SINGLE";
  const wanted = request?.fill ? Number(request.fill.remaining_kg) : request?.quantity_kg;
  const defaultQty = single ? Number(request!.quantity_kg) : Math.min(wanted ?? listing.inventory.available_kg, listing.inventory.available_kg || listing.estimated_qty_kg);
  const priceFor = (g: string, i: number) => prices[g] ?? (i === 0 && request?.target_price ? String(request.target_price) : "");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const grade_prices = Object.fromEntries(grades.map((g, i) => [g, priceFor(g, i)]).filter(([, p]) => p !== "").map(([g, p]) => [g, Number(p)]));
    const ok = await run(
      () =>
        post<Offer>("/offers", {
          listing_id: listing!.id,
          purchase_request_id: request?.id ?? null,
          quantity_kg: Number(f.get("quantity_kg")),
          min_quantity_kg: f.get("min_quantity_kg") ? Number(f.get("min_quantity_kg")) : null,
          grade_prices,
          payment_terms_days: Number(f.get("payment_terms_days")),
          deposit_thb: Number(f.get("deposit_thb") || 0),
          message: f.get("message") || null,
        }),
      `ส่งข้อเสนอให้ ${listing!.farm.name} แล้ว`,
    );
    if (ok) {
      setPrices({});
      onClose();
    }
  }

  return (
    <Modal open={!!listing} onClose={onClose} title={`ส่งข้อเสนอซื้อ · ${listing.code}`} wide>
      <div className="mb-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
        <b className="text-slate-900">{listing.farm.name}</b> · {productName(listing.product_type, listing.variety)} · เก็บเกี่ยว{" "}
        {fmtRange(listing.harvest_start, listing.harvest_end)} · ยังไม่ผูกพัน {fmtKg(listing.inventory.available_kg)}
        {request && <> · สำหรับคำขอ {request.code}</>}
      </div>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="ปริมาณที่เสนอซื้อ (กก.)" hint={single ? "ซื้อจากผู้ขายรายเดียว: ต้องเต็มจำนวนของคำขอ" : request?.fill ? `ยังขาดอยู่ ${Number(request.fill.remaining_kg).toLocaleString("th-TH")} กก.` : undefined}>
          <Input name="quantity_kg" type="number" min="1" step="10" defaultValue={defaultQty} readOnly={single} required />
        </Field>
        {single ? (
          <Field label="ปริมาณขั้นต่ำที่รับได้"><Input value="เต็มจำนวน (สวนแบ่งให้บางส่วนไม่ได้)" disabled /></Field>
        ) : (
          <Field label="ปริมาณขั้นต่ำที่รับได้ (กก.)" hint="ถ้าได้รับจัดสรรน้อยกว่านี้จะไม่รับ">
            <Input name="min_quantity_kg" type="number" min="0" step="10" defaultValue={request?.min_quantity_kg ?? ""} />
          </Field>
        )}
        <div className="sm:col-span-2">
          <div className="mb-1 text-sm font-medium text-slate-700">ราคาต่อกิโลกรัมตามเกรด (บาท) — เว้นว่างเกรดที่ไม่รับ</div>
          <div className="grid gap-3 sm:grid-cols-3">
            {grades.map((g, i) => (
              <Field key={g} label={`เกรด ${g}`}>
                <Input type="number" min="0" step="0.5" value={priceFor(g, i)} onChange={(e) => setPrices((p) => ({ ...p, [g]: e.target.value }))} required={i === 0} />
              </Field>
            ))}
          </div>
        </div>
        <Field label="ชำระเงินภายใน (วันหลังตรวจรับ)">
          <Input name="payment_terms_days" type="number" min="0" max="90" defaultValue={request?.payment_terms_days ?? 3} />
        </Field>
        <Field label="เงินมัดจำ (บาท)" hint="จำลองใน Phase 1">
          <Input name="deposit_thb" type="number" min="0" step="100" defaultValue={0} />
        </Field>
        <Field label="ข้อความถึงเกษตรกร" className="sm:col-span-2"><Textarea name="message" /></Field>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="ghost" onClick={onClose}>ยกเลิก</Button>
          <Button type="submit" loading={pending}>ส่งข้อเสนอ</Button>
        </div>
      </form>
    </Modal>
  );
}
