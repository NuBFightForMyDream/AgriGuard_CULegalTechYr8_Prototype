"use client";

import { useState } from "react";
import useSWR from "swr";
import { Badge, Button, Card, Empty, ErrorState, Field, Input, PageHeader, PageSkeleton, Tabs } from "@/components/ui";
import { post } from "@/lib/api";
import { fmtDate, fmtDateTime } from "@/lib/format";
import type { Appeal } from "@/lib/types";
import { useAction } from "@/lib/useAction";

const DIM: Record<string, string> = { PAYMENT: "การชำระเงิน", PICKUP: "การรับสินค้า", CONTRACT: "การปฏิบัติตามสัญญา", QC: "ความโปร่งใส QC", DISPUTE: "ข้อพิพาท" };
const STATUS = { OPEN: ["รอพิจารณา", "amber"], ACCEPTED: ["รับอุทธรณ์", "green"], REJECTED: ["ไม่รับอุทธรณ์", "gray"] } as const;

export default function AppealsPage() {
  const { data, error } = useSWR<Appeal[]>("/trust/appeals");
  const [tab, setTab] = useState<"OPEN" | "DONE">("OPEN");
  if (error) return <ErrorState error={error} />;
  if (!data) return <PageSkeleton />;
  const shown = data.filter((a) => (tab === "OPEN" ? a.status === "OPEN" : a.status !== "OPEN"));
  return (
    <>
      <PageHeader title="อุทธรณ์ AgriTrust" subtitle="รับอุทธรณ์ = เหตุการณ์ไม่ถูกนำมาคิดคะแนน (เก็บบันทึกไว้) และแสดงคะแนนก่อน/หลัง" />
      <Tabs value={tab} onChange={setTab} tabs={[
        { value: "OPEN", label: "รอพิจารณา", count: data.filter((a) => a.status === "OPEN").length },
        { value: "DONE", label: "มีผลแล้ว", count: data.filter((a) => a.status !== "OPEN").length },
      ]} />
      {shown.length === 0 ? <Card><Empty title="ไม่มีคำอุทธรณ์" /></Card> : (
        <div className="space-y-4">{shown.map((a) => <AppealCard key={a.id} a={a} />)}</div>
      )}
    </>
  );
}

function AppealCard({ a }: { a: Appeal }) {
  const { run, pending } = useAction();
  const [note, setNote] = useState("");
  const [label, tone] = STATUS[a.status];
  return (
    <Card title={`${a.buyer.name} · ${a.event.transaction_ref}`} action={<Badge tone={tone}>{label}</Badge>}>
      <div className="grid gap-4 text-sm md:grid-cols-2">
        <div>
          <div className="text-xs text-slate-500">เหตุการณ์ที่อุทธรณ์</div>
          <div className="mt-1">{DIM[a.event.dimension]} · {a.event.success ? "ผ่าน" : "ไม่ผ่าน"} · {fmtDate(a.event.occurred_at)}</div>
          <div className="text-slate-600">{a.event.note ?? "—"}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">เหตุผลของผู้ซื้อ · {fmtDateTime(a.created_at)}</div>
          <div className="mt-1">{a.reason}</div>
          {a.evidence_note && <div className="text-slate-600">หลักฐาน: {a.evidence_note}</div>}
        </div>
      </div>
      {a.status === "OPEN" ? (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <Field label="เหตุผลการพิจารณา" className="min-w-[260px] flex-1"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <Button loading={pending} disabled={note.trim().length < 3} onClick={() => run(() => post(`/admin/appeals/${a.id}/decide`, { accept: true, note }), "รับอุทธรณ์แล้ว — คำนวณคะแนนใหม่")}>รับอุทธรณ์</Button>
          <Button variant="secondary" loading={pending} disabled={note.trim().length < 3} onClick={() => run(() => post(`/admin/appeals/${a.id}/decide`, { accept: false, note }), "ไม่รับอุทธรณ์")}>ไม่รับ</Button>
        </div>
      ) : (
        <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm">
          {a.decision_note}
          {a.status === "ACCEPTED" && <span className="ml-2 tabular font-medium">คะแนน {a.score_before ?? "—"} → {a.score_after ?? "—"}</span>}
        </div>
      )}
    </Card>
  );
}
