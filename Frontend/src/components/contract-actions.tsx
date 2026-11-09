"use client";

import { Clock } from "lucide-react";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { post } from "@/lib/api";
import { fmtDateTime, fmtKg, fmtTHB } from "@/lib/format";
import { REJECTION } from "@/lib/labels";
import type { ContractDetail, Lot } from "@/lib/types";
import { useAction } from "@/lib/useAction";
import { AiPhotoAssist } from "./ai-photo-assist";
import { Button, Field, Input, Modal, Select, Textarea } from "./ui";

const WAITING: Record<string, string> = {
  AWAITING_CONFIRMATION: "รอผู้ซื้อยืนยัน HarvestLock",
  CONFIRMED: "รอเกษตรกรบันทึกการเก็บเกี่ยวและสร้างล็อต",
  HARVESTED: "รอเกษตรกรส่งล็อตพร้อมน้ำหนักชั่ง",
  IN_TRANSIT: "รอผู้ซื้อยืนยันรับสินค้าและน้ำหนักที่ชั่งได้",
  QC_PENDING: "รอผู้ตรวจคุณภาพ (หรือผู้ซื้อ) บันทึกผล GradeProof",
  PAYMENT_PENDING: "รอผู้ซื้อชำระเงินตามยอดสุทธิ",
  PAYMENT_OVERDUE: "เลยกำหนดชำระ — รอผู้ซื้อชำระเงิน",
  PAID: "รอเกษตรกรยืนยันว่าได้รับเงินครบ",
  COMPLETED: "ธุรกรรมเสร็จสิ้นและบันทึก AgriTrust แล้ว",
  CANCELLED: "ยกเลิกแล้ว ผลผลิตที่จองถูกคืนให้สวน",
  RESERVATION_EXPIRED: "การจองหมดอายุ ผลผลิตถูกคืนให้สวน",
  DISPUTED: "ระงับชั่วคราวระหว่างพิจารณาข้อพิพาท — ผลพิจารณาจะพาคำสั่งซื้อกลับสู่ขั้นตอนเดิม",
};

const SIDE_ACTIONS = ["OPEN_DISPUTE", "PROPOSE_AMENDMENT", "RESPOND_AMENDMENT"];

export function NextAction({ c }: { c: ContractDetail }) {
  const { run, pending } = useAction();
  const [declining, setDeclining] = useState(false);
  const a = c.actions.filter((x) => !SIDE_ACTIONS.includes(x));

  if (!a.length) {
    return (
      <div className="flex items-start gap-2 text-sm text-slate-600">
        <Clock className="mt-0.5 size-4 shrink-0 text-slate-400" />
        {WAITING[c.order_status] ?? "ไม่มีงานที่ต้องทำ"}
      </div>
    );
  }

  const go = (path: string, body: unknown, msg: string, headers?: Record<string, string>) => run(() => post(path, body, headers), msg);

  return (
    <div className="space-y-6">
      {a.includes("ACCEPT_HARVESTLOCK") && (
        <AcceptForm
          c={c}
          pending={pending}
          onAccept={(name) => go(`/contracts/${c.id}/accept`, { signature_name: name, consent: true }, "ลงนามและยืนยัน HarvestLock แล้ว")}
          onDecline={() => setDeclining(true)}
        />
      )}
      {a.includes("RECORD_HARVEST") && <HarvestForm c={c} pending={pending} submit={(b) => go(`/contracts/${c.id}/lots`, b, "บันทึกการเก็บเกี่ยวและสร้างล็อตแล้ว")} />}
      {a.includes("DISPATCH_LOT") && (
        <LotPicker lots={c.lots.filter((l) => l.status === "READY_FOR_PICKUP")} label="ส่งล็อต">
          {(lot) => <DispatchForm key={lot.id} lot={lot} pending={pending} submit={(b) => go(`/lots/${lot.id}/dispatch`, b, `บันทึกการส่งล็อต ${lot.code} แล้ว`)} />}
        </LotPicker>
      )}
      {a.includes("RECEIVE_LOT") && (
        <LotPicker lots={c.lots.filter((l) => l.status === "IN_TRANSIT")} label="รับล็อต">
          {(lot) => <ReceiveForm key={lot.id} lot={lot} pending={pending} submit={(b) => go(`/lots/${lot.id}/receive`, b, `ยืนยันรับล็อต ${lot.code} แล้ว`)} />}
        </LotPicker>
      )}
      {a.includes("RECORD_QC") && (
        <LotPicker lots={c.lots.filter((l) => l.status === "INSPECTION_PENDING")} label="ตรวจล็อต">
          {(lot) => <QcForm key={lot.id} c={c} lot={lot} pending={pending} submit={(b) => go(`/lots/${lot.id}/inspections`, b, `บันทึก GradeProof ล็อต ${lot.code} แล้ว`)} />}
        </LotPicker>
      )}
      {a.includes("RECORD_PAYMENT") && c.settlement && (
        <PaymentForm c={c} pending={pending} submit={(b, key) => go(`/settlements/${c.settlement!.id}/payments`, b, "บันทึกการชำระเงินแล้ว (จำลอง)", { "Idempotency-Key": key })} />
      )}
      {a.includes("CONFIRM_PAYMENT_RECEIVED") && (
        <div className="space-y-3 text-sm">
          <p className="text-slate-600">ผู้ซื้อบันทึกการชำระ {fmtTHB(c.settlement?.paid_amount)} แล้ว ตรวจสอบบัญชีของคุณก่อนยืนยัน การยืนยันจะปิดธุรกรรมและบันทึกเหตุการณ์ AgriTrust ของผู้ซื้อ</p>
          <Button loading={pending} onClick={() => go(`/contracts/${c.id}/complete`, {}, "ปิดธุรกรรมแล้ว — อัปเดต AgriTrust")}>ยืนยันได้รับเงินครบ</Button>
        </div>
      )}
      <Modal open={declining} onClose={() => setDeclining(false)} title="ปฏิเสธ HarvestLock">
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const reason = new FormData(e.currentTarget).get("reason");
            const ok = await go(`/contracts/${c.id}/decline`, { reason: reason || null }, "ปฏิเสธ HarvestLock แล้ว ผลผลิตถูกคืนให้สวน");
            if (ok) setDeclining(false);
          }}
        >
          <p className="text-sm text-slate-600">การจองจะถูกยกเลิกและผลผลิตกลับไปให้เกษตรกรจัดสรรใหม่ได้</p>
          <Field label="เหตุผล"><Textarea name="reason" /></Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setDeclining(false)}>กลับ</Button>
            <Button type="submit" variant="danger" loading={pending}>ยืนยันปฏิเสธ</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

/** Choose which lot an action applies to when a contract ships in several lots. */
function LotPicker({ lots, label, children }: { lots: Lot[]; label: string; children: (lot: Lot) => React.ReactNode }) {
  const [id, setId] = useState(lots[0]?.id);
  const lot = lots.find((l) => l.id === id) ?? lots[0];
  if (!lot) return null;
  return (
    <div className="space-y-3">
      {lots.length > 1 && (
        <Field label={label} className="max-w-xs">
          <Select value={lot.id} onChange={(e) => setId(e.target.value)}>
            {lots.map((l) => <option key={l.id} value={l.id}>{l.code} · {fmtKg(l.net_kg ?? l.harvested_kg)}</option>)}
          </Select>
        </Field>
      )}
      {children(lot)}
    </div>
  );
}

function AcceptForm({ c, pending, onAccept, onDecline }: { c: ContractDetail; pending: boolean; onAccept: (name: string) => void; onDecline: () => void }) {
  const [agree, setAgree] = useState(false);
  const [name, setName] = useState("");
  return (
    <div className="space-y-3 text-sm">
      <p className="text-slate-600">
        เกษตรกรยอมรับฉบับที่ {c.current_version} แล้ว ตรวจเงื่อนไขด้านล่างก่อนยืนยัน การจองหมดอายุ {fmtDateTime(c.reservation_expires_at)}
      </p>
      <label className="flex items-start gap-2">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1 accent-green-800" />
        <span>ข้าพเจ้าได้อ่านและยอมรับเงื่อนไข HarvestLock ฉบับที่ {c.current_version} <span className="font-mono text-xs text-slate-500">({c.terms_hash.slice(0, 12)}…)</span></span>
      </label>
      <Field label="ลงชื่อ (พิมพ์ชื่อ-นามสกุลของผู้มีอำนาจลงนาม)" className="max-w-sm">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ชื่อ นามสกุล" />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button disabled={!agree || name.trim().length < 2} loading={pending} onClick={() => onAccept(name.trim())}>ลงนามและยืนยัน HarvestLock</Button>
        <Button variant="danger" onClick={onDecline}>ปฏิเสธ</Button>
      </div>
      <p className="text-xs text-slate-500">ลายเซ็นอิเล็กทรอนิกส์แบบจำลอง: บันทึกชื่อที่พิมพ์ บัญชีผู้ใช้ เวลา และ hash ของเงื่อนไข — ยังไม่ใช่บริการ e-signature ที่รับรองตามกฎหมาย</p>
    </div>
  );
}

function HarvestForm({ c, pending, submit }: { c: ContractDetail; pending: boolean; submit: (b: unknown) => void }) {
  const harvested = c.lots.reduce((s, l) => s + Number(l.harvested_kg), 0);
  const remaining = Math.max(0, Number(c.quantity_kg) - harvested);
  return (
    <form
      className="grid gap-3 sm:grid-cols-3 sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        submit({ harvest_date: f.get("harvest_date"), harvested_kg: Number(f.get("harvested_kg")) });
      }}
    >
      <Field label="วันที่เก็บเกี่ยว"><Input name="harvest_date" type="date" defaultValue={c.terms.harvest_window[0]} required /></Field>
      <Field
        label={c.lots.length ? `ปริมาณล็อตถัดไป (กก.)` : "ปริมาณที่เก็บได้ (กก.)"}
        hint={c.lots.length ? `เก็บแล้ว ${fmtKg(harvested)} จาก ${fmtKg(c.quantity_kg)} · แบ่งส่งได้หลายล็อต` : `ตามสัญญา ${fmtKg(c.quantity_kg)} ±${c.terms.tolerance_pct}% · แบ่งเป็นหลายล็อตได้`}
      >
        <Input name="harvested_kg" type="number" min="1" step="1" defaultValue={remaining} required />
      </Field>
      <Button type="submit" loading={pending}>{c.lots.length ? "เพิ่มล็อต" : "บันทึกและสร้างล็อต"}</Button>
    </form>
  );
}

function DispatchForm({ lot, pending, submit }: { lot: Lot; pending: boolean; submit: (b: unknown) => void }) {
  const [gross, setGross] = useState(String(Math.round(lot.harvested_kg * 1.075)));
  const [tare, setTare] = useState(String(Math.round(lot.harvested_kg * 0.075)));
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        submit({ vehicle: f.get("vehicle"), transport_operator: f.get("transport_operator") || null, gross_kg: Number(gross), tare_kg: Number(tare) });
      }}
    >
      <Field label="ทะเบียนรถ"><Input name="vehicle" placeholder="เช่น 3ฒก-1234 จันทบุรี" required /></Field>
      <Field label="ผู้ขนส่ง"><Input name="transport_operator" placeholder="ไม่บังคับ" /></Field>
      <Field label="น้ำหนักรวม (กก.)"><Input type="number" value={gross} onChange={(e) => setGross(e.target.value)} min="1" required /></Field>
      <Field label="น้ำหนักภาชนะ (กก.)" hint={`สุทธิ ${fmtKg(Number(gross) - Number(tare))}`}><Input type="number" value={tare} onChange={(e) => setTare(e.target.value)} min="0" required /></Field>
      <div className="sm:col-span-2"><Button type="submit" loading={pending}>ยืนยันส่งล็อต {lot.code}</Button></div>
    </form>
  );
}

function ReceiveForm({ lot, pending, submit }: { lot: Lot; pending: boolean; submit: (b: unknown) => void }) {
  return (
    <form
      className="grid gap-3 sm:grid-cols-2 sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        submit({ received_kg: Number(new FormData(e.currentTarget).get("received_kg")) });
      }}
    >
      <Field label={`น้ำหนักที่ชั่งได้ ณ จุดรับ — ${lot.code} (กก.)`} hint={`ต้นทางแจ้งสุทธิ ${fmtKg(lot.net_kg)}`}>
        <Input name="received_kg" type="number" min="1" defaultValue={lot.net_kg ?? lot.harvested_kg} required />
      </Field>
      <Button type="submit" loading={pending}>ยืนยันรับสินค้า</Button>
    </form>
  );
}

type Reasons = { rejection_reasons: { key: string; label: string }[]; products: { key: string; grade_criteria: { grade: string; criteria: string }[] }[] };

function QcForm({ c, lot, pending, submit }: { c: ContractDetail; lot: Lot; pending: boolean; submit: (b: unknown) => void }) {
  const received = Number(lot.received_kg ?? 0);
  const grades = Object.keys(c.terms.grade_prices).sort();
  const { data: catalog } = useSWR<Reasons>("/catalog");
  const [qty, setQty] = useState<Record<string, string>>(Object.fromEntries(grades.map((g, i) => [g, i === 0 ? String(received) : "0"])));
  const [rejected, setRejected] = useState("0");
  const [reason, setReason] = useState("");
  const [evidence, setEvidence] = useState("");
  const [aiRunId, setAiRunId] = useState<string | null>(null);
  const criteria = catalog?.products.find((p) => p.key === c.product_type)?.grade_criteria ?? [];
  const lotFiles = c.files.filter((f) => f.entity_type === "lot" && f.entity_id === lot.id).length;
  const total = grades.reduce((s, g) => s + Number(qty[g] || 0), 0) + Number(rejected || 0);
  const mismatch = Math.abs(total - received) > 1;
  const preview = useMemo(() => {
    const gross = grades.reduce((s, g) => s + Number(qty[g] || 0) * c.terms.grade_prices[g], 0);
    return { gross };
  }, [qty, grades, c.terms]);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        submit({
          grades: grades.map((g) => ({ grade: g, quantity_kg: Number(qty[g] || 0) })),
          rejected_kg: Number(rejected || 0),
          rejection_reason: Number(rejected) > 0 ? reason : null,
          sampling_method: f.get("sampling_method"),
          evidence_note: evidence || null,
          notes: f.get("notes") || null,
          ai_run_id: aiRunId,
        });
      }}
    >
      <div className="text-sm text-slate-600">ล็อต {lot.code} · รับมา <b className="tabular">{fmtKg(received)}</b> · ราคาตามสัญญา {grades.map((g) => `${g} ${fmtTHB(c.terms.grade_prices[g])}`).join(" · ")}</div>
      <AiPhotoAssist
        lotId={lot.id}
        photos={c.files.filter((f) => f.entity_type === "lot" && f.entity_id === lot.id && f.content_type.startsWith("image/")).length}
        onApply={(s) => {
          if (!s.suggested_kg.grades) return;
          setQty(Object.fromEntries(grades.map((g) => [g, String(s.suggested_kg.grades![g] ?? 0)])));
          setRejected(String(s.suggested_kg.rejected_kg ?? 0));
          const top = s.defects.find((d) => c.terms.rejection_conditions.includes(d.type));
          if ((s.suggested_kg.rejected_kg ?? 0) > 0 && top) setReason(top.type);
          setAiRunId(s.run_id);
        }}
      />
      {criteria.length > 0 && (
        <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
          <div className="mb-1 font-medium text-slate-700">เกณฑ์คัดเกรดของผลผลิตนี้ (มาตรฐานแพลตฟอร์ม)</div>
          <ul className="space-y-0.5">{criteria.map((g) => <li key={g.grade}><b>{g.grade}</b>: {g.criteria}</li>)}</ul>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-4">
        {grades.map((g) => (
          <Field key={g} label={`เกรด ${g} (กก.)`}><Input type="number" min="0" value={qty[g]} onChange={(e) => setQty((q) => ({ ...q, [g]: e.target.value }))} /></Field>
        ))}
        <Field label="ปฏิเสธ (กก.)"><Input type="number" min="0" value={rejected} onChange={(e) => setRejected(e.target.value)} /></Field>
      </div>
      {mismatch && <p className="text-sm text-red-600">ผลรวม {fmtKg(total)} ต้องเท่ากับน้ำหนักที่รับ {fmtKg(received)}</p>}
      {Number(rejected) > 0 && (
        <Field label="เหตุผลการปฏิเสธ" hint="เหตุผลนอกเงื่อนไขสัญญาจะถูกส่งให้ตรวจทาน">
          <Select value={reason} onChange={(e) => setReason(e.target.value)} required>
            <option value="">เลือกเหตุผล</option>
            {(catalog?.rejection_reasons ?? Object.entries(REJECTION).map(([key, label]) => ({ key, label }))).map((r) => (
              <option key={r.key} value={r.key}>{r.label}{c.terms.rejection_conditions.includes(r.key) ? "" : " ⚠"}</option>
            ))}
          </Select>
        </Field>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="วิธีสุ่มตัวอย่าง"><Input name="sampling_method" defaultValue={c.terms.sampling_method} required /></Field>
        <Field label="หลักฐาน" hint={lotFiles ? `แนบภาพในล็อตนี้แล้ว ${lotFiles} ไฟล์` : "แนบภาพได้ที่การ์ดล็อตด้านล่าง หรือระบุรายการหลักฐาน"}>
          <Input value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="เช่น ใบชั่งเลขที่ 0457" />
        </Field>
      </div>
      <Field label="บันทึกเพิ่มเติม"><Textarea name="notes" /></Field>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 p-3 text-sm">
        <span>มูลค่าล็อตนี้ประมาณ <b className="tabular">{fmtTHB(preview.gross)}</b> {c.lots.length > 1 ? "· ยอดชำระคำนวณเมื่อตรวจครบทุกล็อต" : `· หักมัดจำ ${fmtTHB(c.terms.deposit_thb)}`}</span>
        <span className="flex items-center gap-2">
          {aiRunId && <span className="text-xs text-violet-700">เริ่มจากคำแนะนำ AI — ผลที่บันทึกคือการตัดสินของคุณ</span>}
          <Button type="submit" loading={pending} disabled={mismatch || (Number(rejected) > 0 && !reason)}>บันทึกผล GradeProof</Button>
        </span>
      </div>
    </form>
  );
}

function PaymentForm({ c, pending, submit }: { c: ContractDetail; pending: boolean; submit: (b: unknown, key: string) => void }) {
  const s = c.settlement!;
  const [key] = useState(() => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now())));
  return (
    <form
      className="grid gap-3 sm:grid-cols-3 sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        submit({ amount: Number(f.get("amount")), reference: f.get("reference") }, key);
      }}
    >
      <Field label="จำนวนเงิน (บาท)" hint={`ค้างชำระ ${fmtTHB(s.outstanding)}`}><Input name="amount" type="number" min="1" step="0.01" defaultValue={s.outstanding} required /></Field>
      <Field label="เลขอ้างอิงการโอน"><Input name="reference" placeholder="เช่น TRX-20261218-001" required /></Field>
      <Button type="submit" loading={pending}>บันทึกการชำระเงิน</Button>
      <p className="text-xs text-slate-500 sm:col-span-3">จำลองการชำระเงิน ไม่มีการโอนเงินจริงหรือ escrow · แนบสลิปได้ที่การ์ดการชำระเงิน · ป้องกันการบันทึกซ้ำด้วย Idempotency-Key</p>
    </form>
  );
}
