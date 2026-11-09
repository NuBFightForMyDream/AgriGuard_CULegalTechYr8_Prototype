"use client";

import { AlertCircle, ClipboardCheck, FileSignature, Package, ShoppingBasket, Sprout, Truck, Wallet } from "lucide-react";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import useSWR from "swr";
import { ActivityList } from "@/components/activity";
import { OrdersTable } from "@/components/orders";
import { TrustBadge } from "@/components/trust";
import { Card, Empty, ErrorState, LinkButton, PageHeader, PageSkeleton, Stat, StatusBadge, Table, Td } from "@/components/ui";
import { fmtDate, fmtKg, fmtNum, fmtRange, fmtTHB } from "@/lib/format";
import { LOT_STATUS, productName } from "@/lib/labels";
import { useSession } from "@/lib/session";
import type { AuditEvent, ContractBrief, Lot, Offer, TrustSummary } from "@/lib/types";

type Base = { role: string; recent_activity: AuditEvent[]; pipeline: { stage: string; count: number }[]; orders: ContractBrief[] };
type FarmerDash = Base & {
  kpis: Record<"estimated_kg" | "available_kg" | "reserved_kg" | "contracted_kg" | "pending_offers" | "active_orders" | "expected_revenue" | "payments_pending", number>;
  allocation_chart: { code: string; product_type: string; variety: string | null; available: number; reserved: number; contracted: number }[];
  upcoming_harvests: { id: string; code: string; product_type: string; variety: string | null; harvest_start: string; harvest_end: string; estimated_kg: number }[];
  recent_offers: Offer[];
};
type BuyerDash = Base & {
  kpis: Record<"open_requests" | "matched_farms" | "pending_offers" | "confirmed_orders" | "awaiting_my_confirmation" | "incoming_deliveries" | "pending_inspections" | "payment_obligations", number>;
  trust: TrustSummary;
  incoming: Lot[];
};
type InspectorDash = Base & { kpis: { queue: number; in_transit: number }; queue: Lot[] };
type AdminDash = Base & { kpis: { transactions: number; contract_value: number; farmers: number; buyers: number; completion_rate: number | null } };

const COLORS = { contracted: "#166534", reserved: "#22c55e", available: "#d9f99d" };

export default function DashboardPage() {
  const { user } = useSession();
  const { data, error } = useSWR<Base>("/dashboard");
  if (error) return <ErrorState error={error} />;
  if (!data || !user) return <PageSkeleton />;
  const greeting = `สวัสดี ${user.name}`;
  if (data.role === "FARMER") return <Farmer d={data as FarmerDash} greeting={greeting} />;
  if (data.role === "BUYER") return <Buyer d={data as BuyerDash} greeting={greeting} orgId={user.organization.id} />;
  if (data.role === "INSPECTOR") return <Inspector d={data as InspectorDash} greeting={greeting} />;
  return <Admin d={data as AdminDash} />;
}

function Pipeline({ data }: { data: Base["pipeline"] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ left: -20, right: 8 }}>
        <CartesianGrid vertical={false} stroke="#e2e8f0" />
        <XAxis dataKey="stage" tick={{ fontSize: 12 }} interval={0} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
        <Tooltip formatter={(v) => [`${v} สัญญา`, "จำนวน"]} />
        <Bar dataKey="count" fill="#166534" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function Farmer({ d, greeting }: { d: FarmerDash; greeting: string }) {
  const k = d.kpis;
  const chart = d.allocation_chart.map((r) => ({ ...r, name: `${r.code} ${productName(r.product_type)}` }));
  return (
    <>
      <PageHeader title={greeting} subtitle="ภาพรวมผลผลิต ข้อเสนอ และคำสั่งซื้อของสวน" actions={<LinkButton href="/produce/new">+ ลงประกาศผลผลิต</LinkButton>} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="ผลผลิตประมาณการ" value={fmtKg(k.estimated_kg)} icon={<Sprout className="size-4" />} hint={`ยังไม่ผูกพัน ${fmtKg(k.available_kg)}`} />
        <Stat label="จองแล้ว / ทำสัญญา" value={fmtKg(k.reserved_kg + k.contracted_kg)} icon={<FileSignature className="size-4" />} hint={`จอง ${fmtKg(k.reserved_kg)} · สัญญา ${fmtKg(k.contracted_kg)}`} />
        <Stat label="ข้อเสนอรอพิจารณา" value={fmtNum(k.pending_offers)} icon={<ShoppingBasket className="size-4" />} hint={`คำสั่งซื้อที่ดำเนินการ ${k.active_orders}`} tone={k.pending_offers ? "warn" : "default"} />
        <Stat label="รายได้คาดการณ์" value={fmtTHB(k.expected_revenue)} icon={<Wallet className="size-4" />} hint={`รอรับเงิน ${fmtTHB(k.payments_pending)}`} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title="สัดส่วนผลผลิตต่อประกาศ" className="lg:col-span-2">
          {chart.length ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chart} layout="vertical" margin={{ left: 40, right: 16 }}>
                <CartesianGrid horizontal={false} stroke="#e2e8f0" />
                <XAxis type="number" tickFormatter={(v) => fmtNum(v)} tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v) => fmtKg(Number(v))} />
                <Legend formatter={(v) => ({ contracted: "ทำสัญญา", reserved: "จองชั่วคราว", available: "ยังไม่ผูกพัน" })[v as string]} />
                <Bar dataKey="contracted" stackId="a" fill={COLORS.contracted} />
                <Bar dataKey="reserved" stackId="a" fill={COLORS.reserved} />
                <Bar dataKey="available" stackId="a" fill={COLORS.available} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <Empty title="ยังไม่มีประกาศผลผลิต" />
          )}
        </Card>
        <Card title="ปฏิทินเก็บเกี่ยวที่กำลังมา">
          {d.upcoming_harvests.length ? (
            <ul className="space-y-3 text-sm">
              {d.upcoming_harvests.map((h) => (
                <li key={h.id} className="flex items-start justify-between gap-3">
                  <div>
                    <Link href={`/produce/${h.id}`} className="font-medium text-slate-900 hover:text-green-800">
                      {productName(h.product_type, h.variety)}
                    </Link>
                    <div className="text-xs text-slate-500">{fmtRange(h.harvest_start, h.harvest_end)}</div>
                  </div>
                  <span className="tabular text-slate-600">{fmtKg(h.estimated_kg)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty title="ไม่มีรอบเก็บเกี่ยวที่กำลังมา" />
          )}
        </Card>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title="ข้อเสนอล่าสุด" className="lg:col-span-2" action={<LinkButton href="/offers" variant="ghost" size="sm">ดูทั้งหมด</LinkButton>}>
          {d.recent_offers.length ? (
            <Table head={["ผู้ซื้อ", "AgriTrust", "ปริมาณ", "ราคาเกรดสูงสุด", "ประกาศ", ""]}>
              {d.recent_offers.map((o) => (
                <tr key={o.id}>
                  <Td className="max-w-[200px] truncate font-medium">{o.buyer.name}</Td>
                  <Td><TrustBadge trust={o.buyer_trust} orgId={o.buyer.id} /></Td>
                  <Td className="tabular">{fmtKg(o.quantity_kg)}</Td>
                  <Td className="tabular">{fmtTHB(o.top_price)}/กก.</Td>
                  <Td>{o.listing.code}</Td>
                  <Td><LinkButton href={`/allocation/${o.listing.id}`} size="sm" variant="secondary">จัดสรร</LinkButton></Td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty title="ยังไม่มีข้อเสนอใหม่" />
          )}
        </Card>
        <Card title="ความเคลื่อนไหวล่าสุด">
          <ActivityList events={d.recent_activity} />
        </Card>
      </div>
      <Card title="คำสั่งซื้อที่กำลังดำเนินการ" className="mt-6">
        <OrdersTable orders={d.orders} role="FARMER" />
      </Card>
    </>
  );
}

function Buyer({ d, greeting, orgId }: { d: BuyerDash; greeting: string; orgId: string }) {
  const k = d.kpis;
  return (
    <>
      <PageHeader title={greeting} subtitle="ภาพรวมการจัดซื้อ การส่งมอบ และภาระการชำระเงิน" actions={<LinkButton href="/requests/new">+ สร้างคำขอซื้อ</LinkButton>} />
      {k.awaiting_my_confirmation > 0 && (
        <Link href="/contracts" className="mb-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 hover:bg-amber-100">
          <AlertCircle className="size-4" />
          มี HarvestLock {k.awaiting_my_confirmation} ฉบับรอคุณยืนยัน — การจองจะหมดอายุถ้าไม่ยืนยันทันเวลา
        </Link>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="คำขอซื้อที่เปิดอยู่" value={k.open_requests} icon={<ShoppingBasket className="size-4" />} hint={`สวนที่จับคู่ได้ ${k.matched_farms} แห่ง`} />
        <Stat label="คำสั่งซื้อที่ยืนยันแล้ว" value={k.confirmed_orders} icon={<FileSignature className="size-4" />} hint={`ข้อเสนอรอพิจารณา ${k.pending_offers}`} />
        <Stat label="สินค้าที่กำลังมา / รอตรวจ" value={`${k.incoming_deliveries} / ${k.pending_inspections}`} icon={<Truck className="size-4" />} />
        <Stat label="ภาระที่ต้องชำระ" value={fmtTHB(k.payment_obligations)} icon={<Wallet className="size-4" />} tone={k.payment_obligations ? "warn" : "default"} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title="Procurement pipeline" className="lg:col-span-2">
          <Pipeline data={d.pipeline} />
        </Card>
        <Card title="AgriTrust ของบริษัท" action={<LinkButton href={`/buyers/${orgId}`} variant="ghost" size="sm">รายละเอียด</LinkButton>}>
          <div className="text-4xl font-semibold tabular text-slate-900">{d.trust.insufficient_data ? "—" : d.trust.score?.toFixed(1)}</div>
          <div className="mt-2"><TrustBadge trust={d.trust} /></div>
          <p className="mt-3 text-sm text-slate-500">คำนวณจากธุรกรรมที่ตรวจสอบแล้วเท่านั้น ไม่ใช่คะแนนเครดิต และไม่ใช่ความน่าจะเป็นที่จะชำระเงิน</p>
        </Card>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title="คำสั่งซื้อ" className="lg:col-span-2">
          <OrdersTable orders={d.orders} role="BUYER" />
        </Card>
        <Card title="สินค้าที่กำลังมา">
          {d.incoming.length ? (
            <ul className="space-y-3 text-sm">
              {d.incoming.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-2">
                  <div>
                    <Link href={`/contracts/${l.contract_id}`} className="font-medium hover:text-green-800">{l.code}</Link>
                    <div className="text-xs text-slate-500">{l.farmer.name} · {fmtDate(l.harvest_date)}</div>
                  </div>
                  <StatusBadge map={LOT_STATUS} value={l.status} />
                </li>
              ))}
            </ul>
          ) : (
            <Empty icon={<Package className="size-8" />} title="ยังไม่มีสินค้าที่กำลังมา" />
          )}
        </Card>
      </div>
      <Card title="ความเคลื่อนไหวล่าสุด" className="mt-6"><ActivityList events={d.recent_activity} /></Card>
    </>
  );
}

function Inspector({ d, greeting }: { d: InspectorDash; greeting: string }) {
  return (
    <>
      <PageHeader title={greeting} subtitle="ล็อตที่ส่งถึงผู้ซื้อแล้วและรอบันทึกผล GradeProof" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Stat label="รอตรวจคุณภาพ" value={d.kpis.queue} icon={<ClipboardCheck className="size-4" />} tone={d.kpis.queue ? "warn" : "default"} />
        <Stat label="กำลังขนส่ง (จะเข้าคิว)" value={d.kpis.in_transit} icon={<Truck className="size-4" />} />
      </div>
      <Card title="คิวตรวจคุณภาพ" className="mt-6">
        {d.queue.length ? (
          <Table head={["ล็อต", "สัญญา", "ผลผลิต", "สวน → ผู้ซื้อ", "น้ำหนักรับ", ""]}>
            {d.queue.map((l) => (
              <tr key={l.id}>
                <Td className="font-medium">{l.code}</Td>
                <Td>{l.contract_code}</Td>
                <Td>{productName(l.product_type, l.variety)}</Td>
                <Td className="max-w-[260px] truncate">{l.farmer.name} → {l.buyer.name}</Td>
                <Td className="tabular">{fmtKg(l.received_kg)}</Td>
                <Td><LinkButton href={`/contracts/${l.contract_id}`} size="sm">บันทึกผลตรวจ</LinkButton></Td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty icon={<ClipboardCheck className="size-8" />} title="ไม่มีล็อตรอตรวจ">ล็อตจะเข้าคิวเมื่อผู้ซื้อยืนยันรับสินค้า</Empty>
        )}
      </Card>
      <Card title="ความเคลื่อนไหวล่าสุด" className="mt-6"><ActivityList events={d.recent_activity} /></Card>
    </>
  );
}

function Admin({ d }: { d: AdminDash }) {
  const k = d.kpis;
  return (
    <>
      <PageHeader title="ภาพรวมแพลตฟอร์ม" subtitle="Phase 1: ตัวชี้วัดหลัก — หน้าจัดการผู้ใช้ ข้อพิพาท และมาตรฐานคุณภาพอยู่ใน Phase 2" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="ธุรกรรม (สัญญา)" value={k.transactions} />
        <Stat label="มูลค่าสัญญา" value={fmtTHB(k.contract_value)} />
        <Stat label="เกษตรกร / ผู้ซื้อ" value={`${k.farmers} / ${k.buyers}`} />
        <Stat label="อัตราปิดธุรกรรมสำเร็จ" value={k.completion_rate === null ? "—" : `${k.completion_rate}%`} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title="Pipeline ทั้งแพลตฟอร์ม" className="lg:col-span-2"><Pipeline data={d.pipeline} /></Card>
        <Card title="กิจกรรมล่าสุด"><ActivityList events={d.recent_activity} /></Card>
      </div>
      <Card title="ธุรกรรมที่ดำเนินการ" className="mt-6"><OrdersTable orders={d.orders} role="ADMIN" /></Card>
    </>
  );
}
