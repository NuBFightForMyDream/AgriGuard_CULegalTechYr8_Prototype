"use client";

import { Check, ChevronDown, Clock, ExternalLink, PauseCircle, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { fmtDateTime, fmtKg } from "@/lib/format";
import { ROLE, productName } from "@/lib/labels";
import type { AuditEvent, ContractBrief, ContractDetail } from "@/lib/types";
import { Badge, cx, Modal, Skeleton } from "./ui";

type Who = "FARMER" | "BUYER" | "INSPECTOR" | "SYSTEM" | "BOTH";
type Step = { label: string; done: string; who: Who; match: (e: AuditEvent) => boolean };

const to = (...s: string[]) => (e: AuditEvent) => !!e.to_status && s.includes(e.to_status);
const act = (...a: string[]) => (e: AuditEvent) => a.includes(e.action);
const any = (...m: ((e: AuditEvent) => boolean)[]) => (e: AuditEvent) => m.some((f) => f(e));

/** The full purchase flow, 12 steps from the first listing/request to the trust update. */
export const FLOW: Step[] = [
  { label: "ลงประกาศขาย / สร้างคำขอซื้อ", done: "เริ่มต้นแล้ว", who: "BOTH", match: act("LISTING_CREATED", "REQUEST_CREATED") },
  { label: "ผู้ซื้อส่งข้อเสนอ", done: "ส่งข้อเสนอแล้ว", who: "BUYER", match: act("OFFER_SUBMITTED") },
  { label: "เกษตรกรจัดสรร & ร่าง HarvestLock", done: "จัดสรรแล้ว", who: "FARMER", match: act("ALLOCATION_CONFIRMED", "CONTRACT_CREATED") },
  { label: "ผู้ซื้อลงนามยืนยันสัญญา", done: "ดีลแล้ว", who: "BUYER", match: to("CONFIRMED", "CANCELLED", "RESERVATION_EXPIRED") },
  { label: "เก็บเกี่ยว", done: "เก็บเกี่ยวแล้ว", who: "FARMER", match: any(to("HARVESTED"), act("LOT_ADDED")) },
  { label: "ส่งของออกจากสวน", done: "ส่งของแล้ว", who: "FARMER", match: any(to("IN_TRANSIT"), act("LOT_DISPATCHED")) },
  { label: "ผู้ซื้อรับของ & ชั่งน้ำหนัก", done: "ได้รับของแล้ว", who: "BUYER", match: any(to("DELIVERED", "QC_PENDING"), act("LOT_RECEIVED")) },
  { label: "ตรวจคุณภาพ (GradeProof)", done: "ตรวจคุณภาพแล้ว", who: "INSPECTOR", match: any(to("QC_ACCEPTED", "QC_DISPUTED"), act("LOT_INSPECTED")) },
  { label: "สรุปยอดชำระตามผลตรวจ", done: "สรุปยอดแล้ว", who: "SYSTEM", match: to("PAYMENT_PENDING", "PAYMENT_OVERDUE") },
  { label: "ผู้ซื้อชำระเงิน", done: "ชำระเงินแล้ว", who: "BUYER", match: any(to("PAID"), act("PAYMENT_RECORDED")) },
  { label: "เกษตรกรยืนยันรับเงิน & ปิดดีล", done: "ปิดดีลแล้ว", who: "FARMER", match: to("COMPLETED") },
  { label: "อัปเดตคะแนน AgriTrust", done: "อัปเดต AgriTrust แล้ว", who: "SYSTEM", match: act("TRUST_UPDATED") },
];
const N = FLOW.length;

/** Steps finished for an order status (step 12 also needs the trust update event). */
const DONE: Record<string, number> = {
  AWAITING_CONFIRMATION: 3,
  CONFIRMED: 4,
  HARVESTED: 5,
  IN_TRANSIT: 6,
  DELIVERED: 7,
  QC_PENDING: 7,
  QC_DISPUTED: 7,
  QC_ACCEPTED: 8,
  PAYMENT_PENDING: 9,
  PAYMENT_OVERDUE: 9,
  PAID: 10,
  COMPLETED: 11,
  CANCELLED: 3,
  RESERVATION_EXPIRED: 3,
};
const STOPPED = new Set(["CANCELLED", "RESERVATION_EXPIRED"]);
const WHO: Record<Who, string> = { FARMER: "เกษตรกร", BUYER: "ผู้ซื้อ", INSPECTOR: "ผู้ตรวจคุณภาพ", SYSTEM: "ระบบ", BOTH: "เกษตรกร / ผู้ซื้อ" };
const WHO_DOT: Record<string, string> = { FARMER: "bg-green-600", BUYER: "bg-sky-600", INSPECTOR: "bg-violet-600", SYSTEM: "bg-slate-400", ADMIN: "bg-slate-400", BOTH: "bg-lime-500" };

export function progressOf(status: string, opts?: { previous?: string | null; trustUpdated?: boolean }) {
  const effective = status === "DISPUTED" && opts?.previous ? opts.previous : status;
  const done = Math.min(N, (DONE[effective] ?? 0) + (effective === "COMPLETED" && opts?.trustUpdated ? 1 : 0));
  return { done, effective, stopped: STOPPED.has(status), paused: status === "DISPUTED" || status === "QC_DISPUTED" || status === "PAYMENT_OVERDUE" };
}

/** "ขั้นที่ 6/12 · ส่งของแล้ว" */
export function progressLabel(done: number, stopped: boolean) {
  if (stopped) return `หยุดที่ขั้น ${done + 1}/${N} · ดีลไม่สำเร็จ`;
  return done === 0 ? `ขั้นที่ 0/${N}` : `ขั้นที่ ${done}/${N} · ${FLOW[done - 1].done}`;
}

/** Compact clickable progress for deal cards; opens the full flow. */
export function FlowButton({ c }: { c: ContractBrief }) {
  const [open, setOpen] = useState(false);
  const { done, stopped, paused } = progressOf(c.order_status);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="group w-full rounded-xl border border-slate-200 bg-slate-50/60 p-2.5 text-left transition hover:border-green-700 hover:bg-green-50/50"
        aria-label={`ดู flow การซื้อ ${c.code}`}
      >
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className={cx("font-semibold", stopped ? "text-slate-500" : paused ? "text-red-700" : "text-slate-800")}>{progressLabel(done, stopped)}</span>
          <span className="flex items-center gap-0.5 font-medium text-green-800 group-hover:underline">ดู flow<ChevronDown className="size-3.5 -rotate-90" /></span>
        </div>
        <div className="mt-2 grid grid-cols-12 gap-0.5" aria-hidden>
          {FLOW.map((_, i) => (
            <span
              key={i}
              className={cx(
                "h-1.5 rounded-full",
                i < done ? "bg-green-600" : i === done && !stopped ? (paused ? "bg-red-400" : "bg-amber-400") : stopped && i === done ? "bg-red-300" : "bg-slate-200",
              )}
            />
          ))}
        </div>
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Flow การซื้อ · ${c.code}`} wide>
        {open && <FlowDetail id={c.id} />}
      </Modal>
    </>
  );
}

/** Every step with its date, who did it and all events recorded in that step. */
export function FlowDetail({ id }: { id: string }) {
  const { data } = useSWR<ContractDetail>(`/contracts/${id}`);
  const [openStep, setOpenStep] = useState<number | null>(null);
  const now = useRef<HTMLLIElement>(null);
  const loaded = !!data;
  useEffect(() => {
    // Bring the step in progress into view when the flow opens.
    if (loaded) now.current?.scrollIntoView({ block: "center" });
  }, [loaded]);
  if (!data) return <div className="space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>;

  const events = data.timeline;
  const trustUpdated = events.some((e) => e.action === "TRUST_UPDATED");
  const { done, stopped, paused } = progressOf(data.order_status, { previous: data.active_dispute?.previous_order_status, trustUpdated });

  // Place each event under a step: its own step if it matches one, otherwise the step that was in progress at that moment.
  const firstAt: (string | null)[] = FLOW.map((s) => events.find((e) => s.match(e))?.created_at ?? null);
  const byStep: AuditEvent[][] = FLOW.map(() => []);
  for (const e of events) {
    let i = FLOW.findIndex((s) => s.match(e));
    if (i < 0) {
      i = 0;
      firstAt.forEach((t, k) => {
        if (t && t <= e.created_at) i = k;
      });
    }
    byStep[i].push(e);
  }
  const current = Math.min(done, N - 1);
  const shown = openStep ?? current;

  return (
    <div>
      <div className="mb-4 flex items-center gap-3 rounded-2xl bg-gradient-to-br from-green-800 to-emerald-600 p-4 text-white">
        <div className="flex size-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-white/15 leading-none">
          <span className="text-xl font-bold tabular">{done}</span>
          <span className="text-[10px] text-green-100">จาก {N}</span>
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold">{progressLabel(done, stopped)}</div>
          <div className="truncate text-xs text-green-100">
            {data.farmer.name} → {data.buyer.name} · {productName(data.product_type, data.variety)} {fmtKg(data.quantity_kg)}
          </div>
          {!stopped && done < N && (
            <div className="mt-1 text-xs text-white">
              {paused ? "หยุดชั่วคราว: " : "ถัดไป: "}
              {FLOW[done].label} <span className="text-green-100">({WHO[FLOW[done].who]})</span>
            </div>
          )}
        </div>
      </div>
      {data.order_status === "DISPUTED" && (
        <p className="mb-3 flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700"><PauseCircle className="size-4" />ดีลหยุดชั่วคราวระหว่างพิจารณาข้อพิพาท {data.active_dispute?.code}</p>
      )}

      <ol className="relative">
        {FLOW.map((s, i) => {
          const isDone = i < done;
          const isNow = i === done && !stopped;
          const isStop = stopped && i === done;
          const evs = byStep[i];
          const expanded = shown === i;
          return (
            <li key={s.label} ref={i === current ? now : undefined} className="relative flex gap-3 pb-1">
              {i < N - 1 && <span className={cx("absolute left-[15px] top-8 h-[calc(100%-1.5rem)] w-0.5", isDone ? "bg-green-600" : "bg-slate-200")} />}
              <span
                className={cx(
                  "relative z-10 mt-1 flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  isDone ? "bg-green-700 text-white" : isNow ? (paused ? "bg-red-500 text-white" : "bg-amber-400 text-white ring-4 ring-amber-100") : isStop ? "bg-red-500 text-white" : "bg-slate-100 text-slate-400",
                )}
              >
                {isDone ? <Check className="size-4" /> : isStop ? <X className="size-4" /> : isNow ? <Clock className="size-4" /> : i + 1}
              </span>
              <div className="min-w-0 flex-1 pb-3">
                <button onClick={() => setOpenStep(expanded ? -1 : i)} className="flex w-full items-start justify-between gap-2 rounded-lg px-1 py-1 text-left hover:bg-slate-50" aria-expanded={expanded}>
                  <span className="min-w-0">
                    <span className={cx("block text-sm font-medium", isDone ? "text-slate-900" : isNow ? "text-amber-800" : "text-slate-400")}>
                      {i + 1}. {s.label}
                    </span>
                    <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
                      <span className={cx("size-1.5 rounded-full", WHO_DOT[s.who])} />
                      {WHO[s.who]}
                      {firstAt[i] && isDone && <> · {fmtDateTime(firstAt[i])}</>}
                      {isNow && <Badge tone={paused ? "red" : "amber"}>{paused ? "หยุดชั่วคราว" : "กำลังทำ"}</Badge>}
                    </span>
                  </span>
                  {evs.length > 0 && (
                    <span className="flex shrink-0 items-center gap-0.5 text-[11px] text-slate-400">
                      {evs.length} เหตุการณ์ <ChevronDown className={cx("size-3.5 transition", expanded && "rotate-180")} />
                    </span>
                  )}
                </button>
                {expanded && evs.length > 0 && (
                  <ul className="mt-1 space-y-1.5 border-l-2 border-slate-100 pl-3">
                    {evs.map((e) => (
                      <li key={e.id} className="text-xs">
                        <div className="text-slate-700">{e.message}</div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-400">
                          <span className={cx("size-1.5 rounded-full", WHO_DOT[e.actor_role] ?? "bg-slate-400")} />
                          {e.actor?.name ?? ROLE[e.actor_role]} · {fmtDateTime(e.created_at)}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <div className="mt-2 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
        <span className="text-xs text-slate-500">ทุกเหตุการณ์มาจากประวัติธุรกรรมที่บันทึกไว้ แก้ไขย้อนหลังไม่ได้</span>
        <Link href={`/contracts/${data.id}`} className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-green-800 px-3 py-2 text-sm font-medium text-white hover:bg-green-900">
          เปิดสัญญา <ExternalLink className="size-3.5" />
        </Link>
      </div>
    </div>
  );
}
