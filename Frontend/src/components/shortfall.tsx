"use client";

import { TrendingDown } from "lucide-react";
import { useState } from "react";
import { post } from "@/lib/api";
import { fmtKg } from "@/lib/format";
import type { Listing } from "@/lib/types";
import { useAction } from "@/lib/useAction";
import { Button, Field, Input, Modal, Textarea } from "./ui";

type Plan = { committed_kg: number; reserved_kg: number; plan: { contract_id: string; contract_code: string; buyer: string; current_kg: number; new_kg: number; reduction_kg: number }[] };

/** Harvest shortfall: apply the agreed proportional-reduction policy as amendment proposals (never silently). */
export function ShortfallButton({ listing }: { listing: Listing }) {
  const [open, setOpen] = useState(false);
  const [actual, setActual] = useState("");
  const [preview, setPreview] = useState<Plan | null>(null);
  const { run, pending } = useAction();
  if (listing.inventory.contracted_kg <= 0) return null;

  async function check() {
    setPreview(await post<Plan>(`/listings/${listing.id}/shortfall/preview`, { actual_kg: Number(actual) }));
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <TrendingDown className="size-4" />
        แจ้งผลผลิตขาด
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="แจ้งผลผลิตต่ำกว่าที่ทำสัญญา" wide>
        <div className="space-y-4 text-sm">
          <p className="text-slate-600">
            ระบบใช้นโยบายที่ตกลงในสัญญา (ลดตามสัดส่วนให้ผู้ซื้อทุกราย) และส่งเป็น<b>ข้อเสนอแก้ไขสัญญา</b>ให้ผู้ซื้อแต่ละรายยอมรับ — ไม่แก้สัญญาที่ยืนยันแล้วโดยอัตโนมัติ
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="ผลผลิตที่คาดว่าจะได้จริง (กก.)"><Input type="number" min="0" value={actual} onChange={(e) => { setActual(e.target.value); setPreview(null); }} /></Field>
            <Button variant="secondary" disabled={!actual} onClick={check}>ดูผลกระทบ</Button>
          </div>
          {preview && preview.reserved_kg > 0 && Number(actual) < preview.committed_kg + preview.reserved_kg && (
            <p className="rounded-lg bg-amber-50 p-3 text-amber-800">
              ยังมีการจองที่ผู้ซื้อยังไม่ลงนาม {fmtKg(preview.reserved_kg)} — ไม่ผูกพันและไม่ถูกปรับอัตโนมัติ หากผลผลิตไม่พอ ให้รอให้หมดอายุหรือแจ้งผู้ซื้อก่อนลงนาม
            </p>
          )}
          {preview && (
            preview.plan.length === 0 ? (
              <p className="text-amber-700">ไม่มีผลกระทบ: ผลผลิตไม่น้อยกว่าที่ทำสัญญาไว้ ({fmtKg(preview.committed_kg)}) หรือไม่มีสัญญาที่ยังไม่เก็บเกี่ยว</p>
            ) : (
              <form
                className="space-y-3"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const reason = new FormData(e.currentTarget).get("reason");
                  const ok = await run(() => post(`/listings/${listing.id}/shortfall`, { actual_kg: Number(actual), reason: reason || null }), "ส่งข้อเสนอลดปริมาณให้ผู้ซื้อแล้ว");
                  if (ok) { setOpen(false); setPreview(null); }
                }}
              >
                <table className="w-full">
                  <thead><tr className="border-b border-slate-200 text-left text-xs text-slate-500"><th className="py-2">สัญญา / ผู้ซื้อ</th><th>ปัจจุบัน</th><th>ใหม่</th><th>ลดลง</th></tr></thead>
                  <tbody>
                    {preview.plan.map((p) => (
                      <tr key={p.contract_id} className="border-b border-slate-100">
                        <td className="py-2">{p.contract_code} · {p.buyer}</td>
                        <td className="tabular">{fmtKg(p.current_kg)}</td>
                        <td className="tabular font-medium">{fmtKg(p.new_kg)}</td>
                        <td className="tabular text-red-600">−{fmtKg(p.reduction_kg)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Field label="หมายเหตุถึงผู้ซื้อ"><Textarea name="reason" placeholder="เช่น ฝนตกหนักช่วงติดผล" /></Field>
                <div className="flex justify-end"><Button type="submit" loading={pending}>ส่งข้อเสนอแก้ไขให้ผู้ซื้อ {preview.plan.length} ราย</Button></div>
              </form>
            )
          )}
        </div>
      </Modal>
    </>
  );
}
