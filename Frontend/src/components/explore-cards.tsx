"use client";

import { CalendarRange, MapPin, Sparkles } from "lucide-react";
import Link from "next/link";
import { fmtKg, fmtRange, fmtTHB } from "@/lib/format";
import { BUSINESS_TYPE, INVENTORY_STATUS, PRODUCT, productName } from "@/lib/labels";
import type { Listing, PurchaseRequest } from "@/lib/types";
import { ChatButton } from "./deal-card";
import { InventoryBar } from "./inventory";
import { ProduceArt } from "./produce-art";
import { SourcingBadge } from "./sourcing";
import { TrustBadge } from "./trust";
import { Avatar, Badge, Button, cx, StatusBadge } from "./ui";

/** Match score pill (the "[5%]" box in the sketch). Heuristic, not AI. */
export function MatchPill({ score, className }: { score: number; className?: string }) {
  const tone = score >= 75 ? "bg-green-800 text-white" : score >= 55 ? "bg-lime-300 text-green-950" : "bg-white text-slate-700 ring-1 ring-slate-200";
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold shadow-sm", tone, className)} title="คะแนนความเข้ากันได้ (heuristic ไม่ใช่ AI)">
      <Sparkles className="size-3" />
      เข้ากัน {score.toFixed(0)}%
    </span>
  );
}

/** Buyer's view of a farm listing: "สวน A ขาย…". */
export function ListingCard({ l, score, note, onOffer, offered }: { l: Listing; score?: number; note?: React.ReactNode; onOffer?: () => void; offered?: boolean }) {
  return (
    <article className="flex flex-col overflow-hidden rounded-3xl bg-white ring-1 ring-slate-900/[0.05] shadow-sm shadow-slate-900/[0.03]">
      <div className="relative">
        <ProduceArt type={l.product_type} className="h-28" />
        <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold text-slate-800 shadow-sm">
          ขาย {productName(l.product_type, l.variety)}
        </span>
        <span className="absolute right-3 top-3">{score !== undefined ? <MatchPill score={score} /> : <StatusBadge map={INVENTORY_STATUS} value={l.inventory.status} />}</span>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-center gap-2.5">
          <Avatar name={l.farm.name} size="sm" />
          <div className="min-w-0">
            <div className="truncate font-semibold text-slate-900">{l.farm.name}</div>
            <div className="flex items-center gap-1 text-xs text-slate-500"><MapPin className="size-3" />{l.farm.province} · {l.code}</div>
          </div>
        </div>
        <div className="mt-3 space-y-1 text-sm text-slate-600">
          <div className="flex items-center gap-1.5"><CalendarRange className="size-4 text-slate-400" />เก็บเกี่ยว {fmtRange(l.harvest_start, l.harvest_end)}</div>
          <div>เกรด {l.expected_grades.join(", ")}{l.price_min ? ` · คาด ${fmtTHB(l.price_min)}–${fmtTHB(l.price_max)}/กก.` : ""}</div>
        </div>
        <div className="mt-3 text-sm">คงเหลือ <b className="tabular text-slate-900">{fmtKg(l.inventory.available_kg)}</b> <span className="text-slate-500">จาก {fmtKg(l.estimated_qty_kg)}</span></div>
        <div className="mt-1.5"><InventoryBar inv={l.inventory} showLegend={false} /></div>
        {note && <div className="mt-2 text-xs text-slate-500">{note}</div>}
        <div className="mt-auto flex gap-2 pt-4">
          {onOffer && (
            <Button size="sm" className="flex-1" disabled={offered || l.inventory.available_kg <= 0} onClick={onOffer}>
              {offered ? "ส่งข้อเสนอแล้ว" : "ส่งข้อเสนอ"}
            </Button>
          )}
          <ChatButton orgId={l.farm.organization_id} label="แชทกับสวน" className={onOffer ? undefined : "flex-1"} />
        </div>
      </div>
    </article>
  );
}

/** Farmer's view of a buyer's purchase request: "โรงงาน A ต้องการ…". */
export function RequestCard({ r }: { r: PurchaseRequest }) {
  const remaining = r.fill?.remaining_kg ?? r.quantity_kg;
  return (
    <article className="flex flex-col overflow-hidden rounded-3xl bg-white ring-1 ring-slate-900/[0.05] shadow-sm shadow-slate-900/[0.03]">
      <div className="relative">
        <ProduceArt type={r.product_type} className="h-24" compact />
        <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold text-slate-800 shadow-sm">
          ต้องการ {PRODUCT[r.product_type] ?? r.product_type} {fmtKg(r.sourcing_mode === "SINGLE" ? r.quantity_kg : remaining)}
        </span>
        <span className="absolute right-3 top-3">{r.best_match ? <MatchPill score={r.best_match.score} /> : <Badge tone="gray">ไม่ตรงกับผลผลิตของคุณ</Badge>}</span>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-center gap-2.5">
          <Avatar name={r.buyer.name} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold text-slate-900">{r.buyer.name}</div>
            <div className="text-xs text-slate-500">{r.buyer.business_type ? BUSINESS_TYPE[r.buyer.business_type] : "ผู้ซื้อ"} · {r.code}</div>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {r.buyer_trust && <TrustBadge trust={r.buyer_trust} orgId={r.buyer.id} />}
          <SourcingBadge r={r} />
        </div>
        <div className="mt-3 space-y-1 text-sm text-slate-600">
          <div>{productName(r.product_type, r.variety)} · เกรด {r.accepted_grades.join(", ")}</div>
          <div className="flex items-center gap-1.5"><CalendarRange className="size-4 text-slate-400" />รับ {fmtRange(r.delivery_start, r.delivery_end)}</div>
          <div className="flex items-center gap-1.5"><MapPin className="size-4 text-slate-400" />ส่งที่ {r.destination_province}</div>
          <div>
            ราคาเป้าหมาย <b className="text-slate-900">{r.target_price ? `${fmtTHB(r.target_price)}/กก.` : "—"}</b> · ชำระใน {r.payment_terms_days} วัน
          </div>
          <div className="text-xs text-slate-500">
            {r.sourcing_mode === "SINGLE" ? `ต้องส่งได้ครบ ${fmtKg(r.quantity_kg)} จากสวนเดียว` : `ยังขาด ${fmtKg(remaining)} · ขั้นต่ำต่อสวน ${fmtKg(r.min_quantity_kg)}`}
          </div>
        </div>
        <div className="mt-auto flex gap-2 pt-4">
          {r.best_match && (
            <Link href={`/produce/${r.best_match.listing_id}`} className="flex-1 rounded-xl bg-green-800 px-3 py-1.5 text-center text-sm font-medium text-white hover:bg-green-900">
              ดูประกาศ {r.best_match.listing_code}
            </Link>
          )}
          <ChatButton orgId={r.buyer.id} label="แชทกับผู้ซื้อ" className={r.best_match ? undefined : "flex-1"} />
        </div>
      </div>
    </article>
  );
}
