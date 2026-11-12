"use client";

import {
  Activity,
  AlertCircle,
  BadgeCheck,
  ChevronRight,
  ClipboardCheck,
  FileSignature,
  Package,
  Plus,
  ShoppingBasket,
  Sprout,
  Truck,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import useSWR from "swr";
import { ActivityList } from "@/components/activity";
import { OrdersTable } from "@/components/orders";
import { DealCard } from "@/components/deal-card";
import { PlanCard } from "@/components/plan";
import { TrustBadge } from "@/components/trust";
import { Avatar, Card, cx, Empty, ErrorState, LinkButton, PageSkeleton, Stat, StatusBadge, Table, Td } from "@/components/ui";
import { fmtDate, fmtKg, fmtNum, fmtRange, fmtTHB, fmtTHBShort } from "@/lib/format";
import { LOT_STATUS, ROLE, productName } from "@/lib/labels";
import { useSession } from "@/lib/session";
import type { AuditEvent, ContractBrief, Lot, Offer, TrustSummary, User } from "@/lib/types";

type Base = { role: string; recent_activity: AuditEvent[]; pipeline: { stage: string; count: number }[]; orders: ContractBrief[] };
type FarmerDash = Base & {
  kpis: Record<"estimated_kg" | "available_kg" | "reserved_kg" | "contracted_kg" | "pending_offers" | "active_orders" | "expected_revenue" | "payments_pending" | "completed_contracts", number> & { reliability: number | null };
  allocation_chart: { code: string; product_type: string; variety: string | null; available: number; reserved: number; contracted: number }[];
  upcoming_harvests: { id: string; code: string; product_type: string; variety: string | null; harvest_start: string; harvest_end: string; estimated_kg: number }[];
  recent_offers: Offer[];
};
type BuyerDash = Base & {
  kpis: Record<"open_requests" | "matched_farms" | "pending_offers" | "confirmed_orders" | "awaiting_my_confirmation" | "incoming_deliveries" | "pending_inspections" | "payment_obligations" | "order_value", number>;
  trust: TrustSummary;
  incoming: Lot[];
};
type InspectorDash = Base & { kpis: { queue: number; in_transit: number }; queue: Lot[] };
type AdminDash = Base & { kpis: { transactions: number; contract_value: number; farmers: number; buyers: number; completion_rate: number | null; open_disputes: number; dispute_rate: number | null } };

const COLORS = { contracted: "#18462d", reserved: "#5c9f73", available: "#d9ecc0" };

export default function DashboardPage() {
  const { user } = useSession();
  const { data, error } = useSWR<Base>("/dashboard");
  if (error) return <ErrorState error={error} />;
  if (!data || !user) return <PageSkeleton />;
  if (data.role === "FARMER") return <Farmer d={data as FarmerDash} user={user} />;
  if (data.role === "BUYER") return <Buyer d={data as BuyerDash} user={user} />;
  if (data.role === "INSPECTOR") return <Inspector d={data as InspectorDash} user={user} />;
  return <Admin d={data as AdminDash} user={user} />;
}

type Tile = { label: string; value: React.ReactNode; hint?: React.ReactNode; href?: string };

/** Greeting card from the sketch: avatar, "สวัสดี คุณ…", and three tiles. */
function Hero({ user, tiles, extra }: { user: User; tiles: Tile[]; extra?: React.ReactNode }) {
  const first = user.name.split(" ")[0];
  return (
    <section className="relative overflow-hidden rounded-[32px] bg-green-950 p-5 text-white shadow-xl shadow-green-950/20 sm:p-7">
      <div className="glow-lime pointer-events-none absolute -right-24 -top-28 size-80" />
      <div className="pointer-events-none absolute -bottom-32 -left-16 size-72 rounded-full bg-green-700/30 blur-3xl" />
      <div className="relative flex items-center gap-4">
        <Avatar name={user.name} size="xl" className="ring-4 ring-white/10" />
        <div className="min-w-0 flex-1">
          <div className="text-sm text-green-100/70">สวัสดี</div>
          <h1 className="truncate text-2xl font-semibold tracking-tight sm:text-3xl">คุณ{first}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-green-100/80">
            <span className="truncate">{ROLE[user.role]} · {user.organization.name}</span>
            {user.organization.verified && <span className="inline-flex items-center gap-0.5 rounded-full bg-lime-300/15 px-2 py-0.5 text-lime-200"><BadgeCheck className="size-3" />ยืนยันแล้ว</span>}
            {extra}
          </div>
        </div>
      </div>
      <div className={cx("relative mt-6 grid gap-2 sm:gap-3", tiles.length === 3 ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-4")}>
        {tiles.map((t) => {
          const body = (
            <>
              <div className="truncate text-[11px] text-green-100/70 sm:text-xs">{t.label}</div>
              <div className="tabular mt-1 truncate text-[15px] font-semibold tracking-tight sm:text-[26px]">{t.value}</div>
              {t.hint && <div className="mt-0.5 truncate text-[10px] text-green-100/60 sm:text-xs">{t.hint}</div>}
            </>
          );
          const cls = "min-w-0 rounded-3xl bg-white/[0.06] p-3 ring-1 ring-inset ring-white/10 backdrop-blur sm:p-4";
          return t.href ? (
            <Link key={t.label} href={t.href} className={cx(cls, "transition hover:bg-white/[0.11]")}>{body}</Link>
          ) : (
            <div key={t.label} className={cls}>{body}</div>
          );
        })}
      </div>
    </section>
  );
}

/** The two big buttons under the greeting (sketch: create + Status). */
function BigActions({ primary }: { primary: { href: string; label: string; hint: string } }) {
  return (
    <div className="mt-3 grid grid-cols-2 gap-3">
      <Link href={primary.href} className="group flex items-center gap-3 rounded-3xl bg-lime-300 p-4 text-green-950 shadow-sm transition hover:bg-lime-200 active:scale-[0.98]">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-green-950 text-lime-300 transition group-hover:rotate-90"><Plus className="size-5" /></span>
        <span className="min-w-0 leading-tight">
          <span className="block font-semibold">{primary.label}</span>
          <span className="block truncate text-xs text-green-950/60">{primary.hint}</span>
        </span>
      </Link>
      <Link href="/status" className="group flex items-center gap-3 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-900/[0.05] transition hover:shadow-md active:scale-[0.98]">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-green-50 text-green-800"><Activity className="size-5" /></span>
        <span className="min-w-0 leading-tight">
          <span className="block font-semibold text-slate-900">Status</span>
          <span className="block truncate text-xs text-slate-500">สถานะการซื้อขายทั้งหมด</span>
        </span>
        <ChevronRight className="ml-auto hidden size-4 text-slate-300 transition group-hover:translate-x-0.5 sm:block" />
      </Link>
    </div>
  );
}

function Shortcuts({ items }: { items: { href: string; label: string; icon: React.ElementType; badge?: number }[] }) {
  return (
    <div className={cx("mt-3 grid gap-2 sm:gap-3", items.length === 4 ? "grid-cols-4" : "grid-cols-3")}>
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          className="relative flex flex-col items-center gap-2 rounded-3xl p-2 text-center text-[11px] font-medium leading-tight text-slate-700 transition hover:bg-white sm:flex-row sm:gap-3 sm:bg-white sm:p-3 sm:text-left sm:text-sm sm:shadow-sm sm:ring-1 sm:ring-slate-900/[0.05] sm:hover:shadow-md"
        >
          <span className="flex size-12 shrink-0 items-center justify-center rounded-[18px] bg-white text-green-800 shadow-sm ring-1 ring-slate-900/[0.05] sm:size-10 sm:rounded-2xl sm:bg-green-50 sm:shadow-none sm:ring-0"><i.icon className="size-5" /></span>
          <span className="min-w-0">{i.label}</span>
          {!!i.badge && <span className="absolute right-2 top-1 min-w-[18px] rounded-full bg-red-500 px-1 text-center text-[10px] font-semibold leading-[18px] text-white sm:static sm:ml-auto">{i.badge}</span>}
        </Link>
      ))}
    </div>
  );
}

function Todo({ items }: { items: { show: boolean; href: string; text: string; tone?: "amber" | "red" }[] }) {
  const shown = items.filter((i) => i.show);
  if (!shown.length) return null;
  return (
    <div className="mt-4 space-y-2">
      {shown.map((i) => (
        <Link key={i.href + i.text} href={i.href} className={cx("flex items-center gap-2.5 rounded-3xl px-4 py-3 text-sm ring-1 ring-inset transition hover:brightness-[0.98]", i.tone === "red" ? "bg-red-50 text-red-800 ring-red-200/70" : "bg-amber-50 text-amber-900 ring-amber-200/70")}>
          <AlertCircle className="size-4 shrink-0" />
          <span className="flex-1">{i.text}</span>
          <ChevronRight className="size-4" />
        </Link>
      ))}
    </div>
  );
}

function Deals({ orders, role }: { orders: ContractBrief[]; role: User["role"] }) {
  return (
    <section className="mt-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight text-slate-900">ดีลที่กำลังดำเนินการ</h2>
        <Link href="/status" className="text-sm font-medium text-green-800 hover:underline">ดูทั้งหมด</Link>
      </div>
      {orders.length ? (
        <div className="grid gap-3 md:grid-cols-2">{orders.slice(0, 4).map((c) => <DealCard key={c.id} c={c} role={role} />)}</div>
      ) : (
        <Card><Empty title="ยังไม่มีดีลที่กำลังดำเนินการ">ดีลจะขึ้นที่นี่หลังมีการจัดสรรผลผลิตให้ผู้ซื้อ</Empty></Card>
      )}
    </section>
  );
}

function Pipeline({ data }: { data: Base["pipeline"] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ left: -20, right: 8 }}>
        <CartesianGrid vertical={false} stroke="#eef0ea" />
        <XAxis dataKey="stage" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} interval={0} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
        <Tooltip cursor={{ fill: "#f0f7f2" }} formatter={(v) => [`${v} สัญญา`, "จำนวน"]} contentStyle={{ borderRadius: 16, border: "none", boxShadow: "0 8px 24px -8px rgb(12 31 23 / 0.25)" }} />
        <Bar dataKey="count" fill="#18462d" radius={[8, 8, 0, 0]} maxBarSize={44} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function Farmer({ d, user }: { d: FarmerDash; user: User }) {
  const k = d.kpis;
  const chart = d.allocation_chart.map((r) => ({ ...r, available: Number(r.available), reserved: Number(r.reserved), contracted: Number(r.contracted), name: `${r.code} ${productName(r.product_type)}` }));
  const awaiting = d.orders.filter((o) => o.order_status === "AWAITING_CONFIRMATION").length;
  return (
    <>
      <Hero
        user={user}
        tiles={[
          { label: "รายได้", value: fmtTHBShort(k.expected_revenue), hint: `รอรับ ${fmtTHBShort(k.payments_pending)}`, href: "/payments" },
          { label: "สัญญา", value: `${k.active_orders} ฉบับ`, hint: awaiting ? `รอผู้ซื้อยืนยัน ${awaiting}` : `ข้อเสนอใหม่ ${k.pending_offers}`, href: "/status" },
          { label: "ความน่าเชื่อถือ", value: k.reliability === null ? "ใหม่" : `${k.reliability.toFixed(0)}%`, hint: `ส่งมอบสำเร็จ ${k.completed_contracts} สัญญา` },
        ]}
      />
      <BigActions primary={{ href: "/produce/new", label: "ลงขายผลผลิต", hint: "ประกาศผลผลิตล่วงหน้า" }} />
      <Shortcuts
        items={[
          { href: "/produce", label: "ผลผลิตของฉัน", icon: Sprout },
          { href: "/offers", label: "ข้อเสนอ & จัดสรร", icon: ShoppingBasket, badge: k.pending_offers },
          { href: "/payments", label: "รับเงิน", icon: Wallet },
        ]}
      />
      <Todo
        items={[
          { show: k.pending_offers > 0, href: "/allocation", text: `มีข้อเสนอซื้อรอพิจารณา ${k.pending_offers} รายการ — จัดสรรผลผลิตให้ผู้ซื้อได้เลย` },
          { show: d.orders.some((o) => o.order_status === "PAYMENT_OVERDUE"), href: "/payments", text: "มีคำสั่งซื้อที่ผู้ซื้อชำระเงินเลยกำหนด", tone: "red" },
        ]}
      />
      <Deals orders={d.orders} role="FARMER" />
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
    </>
  );
}

function Buyer({ d, user }: { d: BuyerDash; user: User }) {
  const k = d.kpis;
  const orgId = user.organization.id;
  return (
    <>
      <Hero
        user={user}
        tiles={[
          { label: "ยอดสั่งซื้อ", value: fmtTHBShort(k.order_value), hint: `ต้องชำระ ${fmtTHBShort(k.payment_obligations)}`, href: "/payments" },
          { label: "สัญญา", value: `${k.confirmed_orders} ฉบับ`, hint: k.awaiting_my_confirmation ? `รอคุณยืนยัน ${k.awaiting_my_confirmation}` : `ข้อเสนอรอตอบ ${k.pending_offers}`, href: "/status" },
          { label: "AgriTrust", value: d.trust.insufficient_data ? "ใหม่" : `${d.trust.score?.toFixed(0)}%`, hint: `${d.trust.transactions} ธุรกรรม`, href: `/buyers/${orgId}` },
        ]}
      />
      <BigActions primary={{ href: "/requests/new", label: "สร้างคำขอซื้อ", hint: "ระบบจับคู่สวนให้" }} />
      <Shortcuts
        items={[
          { href: "/requests", label: "คำขอซื้อ & ข้อเสนอ", icon: ShoppingBasket, badge: k.pending_offers },
          { href: "/deliveries", label: "รับของ & ผลตรวจ", icon: Truck, badge: k.incoming_deliveries + k.pending_inspections },
          { href: "/payments", label: "ชำระเงิน", icon: Wallet },
        ]}
      />
      <PlanCard />
      <Todo
        items={[
          { show: k.awaiting_my_confirmation > 0, href: "/status", text: `มี HarvestLock ${k.awaiting_my_confirmation} ฉบับรอคุณยืนยัน — การจองจะหมดอายุถ้าไม่ยืนยันทันเวลา` },
          { show: k.pending_inspections > 0, href: "/quality", text: `มีล็อตรอตรวจคุณภาพ ${k.pending_inspections} รายการ` },
          { show: d.orders.some((o) => o.order_status === "PAYMENT_OVERDUE"), href: "/payments", text: "มีรายการชำระเงินเลยกำหนด — ส่งผลต่อ AgriTrust", tone: "red" },
        ]}
      />
      <Deals orders={d.orders} role="BUYER" />
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
        <Card title="ความเคลื่อนไหวล่าสุด" className="lg:col-span-2"><ActivityList events={d.recent_activity} /></Card>
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
    </>
  );
}

function Inspector({ d, user }: { d: InspectorDash; user: User }) {
  return (
    <>
      <Hero
        user={user}
        tiles={[
          { label: "รอตรวจคุณภาพ", value: d.kpis.queue, hint: "ล็อตที่ส่งถึงผู้ซื้อแล้ว" },
          { label: "กำลังขนส่ง", value: d.kpis.in_transit, hint: "จะเข้าคิวเมื่อส่งถึง", href: "/deliveries" },
        ]}
      />
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

function Admin({ d, user }: { d: AdminDash; user: User }) {
  const k = d.kpis;
  return (
    <>
      <Hero
        user={user}
        tiles={[
          { label: "ธุรกรรม (สัญญา)", value: k.transactions, href: "/contracts" },
          { label: "มูลค่าสัญญา", value: fmtTHBShort(k.contract_value) },
          { label: "เกษตรกร / ผู้ซื้อ", value: `${k.farmers} / ${k.buyers}`, href: "/admin/users" },
          { label: "ปิดสำเร็จ", value: k.completion_rate === null ? "—" : `${k.completion_rate}%`, hint: `ข้อพิพาทเปิด ${k.open_disputes}`, href: "/disputes" },
        ]}
      />
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title="Pipeline ทั้งแพลตฟอร์ม" className="lg:col-span-2"><Pipeline data={d.pipeline} /></Card>
        <Card title="กิจกรรมล่าสุด"><ActivityList events={d.recent_activity} /></Card>
      </div>
      <Card title="ธุรกรรมที่ดำเนินการ" className="mt-6"><OrdersTable orders={d.orders} role="ADMIN" /></Card>
    </>
  );
}
