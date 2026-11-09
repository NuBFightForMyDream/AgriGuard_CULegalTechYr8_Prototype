"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { Button, Card, DL, Field, Input, PageHeader, Select, Textarea, cx } from "@/components/ui";
import { post } from "@/lib/api";
import { fmtKg, fmtRange, fmtTHB } from "@/lib/format";
import { productName } from "@/lib/labels";
import type { Catalog, PurchaseRequest } from "@/lib/types";
import { useAction } from "@/lib/useAction";

type Form = {
  product_type: string;
  variety: string;
  quantity_kg: string;
  min_quantity_kg: string;
  target_price: string;
  accepted_grades: string[];
  quality_notes: string;
  delivery_start: string;
  delivery_end: string;
  destination_province: string;
  payment_terms_days: string;
  expires_on: string;
};

const STEPS = ["ผลผลิต", "ปริมาณ คุณภาพ ราคา", "การส่งมอบและชำระเงิน", "ตรวจทาน"];

export default function NewRequestPage() {
  const { data: catalog } = useSWR<Catalog>("/catalog");
  const router = useRouter();
  const { run, pending } = useAction();
  const [step, setStep] = useState(0);
  const [f, setF] = useState<Form>({
    product_type: "mango", variety: "", quantity_kg: "", min_quantity_kg: "", target_price: "", accepted_grades: ["A"],
    quality_notes: "", delivery_start: "", delivery_end: "", destination_province: "กรุงเทพมหานคร", payment_terms_days: "3", expires_on: "",
  });
  const set = (k: keyof Form, v: Form[keyof Form]) => setF((x) => ({ ...x, [k]: v }));
  const spec = catalog?.products.find((p) => p.key === f.product_type);

  const stepErrors = [
    !f.product_type ? "เลือกชนิดผลผลิต" : null,
    !Number(f.quantity_kg) ? "ระบุปริมาณ" : !f.accepted_grades.length ? "เลือกอย่างน้อยหนึ่งเกรด" : Number(f.min_quantity_kg) > Number(f.quantity_kg) ? "ขั้นต่ำต้องไม่เกินปริมาณที่ต้องการ" : null,
    !f.delivery_start || !f.delivery_end ? "ระบุช่วงรับสินค้า" : f.delivery_end < f.delivery_start ? "วันสิ้นสุดต้องไม่ก่อนวันเริ่ม" : null,
    null,
  ];

  async function submit() {
    const num = (s: string) => (s ? Number(s) : null);
    const created = await run(
      () =>
        post<PurchaseRequest>("/purchase-requests", {
          product_type: f.product_type,
          variety: f.variety || null,
          quantity_kg: Number(f.quantity_kg),
          min_quantity_kg: num(f.min_quantity_kg),
          target_price: num(f.target_price),
          accepted_grades: f.accepted_grades,
          quality_notes: f.quality_notes || null,
          delivery_start: f.delivery_start,
          delivery_end: f.delivery_end,
          destination_province: f.destination_province,
          payment_terms_days: Number(f.payment_terms_days || 0),
          expires_on: f.expires_on || null,
        }),
      "สร้างคำขอซื้อแล้ว — ดูสวนที่จับคู่ได้",
    );
    if (created) router.push(`/requests/${created.id}`);
  }

  return (
    <>
      <PageHeader title="สร้างคำขอซื้อ" subtitle="ระบุความต้องการให้ชัด เพื่อให้ระบบคัดสวนที่เข้าเงื่อนไขจริง" />
      <ol className="mb-6 flex flex-wrap gap-2 text-sm">
        {STEPS.map((s, i) => (
          <li key={s} className={cx("flex items-center gap-2 rounded-full px-3 py-1", i === step ? "bg-green-800 text-white" : i < step ? "bg-green-50 text-green-800" : "bg-slate-100 text-slate-500")}>
            {i < step ? <Check className="size-3.5" /> : <span className="tabular">{i + 1}</span>}
            {s}
          </li>
        ))}
      </ol>
      <Card className="max-w-3xl">
        {step === 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="ชนิดผลผลิต">
              <Select value={f.product_type} onChange={(e) => { set("product_type", e.target.value); set("accepted_grades", []); }}>
                {catalog?.products.map((p) => <option key={p.key} value={p.key}>{p.th}</option>)}
              </Select>
            </Field>
            <Field label="สายพันธุ์" hint="เว้นว่างหากรับทุกสายพันธุ์">
              <Input value={f.variety} onChange={(e) => set("variety", e.target.value)} list="req-varieties" />
              <datalist id="req-varieties">{spec?.varieties.map((v) => <option key={v} value={v} />)}</datalist>
            </Field>
          </div>
        )}
        {step === 1 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="ปริมาณที่ต้องการ (กก.)"><Input type="number" min="1" value={f.quantity_kg} onChange={(e) => set("quantity_kg", e.target.value)} /></Field>
            <Field label="ปริมาณขั้นต่ำที่รับได้ (กก.)"><Input type="number" min="0" value={f.min_quantity_kg} onChange={(e) => set("min_quantity_kg", e.target.value)} /></Field>
            <Field label="ราคาเป้าหมาย (บาท/กก.)"><Input type="number" min="0" step="0.5" value={f.target_price} onChange={(e) => set("target_price", e.target.value)} /></Field>
            <Field label="เกรดที่รับ">
              <div className="flex flex-wrap gap-2 pt-1">
                {spec?.grades.map((g) => (
                  <button key={g} type="button" onClick={() => set("accepted_grades", f.accepted_grades.includes(g) ? f.accepted_grades.filter((x) => x !== g) : [...f.accepted_grades, g])}
                    className={cx("rounded-lg px-3 py-1.5 text-sm font-medium ring-1 ring-inset", f.accepted_grades.includes(g) ? "bg-green-800 text-white ring-green-800" : "bg-white text-slate-700 ring-slate-300")}>
                    เกรด {g}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="ข้อกำหนดคุณภาพเพิ่มเติม" className="sm:col-span-2"><Textarea value={f.quality_notes} onChange={(e) => set("quality_notes", e.target.value)} /></Field>
          </div>
        )}
        {step === 2 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="รับสินค้าตั้งแต่"><Input type="date" value={f.delivery_start} onChange={(e) => set("delivery_start", e.target.value)} /></Field>
            <Field label="ถึงวันที่"><Input type="date" value={f.delivery_end} onChange={(e) => set("delivery_end", e.target.value)} /></Field>
            <Field label="จังหวัดปลายทาง">
              <Select value={f.destination_province} onChange={(e) => set("destination_province", e.target.value)}>
                {catalog?.provinces.map((p) => <option key={p}>{p}</option>)}
              </Select>
            </Field>
            <Field label="ชำระเงินภายใน (วันหลังตรวจรับ)"><Input type="number" min="0" max="90" value={f.payment_terms_days} onChange={(e) => set("payment_terms_days", e.target.value)} /></Field>
            <Field label="คำขอหมดอายุ"><Input type="date" value={f.expires_on} onChange={(e) => set("expires_on", e.target.value)} /></Field>
          </div>
        )}
        {step === 3 && (
          <DL
            items={[
              ["ผลผลิต", productName(f.product_type, f.variety)],
              ["ปริมาณ", `${fmtKg(Number(f.quantity_kg))} (ขั้นต่ำ ${f.min_quantity_kg ? fmtKg(Number(f.min_quantity_kg)) : "—"})`],
              ["เกรดที่รับ", f.accepted_grades.join(", ")],
              ["ราคาเป้าหมาย", f.target_price ? `${fmtTHB(Number(f.target_price))}/กก.` : "—"],
              ["ช่วงรับสินค้า", fmtRange(f.delivery_start, f.delivery_end)],
              ["ปลายทาง", f.destination_province],
              ["เงื่อนไขชำระเงิน", `ภายใน ${f.payment_terms_days} วันหลังตรวจรับ`],
              ["ข้อกำหนดคุณภาพ", f.quality_notes || "—"],
            ]}
          />
        )}
        {stepErrors[step] && <p className="mt-4 text-sm text-amber-700">{stepErrors[step]}</p>}
        <div className="mt-6 flex justify-between gap-2">
          <Button variant="ghost" onClick={() => (step ? setStep(step - 1) : router.back())}>{step ? "ย้อนกลับ" : "ยกเลิก"}</Button>
          {step < 3 ? (
            <Button disabled={!!stepErrors[step]} onClick={() => setStep(step + 1)}>ถัดไป</Button>
          ) : (
            <Button loading={pending} onClick={submit}>สร้างคำขอซื้อ</Button>
          )}
        </div>
      </Card>
    </>
  );
}
