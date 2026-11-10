"use client";

import { Activity, ChevronRight, Handshake, ShoppingBasket } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import useSWR from "swr";
import { CLOSED, DealCard, PROBLEM } from "@/components/deal-card";
import { ListingCard, RequestCard } from "@/components/explore-cards";
import { OfferDialog } from "@/components/offer-dialog";
import { Avatar, Card, Chips, cx, Empty, ErrorState, PageHeader, PageSkeleton, StatusBadge } from "@/components/ui";
import { fmtKg, fmtTHB } from "@/lib/format";
import { OFFER_STATUS, productName } from "@/lib/labels";
import { useSession } from "@/lib/session";
import type { ContractBrief, DealSuggestion, Listing, Offer, PurchaseRequest, Role } from "@/lib/types";

/** Orders waiting on *this* side to act. */
const MY_MOVE: Record<Role, Set<string>> = {
  FARMER: new Set(["CONFIRMED", "HARVESTED", "PAID"]),
  BUYER: new Set(["AWAITING_CONFIRMATION", "IN_TRANSIT", "DELIVERED", "QC_ACCEPTED", "PAYMENT_PENDING", "PAYMENT_OVERDUE"]),
  INSPECTOR: new Set(["QC_PENDING"]),
  ADMIN: new Set(["DISPUTED"]),
};

type Filter = "all" | "mine" | "active" | "problem" | "done";

export default function StatusPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Status />
    </Suspense>
  );
}

function Status() {
  const { user } = useSession();
  const params = useSearchParams();
  const router = useRouter();
  const tab = params.get("tab") === "deal" ? "deal" : "status";
  const trader = user?.role === "FARMER" || user?.role === "BUYER";
  if (!user) return <PageSkeleton />;
  return (
    <>
      <PageHeader title="สถานะการซื้อขาย" subtitle="ติดตามทุกดีลในที่เดียว และหาดีลใหม่ที่เข้ากับคุณ" />
      {trader && (
        <div className="mb-5 grid grid-cols-2 gap-1 rounded-2xl bg-white p-1 shadow-sm ring-1 ring-slate-200/80" role="tablist">
          {(
            [
              ["status", "Status", Activity],
              ["deal", "หา Deal", Handshake],
            ] as const
          ).map(([v, label, Icon]) => (
            <button
              key={v}
              role="tab"
              aria-selected={tab === v}
              onClick={() => router.replace(v === "deal" ? "/status?tab=deal" : "/status")}
              className={cx("flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition", tab === v ? "bg-green-800 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50")}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </div>
      )}
      {tab === "deal" && trader ? (user.role === "FARMER" ? <FarmerDeals /> : <BuyerDeals />) : <Deals role={user.role} />}
    </>
  );
}

function Deals({ role }: { role: Role }) {
  const { data, error } = useSWR<ContractBrief[]>("/contracts");
  const offers = useSWR<Offer[]>(role === "FARMER" || role === "BUYER" ? "/offers" : null);
  const [filter, setFilter] = useState<Filter>("all");
  if (error) return <ErrorState error={error} />;
  if (!data) return <PageSkeleton />;
  const live = data.filter((c) => c.order_status !== "RESERVATION_EXPIRED");
  const groups: Record<Filter, ContractBrief[]> = {
    all: live,
    mine: live.filter((c) => MY_MOVE[role].has(c.order_status)),
    active: live.filter((c) => !CLOSED.has(c.order_status) && !PROBLEM.has(c.order_status)),
    problem: live.filter((c) => PROBLEM.has(c.order_status)),
    done: live.filter((c) => c.order_status === "COMPLETED"),
  };
  const pending = (offers.data ?? []).filter((o) => o.status === "PENDING");
  return (
    <>
      {pending.length > 0 && (
        <Card title={role === "FARMER" ? "ข้อเสนอซื้อที่รอคุณพิจารณา" : "ข้อเสนอที่รอสวนตอบ"} className="mb-5" bodyClassName="p-0">
          <ul className="divide-y divide-slate-100">
            {pending.slice(0, 5).map((o) => (
              <li key={o.id}>
                <Link href={role === "FARMER" ? `/allocation/${o.listing.id}` : "/offers"} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
                  <Avatar name={role === "FARMER" ? o.buyer.name : o.listing.farm_name} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-900">{role === "FARMER" ? o.buyer.name : o.listing.farm_name}</span>
                    <span className="block truncate text-xs text-slate-500">{productName(o.listing.product_type, o.listing.variety)} · {fmtKg(o.quantity_kg)} · สูงสุด {fmtTHB(o.top_price)}/กก.</span>
                  </span>
                  <StatusBadge map={OFFER_STATUS} value={o.status} />
                  <ChevronRight className="size-4 text-slate-400" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Chips
        className="mb-4"
        value={filter}
        onChange={setFilter}
        items={[
          { value: "all", label: "ทั้งหมด", count: groups.all.length },
          { value: "mine", label: "รอคุณดำเนินการ", count: groups.mine.length },
          { value: "active", label: "กำลังดำเนินการ", count: groups.active.length },
          { value: "problem", label: "มีปัญหา", count: groups.problem.length },
          { value: "done", label: "เสร็จสิ้น", count: groups.done.length },
        ]}
      />
      {groups[filter].length === 0 ? (
        <Card>
          <Empty icon={<ShoppingBasket className="size-10" />} title="ไม่มีดีลในหมวดนี้">
            {role === "FARMER" ? "ดีลจะขึ้นเมื่อคุณจัดสรรผลผลิตให้ผู้ซื้อ" : role === "BUYER" ? "ดีลจะขึ้นเมื่อสวนจัดสรรผลผลิตให้ตามข้อเสนอของคุณ" : null}
          </Empty>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{groups[filter].map((c) => <DealCard key={c.id} c={c} role={role} />)}</div>
      )}
    </>
  );
}

function FarmerDeals() {
  const { data, error } = useSWR<PurchaseRequest[]>("/purchase-requests");
  if (error) return <ErrorState error={error} />;
  if (!data) return <PageSkeleton />;
  const fits = data.filter((r) => r.best_match).sort((a, b) => b.best_match!.score - a.best_match!.score);
  return (
    <>
      <p className="mb-4 text-sm text-slate-500">ผู้ซื้อที่กำลังหาผลผลิตแบบเดียวกับที่คุณประกาศไว้ เรียงตามความเข้ากันได้ (heuristic ไม่ใช่ AI) — ทักแชทเพื่อคุยรายละเอียดได้เลย</p>
      {fits.length === 0 ? (
        <Card><Empty icon={<Handshake className="size-10" />} title="ยังไม่มีคำขอซื้อที่ตรงกับผลผลิตของคุณ">ลองลงประกาศผลผลิตเพิ่ม หรือดูคำขอซื้อทั้งหมดที่หน้า <Link href="/marketplace" className="text-green-800 underline">ค้นหาผู้ซื้อ</Link></Empty></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{fits.map((r) => <RequestCard key={r.id} r={r} />)}</div>
      )}
    </>
  );
}

function BuyerDeals() {
  const { data, error } = useSWR<DealSuggestion[]>("/deals/suggestions");
  const [offer, setOffer] = useState<{ listing: Listing; request: PurchaseRequest } | null>(null);
  if (error) return <ErrorState error={error} />;
  if (!data) return <PageSkeleton />;
  return (
    <>
      <p className="mb-4 text-sm text-slate-500">สวนที่เข้ากับคำขอซื้อที่เปิดอยู่ของคุณมากที่สุด (คำขอละไม่เกิน 3 สวน) — คะแนนจากช่วงเวลา ปริมาณ เกรด ระยะทาง และประวัติสวน</p>
      {data.length === 0 ? (
        <Card><Empty icon={<Handshake className="size-10" />} title="ยังไม่มีสวนที่เข้ากับคำขอซื้อของคุณ">สร้างคำขอซื้อเพื่อให้ระบบจับคู่สวนให้ที่ <Link href="/requests/new" className="text-green-800 underline">สร้างคำขอซื้อ</Link></Empty></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((d) => (
            <ListingCard
              key={`${d.request.id}-${d.listing.id}`}
              l={d.listing}
              score={d.score}
              offered={d.already_offered}
              note={<>สำหรับคำขอ <Link href={`/requests/${d.request.id}`} className="font-medium text-green-800 hover:underline">{d.request.code}</Link> · {productName(d.request.product_type, d.request.variety)} {fmtKg(d.request.quantity_kg)}</>}
              onOffer={() => setOffer({ listing: d.listing, request: d.request })}
            />
          ))}
        </div>
      )}
      <OfferDialog listing={offer?.listing ?? null} request={offer?.request} onClose={() => setOffer(null)} />
    </>
  );
}
