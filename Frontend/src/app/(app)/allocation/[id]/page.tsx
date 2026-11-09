"use client";

import { AlertTriangle, CheckCircle2, Info, Sparkles } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import useSWR from "swr";
import { InventoryBar } from "@/components/inventory";
import { OfferPrices } from "@/components/offers-table";
import { TrustBadge } from "@/components/trust";
import { Button, Card, Empty, ErrorState, Input, Modal, PageHeader, PageSkeleton, Stat, cx } from "@/components/ui";
import { post } from "@/lib/api";
import { fmtKg, fmtNum, fmtTHB } from "@/lib/format";
import { productName } from "@/lib/labels";
import type { ContractBrief, Listing } from "@/lib/types";
import { useAction } from "@/lib/useAction";

type Strategy = "MANUAL" | "PROPORTIONAL";
type Preview = {
  available_kg: number;
  errors: string[];
  warnings: string[];
  lines: { offer_id: string; quantity_kg: number; share_pct: number; expected_revenue: number }[];
  total_kg: number;
  remaining_kg: number;
  expected_revenue: number;
};

const PALETTE = ["#166534", "#0284c7", "#7c3aed", "#d97706", "#db2777", "#0f766e"];
const STEP = 10;

export default function AllocationWorkspace() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: listing, error } = useSWR<Listing>(`/listings/${id}`);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [strategy, setStrategy] = useState<Strategy>("MANUAL");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const { run, pending } = useAction();

  const offers = useMemo(() => (listing?.offers ?? []).filter((o) => o.status === "PENDING"), [listing]);
  const available = listing?.inventory.available_kg ?? 0;
  const items = offers.map((o) => ({ offer_id: o.id, quantity_kg: qty[o.id] ?? 0 }));
  const itemsKey = JSON.stringify(items);

  // Server-side preview is the source of truth for validation and revenue.
  useEffect(() => {
    if (!listing) return;
    const t = setTimeout(() => {
      post<Preview>(`/listings/${id}/allocation/preview`, { strategy: "MANUAL", items: JSON.parse(itemsKey) })
        .then(setPreview)
        .catch(() => setPreview(null));
    }, 200);
    return () => clearTimeout(t);
  }, [itemsKey, id, listing]);

  async function applyProportional() {
    const p = await post<Preview>(`/listings/${id}/allocation/preview`, { strategy: "PROPORTIONAL" });
    setQty(Object.fromEntries(p.lines.map((l) => [l.offer_id, Number(l.quantity_kg)])));
    setWarnings(p.warnings);
    setStrategy("PROPORTIONAL");
  }

  function setOne(offerId: string, value: number) {
    setStrategy("MANUAL");
    setWarnings([]);
    setQty((q) => ({ ...q, [offerId]: Math.max(0, value) }));
  }

  async function confirm() {
    const res = await run(
      () => post<{ contracts: ContractBrief[] }>(`/listings/${id}/allocation/confirm`, { strategy, items: items.filter((i) => i.quantity_kg > 0) }),
      "ยืนยันแผนจัดสรรแล้ว — สร้าง HarvestLock แยกตามผู้ซื้อ รอผู้ซื้อยืนยัน",
    );
    if (res) router.push("/contracts");
  }

  if (error) return <ErrorState error={error} />;
  if (!listing) return <PageSkeleton />;

  const total = items.reduce((s, i) => s + i.quantity_kg, 0);
  const revenueByOffer = Object.fromEntries((preview?.lines ?? []).map((l) => [l.offer_id, l]));
  const errors = preview?.errors ?? [];
  const chart = [
    ...offers.map((o, i) => ({ name: o.buyer.name, value: qty[o.id] ?? 0, color: PALETTE[i % PALETTE.length] })),
    { name: "คงเหลือ", value: Math.max(0, available - total), color: "#e2e8f0" },
  ].filter((d) => d.value > 0);

  return (
    <>
      <PageHeader
        eyebrow={`Smart Allocation · ${listing.code}`}
        title={productName(listing.product_type, listing.variety)}
        subtitle="กำหนดปริมาณให้ผู้ซื้อแต่ละราย การยืนยันจะสร้างการจองชั่วคราวและ HarvestLock แยกรายผู้ซื้อ — ยังไม่ใช่สัญญาผูกพันจนกว่าผู้ซื้อจะยืนยัน"
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="ผลผลิตที่ยังไม่ผูกพัน" value={fmtKg(available)} hint={`จากประมาณการ ${fmtKg(listing.inventory.estimated_kg)}`} />
        <Stat label="ความต้องการรวม" value={fmtKg(offers.reduce((s, o) => s + o.quantity_kg, 0))} hint={`${offers.length} ข้อเสนอ`} />
        <Stat label="จัดสรรแล้ว" value={fmtKg(total)} hint={`คงเหลือ ${fmtKg(Math.max(0, available - total))}`} tone={total > available ? "warn" : "default"} />
        <Stat label="รายได้คาดการณ์" value={fmtTHB(preview?.expected_revenue ?? 0)} hint="คิดที่ราคาเกรดสูงสุดของแต่ละข้อเสนอ" />
      </div>

      <Card className="mt-6" bodyClassName="p-4">
        <InventoryBar inv={listing.inventory} />
      </Card>

      {offers.length === 0 ? (
        <Card className="mt-6"><Empty title="ไม่มีข้อเสนอที่รอจัดสรร" /></Card>
      ) : (
        <div className="mt-6 grid gap-6 xl:grid-cols-3">
          <Card
            title="เปรียบเทียบข้อเสนอและกำหนดปริมาณ"
            className="xl:col-span-2"
            action={
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant={strategy === "MANUAL" ? "primary" : "secondary"} onClick={() => setStrategy("MANUAL")}>กำหนดเอง</Button>
                <Button size="sm" variant={strategy === "PROPORTIONAL" ? "primary" : "secondary"} onClick={applyProportional}>ตามสัดส่วนความต้องการ</Button>
                <Button size="sm" variant="secondary" disabled title="Phase 2: optimizer (OR-Tools)">
                  <Sparkles className="size-4" />
                  เพิ่มรายได้สูงสุด (Phase 2)
                </Button>
              </div>
            }
          >
            <div className="space-y-4">
              {offers.map((o, i) => {
                const value = qty[o.id] ?? 0;
                const max = Math.min(o.quantity_kg, available);
                const line = revenueByOffer[o.id];
                return (
                  <div key={o.id} className="rounded-lg border border-slate-200 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="size-2.5 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
                          <span className="font-medium text-slate-900">{o.buyer.name}</span>
                          <TrustBadge trust={o.buyer_trust} orgId={o.buyer.id} />
                        </div>
                        <div className="mt-1 text-sm text-slate-500">
                          ต้องการ {fmtKg(o.quantity_kg)} · <OfferPrices prices={o.grade_prices} /> · ชำระใน {o.payment_terms_days} วัน · มัดจำ {fmtTHB(o.deposit_thb)}
                        </div>
                      </div>
                      <div className="text-right text-sm">
                        <div className="tabular font-semibold text-slate-900">{fmtTHB(line?.expected_revenue ?? 0)}</div>
                        <div className="text-xs text-slate-500">{fmtNum(line?.share_pct ?? 0, 1)}% ของผลผลิต</div>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <input
                        type="range"
                        min={0}
                        max={max}
                        step={STEP}
                        value={Math.min(value, max)}
                        onChange={(e) => setOne(o.id, Number(e.target.value))}
                        className="w-full"
                        aria-label={`ปริมาณสำหรับ ${o.buyer.name}`}
                      />
                      <Input
                        type="number"
                        min={0}
                        step={STEP}
                        value={value}
                        onChange={(e) => setOne(o.id, Number(e.target.value))}
                        className="w-28 text-right tabular"
                      />
                      <span className="text-sm text-slate-500">กก.</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <div className="space-y-6">
            <Card title="สัดส่วนการจัดสรร">
              {chart.length ? (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={chart} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={1}>
                      {chart.map((d) => <Cell key={d.name} fill={d.color} />)}
                    </Pie>
                    <Tooltip formatter={(v) => fmtKg(Number(v))} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <Empty title="ยังไม่ได้จัดสรร" />
              )}
              <ul className="mt-2 space-y-1 text-sm">
                {chart.map((d) => (
                  <li key={d.name} className="flex justify-between gap-2">
                    <span className="inline-flex items-center gap-2 truncate"><span className="size-2 shrink-0 rounded-full" style={{ background: d.color }} />{d.name}</span>
                    <span className="tabular text-slate-600">{fmtKg(d.value)}</span>
                  </li>
                ))}
              </ul>
            </Card>
            <Card title="ตรวจสอบก่อนยืนยัน">
              <ul className="space-y-2 text-sm">
                {errors.map((e) => (
                  <li key={e} className="flex gap-2 text-red-700"><AlertTriangle className="mt-0.5 size-4 shrink-0" />{e}</li>
                ))}
                {warnings.map((w) => (
                  <li key={w} className="flex gap-2 text-amber-700"><Info className="mt-0.5 size-4 shrink-0" />{w}</li>
                ))}
                {offers.some((o) => o.buyer_trust.insufficient_data && (qty[o.id] ?? 0) > 0) && (
                  <li className="flex gap-2 text-slate-600"><Info className="mt-0.5 size-4 shrink-0" />มีผู้ซื้อที่ประวัติไม่เพียงพอ — ไม่ได้แปลว่าเสี่ยงสูง แต่ควรพิจารณาเงินมัดจำ</li>
                )}
                {!errors.length && total > 0 && (
                  <li className="flex gap-2 text-green-800"><CheckCircle2 className="mt-0.5 size-4 shrink-0" />ไม่เกินผลผลิตที่ยังไม่ผูกพันและความต้องการของผู้ซื้อ</li>
                )}
              </ul>
              <Button className="mt-4 w-full" disabled={!!errors.length || total <= 0} onClick={() => setConfirming(true)}>
                ยืนยันแผนจัดสรร
              </Button>
            </Card>
          </div>
        </div>
      )}

      <Modal open={confirming} onClose={() => setConfirming(false)} title="ยืนยันแผนจัดสรร">
        <p className="text-sm text-slate-600">
          ระบบจะจองผลผลิตชั่วคราวและสร้าง HarvestLock แยกสำหรับผู้ซื้อแต่ละราย การยืนยันนี้นับเป็นการยอมรับเงื่อนไขฝั่งเกษตรกร ผู้ซื้อต้องยืนยันภายในเวลาที่กำหนด มิฉะนั้นการจองจะหมดอายุ
        </p>
        <ul className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm">
          {offers.filter((o) => (qty[o.id] ?? 0) > 0).map((o) => (
            <li key={o.id} className="flex justify-between gap-3 px-3 py-2">
              <span className="truncate">{o.buyer.name}</span>
              <span className="tabular">{fmtKg(qty[o.id])} · {fmtTHB(revenueByOffer[o.id]?.expected_revenue ?? 0)}</span>
            </li>
          ))}
          <li className={cx("flex justify-between px-3 py-2 font-semibold")}>
            <span>รวม</span>
            <span className="tabular">{fmtKg(total)} · {fmtTHB(preview?.expected_revenue ?? 0)}</span>
          </li>
        </ul>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirming(false)}>กลับไปแก้ไข</Button>
          <Button onClick={confirm} loading={pending}>ยืนยันและสร้าง HarvestLock</Button>
        </div>
      </Modal>
    </>
  );
}
