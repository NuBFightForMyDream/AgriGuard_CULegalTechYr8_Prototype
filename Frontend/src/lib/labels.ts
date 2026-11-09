import type { Role } from "./types";

export type Tone = "gray" | "green" | "amber" | "red" | "blue" | "violet" | "lime";

export const PRODUCT: Record<string, string> = {
  mango: "มะม่วง",
  durian: "ทุเรียน",
  mangosteen: "มังคุด",
  longan: "ลำไย",
  orange: "ส้ม",
  rambutan: "เงาะ",
  other: "อื่น ๆ",
};

export const productName = (type: string, variety?: string | null) =>
  `${PRODUCT[type] ?? type}${variety ? ` ${variety}` : ""}`;

export const ROLE: Record<Role | "SYSTEM", string> = {
  FARMER: "เกษตรกร",
  BUYER: "ผู้ซื้อ",
  INSPECTOR: "ผู้ตรวจคุณภาพ",
  ADMIN: "ผู้ดูแลระบบ",
  SYSTEM: "ระบบ AgriGuard",
};

export const ACTOR_TONE: Record<Role | "SYSTEM", Tone> = {
  FARMER: "green",
  BUYER: "blue",
  INSPECTOR: "violet",
  ADMIN: "gray",
  SYSTEM: "gray",
};

export const BUSINESS_TYPE: Record<string, string> = {
  EXPORTER: "ผู้ส่งออก",
  PROCESSOR: "โรงงานแปรรูป",
  WHOLESALER: "ผู้ค้าส่ง",
};

export const ORDER_STATUS: Record<string, [string, Tone]> = {
  AWAITING_CONFIRMATION: ["รอผู้ซื้อยืนยัน", "amber"],
  CONFIRMED: ["ยืนยันสัญญาแล้ว", "blue"],
  HARVESTED: ["เก็บเกี่ยวแล้ว", "blue"],
  IN_TRANSIT: ["กำลังขนส่ง", "blue"],
  DELIVERED: ["ส่งถึงแล้ว", "blue"],
  QC_PENDING: ["รอตรวจคุณภาพ", "violet"],
  QC_ACCEPTED: ["ตรวจคุณภาพแล้ว", "violet"],
  QC_DISPUTED: ["โต้แย้งผลตรวจ", "red"],
  PAYMENT_PENDING: ["รอชำระเงิน", "amber"],
  PAYMENT_OVERDUE: ["เลยกำหนดชำระ", "red"],
  PAID: ["ชำระแล้ว รอยืนยันรับเงิน", "lime"],
  COMPLETED: ["เสร็จสิ้น", "green"],
  CANCELLED: ["ยกเลิก", "red"],
  RESERVATION_EXPIRED: ["การจองหมดอายุ", "gray"],
  DISPUTED: ["ระงับ: มีข้อพิพาท", "red"],
};

export const DISPUTE_STATUS: Record<string, [string, Tone]> = {
  OPEN: ["เปิดใหม่", "amber"],
  EVIDENCE_COLLECTION: ["รวบรวมหลักฐาน", "amber"],
  UNDER_REVIEW: ["กำลังพิจารณา", "blue"],
  REINSPECTION_REQUESTED: ["รอตรวจซ้ำ", "violet"],
  RESOLVED: ["มีผลพิจารณาแล้ว", "green"],
  CLOSED: ["ปิดแล้ว", "gray"],
};

export const DISPUTE_CATEGORY: Record<string, string> = {
  NO_PICKUP: "ผู้ซื้อไม่มารับสินค้า",
  CANCELLED_AFTER_CONFIRMATION: "ยกเลิกหลังยืนยันสัญญา",
  PRICE_CHANGED: "เปลี่ยนราคาจากที่ตกลง",
  SHORT_DELIVERY: "ส่งมอบน้อยกว่าที่ตกลง",
  GRADE_DISPUTE: "โต้แย้งผลการคัดเกรด",
  UNSUPPORTED_REJECTION: "ปฏิเสธสินค้าโดยไม่มีหลักฐานเพียงพอ",
  LATE_PAYMENT: "ชำระเงินล่าช้า",
};

export const DISPUTE_OUTCOME: Record<string, string> = {
  BUYER_RESPONSIBLE: "ผู้ซื้อเป็นฝ่ายรับผิดชอบ",
  FARMER_RESPONSIBLE: "เกษตรกรเป็นฝ่ายรับผิดชอบ",
  SHARED: "รับผิดชอบร่วมกัน",
  NO_FAULT: "ไม่มีฝ่ายใดผิด",
};

export const INVENTORY_STATUS: Record<string, [string, Tone]> = {
  AVAILABLE: ["เปิดรับข้อเสนอ", "green"],
  PARTIALLY_RESERVED: ["จองบางส่วน", "amber"],
  FULLY_RESERVED: ["จองเต็มแล้ว", "blue"],
  CONTRACTED: ["ทำสัญญาครบ", "blue"],
  CLOSED: ["ปิดแล้ว", "gray"],
};

export const OFFER_STATUS: Record<string, [string, Tone]> = {
  PENDING: ["รอพิจารณา", "amber"],
  ALLOCATED: ["ได้รับการจัดสรร", "green"],
  REJECTED: ["ถูกปฏิเสธ", "red"],
  WITHDRAWN: ["ถอนแล้ว", "gray"],
  DECLINED: ["ผู้ซื้อปฏิเสธสัญญา", "red"],
  EXPIRED: ["หมดอายุ", "gray"],
};

export const REQUEST_STATUS: Record<string, [string, Tone]> = {
  OPEN: ["เปิดรับ", "green"],
  CANCELLED: ["ยกเลิก", "gray"],
};

export const LOT_STATUS: Record<string, [string, Tone]> = {
  READY_FOR_PICKUP: ["พร้อมให้รับ", "amber"],
  IN_TRANSIT: ["กำลังขนส่ง", "blue"],
  INSPECTION_PENDING: ["รอตรวจคุณภาพ", "violet"],
  INSPECTED: ["ตรวจแล้ว", "green"],
};

export const SETTLEMENT_STATUS: Record<string, [string, Tone]> = {
  PAYMENT_PENDING: ["รอชำระ", "amber"],
  PARTIALLY_PAID: ["ชำระบางส่วน", "amber"],
  PAID: ["ชำระครบ", "green"],
  OVERDUE: ["เลยกำหนด", "red"],
};

export const TRUST_BAND: Record<string, [string, Tone]> = {
  LOW_RISK: ["ความเสี่ยงต่ำ", "green"],
  MEDIUM_RISK: ["ความเสี่ยงปานกลาง", "amber"],
  HIGH_RISK: ["ต้องระวัง", "red"],
};

export const FLAG_LABEL: Record<string, string> = {
  QUANTITY_SHORTFALL: "ปริมาณขาด",
  QUANTITY_OVERAGE: "ปริมาณเกิน",
  GRADE_NOT_IN_CONTRACT: "เกรดนอกสัญญา",
  UNAUTHORIZED_REJECTION: "ปฏิเสธนอกเงื่อนไข",
  QC_EVIDENCE_MISSING: "ขาดหลักฐาน QC",
  PRICE_DISCREPANCY: "ราคาไม่ตรงสัญญา",
};

export const REJECTION: Record<string, string> = {
  ROT: "เน่าเสีย",
  PEST_DAMAGE: "แมลงทำลาย",
  BRUISING: "ช้ำ / บอบช้ำ",
  UNDERSIZE: "ขนาดเล็กกว่าเกณฑ์",
  OTHER: "อื่น ๆ (ไม่อยู่ในเงื่อนไขสัญญา)",
};

export const SHORTFALL_POLICY: Record<string, string> = {
  PROPORTIONAL_REDUCTION: "ลดปริมาณตามสัดส่วนให้ผู้ซื้อทุกราย",
};

export const VERSION_STATUS: Record<string, [string, Tone]> = {
  PROPOSED: ["รอยอมรับ", "amber"],
  ACCEPTED: ["มีผล", "green"],
  REJECTED: ["ถูกปฏิเสธ", "red"],
  SUPERSEDED: ["ถูกแทนที่", "gray"],
};

export const SIGN_METHOD: Record<string, string> = {
  ALLOCATION_CONFIRMATION: "ยืนยันผ่านแผนจัดสรร",
  TYPED_NAME: "ลงชื่อ (พิมพ์ชื่อ) + ยินยอม",
  PROPOSER: "ผู้เสนอแก้ไข",
  AUTHENTICATED_CLICK: "ยืนยันผ่านบัญชีที่เข้าสู่ระบบ",
};
