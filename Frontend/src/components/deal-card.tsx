"use client";

import { AlertTriangle, Check, MessageCircle, Users, User as UserIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { post } from "@/lib/api";
import { fmtKg, fmtRange, fmtTHB } from "@/lib/format";
import { ORDER_STATUS, productName } from "@/lib/labels";
import type { ContractBrief, Role } from "@/lib/types";
import { FlowButton } from "./deal-flow";
import { useToast } from "./toast";
import { Avatar, Badge, Button, cx } from "./ui";

/** States that need attention: shown with a red frame ("เบี้ยวนัด" in the sketch). */
export const PROBLEM = new Set(["DISPUTED", "PAYMENT_OVERDUE", "QC_DISPUTED", "CANCELLED"]);
export const CLOSED = new Set(["COMPLETED", "CANCELLED", "RESERVATION_EXPIRED"]);

export function SourcingChip({ s }: { s: ContractBrief["sourcing"] }) {
  if (!s) return <Badge tone="gray">ซื้อตรงจากประกาศ</Badge>;
  return s.mode === "SINGLE" ? (
    <Badge tone="blue"><UserIcon className="size-3" />ผู้ขายรายเดียว · 1 คน</Badge>
  ) : (
    <Badge tone="violet"><Users className="size-3" />หลายผู้ขาย{s.max_suppliers ? ` · สูงสุด ${s.max_suppliers} คน` : ""}</Badge>
  );
}

/** Opens (or creates) the chat thread with an organization. */
export function ChatButton({ orgId, label = "แชท", size = "sm", variant = "secondary", className }: { orgId: string; label?: string; size?: "sm" | "md"; variant?: "primary" | "secondary" | "ghost"; className?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size={size}
      variant={variant}
      loading={busy}
      className={className}
      onClick={async () => {
        setBusy(true);
        try {
          const { id } = await post<{ id: string }>("/chats", { organization_id: orgId });
          router.push(`/chat/${id}`);
        } catch (e) {
          toast("error", e instanceof Error ? e.message : "เปิดแชทไม่สำเร็จ");
          setBusy(false);
        }
      }}
    >
      {!busy && <MessageCircle className="size-4" />}
      {label}
    </Button>
  );
}

export function DealCard({ c, role }: { c: ContractBrief; role: Role }) {
  const other = role === "FARMER" ? c.buyer : c.farmer;
  const [label, tone] = ORDER_STATUS[c.order_status] ?? [c.order_status, "gray"];
  const problem = PROBLEM.has(c.order_status);
  const trader = role === "FARMER" || role === "BUYER";
  return (
    <article className={cx("rounded-2xl border bg-white p-4 shadow-sm shadow-slate-900/[0.03]", problem ? "border-red-300 ring-1 ring-red-200" : "border-slate-200/80")}>
      <div className="flex items-start gap-3">
        <Avatar name={other.name} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate font-semibold text-slate-900">{role === "ADMIN" || role === "INSPECTOR" ? `${c.farmer.name} → ${c.buyer.name}` : other.name}</div>
              <div className="text-xs text-slate-500">{c.code} · {productName(c.product_type, c.variety)}</div>
            </div>
            <Badge tone={tone} className={problem ? "ring-2 ring-red-300" : undefined}>
              {problem && <AlertTriangle className="size-3" />}
              {c.order_status === "COMPLETED" && <Check className="size-3" />}
              {label}
            </Badge>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
            <span><span className="text-slate-400">กิโลกรัม</span> <b className="tabular text-slate-900">{fmtKg(c.quantity_kg)}</b></span>
            <span><span className="text-slate-400">ราคา</span> <b className="tabular text-slate-900">{fmtTHB(c.top_price)}</b>/กก.</span>
            <span className="text-xs text-slate-500">ส่งมอบ {fmtRange(c.delivery_window[0], c.delivery_window[1])}</span>
          </div>
          <div className="mt-2"><SourcingChip s={c.sourcing} /></div>
        </div>
      </div>
      <div className="mt-3"><FlowButton c={c} /></div>
      {c.order_status === "DISPUTED" && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">สัญญาถูกระงับระหว่างพิจารณาข้อพิพาท</p>}
      <div className="mt-3 flex gap-2">
        <Link href={`/contracts/${c.id}`} className="flex-1 rounded-xl bg-green-800 px-3 py-2 text-center text-sm font-medium text-white hover:bg-green-900">ดูรายละเอียด</Link>
        {trader && <ChatButton orgId={other.id} />}
      </div>
    </article>
  );
}
