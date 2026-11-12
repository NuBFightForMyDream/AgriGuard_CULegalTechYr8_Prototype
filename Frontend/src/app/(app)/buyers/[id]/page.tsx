"use client";

import { CheckCircle2, Info, ShieldQuestion, XCircle } from "lucide-react";
import { useParams } from "next/navigation";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useState } from "react";
import useSWR from "swr";
import { Badge, Button, Card, DL, Empty, ErrorState, Field, Input, Meter, Modal, PageHeader, PageSkeleton, StatusBadge, Table, Td, Textarea } from "@/components/ui";
import { post } from "@/lib/api";
import { useAction } from "@/lib/useAction";
import { fmtDate } from "@/lib/format";
import { BUSINESS_TYPE, TRUST_BAND } from "@/lib/labels";
import { useSession } from "@/lib/session";
import type { Appeal, TrustProfile } from "@/lib/types";

const DIM_LABEL: Record<string, string> = {
  PAYMENT: "การชำระเงิน",
  PICKUP: "การรับสินค้า",
  CONTRACT: "การปฏิบัติตามสัญญา",
  QC: "ความโปร่งใส QC",
  DISPUTE: "ข้อพิพาท",
};

const MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

export default function BuyerTrustPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useSession();
  const { data, error } = useSWR<TrustProfile>(`/organizations/${id}/trust`);
  const isOwn = user?.organization.id === id && user?.role === "BUYER";
  const { data: appeals } = useSWR<Appeal[]>(isOwn ? "/trust/appeals" : null);
  const [appealFor, setAppealFor] = useState<TrustProfile["recent_events"][number] | null>(null);
  const { run, pending } = useAction();
  if (error) return <ErrorState error={error} />;
  if (!data) return <PageSkeleton />;
  const { organization: org, profile: p } = data;
  const appealed = new Set((appeals ?? []).filter((a) => a.status !== "REJECTED").map((a) => a.event.id));
  const history = data.history.map((h) => ({ ...h, label: MONTHS[Number(h.month.slice(5)) - 1] }));

  return (
    <>
      <PageHeader
        eyebrow="AgriTrust — Evidence-Based Buyer Reliability"
        title={org.name}
        subtitle={`${org.business_type ? BUSINESS_TYPE[org.business_type] : "ผู้ซื้อ"} · ${org.province ?? ""}`}
        actions={org.verified ? <Badge tone="green">ยืนยันธุรกิจแล้ว</Badge> : <Badge tone="gray">ยังไม่ยืนยันธุรกิจ</Badge>}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="คะแนนรวม">
          {p.insufficient_data ? (
            <div className="flex flex-col items-start gap-2">
              <ShieldQuestion className="size-10 text-slate-300" />
              <div className="text-lg font-semibold">Insufficient Transaction Data</div>
              <p className="text-sm text-slate-500">
                มีธุรกรรมที่ตรวจสอบแล้ว {p.transactions} รายการ (ต้องมีอย่างน้อย {data.min_transactions}) — ระบบไม่ให้คะแนนต่ำโดยอัตโนมัติแก่ผู้ซื้อใหม่
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-baseline gap-2">
                <span className="tabular text-5xl font-semibold text-slate-900">{p.score?.toFixed(1)}</span>
                <span className="text-slate-500">/ 100</span>
              </div>
              <div className="mt-2"><StatusBadge map={TRUST_BAND} value={p.band ?? ""} /></div>
              <DL cols={1} items={[["ธุรกรรมที่ตรวจสอบแล้ว", `${p.transactions} รายการ`]]} />
            </>
          )}
          <div className="mt-4 flex gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            <Info className="size-4 shrink-0" />
            ไม่ใช่คะแนนเครดิต และไม่ใช่ความน่าจะเป็นที่จะชำระเงิน ใช้เฉพาะเหตุการณ์ที่ตรวจสอบแล้ว ข้อพิพาทที่ยังไม่ยุติไม่ถูกนำมาหักคะแนน
          </div>
        </Card>
        <Card title="ที่มาของคะแนน" className="lg:col-span-2">
          <div className="space-y-4">
            {p.dimensions.map((d) => (
              <div key={d.key}>
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium text-slate-800">{d.label} <span className="font-normal text-slate-400">· น้ำหนัก {Math.round(d.weight * 100)}%</span></span>
                  <span className="tabular text-slate-600">
                    {d.trials ? `${d.successes}/${d.trials} (${d.rate}%)` : "ไม่มีข้อมูล"} → {d.score.toFixed(1)} · ได้ {d.contribution.toFixed(1)} คะแนน
                  </span>
                </div>
                <Meter value={d.score} className={d.score >= 85 ? "bg-green-600" : d.score >= 70 ? "bg-amber-500" : "bg-red-500"} />
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-slate-500">
            คะแนนแต่ละมิติใช้ Bayesian smoothing: (สำเร็จ + 1) / (ทั้งหมด + 2) × 100 เพื่อไม่ให้ตัวอย่างน้อยได้คะแนนสุดขั้ว · TrustScore = .30P + .25R + .20C + .15Q + .10D
          </p>
        </Card>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title="คะแนนย้อนหลัง 12 เดือน" className="lg:col-span-2">
          {history.some((h) => h.score !== null) ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={history} margin={{ left: -20, right: 8 }}>
                <CartesianGrid vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v) => [`${Number(v).toFixed(1)}`, "AgriTrust"]} />
                <Line type="monotone" dataKey="score" stroke="#18462d" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <Empty title="ยังไม่มีประวัติเพียงพอสำหรับกราฟ" />
          )}
        </Card>
        <Card title="อุทธรณ์ข้อมูล">
          <p className="text-sm text-slate-600">
            {isOwn ? "หากเหตุการณ์ใดไม่ถูกต้อง กด “อุทธรณ์” ที่เหตุการณ์นั้นพร้อมหลักฐาน หากผู้ดูแลรับอุทธรณ์ เหตุการณ์จะไม่ถูกนำมาคิดคะแนน และแสดงคะแนนก่อน/หลัง" : "ผู้ซื้อสามารถอุทธรณ์เหตุการณ์ที่กระทบคะแนนได้"}
          </p>
          {isOwn && !!appeals?.length && (
            <ul className="mt-3 space-y-2 text-sm">
              {appeals.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-2">
                  <Badge tone={a.status === "ACCEPTED" ? "green" : a.status === "OPEN" ? "amber" : "gray"}>{a.status === "ACCEPTED" ? "รับอุทธรณ์" : a.status === "OPEN" ? "รอพิจารณา" : "ไม่รับ"}</Badge>
                  {a.event.transaction_ref} · {DIM_LABEL[a.event.dimension]}
                  {a.status === "ACCEPTED" && <span className="tabular text-xs text-slate-500">{a.score_before} → {a.score_after}</span>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <Card title="เหตุการณ์ล่าสุดที่ตรวจสอบแล้ว" className="mt-6">
        {data.recent_events.length ? (
          <Table head={["วันที่", "ธุรกรรม", "มิติ", "ผล", "หมายเหตุ", ...(isOwn ? [""] : [])]}>
            {data.recent_events.map((e) => (
              <tr key={e.id}>
                <Td>{fmtDate(e.occurred_at)}</Td>
                <Td>{e.transaction_ref}</Td>
                <Td>{DIM_LABEL[e.dimension] ?? e.dimension}</Td>
                <Td>{e.success ? <CheckCircle2 className="size-4 text-green-600" /> : <XCircle className="size-4 text-red-500" />}</Td>
                <Td className="whitespace-normal text-slate-600">{e.note ?? "—"}{!e.verified && <Badge tone="gray" className="ml-2">ไม่นำมาคิดคะแนน</Badge>}</Td>
                {isOwn && (
                  <Td>
                    {e.verified && !appealed.has(e.id) && <Button size="sm" variant="ghost" onClick={() => setAppealFor(e)}>อุทธรณ์</Button>}
                    {appealed.has(e.id) && <span className="text-xs text-slate-500">อุทธรณ์แล้ว</span>}
                  </Td>
                )}
              </tr>
            ))}
          </Table>
        ) : (
          <Empty title="ยังไม่มีเหตุการณ์" />
        )}
      </Card>
      <Modal open={!!appealFor} onClose={() => setAppealFor(null)} title={`อุทธรณ์เหตุการณ์ ${appealFor?.transaction_ref ?? ""}`}>
        <form
          className="space-y-4"
          onSubmit={async (ev) => {
            ev.preventDefault();
            const f = new FormData(ev.currentTarget);
            const ok = await run(() => post(`/trust/events/${appealFor!.id}/appeals`, { reason: f.get("reason"), evidence_note: f.get("evidence_note") || null }), "ส่งคำอุทธรณ์แล้ว");
            if (ok) setAppealFor(null);
          }}
        >
          <p className="text-sm text-slate-600">{appealFor && `${DIM_LABEL[appealFor.dimension]} · ${appealFor.note ?? ""}`}</p>
          <Field label="เหตุผล"><Textarea name="reason" required minLength={10} /></Field>
          <Field label="หลักฐาน"><Input name="evidence_note" placeholder="เช่น สลิปโอนเงิน, ข้อความยืนยันการรับสินค้า" /></Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setAppealFor(null)}>ยกเลิก</Button>
            <Button type="submit" loading={pending}>ส่งคำอุทธรณ์</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
