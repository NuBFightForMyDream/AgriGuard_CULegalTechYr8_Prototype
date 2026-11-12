"use client";

import { AlertTriangle, CalendarRange, Download, Scale, ShoppingBasket, Sprout, Wallet } from "lucide-react";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import useSWR from "swr";
import { PlanBadge, PlanGate, useMyPlan } from "@/components/plan";
import { Avatar, Button, Card, Empty, ErrorState, PageHeader, PageSkeleton, Stat, StatusBadge, Table, Td, cx } from "@/components/ui";
import { fmtDate, fmtKg, fmtNum, fmtTHB, fmtTHBShort } from "@/lib/format";
import { ORDER_STATUS, PRODUCT } from "@/lib/labels";
import { hasPlan } from "@/lib/plans";
import type { ContractBrief, PurchaseRequest } from "@/lib/types";

const DONE = ["COMPLETED", "PAID"];
const PROBLEM = ["DISPUTED", "QC_DISPUTED", "PAYMENT_OVERDUE", "CANCELLED"];
const LIVE_EXCLUDE = ["CANCELLED", "RESERVATION_EXPIRED"];
const PRODUCT_COLORS = ["#18462d", "#5c9f73", "#a3e635", "#8cbf9c", "#215838", "#d9ecc0", "#3c8457"];
const tooltipStyle = { borderRadius: 16, border: "none", boxShadow: "0 8px 24px -8px rgb(12 31 23 / 0.25)" };

const value = (c: ContractBrief) => Number(c.settlement_net ?? c.quantity_kg * c.top_price);
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const monthLabel = (key: string) => new Date(`${key}-01T00:00:00`).toLocaleDateString("th-TH", { month: "short", year: "2-digit" });

/** Spread kg evenly over the months a delivery window touches. */
function spread(start: string, end: string, kg: number): [string, number][] {
  const a = new Date(`${start}T00:00:00`);
  const b = new Date(`${end}T00:00:00`);
  const keys: string[] = [];
  for (let d = new Date(a.getFullYear(), a.getMonth(), 1); d <= b; d.setMonth(d.getMonth() + 1)) keys.push(monthKey(d));
  if (!keys.length) keys.push(monthKey(a));
  return keys.map((k) => [k, kg / keys.length]);
}

export default function InsightsPage() {
  const [plan] = useMyPlan();
  const { data: contracts, error } = useSWR<ContractBrief[]>("/contracts");
  const { data: requests } = useSWR<PurchaseRequest[]>("/purchase-requests");
  if (error) return <ErrorState error={error} />;
  if (!contracts) return <PageSkeleton />;

  const live = contracts.filter((c) => !LIVE_EXCLUDE.includes(c.order_status));
  const spend = live.reduce((s, c) => s + value(c), 0);
  const kg = live.reduce((s, c) => s + Number(c.quantity_kg), 0);
  const farms = new Map<string, { name: string; id: string; contracts: ContractBrief[] }>();
  for (const c of live) {
    const f = farms.get(c.farmer.id) ?? { name: c.farmer.name, id: c.farmer.id, contracts: [] };
    f.contracts.push(c);
    farms.set(c.farmer.id, f);
  }

  const byProduct = Object.values(
    live.reduce<Record<string, { name: string; spend: number; kg: number }>>((acc, c) => {
      const k = c.product_type;
      acc[k] ??= { name: PRODUCT[k] ?? k, spend: 0, kg: 0 };
      acc[k].spend += value(c);
      acc[k].kg += Number(c.quantity_kg);
      return acc;
    }, {}),
  ).sort((a, b) => b.spend - a.spend);

  const scorecard = [...farms.values()]
    .map((f) => {
      const fkg = f.contracts.reduce((s, c) => s + Number(c.quantity_kg), 0);
      const fv = f.contracts.reduce((s, c) => s + value(c), 0);
      const done = f.contracts.filter((c) => DONE.includes(c.order_status)).length;
      const problems = f.contracts.filter((c) => PROBLEM.includes(c.order_status)).length;
      return { ...f, kg: fkg, value: fv, avg: fkg ? fv / fkg : 0, done, problems, share: kg ? (fkg / kg) * 100 : 0 };
    })
    .sort((a, b) => b.value - a.value);

  // Enterprise: supply calendar (contracted vs still-open demand) and risk alerts.
  const cal = new Map<string, { month: string; contracted: number; open: number }>();
  const add = (k: string, field: "contracted" | "open", v: number) => {
    const row = cal.get(k) ?? { month: k, contracted: 0, open: 0 };
    row[field] += v;
    cal.set(k, row);
  };
  for (const c of live.filter((c) => !DONE.includes(c.order_status))) spread(c.delivery_window[0], c.delivery_window[1], Number(c.quantity_kg)).forEach(([k, v]) => add(k, "contracted", v));
  for (const r of (requests ?? []).filter((r) => r.status === "OPEN" || r.accepting_offers)) {
    const remaining = r.fill ? r.fill.remaining_kg : r.quantity_kg;
    if (remaining > 0) spread(r.delivery_start, r.delivery_end, Number(remaining)).forEach(([k, v]) => add(k, "open", v));
  }
  const calendar = [...cal.values()].sort((a, b) => a.month.localeCompare(b.month)).map((r) => ({ ...r, label: monthLabel(r.month), contracted: Math.round(r.contracted), open: Math.round(r.open) }));

  const risks: { tone: "red" | "amber"; text: string; href: string }[] = [];
  for (const c of contracts) {
    if (c.order_status === "DISPUTED" || c.order_status === "QC_DISPUTED") risks.push({ tone: "red", text: `${c.code} มีข้อพิพาทกับ ${c.farmer.name} — วัตถุดิบ ${fmtKg(c.quantity_kg)} อาจไม่เข้าตามแผน`, href: `/contracts/${c.id}` });
    if (c.order_status === "PAYMENT_OVERDUE") risks.push({ tone: "red", text: `${c.code} ชำระเงินเลยกำหนด — กระทบ AgriTrust ของบริษัท`, href: "/payments" });
    if (c.order_status === "AWAITING_CONFIRMATION" && c.reservation_expires_at) risks.push({ tone: "amber", text: `${c.code} รอคุณยืนยัน HarvestLock ก่อน ${fmtDate(c.reservation_expires_at)} ไม่เช่นนั้นการจองจะหมดอายุ`, href: `/contracts/${c.id}` });
  }
  const top = scorecard[0];
  if (top && scorecard.length > 1 && top.share >= 50) risks.push({ tone: "amber", text: `พึ่งพา ${top.name} ${top.share.toFixed(0)}% ของปริมาณทั้งหมด — ควรกระจายแหล่งวัตถุดิบ`, href: "/farms" });
  if (scorecard.length === 1) risks.push({ tone: "amber", text: `วัตถุดิบทั้งหมดมาจากสวนเดียว (${scorecard[0].name}) — ควรเพิ่มสวนสำรอง`, href: "/farms" });

  const exportCsv = () => {
    const rows = [["code", "product", "farm", "kg", "price_per_kg", "value_thb", "status", "delivery_start", "delivery_end"]];
    for (const c of contracts) rows.push([c.code, c.product_type, c.farmer.name, String(c.quantity_kg), String(c.top_price), String(value(c)), c.order_status, c.delivery_window[0], c.delivery_window[1]]);
    const csv = "﻿" + rows.map((r) => r.map((v) => `"${v.replaceAll('"', '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `agriguard-procurement-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <>
      <PageHeader
        eyebrow={<span className="flex items-center gap-2">Procurement Insights <PlanBadge plan={plan} /></span>}
        title="ข้อมูลจัดซื้อของบริษัท"
        subtitle="คำนวณจากสัญญาและคำขอซื้อในระบบ — ยอดซื้อใช้ยอดสุทธิหลังตรวจเกรดเมื่อมี ไม่เช่นนั้นใช้ราคาเกรดสูงสุด × ปริมาณ"
        actions={hasPlan(plan, "PREMIUM") && <Button variant="secondary" onClick={exportCsv}><Download className="size-4" />ส่งออก CSV</Button>}
      />

      <PlanGate need="PREMIUM" title="Procurement Insights">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="ยอดซื้อ" value={fmtTHBShort(spend)} icon={<Wallet className="size-4" />} hint={`${live.length} สัญญา`} />
          <Stat label="ปริมาณ" value={fmtKg(kg)} icon={<ShoppingBasket className="size-4" />} hint={`${byProduct.length} ชนิดผลผลิต`} />
          <Stat label="ราคาเฉลี่ย" value={kg ? `${fmtTHB(spend / kg)}` : "—"} icon={<Scale className="size-4" />} hint="ต่อกิโลกรัม" />
          <Stat label="สวนที่ซื้ออยู่" value={farms.size} icon={<Sprout className="size-4" />} hint={top ? `หลัก: ${top.name}` : "—"} />
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-5">
          <Card title="ยอดซื้อตามผลผลิต" className="lg:col-span-2">
            {byProduct.length ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={byProduct} layout="vertical" margin={{ left: 0, right: 16 }}>
                  <CartesianGrid horizontal={false} stroke="#eef0ea" />
                  <XAxis type="number" tickFormatter={(v) => fmtTHBShort(v)} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={64} tick={{ fontSize: 12, fill: "#475569" }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: "#f0f7f2" }} contentStyle={tooltipStyle} formatter={(v) => [fmtTHB(Number(v)), "ยอดซื้อ"]} />
                  <Bar dataKey="spend" fill="#18462d" radius={[0, 8, 8, 0]} maxBarSize={28} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Empty title="ยังไม่มีสัญญา" />
            )}
          </Card>
          <Card title="Supplier scorecard" className="lg:col-span-3" bodyClassName="px-5 pb-3">
            {scorecard.length ? (
              <Table head={["สวน", "สัญญา", "ปริมาณ", "ราคาเฉลี่ย", "สัดส่วน", "สถานะ"]}>
                {scorecard.map((f) => (
                  <tr key={f.id}>
                    <Td className="max-w-[220px]">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={f.name} size="sm" />
                        <span className="truncate font-medium">{f.name}</span>
                      </div>
                    </Td>
                    <Td className="tabular">{f.contracts.length}</Td>
                    <Td className="tabular">{fmtKg(f.kg)}</Td>
                    <Td className="tabular">{fmtTHB(f.avg)}</Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-green-700" style={{ width: `${f.share}%` }} /></div>
                        <span className="tabular text-xs text-slate-500">{f.share.toFixed(0)}%</span>
                      </div>
                    </Td>
                    <Td>
                      {f.problems ? <span className="text-xs font-medium text-red-600">มีปัญหา {f.problems}</span> : f.done ? <span className="text-xs font-medium text-green-700">สำเร็จ {f.done}</span> : <span className="text-xs text-slate-500">กำลังดำเนินการ</span>}
                    </Td>
                  </tr>
                ))}
              </Table>
            ) : (
              <Empty title="ยังไม่มีสวนที่ซื้อ" />
            )}
          </Card>
        </div>
      </PlanGate>

      <div className="mt-8 mb-3 flex items-center gap-2">
        <h2 className="text-lg font-semibold tracking-tight text-slate-900">วางแผนวัตถุดิบ</h2>
        <PlanBadge plan="ENTERPRISE" />
      </div>
      <PlanGate need="ENTERPRISE" title="แผนวัตถุดิบล่วงหน้า & แจ้งเตือนความเสี่ยง">
        <div className="grid gap-4 lg:grid-cols-5">
          <Card title={<span className="flex items-center gap-2"><CalendarRange className="size-4 text-green-700" />Supply calendar (กก. ต่อเดือน)</span>} className="lg:col-span-3">
            {calendar.length ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={calendar} margin={{ left: -10, right: 8 }}>
                  <CartesianGrid vertical={false} stroke="#eef0ea" />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(v) => fmtNum(v)} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: "#f0f7f2" }} contentStyle={tooltipStyle} formatter={(v, n) => [fmtKg(Number(v)), n === "contracted" ? "ทำสัญญาแล้ว" : "ยังหาไม่ครบ"]} />
                  <Legend formatter={(v) => (v === "contracted" ? "ทำสัญญาแล้ว" : "ยังหาไม่ครบ (คำขอที่เปิดอยู่)")} />
                  <Bar dataKey="contracted" stackId="s" fill={PRODUCT_COLORS[0]} maxBarSize={44} isAnimationActive={false} />
                  <Bar dataKey="open" stackId="s" fill={PRODUCT_COLORS[2]} radius={[8, 8, 0, 0]} maxBarSize={44} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Empty title="ยังไม่มีวัตถุดิบที่กำลังจะเข้า" />
            )}
          </Card>
          <Card title={<span className="flex items-center gap-2"><AlertTriangle className="size-4 text-amber-500" />แจ้งเตือนความเสี่ยงซัพพลาย</span>} className="lg:col-span-2">
            {risks.length ? (
              <ul className="space-y-2">
                {risks.map((r) => (
                  <li key={r.text}>
                    <Link href={r.href} className={cx("flex gap-2.5 rounded-2xl p-3 text-sm ring-1 ring-inset", r.tone === "red" ? "bg-red-50 text-red-800 ring-red-200/70" : "bg-amber-50 text-amber-900 ring-amber-200/70")}>
                      <span className={cx("mt-1.5 size-1.5 shrink-0 rounded-full", r.tone === "red" ? "bg-red-500" : "bg-amber-500")} />
                      {r.text}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty title="ไม่พบความเสี่ยง">วัตถุดิบตามสัญญาทั้งหมดเดินตามแผน</Empty>
            )}
          </Card>
        </div>
        <Card title="สัญญาที่กำลังจะส่งมอบ" className="mt-4" bodyClassName="px-5 pb-3">
          <Table head={["สัญญา", "ผลผลิต", "สวน", "ปริมาณ", "ช่วงส่งมอบ", "สถานะ"]}>
            {live.filter((c) => !DONE.includes(c.order_status)).map((c) => (
              <tr key={c.id}>
                <Td><Link href={`/contracts/${c.id}`} className="font-medium text-green-800 hover:underline">{c.code}</Link></Td>
                <Td>{PRODUCT[c.product_type] ?? c.product_type}{c.variety ? ` ${c.variety}` : ""}</Td>
                <Td className="max-w-[200px] truncate">{c.farmer.name}</Td>
                <Td className="tabular">{fmtKg(c.quantity_kg)}</Td>
                <Td>{fmtDate(c.delivery_window[0])} – {fmtDate(c.delivery_window[1])}</Td>
                <Td><StatusBadge map={ORDER_STATUS} value={c.order_status} /></Td>
              </tr>
            ))}
          </Table>
        </Card>
      </PlanGate>
    </>
  );
}
