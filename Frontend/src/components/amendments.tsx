"use client";

import { FilePen } from "lucide-react";
import { useState } from "react";
import { post } from "@/lib/api";
import { fmtDateTime, fmtRange, fmtTHB } from "@/lib/format";
import type { ContractDetail, Terms } from "@/lib/types";
import { useAction } from "@/lib/useAction";
import { Badge, Button, Card, Field, Input, Modal, Textarea } from "./ui";

export function formatTermValue(field: string, v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (field === "grade_prices") return Object.entries(v as Record<string, number>).map(([g, p]) => `${g} ${fmtTHB(p)}`).join(" · ");
  if (field === "delivery_window") return fmtRange((v as string[])[0], (v as string[])[1]);
  if (field === "deposit_thb") return fmtTHB(v as number);
  if (field === "quantity_kg") return `${Number(v).toLocaleString("th-TH")} กก.`;
  return String(v);
}

export function ProposeAmendmentButton({ c }: { c: ContractDetail }) {
  const [open, setOpen] = useState(false);
  const { run, pending } = useAction();
  if (!c.actions.includes("PROPOSE_AMENDMENT")) return null;
  const t: Terms = c.terms;
  const grades = Object.keys(t.grade_prices).sort();

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <FilePen className="size-4" />
        ขอแก้ไขสัญญา
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={`เสนอแก้ไข ${c.code} (ฉบับที่ ${c.current_version + 1})`} wide>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const num = (k: string) => Number(f.get(k));
            const ok = await run(
              () =>
                post(`/contracts/${c.id}/amendments`, {
                  reason: f.get("reason"),
                  changes: {
                    quantity_kg: num("quantity_kg"),
                    grade_prices: Object.fromEntries(grades.map((g) => [g, num(`price_${g}`)])),
                    delivery_window: [f.get("delivery_start"), f.get("delivery_end")],
                    payment_due_days: num("payment_due_days"),
                    deposit_thb: num("deposit_thb"),
                  },
                }),
              "ส่งข้อเสนอแก้ไขแล้ว — รออีกฝ่ายยอมรับ",
            );
            if (ok) setOpen(false);
          }}
        >
          <p className="text-sm text-slate-600">ฉบับปัจจุบันยังมีผลจนกว่าอีกฝ่ายจะยอมรับฉบับใหม่ ฉบับเดิมจะไม่ถูกเขียนทับ</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="ปริมาณ (กก.)"><Input name="quantity_kg" type="number" min="1" defaultValue={t.quantity_kg} /></Field>
            <Field label="ชำระภายใน (วัน)"><Input name="payment_due_days" type="number" min="0" max="90" defaultValue={t.payment_due_days} /></Field>
            <Field label="มัดจำ (บาท)"><Input name="deposit_thb" type="number" min="0" defaultValue={t.deposit_thb} /></Field>
            {grades.map((g) => (
              <Field key={g} label={`ราคาเกรด ${g} (บาท/กก.)`}><Input name={`price_${g}`} type="number" min="0" step="0.5" defaultValue={t.grade_prices[g]} /></Field>
            ))}
            <Field label="ส่งมอบตั้งแต่"><Input name="delivery_start" type="date" defaultValue={t.delivery_window[0]} /></Field>
            <Field label="ถึง"><Input name="delivery_end" type="date" defaultValue={t.delivery_window[1]} /></Field>
          </div>
          <Field label="เหตุผล"><Textarea name="reason" required minLength={3} /></Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>ยกเลิก</Button>
            <Button type="submit" loading={pending}>ส่งข้อเสนอแก้ไข</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function PendingAmendment({ c }: { c: ContractDetail }) {
  const { run, pending } = useAction();
  const [name, setName] = useState("");
  const [agree, setAgree] = useState(false);
  const p = c.proposed;
  if (!p) return null;
  const canRespond = c.actions.includes("RESPOND_AMENDMENT");
  const respond = (accept: boolean) =>
    run(() => post(`/contracts/${c.id}/amendments/respond`, accept ? { accept, signature_name: name.trim(), consent: true } : { accept }),
      accept ? "ยอมรับการแก้ไขแล้ว" : "ปฏิเสธการแก้ไขแล้ว");

  return (
    <Card className="mt-6 border-amber-200" title={<span className="flex items-center gap-2">ข้อเสนอแก้ไขฉบับที่ {p.version} <Badge tone="amber">รอยอมรับ</Badge></span>}>
      <div className="text-sm text-slate-600">เหตุผล: {p.reason} · เสนอเมื่อ {fmtDateTime(p.created_at)}</div>
      <div className="-mx-5 mt-3 overflow-x-auto">
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
              <th className="px-5 py-2 font-medium">รายการ</th>
              <th className="px-5 py-2 font-medium">ฉบับที่ {c.current_version} (มีผล)</th>
              <th className="px-5 py-2 font-medium">ฉบับที่ {p.version} (เสนอ)</th>
            </tr>
          </thead>
          <tbody>
            {p.diff.map((d) => (
              <tr key={d.field} className="border-b border-slate-100">
                <td className="px-5 py-2">{d.label}</td>
                <td className="px-5 py-2 text-slate-500 line-through">{formatTermValue(d.field, d.from)}</td>
                <td className="px-5 py-2 font-medium text-green-800">{formatTermValue(d.field, d.to)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canRespond ? (
        <div className="mt-4 space-y-3 text-sm">
          <label className="flex items-start gap-2">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1 accent-green-800" />
            <span>ยอมรับเงื่อนไขฉบับที่ {p.version} <span className="font-mono text-xs text-slate-500">({p.terms_hash.slice(0, 12)}…)</span></span>
          </label>
          <Field label="ลงชื่อ" className="max-w-sm"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ชื่อ นามสกุล" /></Field>
          <div className="flex flex-wrap gap-2">
            <Button loading={pending} disabled={!agree || name.trim().length < 2} onClick={() => respond(true)}>ลงนามยอมรับการแก้ไข</Button>
            <Button variant="danger" loading={pending} onClick={() => respond(false)}>ปฏิเสธ</Button>
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm text-slate-500">รออีกฝ่ายพิจารณา</p>
      )}
    </Card>
  );
}
