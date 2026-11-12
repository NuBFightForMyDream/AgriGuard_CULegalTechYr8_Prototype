"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { Org } from "./types";

/**
 * Buyer (factory / exporter) subscription plans. Prices follow the Business Feasibility slide:
 * Basic = ฿0 + 1% per deal, Premium = the slide's "Business" ฿3,000/month + 0.6%; Enterprise is quoted per volume.
 * The prototype keeps the chosen plan in this browser only (no billing): see `usePlan`.
 */
export type PlanId = "BASIC" | "PREMIUM" | "ENTERPRISE";

export const PLAN_ORDER: PlanId[] = ["BASIC", "PREMIUM", "ENTERPRISE"];

export type Plan = {
  id: PlanId;
  name: string;
  price: string;
  priceNote: string;
  fee: string;
  tagline: string;
  seats: string;
  farmsPerRequest: string;
  highlights: string[];
};

export const PLANS: Record<PlanId, Plan> = {
  BASIC: {
    id: "BASIC",
    name: "Basic",
    price: "฿0",
    priceNote: "ค่าสมาชิก",
    fee: "1% ต่อดีล",
    tagline: "เริ่มซื้อล่วงหน้าแบบมีสัญญาและหลักฐาน",
    seats: "1 คน",
    farmsPerRequest: "สูงสุด 3 สวน",
    highlights: ["สัญญา HarvestLock + มัดจำ", "ผลตรวจ GradeProof", "ข้อพิพาท & หลักฐาน", "AgriBot ถามสัญญาและกฎหมาย"],
  },
  PREMIUM: {
    id: "PREMIUM",
    name: "Premium",
    price: "฿3,000",
    priceNote: "ต่อเดือน",
    fee: "0.6% ต่อดีล",
    tagline: "ฝ่ายจัดซื้อทั้งทีม พร้อมข้อมูลตัดสินใจ",
    seats: "สูงสุด 10 คน",
    farmsPerRequest: "ไม่จำกัด",
    highlights: ["Procurement Insights", "Supplier scorecard", "QR trace ส่งออก + ส่งออก CSV", "ทีมจัดซื้อหลายคน"],
  },
  ENTERPRISE: {
    id: "ENTERPRISE",
    name: "Enterprise",
    price: "ตามปริมาณ",
    priceNote: "ติดต่อทีมขาย",
    fee: "fee ต่อรองได้",
    tagline: "โรงงานหลายสาขา เชื่อมระบบองค์กร",
    seats: "ไม่จำกัด",
    farmsPerRequest: "ไม่จำกัด",
    highlights: ["แผนวัตถุดิบล่วงหน้า", "หลายโรงงาน + สายอนุมัติ", "API & เชื่อม ERP", "template สัญญาขององค์กร + SLA"],
  },
};

/** Feature matrix for the comparison table. `true` = included, string = included with that limit. */
export const PLAN_FEATURES: { group: string; rows: { label: string; values: Record<PlanId, boolean | string> }[] }[] = [
  {
    group: "ซื้อขายพื้นฐาน",
    rows: [
      { label: "คำขอซื้อ + จับคู่สวน", values: { BASIC: true, PREMIUM: true, ENTERPRISE: true } },
      { label: "สวนต่อคำขอซื้อ", values: { BASIC: "3 สวน", PREMIUM: "ไม่จำกัด", ENTERPRISE: "ไม่จำกัด" } },
      { label: "HarvestLock · GradeProof · ข้อพิพาท", values: { BASIC: true, PREMIUM: true, ENTERPRISE: true } },
      { label: "AgriBot (สัญญา & กฎหมาย)", values: { BASIC: true, PREMIUM: true, ENTERPRISE: true } },
      { label: "ค่าธรรมเนียมต่อดีล", values: { BASIC: "1%", PREMIUM: "0.6%", ENTERPRISE: "ต่อรองได้" } },
    ],
  },
  {
    group: "ข้อมูลจัดซื้อ",
    rows: [
      { label: "Procurement Insights (ยอดซื้อ ราคาเฉลี่ย)", values: { BASIC: false, PREMIUM: true, ENTERPRISE: true } },
      { label: "Supplier scorecard", values: { BASIC: false, PREMIUM: true, ENTERPRISE: true } },
      { label: "ส่งออกข้อมูล CSV", values: { BASIC: false, PREMIUM: true, ENTERPRISE: true } },
      { label: "QR trace สำหรับส่งออก", values: { BASIC: false, PREMIUM: true, ENTERPRISE: true } },
      { label: "แผนวัตถุดิบล่วงหน้า (supply calendar)", values: { BASIC: false, PREMIUM: false, ENTERPRISE: true } },
      { label: "แจ้งเตือนความเสี่ยงซัพพลาย", values: { BASIC: false, PREMIUM: false, ENTERPRISE: true } },
    ],
  },
  {
    group: "ทีมและองค์กร",
    rows: [
      { label: "ผู้ใช้", values: { BASIC: "1 คน", PREMIUM: "10 คน", ENTERPRISE: "ไม่จำกัด" } },
      { label: "หลายโรงงาน / สาขา", values: { BASIC: false, PREMIUM: false, ENTERPRISE: true } },
      { label: "สายอนุมัติการสั่งซื้อ", values: { BASIC: false, PREMIUM: false, ENTERPRISE: true } },
      { label: "API · webhook · เชื่อม ERP", values: { BASIC: false, PREMIUM: false, ENTERPRISE: true } },
      { label: "Single sign-on (SSO)", values: { BASIC: false, PREMIUM: false, ENTERPRISE: true } },
      { label: "template สัญญาขององค์กร + Legal AI ตรวจ", values: { BASIC: false, PREMIUM: false, ENTERPRISE: true } },
      { label: "ผู้ดูแลบัญชี + SLA 99.9%", values: { BASIC: false, PREMIUM: false, ENTERPRISE: true } },
    ],
  },
];

export const planRank = (p: PlanId) => PLAN_ORDER.indexOf(p);
export const hasPlan = (current: PlanId, need: PlanId) => planRank(current) >= planRank(need);

/** Demo defaults so every tier can be shown: verified processors (factories) → Enterprise, exporters → Premium. */
export function defaultPlan(org: Org): PlanId {
  if (org.kind !== "BUYER") return "BASIC";
  if (org.business_type === "PROCESSOR" && org.verified) return "ENTERPRISE";
  if (org.business_type === "EXPORTER") return "PREMIUM";
  return "BASIC";
}

const KEY = (orgId: string) => `agriguard.plan.${orgId}`;
const EVENT = "agriguard-plan";

function read(orgId: string): PlanId | null {
  try {
    const v = localStorage.getItem(KEY(orgId));
    return v && (PLAN_ORDER as string[]).includes(v) ? (v as PlanId) : null;
  } catch {
    return null;
  }
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/** The organization's plan (simulated: stored in this browser, no billing). */
export function usePlan(org: Org): [PlanId, (p: PlanId) => void] {
  const stored = useSyncExternalStore(subscribe, () => read(org.id), () => null);
  const set = useCallback(
    (p: PlanId) => {
      try {
        localStorage.setItem(KEY(org.id), p);
      } catch {
        /* storage unavailable: the choice lasts until reload */
      }
      window.dispatchEvent(new Event(EVENT));
    },
    [org.id],
  );
  return [stored ?? defaultPlan(org), set];
}
