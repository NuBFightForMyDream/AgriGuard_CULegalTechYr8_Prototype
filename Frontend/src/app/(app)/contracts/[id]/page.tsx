"use client";

import { AlertTriangle, FileCheck2, Hash, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { NextAction } from "@/components/contract-actions";
import { TrustBadge } from "@/components/trust";
import { Badge, Card, DL, ErrorState, PageHeader, PageSkeleton, StatusBadge } from "@/components/ui";
import { ACTOR_LABEL, ACTOR_TONE_OF, STAGES, Stepper, Swimlane, currentStage, isStopped } from "@/components/workflow";
import { fmtDate, fmtDateTime, fmtKg, fmtRange, fmtTHB } from "@/lib/format";
import { FLAG_LABEL, LOT_STATUS, ORDER_STATUS, REJECTION, SETTLEMENT_STATUS, SHORTFALL_POLICY, productName } from "@/lib/labels";
import type { ContractDetail } from "@/lib/types";

export default function ContractWorkspace() {
  const { id } = useParams<{ id: string }>();
  const { data: c, error } = useSWR<ContractDetail>(`/contracts/${id}`);
  const [picked, setPicked] = useState<number | null>(null);
  if (error) return <ErrorState error={error} />;
  if (!c) return <PageSkeleton />;

  const cur = Math.min(currentStage(c.order_status), STAGES.length - 1);
  const selected = picked ?? cur;
  const stage = STAGES[selected];
  const stageEvents = c.timeline.filter(stage.match);
  const stageState = isStopped(c.order_status) && selected === currentStage(c.order_status) ? "หยุดที่ขั้นนี้" : selected < currentStage(c.order_status) ? "เสร็จแล้ว" : selected === currentStage(c.order_status) ? "ขั้นปัจจุบัน" : "ยังไม่ถึง";
  const t = c.terms;
  const lot = c.lots[0];
  const insp = c.inspection;
  const s = c.settlement;

  return (
    <>
      <PageHeader
        eyebrow={<Link href="/contracts" className="hover:text-green-800">← สัญญาทั้งหมด</Link>}
        title={<span className="flex flex-wrap items-center gap-3">{c.code}<StatusBadge map={ORDER_STATUS} value={c.order_status} /></span>}
        subtitle={`${productName(c.product_type, c.variety)} · ${fmtKg(c.quantity_kg)} · ${c.farmer.name} → ${c.buyer.name}`}
      />

      <Card title="เส้นทางธุรกรรม (End-to-End Ordering Workspace)" bodyClassName="p-4 sm:p-5">
        <Stepper c={c} selected={selected} onSelect={setPicked} />
        <div className="mt-4 grid gap-4 rounded-lg border border-slate-200 bg-slate-50/60 p-4 text-sm md:grid-cols-3">
          <div>
            <div className="text-xs text-slate-500">ขั้นตอน {selected + 1}: {stage.label}</div>
            <div className="mt-1 font-medium">{stageState}</div>
            <div className="mt-2"><Badge tone={ACTOR_TONE_OF[stage.actor]}>ผู้รับผิดชอบ: {ACTOR_LABEL[stage.actor]}</Badge></div>
          </div>
          <div>
            <div className="text-xs text-slate-500">เอกสาร/หลักฐานที่ต้องมี</div>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">{stage.docs.map((d) => <li key={d}>{d}</li>)}</ul>
          </div>
          <div>
            <div className="text-xs text-slate-500">สิ่งที่เกิดขึ้นในขั้นนี้</div>
            {stageEvents.length ? (
              <ul className="mt-1 space-y-1">{stageEvents.map((e) => <li key={e.id}>{e.message} <span className="text-xs text-slate-500">· {fmtDateTime(e.created_at)}</span></li>)}</ul>
            ) : (
              <div className="mt-1 text-slate-500">{stage.key === "MATCHING" ? "จับคู่ด้วย heuristic-v1 จากคำขอซื้อ" : "ยังไม่มี"}</div>
            )}
          </div>
        </div>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title="งานถัดไป" className="lg:col-span-2"><NextAction c={c} /></Card>
        <Card title="ความเสี่ยงที่ควรรู้">
          {c.risks.length ? (
            <ul className="space-y-2 text-sm">
              {c.risks.map((r) => <li key={r} className="flex gap-2 text-amber-800"><AlertTriangle className="mt-0.5 size-4 shrink-0" />{r}</li>)}
            </ul>
          ) : (
            <div className="flex gap-2 text-sm text-green-800"><ShieldCheck className="size-4" />ไม่พบประเด็นเสี่ยง</div>
          )}
          <div className="mt-4 border-t border-slate-100 pt-3 text-sm">
            <div className="mb-1 text-slate-500">AgriTrust ผู้ซื้อ</div>
            <TrustBadge trust={c.buyer_trust} orgId={c.buyer.id} />
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title="เงื่อนไข HarvestLock" className="lg:col-span-2" action={<Badge tone="gray">ฉบับที่ {c.current_version}</Badge>}>
          <DL
            items={[
              ["คู่สัญญา", `${t.farmer} ↔ ${t.buyer}`],
              ["ผลผลิต", `${productName(t.product_type, t.variety)} (ประกาศ ${t.listing_code}, ข้อเสนอ ${t.offer_code})`],
              ["ปริมาณ", `${fmtKg(t.quantity_kg)} ±${t.tolerance_pct}%`],
              ["ราคาตามเกรด", Object.entries(t.grade_prices).map(([g, p]) => `${g}: ${fmtTHB(p)}/กก.`).join(" · ")],
              ["ช่วงเก็บเกี่ยว", fmtRange(t.harvest_window[0], t.harvest_window[1])],
              ["ช่วงส่งมอบ / ปลายทาง", `${fmtRange(t.delivery_window[0], t.delivery_window[1])} · ${t.destination_province}`],
              ["ชำระเงิน", `ภายใน ${t.payment_due_days} วันหลังตรวจรับ · มัดจำ ${fmtTHB(t.deposit_thb)}`],
              ["การสุ่มตรวจ", t.sampling_method],
              ["เหตุผลปฏิเสธที่ยอมรับ", t.rejection_conditions.map((r) => REJECTION[r] ?? r).join(", ")],
              ["กรณีผลผลิตขาด", SHORTFALL_POLICY[t.shortfall_policy] ?? t.shortfall_policy],
              ["การยกเลิก", t.cancellation],
              ["ข้อพิพาท", t.dispute_procedure],
            ]}
          />
        </Card>
        <Card title="การยอมรับและความถูกต้องของเอกสาร">
          <div className="flex items-start gap-2 text-xs">
            <Hash className="mt-0.5 size-3.5 shrink-0 text-slate-400" />
            <span className="break-all font-mono text-slate-600">{c.terms_hash}</span>
          </div>
          <ul className="mt-4 space-y-3 text-sm">
            {c.acceptances.map((a) => (
              <li key={a.organization_id + a.version} className="flex gap-2">
                <FileCheck2 className="mt-0.5 size-4 shrink-0 text-green-700" />
                <div>
                  <div>{a.user_name} ยอมรับฉบับที่ {a.version}</div>
                  <div className="text-xs text-slate-500">{fmtDateTime(a.accepted_at)} · {a.terms_hash === c.terms_hash ? "hash ตรงกับฉบับปัจจุบัน" : "hash ไม่ตรง"}</div>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-slate-500">SHA-256 ของเงื่อนไขช่วยตรวจว่าเอกสารไม่ถูกแก้ไข แต่ hash อย่างเดียวไม่ได้ยืนยันผลทางกฎหมาย ฉบับที่ยอมรับแล้วไม่ถูกเขียนทับ</p>
        </Card>
      </div>

      {(lot || insp || s) && (
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          {lot && (
            <Card title={`ล็อต ${lot.code}`} action={<StatusBadge map={LOT_STATUS} value={lot.status} />}>
              <DL cols={1} items={[
                ["เก็บเกี่ยว", `${fmtDate(lot.harvest_date)} · ${fmtKg(lot.harvested_kg)}`],
                ["ขนส่ง", lot.vehicle ? `${lot.vehicle}${lot.transport_operator ? ` · ${lot.transport_operator}` : ""}` : "—"],
                ["น้ำหนัก รวม / ภาชนะ / สุทธิ", lot.gross_kg ? `${fmtKg(lot.gross_kg)} / ${fmtKg(lot.tare_kg)} / ${fmtKg(lot.net_kg)}` : "—"],
                ["รับที่ปลายทาง", lot.received_kg ? `${fmtKg(lot.received_kg)} · ${fmtDateTime(lot.received_at)}` : "—"],
              ]} />
              <p className="mt-3 text-xs text-slate-500">QR code สำหรับติดตามล็อตอยู่ใน Phase 2</p>
            </Card>
          )}
          {insp && (
            <Card title="ผล GradeProof">
              <ul className="divide-y divide-slate-100 text-sm">
                {insp.grades.map((g) => (
                  <li key={g.grade} className="flex justify-between py-1.5"><span>เกรด {g.grade}</span><span className="tabular">{fmtKg(g.quantity_kg)}</span></li>
                ))}
                <li className="flex justify-between gap-2 py-1.5">
                  <span>ปฏิเสธ{insp.rejection_reason ? ` (${REJECTION[insp.rejection_reason]})` : ""}</span>
                  <span className="tabular">{fmtKg(insp.rejected_kg)}</span>
                </li>
              </ul>
              <div className="mt-3 text-xs text-slate-500">{insp.inspector.name} · {fmtDateTime(insp.inspected_at)} · {insp.sampling_method}</div>
              <div className="mt-1 text-xs text-slate-500">หลักฐาน: {insp.evidence_note ?? "—"}</div>
              {insp.flags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">{insp.flags.map((f) => <Badge key={f.code} tone="amber">{FLAG_LABEL[f.code] ?? f.code}</Badge>)}</div>
              )}
            </Card>
          )}
          {s && (
            <Card title="การคำนวณยอดชำระ" action={<StatusBadge map={SETTLEMENT_STATUS} value={s.status} />}>
              <ul className="space-y-1 text-sm">
                {s.lines.map((l) => (
                  <li key={l.grade} className="flex justify-between gap-2">
                    <span>{l.grade === "REJECTED" ? "ปฏิเสธ" : `เกรด ${l.grade}`}: {fmtKg(l.quantity_kg)} × {fmtTHB(l.price)}</span>
                    <span className="tabular">{fmtTHB(l.amount)}</span>
                  </li>
                ))}
                <li className="flex justify-between border-t border-slate-100 pt-1"><span>รวม</span><span className="tabular">{fmtTHB(s.gross_amount)}</span></li>
                <li className="flex justify-between"><span>หักมัดจำ</span><span className="tabular">−{fmtTHB(s.deposit_amount)}</span></li>
                <li className="flex justify-between font-semibold"><span>ยอดสุทธิ</span><span className="tabular">{fmtTHB(s.net_amount)}</span></li>
                <li className="flex justify-between text-slate-600"><span>ชำระแล้ว</span><span className="tabular">{fmtTHB(s.paid_amount)}</span></li>
              </ul>
              <div className="mt-3 text-xs text-slate-500">ครบกำหนด {fmtDate(s.due_date)}</div>
            </Card>
          )}
        </div>
      )}

      <Card title="ไทม์ไลน์ (แยกตามผู้ดำเนินการ)" className="mt-6">
        <Swimlane events={c.timeline} fmt={fmtDateTime} />
      </Card>
    </>
  );
}
