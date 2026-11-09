"use client";

import { Check, X } from "lucide-react";
import type { Tone } from "@/lib/labels";
import type { AuditEvent, ContractDetail } from "@/lib/types";
import { cx } from "./ui";

export type Actor = "FARMER" | "BUYER" | "INSPECTOR" | "SYSTEM" | "BOTH";

export type Stage = {
  key: string;
  label: string;
  actor: Actor;
  docs: string[];
  match: (e: AuditEvent) => boolean;
};

const to = (...s: string[]) => (e: AuditEvent) => !!e.to_status && s.includes(e.to_status);

export const STAGES: Stage[] = [
  { key: "REQUEST", label: "คำขอซื้อ", actor: "BUYER", docs: ["รายละเอียดคำขอซื้อ"], match: (e) => e.action === "REQUEST_CREATED" },
  { key: "MATCHING", label: "จับคู่", actor: "SYSTEM", docs: ["ผลการจับคู่และเหตุผล"], match: (e) => e.action === "LISTING_CREATED" },
  { key: "OFFER", label: "ข้อเสนอ", actor: "BUYER", docs: ["ข้อเสนอซื้อพร้อมราคาตามเกรด"], match: (e) => e.action === "OFFER_SUBMITTED" },
  { key: "ALLOCATION", label: "จัดสรร", actor: "FARMER", docs: ["แผนจัดสรรหลักและการจองชั่วคราว"], match: (e) => e.action === "CONTRACT_CREATED" },
  { key: "HARVESTLOCK", label: "HarvestLock", actor: "BOTH", docs: ["สัญญาฉบับล่าสุด", "การยอมรับจากทั้งสองฝ่าย (hash เดียวกัน)"], match: to("CONFIRMED", "CANCELLED", "RESERVATION_EXPIRED") },
  { key: "HARVEST", label: "เก็บเกี่ยว", actor: "FARMER", docs: ["บันทึกการเก็บเกี่ยว", "รหัสล็อต"], match: to("HARVESTED") },
  { key: "DELIVERY", label: "ขนส่ง", actor: "BOTH", docs: ["น้ำหนักรวม/ภาชนะ/สุทธิ", "ทะเบียนรถ", "การยืนยันรับสินค้า"], match: to("IN_TRANSIT", "DELIVERED") },
  { key: "GRADEPROOF", label: "GradeProof", actor: "INSPECTOR", docs: ["ผลตรวจแยกตามเกรด", "วิธีสุ่มตัวอย่าง", "หลักฐานภาพถ่าย"], match: to("QC_PENDING", "QC_ACCEPTED") },
  { key: "SETTLEMENT", label: "ชำระเงิน", actor: "BUYER", docs: ["ใบคำนวณยอด", "หลักฐานการชำระเงิน", "การยืนยันรับเงิน"], match: (e) => e.action === "PAYMENT_RECORDED" || ["PAYMENT_PENDING", "PAID", "COMPLETED"].includes(e.to_status ?? "") },
  { key: "AGRITRUST", label: "AgriTrust", actor: "SYSTEM", docs: ["เหตุการณ์ที่ตรวจสอบแล้ว"], match: (e) => e.action === "TRUST_UPDATED" },
];

const CURRENT: Record<string, number> = {
  AWAITING_CONFIRMATION: 4,
  CONFIRMED: 5,
  HARVESTED: 6,
  IN_TRANSIT: 6,
  DELIVERED: 7,
  QC_PENDING: 7,
  QC_ACCEPTED: 8,
  PAYMENT_PENDING: 8,
  PAYMENT_OVERDUE: 8,
  PAID: 8,
  COMPLETED: 10,
  CANCELLED: 4,
  RESERVATION_EXPIRED: 4,
};

export const isStopped = (s: string) => s === "CANCELLED" || s === "RESERVATION_EXPIRED";
export const currentStage = (s: string) => CURRENT[s] ?? 0;

export const ACTOR_LABEL: Record<Actor, string> = {
  FARMER: "เกษตรกร",
  BUYER: "ผู้ซื้อ",
  INSPECTOR: "ผู้ตรวจคุณภาพ",
  SYSTEM: "ระบบ AgriGuard",
  BOTH: "เกษตรกร + ผู้ซื้อ",
};

export const ACTOR_DOT: Record<Actor, string> = {
  FARMER: "bg-green-600",
  BUYER: "bg-sky-600",
  INSPECTOR: "bg-violet-600",
  SYSTEM: "bg-slate-400",
  BOTH: "bg-gradient-to-r from-green-600 to-sky-600",
};

export const ACTOR_TONE_OF: Record<Actor, Tone> = { FARMER: "green", BUYER: "blue", INSPECTOR: "violet", SYSTEM: "gray", BOTH: "lime" };

export function Stepper({ c, selected, onSelect }: { c: ContractDetail; selected: number; onSelect: (i: number) => void }) {
  const cur = currentStage(c.order_status);
  const stopped = isStopped(c.order_status);
  return (
    <ol className="grid grid-cols-2 gap-2 sm:grid-cols-5 xl:grid-cols-10">
      {STAGES.map((s, i) => {
        const done = i < cur;
        const active = i === cur && !stopped;
        const failed = i === cur && stopped;
        return (
          <li key={s.key}>
            <button
              onClick={() => onSelect(i)}
              className={cx(
                "flex h-full w-full flex-col items-start gap-1.5 rounded-lg border p-2.5 text-left transition",
                selected === i ? "border-green-700 ring-2 ring-green-700/20" : "border-slate-200 hover:border-slate-300",
                active && "bg-amber-50",
                failed && "bg-red-50",
              )}
            >
              <span
                className={cx(
                  "flex size-6 items-center justify-center rounded-full text-xs font-semibold",
                  done ? "bg-green-700 text-white" : active ? "bg-amber-500 text-white" : failed ? "bg-red-500 text-white" : "bg-slate-100 text-slate-500",
                )}
              >
                {done ? <Check className="size-3.5" /> : failed ? <X className="size-3.5" /> : i + 1}
              </span>
              <span className="text-xs font-medium leading-tight text-slate-800">{s.label}</span>
              <span className="flex items-center gap-1 text-[11px] text-slate-500">
                <span className={cx("size-1.5 rounded-full", ACTOR_DOT[s.actor])} />
                {ACTOR_LABEL[s.actor]}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

const LANES: { key: AuditEvent["actor_role"][]; label: string; dot: string }[] = [
  { key: ["FARMER"], label: "เกษตรกร", dot: "bg-green-600" },
  { key: ["BUYER"], label: "ผู้ซื้อ", dot: "bg-sky-600" },
  { key: ["INSPECTOR"], label: "ผู้ตรวจ", dot: "bg-violet-600" },
  { key: ["SYSTEM", "ADMIN"], label: "ระบบ", dot: "bg-slate-400" },
];

/** Swimlane timeline: one column per actor so it is clear who did what (overall_flow §25). */
export function Swimlane({ events, fmt }: { events: AuditEvent[]; fmt: (s: string) => string }) {
  return (
    <div className="-mx-5 overflow-x-auto px-5">
      <div className="min-w-[720px]">
        <div className="grid grid-cols-[110px_repeat(4,1fr)] gap-2 border-b border-slate-200 pb-2 text-xs font-medium text-slate-500">
          <span>เวลา</span>
          {LANES.map((l) => (
            <span key={l.label} className="flex items-center gap-1.5"><span className={cx("size-2 rounded-full", l.dot)} />{l.label}</span>
          ))}
        </div>
        {events.map((e) => {
          const lane = LANES.findIndex((l) => l.key.includes(e.actor_role));
          return (
            <div key={e.id} className="grid grid-cols-[110px_repeat(4,1fr)] gap-2 border-b border-slate-100 py-2 text-sm">
              <span className="text-xs text-slate-500">{fmt(e.created_at)}</span>
              {LANES.map((l, i) => (
                <div key={l.label} className={cx("min-w-0", i === lane ? "" : "border-l border-dashed border-slate-100")}>
                  {i === lane && (
                    <div className="rounded-md bg-slate-50 px-2 py-1.5">
                      <div className="text-slate-800">{e.message}</div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {e.actor?.name ?? "ระบบ"}
                        {e.from_status || e.to_status ? ` · ${e.from_status ?? "—"} → ${e.to_status ?? "—"}` : ""}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
