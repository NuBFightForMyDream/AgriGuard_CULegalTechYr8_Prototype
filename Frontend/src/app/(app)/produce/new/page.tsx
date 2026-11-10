"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { Button, Card, Field, Input, PageHeader, Select, Textarea, cx } from "@/components/ui";
import { post } from "@/lib/api";
import type { Catalog, Listing } from "@/lib/types";
import { useAction } from "@/lib/useAction";

export default function NewListingPage() {
  const { data: catalog } = useSWR<Catalog>("/catalog");
  const router = useRouter();
  const { run, pending } = useAction();
  const [product, setProduct] = useState("mango");
  const [grades, setGrades] = useState<string[]>(["A", "B"]);
  const spec = catalog?.products.find((p) => p.key === product);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const num = (k: string) => (f.get(k) ? Number(f.get(k)) : null);
    const created = await run(
      () =>
        post<Listing>("/listings", {
          product_type: product,
          variety: f.get("variety") || null,
          estimated_qty_kg: num("estimated_qty_kg"),
          harvest_start: f.get("harvest_start"),
          harvest_end: f.get("harvest_end"),
          expected_grades: grades,
          price_min: num("price_min"),
          price_max: num("price_max"),
          notes: f.get("notes") || null,
        }),
      "ลงประกาศผลผลิตแล้ว",
    );
    if (created) router.push(`/produce/${created.id}`);
  }

  return (
    <>
      <PageHeader title="ลงประกาศผลผลิต" subtitle="บันทึกผลผลิตที่คาดว่าจะเก็บเกี่ยว — ผู้ซื้อจะเห็นและยื่นข้อเสนอได้" />
      <Card className="max-w-3xl">
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <Field label="ชนิดผลผลิต">
            <Select value={product} onChange={(e) => { setProduct(e.target.value); setGrades([]); }}>
              {catalog?.products.map((p) => <option key={p.key} value={p.key}>{p.th}</option>)}
            </Select>
          </Field>
          <Field label="สายพันธุ์">
            <Input name="variety" list="varieties" placeholder={spec?.varieties[0] ?? ""} />
            <datalist id="varieties">{spec?.varieties.map((v) => <option key={v} value={v} />)}</datalist>
          </Field>
          <Field label="ปริมาณประมาณการ (กก.)" hint="ประมาณการ ไม่ใช่ปริมาณที่รับประกัน">
            <Input name="estimated_qty_kg" type="number" min="1" step="1" required />
          </Field>
          <Field label="เกรดที่คาดว่าจะได้" group>
            <div className="flex flex-wrap gap-2 pt-1">
              {spec?.grades.map((g) => (
                <button
                  type="button"
                  key={g}
                  onClick={() => setGrades((cur) => (cur.includes(g) ? cur.filter((x) => x !== g) : [...cur, g]))}
                  className={cx("rounded-lg px-3 py-1.5 text-sm font-medium ring-1 ring-inset", grades.includes(g) ? "bg-green-800 text-white ring-green-800" : "bg-white text-slate-700 ring-slate-300")}
                >
                  เกรด {g}
                </button>
              ))}
            </div>
          </Field>
          <Field label="เริ่มเก็บเกี่ยว"><Input name="harvest_start" type="date" required /></Field>
          <Field label="สิ้นสุดเก็บเกี่ยว"><Input name="harvest_end" type="date" required /></Field>
          <Field label="ราคาคาดหวังต่ำสุด (บาท/กก.)"><Input name="price_min" type="number" min="0" step="0.5" /></Field>
          <Field label="ราคาคาดหวังสูงสุด (บาท/กก.)"><Input name="price_max" type="number" min="0" step="0.5" /></Field>
          <Field label="หมายเหตุ" className="sm:col-span-2"><Textarea name="notes" placeholder="เช่น ใบรับรอง GAP, วิธีเก็บเกี่ยว" /></Field>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" loading={pending} disabled={!grades.length}>ลงประกาศ</Button>
            <Button type="button" variant="ghost" onClick={() => router.back()}>ยกเลิก</Button>
          </div>
        </form>
      </Card>
    </>
  );
}
