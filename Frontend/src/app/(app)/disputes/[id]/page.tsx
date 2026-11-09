"use client";

import { Check, Clock, Gavel } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { ActivityList } from "@/components/activity";
import { EvidencePanel } from "@/components/evidence";
import { Badge, Button, Card, DL, ErrorState, Field, Input, PageHeader, PageSkeleton, Select, StatusBadge, Textarea, cx } from "@/components/ui";
import { post } from "@/lib/api";
import { fmtDateTime, fmtKg, fmtTHB } from "@/lib/format";
import { DISPUTE_OUTCOME, DISPUTE_STATUS, FLAG_LABEL, ORDER_STATUS, REJECTION } from "@/lib/labels";
import type { DisputeDetail } from "@/lib/types";
import { useAction } from "@/lib/useAction";

const FLOW = ["EVIDENCE_COLLECTION", "UNDER_REVIEW", "RESOLVED", "CLOSED"];

export default function DisputePage() {
  const { id } = useParams<{ id: string }>();
  const { data: d, error } = useSWR<DisputeDetail>(`/disputes/${id}`);
  if (error) return <ErrorState error={error} />;
  if (!d) return <PageSkeleton />;
  const stepIndex = d.status === "REINSPECTION_REQUESTED" ? 1 : FLOW.indexOf(d.status);
  const sides = (["FARMER", "BUYER"] as const).map((side) => ({
    side,
    org: side === "FARMER" ? d.contract.farmer : d.contract.buyer,
    items: d.statements.filter((s) => s.side === side),
  }));

  return (
    <>
      <PageHeader
        eyebrow={<Link href="/disputes" className="hover:text-green-800">← ข้อพิพาททั้งหมด</Link>}
        title={<span className="flex flex-wrap items-center gap-3">{d.code}<StatusBadge map={DISPUTE_STATUS} value={d.status} /></span>}
        subtitle={`${d.category_label} · สัญญา ${d.contract_code} · เปิดโดย ${d.opened_by_org.name}`}
      />

      <ol className="mb-6 grid gap-2 sm:grid-cols-4">
        {["รวบรวมหลักฐาน", d.status === "REINSPECTION_REQUESTED" ? "รอตรวจซ้ำ" : "พิจารณา", "มีผลพิจารณา", "ปิด"].map((label, i) => (
          <li
            key={label}
            className={cx(
              "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
              i < stepIndex ? "border-green-200 bg-green-50 text-green-800" : i === stepIndex ? "border-amber-300 bg-amber-50 text-amber-900" : "border-slate-200 text-slate-500",
            )}
          >
            {i < stepIndex ? <Check className="size-4" /> : i === stepIndex ? <Clock className="size-4" /> : <span className="tabular">{i + 1}</span>}
            {label}
          </li>
        ))}
      </ol>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="รายละเอียด" className="lg:col-span-2">
          <p className="whitespace-pre-line text-sm text-slate-800">{d.description}</p>
          <div className="mt-4">
            <DL
              cols={3}
              items={[
                ["ยอดที่โต้แย้ง", fmtTHB(d.disputed_amount)],
                ["ยอดที่กันไว้", fmtTHB(d.held_amount)],
                ["กำหนดชี้แจง", fmtDateTime(d.response_deadline)],
                ["สถานะคำสั่งซื้อก่อนระงับ", ORDER_STATUS[d.previous_order_status]?.[0] ?? d.previous_order_status],
                ["ยอดชำระสุทธิปัจจุบัน", d.settlement ? fmtTHB(d.settlement.net_amount) : "—"],
                ["ผู้ตรวจทาน", d.reviewer?.name ?? "ยังไม่มอบหมาย"],
              ]}
            />
          </div>
        </Card>
        <Card title="ผลพิจารณา">
          {d.outcome ? (
            <div className="space-y-2 text-sm">
              <Badge tone={d.outcome === "NO_FAULT" ? "gray" : "amber"}>{DISPUTE_OUTCOME[d.outcome]}</Badge>
              <p className="text-slate-800">{d.resolution}</p>
              <p className="text-slate-600">ปรับยอดชำระ <b className="tabular">{fmtTHB(d.settlement_adjustment)}</b></p>
              <p className="text-xs text-slate-500">AgriTrust ได้รับผลเฉพาะเมื่อผู้ซื้อเป็นฝ่ายรับผิดชอบ (บันทึกตอนปิดธุรกรรม)</p>
            </div>
          ) : (
            <p className="text-sm text-slate-500">ยังไม่มีผลพิจารณา — ระหว่างนี้ไม่มีการหักคะแนน AgriTrust ของฝ่ายใด</p>
          )}
          {d.reviewer_notes && <p className="mt-3 border-t border-slate-100 pt-3 text-sm text-slate-600">บันทึกผู้ตรวจทาน: {d.reviewer_notes}</p>}
        </Card>
      </div>

      <DisputeActions d={d} />

      <Card title="หลักฐานประกอบข้อพิพาท" className="mt-6">
        <EvidencePanel files={d.files} entityType="dispute" entityId={d.id} canUpload={!["RESOLVED", "CLOSED"].includes(d.status)} label="ไฟล์ที่แนบ" />
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {sides.map((s) => (
          <Card key={s.side} title={<span className="inline-flex items-center gap-2"><span className={cx("size-2 rounded-full", s.side === "FARMER" ? "bg-green-600" : "bg-sky-600")} />คำชี้แจง: {s.org.name}</span>}>
            {s.items.length ? (
              <ul className="space-y-4 text-sm">
                {s.items.map((st) => (
                  <li key={st.id}>
                    <p className="whitespace-pre-line text-slate-800">{st.body}</p>
                    {st.evidence_note && <p className="mt-1 text-xs text-slate-600">หลักฐาน: {st.evidence_note}</p>}
                    <p className="mt-1 text-xs text-slate-500">{st.user_name} · {fmtDateTime(st.created_at)}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">ยังไม่ได้ชี้แจง</p>
            )}
          </Card>
        ))}
      </div>

      {d.inspections.length > 0 && (
        <Card title="ผลตรวจคุณภาพที่เกี่ยวข้อง" className="mt-6">
          <ul className="grid gap-4 text-sm md:grid-cols-2">
            {d.inspections.map((i, idx) => (
              <li key={i.id} className="rounded-lg border border-slate-200 p-3">
                <div className="font-medium">{idx === 0 ? "ตรวจครั้งแรก" : `ตรวจซ้ำครั้งที่ ${idx}`} · {i.inspector.name}</div>
                <div className="mt-1 text-slate-600">
                  {i.grades.map((g) => `${g.grade} ${fmtKg(g.quantity_kg)}`).join(" · ")} · ปฏิเสธ {fmtKg(i.rejected_kg)}
                  {i.rejection_reason && ` (${REJECTION[i.rejection_reason]})`}
                </div>
                {i.flags.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{i.flags.map((f) => <Badge key={f.code} tone="amber">{FLAG_LABEL[f.code] ?? f.code}</Badge>)}</div>}
                <div className="mt-1 text-xs text-slate-500">{fmtDateTime(i.inspected_at)}</div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="ไทม์ไลน์ข้อพิพาท" className="mt-6"><ActivityList events={[...d.timeline].reverse()} /></Card>
    </>
  );
}

function DisputeActions({ d }: { d: DisputeDetail }) {
  const { run, pending } = useAction();
  const [outcome, setOutcome] = useState("BUYER_RESPONSIBLE");
  const a = d.actions;
  if (!a.length) return null;
  const go = (path: string, body: unknown, msg: string) => run(() => post(`/disputes/${d.id}${path}`, body), msg);

  return (
    <Card title={<span className="inline-flex items-center gap-2"><Gavel className="size-4 text-green-800" />สิ่งที่คุณทำได้</span>} className="mt-6">
      <div className="space-y-6">
        {a.includes("ADD_STATEMENT") && (
          <form
            className="grid gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const f = new FormData(form);
              const ok = await go("/statements", { body: f.get("body"), evidence_note: f.get("evidence_note") || null }, "ส่งคำชี้แจงแล้ว");
              if (ok) form.reset();
            }}
          >
            <Field label="คำชี้แจงของคุณ"><Textarea name="body" required minLength={5} rows={4} /></Field>
            <Field label="หลักฐาน"><Input name="evidence_note" placeholder="เช่น ใบชั่ง, ภาพถ่าย, ข้อความตกลง" /></Field>
            <div><Button type="submit" loading={pending}>ส่งคำชี้แจง</Button></div>
          </form>
        )}
        {a.includes("START_REVIEW") && (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Button loading={pending} onClick={() => go("/review", { action: "START_REVIEW" }, "เริ่มพิจารณาแล้ว")}>เริ่มพิจารณา</Button>
            <span className="text-slate-500">ไม่ต้องรอคำชี้แจงครบ หากเลยกำหนดเวลาแล้ว</span>
          </div>
        )}
        {a.includes("REQUEST_REINSPECTION") && (
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              go("/review", { action: "REQUEST_REINSPECTION", notes: new FormData(e.currentTarget).get("notes") || null }, "ส่งคำขอตรวจซ้ำแล้ว");
            }}
          >
            <Field label="ขอให้ตรวจคุณภาพซ้ำ" className="min-w-[260px] flex-1"><Input name="notes" placeholder="ระบุสิ่งที่ต้องการให้ตรวจ" /></Field>
            <Button type="submit" variant="secondary" loading={pending}>ขอตรวจซ้ำ</Button>
          </form>
        )}
        {a.includes("RESOLVE") && (
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              go("/review", {
                action: "RESOLVE",
                outcome,
                resolution: f.get("resolution"),
                notes: f.get("notes") || null,
                settlement_adjustment: f.get("settlement_adjustment") ? Number(f.get("settlement_adjustment")) : null,
              }, "บันทึกผลพิจารณาแล้ว");
            }}
          >
            <Field label="ผลการพิจารณา">
              <Select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
                {Object.entries(DISPUTE_OUTCOME).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
            <Field label="ปรับยอดชำระ (บาท, + เพิ่ม / − ลด)" hint={d.proposed_adjustment !== null ? `ผลตรวจซ้ำเสนอ ${fmtTHB(d.proposed_adjustment)}` : "เว้นว่างหากไม่ปรับ"}>
              <Input name="settlement_adjustment" type="number" step="0.01" defaultValue={d.proposed_adjustment ?? ""} disabled={!d.settlement} />
            </Field>
            <Field label="เหตุผล (ทั้งสองฝ่ายเห็น)" className="sm:col-span-2"><Textarea name="resolution" required /></Field>
            <Field label="บันทึกภายใน" className="sm:col-span-2"><Input name="notes" /></Field>
            <div className="sm:col-span-2"><Button type="submit" loading={pending}>บันทึกผลพิจารณาและปลดระงับคำสั่งซื้อ</Button></div>
          </form>
        )}
        {a.includes("RECORD_REINSPECTION") && <ReinspectionForm d={d} go={go} pending={pending} />}
      </div>
    </Card>
  );
}

function ReinspectionForm({ d, go, pending }: { d: DisputeDetail; go: (p: string, b: unknown, m: string) => unknown; pending: boolean }) {
  const first = d.inspections[0];
  const received = first?.received_kg ?? 0;
  const grades = first ? first.grades.map((g) => g.grade) : ["A", "B"];
  const [qty, setQty] = useState<Record<string, string>>(Object.fromEntries(grades.map((g) => [g, ""])));
  const [rejected, setRejected] = useState("0");
  const [reason, setReason] = useState("");
  const total = grades.reduce((s, g) => s + Number(qty[g] || 0), 0) + Number(rejected || 0);
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        go("/reinspection", {
          grades: grades.map((g) => ({ grade: g, quantity_kg: Number(qty[g] || 0) })),
          rejected_kg: Number(rejected || 0),
          rejection_reason: Number(rejected) > 0 ? reason : null,
          sampling_method: f.get("sampling_method"),
          evidence_note: f.get("evidence_note") || null,
          notes: f.get("notes") || null,
        }, "บันทึกผลตรวจซ้ำแล้ว");
      }}
    >
      <div className="text-sm text-slate-600">ตรวจซ้ำล็อตที่รับมา {fmtKg(received)}</div>
      <div className="grid gap-3 sm:grid-cols-4">
        {grades.map((g) => (
          <Field key={g} label={`เกรด ${g} (กก.)`}><Input type="number" min="0" value={qty[g]} onChange={(e) => setQty((q) => ({ ...q, [g]: e.target.value }))} /></Field>
        ))}
        <Field label="ปฏิเสธ (กก.)"><Input type="number" min="0" value={rejected} onChange={(e) => setRejected(e.target.value)} /></Field>
      </div>
      {Number(rejected) > 0 && (
        <Field label="เหตุผลการปฏิเสธ">
          <Select value={reason} onChange={(e) => setReason(e.target.value)} required>
            <option value="">เลือกเหตุผล</option>
            {Object.entries(REJECTION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="วิธีตรวจ"><Input name="sampling_method" defaultValue="ตรวจทั้งล็อต" required /></Field>
        <Field label="หลักฐาน"><Input name="evidence_note" placeholder="เช่น ภาพตรวจซ้ำ 20 ภาพ" /></Field>
      </div>
      <Field label="บันทึก"><Textarea name="notes" /></Field>
      {Math.abs(total - received) > 1 && <p className="text-sm text-red-600">ผลรวม {fmtKg(total)} ต้องเท่ากับ {fmtKg(received)}</p>}
      <Button type="submit" loading={pending} disabled={Math.abs(total - received) > 1}>บันทึกผลตรวจซ้ำ</Button>
    </form>
  );
}
