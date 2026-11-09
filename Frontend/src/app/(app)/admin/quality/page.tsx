"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";
import { Button, Card, ErrorState, Field, Input, PageHeader, PageSkeleton } from "@/components/ui";
import { api } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import { PRODUCT } from "@/lib/labels";
import { useAction } from "@/lib/useAction";

type Standard = { product_type: string; grades: { grade: string; criteria: string }[]; sampling_method: string; updated_at: string };

export default function QualityStandardsPage() {
  const { data, error } = useSWR<Standard[]>("/quality-standards");
  if (error) return <ErrorState error={error} />;
  if (!data) return <PageSkeleton />;
  return (
    <>
      <PageHeader title="มาตรฐานคุณภาพ" subtitle="เกณฑ์คัดเกรดแยกตามชนิดผลผลิต — ใช้กำหนดเกรดที่ลงประกาศได้ และแสดงให้ผู้ตรวจเห็นตอนบันทึก GradeProof" />
      <div className="grid gap-6 lg:grid-cols-2">
        {data.map((s) => <StandardCard key={s.product_type} s={s} />)}
      </div>
    </>
  );
}

function StandardCard({ s }: { s: Standard }) {
  const [grades, setGrades] = useState(s.grades);
  const [sampling, setSampling] = useState(s.sampling_method);
  const { run, pending } = useAction();
  const dirty = JSON.stringify(grades) !== JSON.stringify(s.grades) || sampling !== s.sampling_method;
  const set = (i: number, k: "grade" | "criteria", v: string) => setGrades((g) => g.map((row, j) => (j === i ? { ...row, [k]: v } : row)));

  return (
    <Card title={PRODUCT[s.product_type] ?? s.product_type} action={<span className="text-xs text-slate-500">แก้ไขล่าสุด {fmtDateTime(s.updated_at)}</span>}>
      <div className="space-y-2">
        {grades.map((g, i) => (
          <div key={i} className="flex gap-2">
            <Input value={g.grade} onChange={(e) => set(i, "grade", e.target.value)} className="w-16 text-center font-medium" aria-label="เกรด" />
            <Input value={g.criteria} onChange={(e) => set(i, "criteria", e.target.value)} aria-label="เกณฑ์" />
            <button onClick={() => setGrades((x) => x.filter((_, j) => j !== i))} disabled={grades.length <= 1} className="rounded p-2 text-slate-400 hover:text-red-600 disabled:opacity-30" aria-label="ลบเกรด">
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
        <Button size="sm" variant="ghost" onClick={() => setGrades((g) => [...g, { grade: "", criteria: "" }])}><Plus className="size-4" />เพิ่มเกรด</Button>
        <Field label="วิธีสุ่มตรวจมาตรฐาน"><Input value={sampling} onChange={(e) => setSampling(e.target.value)} /></Field>
        <div className="flex justify-end">
          <Button
            size="sm"
            disabled={!dirty || grades.some((g) => !g.grade.trim() || !g.criteria.trim())}
            loading={pending}
            onClick={() => run(() => api(`/admin/quality-standards/${s.product_type}`, { method: "PUT", body: JSON.stringify({ grades, sampling_method: sampling }) }), "บันทึกมาตรฐานแล้ว")}
          >
            บันทึก
          </Button>
        </div>
      </div>
    </Card>
  );
}
