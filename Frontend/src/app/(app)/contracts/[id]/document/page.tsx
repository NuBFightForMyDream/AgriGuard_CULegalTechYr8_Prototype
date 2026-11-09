"use client";

import { Printer } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { formatTermValue } from "@/components/amendments";
import { Button, ErrorState, PageSkeleton } from "@/components/ui";
import { fmtDateTime, fmtKg, fmtRange, fmtTHB } from "@/lib/format";
import { REJECTION, SHORTFALL_POLICY, SIGN_METHOD, productName } from "@/lib/labels";
import type { ContractDetail } from "@/lib/types";

/** Printable HarvestLock. "Save as PDF" from the browser print dialog produces the contract PDF. */
export default function ContractDocument() {
  const { id } = useParams<{ id: string }>();
  const { data: c, error } = useSWR<ContractDetail>(`/contracts/${id}`);
  if (error) return <ErrorState error={error} />;
  if (!c) return <PageSkeleton />;
  const t = c.terms;
  const signed = c.acceptances.filter((a) => a.version === c.current_version);
  const rows: [string, React.ReactNode][] = [
    ["ผู้ขาย (เกษตรกร)", t.farmer],
    ["ผู้ซื้อ", t.buyer],
    ["ผลผลิต", `${productName(t.product_type, t.variety)} (ประกาศ ${t.listing_code}, ข้อเสนอ ${t.offer_code})`],
    ["ปริมาณ", `${fmtKg(t.quantity_kg)} ค่าคลาดเคลื่อนที่ยอมรับ ±${t.tolerance_pct}%`],
    ["ราคาตามเกรด", formatTermValue("grade_prices", t.grade_prices) + " ต่อกิโลกรัม"],
    ["ช่วงเก็บเกี่ยว", fmtRange(t.harvest_window[0], t.harvest_window[1])],
    ["การส่งมอบ", `${fmtRange(t.delivery_window[0], t.delivery_window[1])} ปลายทาง ${t.destination_province}`],
    ["การชำระเงิน", `ภายใน ${t.payment_due_days} วันหลังตรวจรับ เงินมัดจำ ${fmtTHB(t.deposit_thb)}`],
    ["การตรวจคุณภาพ", t.sampling_method],
    ["เหตุผลที่ปฏิเสธสินค้าได้", t.rejection_conditions.map((r) => REJECTION[r] ?? r).join(", ")],
    ["กรณีผลผลิตขาด", SHORTFALL_POLICY[t.shortfall_policy] ?? t.shortfall_policy],
    ["การยกเลิก", t.cancellation],
    ["การระงับข้อพิพาท", t.dispute_procedure],
  ];

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between gap-2 print:hidden">
        <Link href={`/contracts/${c.id}`} className="text-sm text-slate-600 hover:text-green-800">← กลับไปที่สัญญา</Link>
        <Button onClick={() => window.print()}><Printer className="size-4" />พิมพ์ / บันทึกเป็น PDF</Button>
      </div>
      <article className="rounded-xl border border-slate-200 bg-white p-8 text-sm leading-relaxed print:rounded-none print:border-0 print:p-0">
        <header className="border-b border-slate-200 pb-4">
          <div className="text-xs text-slate-500">AgriGuard · HarvestLock Pre-Harvest Purchase Agreement</div>
          <h1 className="mt-1 text-xl font-semibold">ข้อตกลงซื้อขายผลผลิตล่วงหน้า เลขที่ {c.code}</h1>
          <div className="mt-1 text-slate-600">ฉบับที่ {c.current_version} · สถานะ {c.status}</div>
        </header>
        <table className="mt-4 w-full">
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k} className="border-b border-slate-100 align-top">
                <th className="w-44 py-2 pr-4 text-left font-medium text-slate-600">{k}</th>
                <td className="py-2">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <section className="mt-6">
          <h2 className="font-semibold">การลงนาม</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 print:grid-cols-2">
            {signed.map((a) => (
              <div key={a.organization_id} className="rounded-lg border border-slate-200 p-3">
                <div className="text-lg italic">{a.signature_name ?? a.user_name}</div>
                <div className="mt-1 text-xs text-slate-500">{SIGN_METHOD[a.method] ?? a.method} · {fmtDateTime(a.accepted_at)}</div>
              </div>
            ))}
            {signed.length < 2 && <div className="rounded-lg border border-dashed border-slate-300 p-3 text-slate-500">รอการลงนามของอีกฝ่าย</div>}
          </div>
        </section>
        <footer className="mt-6 border-t border-slate-200 pt-3 text-xs text-slate-500">
          <div>SHA-256 ของเงื่อนไขฉบับนี้ (canonical JSON): <span className="break-all font-mono">{c.terms_hash}</span></div>
          <p className="mt-2">
            เอกสารนี้สร้างจากระบบเพื่อการบันทึกและตรวจสอบ hash ช่วยยืนยันว่าเงื่อนไขไม่ถูกแก้ไข แต่ไม่ได้ยืนยันผลทางกฎหมายด้วยตัวเอง
            การลงนามในต้นแบบนี้เป็นการพิมพ์ชื่อพร้อมยินยอมผ่านบัญชีผู้ใช้ ไม่ใช่บริการลายมือชื่ออิเล็กทรอนิกส์ที่ได้รับการรับรอง
            ควรพิจารณาตาม พ.ร.บ. ว่าด้วยธุรกรรมทางอิเล็กทรอนิกส์ก่อนใช้จริง · พิมพ์เมื่อ {fmtDateTime(new Date().toISOString())}
          </p>
        </footer>
      </article>
    </div>
  );
}
