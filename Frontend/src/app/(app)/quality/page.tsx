"use client";

import { ClipboardCheck } from "lucide-react";
import Link from "next/link";
import useSWR from "swr";
import { Badge, Card, Empty, ErrorState, LinkButton, PageHeader, PageSkeleton, SegmentBar, SubNav, Table, Td } from "@/components/ui";
import { fmtDateTime, fmtKg } from "@/lib/format";
import { FLAG_LABEL, productName, SUBNAV } from "@/lib/labels";
import { useSession } from "@/lib/session";
import type { Inspection, Lot } from "@/lib/types";

const GRADE_COLORS = ["bg-green-800", "bg-green-500", "bg-lime-400", "bg-amber-400"];

export default function QualityPage() {
  const { user } = useSession();
  const { data, error } = useSWR<Inspection[]>("/inspections");
  const { data: lots } = useSWR<Lot[]>("/lots");
  if (error) return <ErrorState error={error} />;
  if (!data || !user) return <PageSkeleton />;
  const queue = (lots ?? []).filter((l) => l.status === "INSPECTION_PENDING");
  const canInspect = user.role === "INSPECTOR" || user.role === "BUYER";
  return (
    <>
      <SubNav items={SUBNAV.delivery} />
      <PageHeader title="GradeProof" subtitle="ผลตรวจคุณภาพเทียบกับเงื่อนไข HarvestLock — ประเด็นที่ไม่ตรงสัญญาถูกส่งให้คนตรวจทาน ไม่ใช่คำตัดสิน" />
      {canInspect && (
        <Card title={`รอตรวจคุณภาพ (${queue.length})`} className="mb-6">
          {queue.length ? (
            <Table head={["ล็อต", "ผลผลิต", "สวน", "รับจริง", ""]}>
              {queue.map((l) => (
                <tr key={l.id}>
                  <Td className="font-medium">{l.code}</Td>
                  <Td>{productName(l.product_type, l.variety)}</Td>
                  <Td>{l.farmer.name}</Td>
                  <Td className="tabular">{fmtKg(l.received_kg)}</Td>
                  <Td><LinkButton href={`/contracts/${l.contract_id}`} size="sm">บันทึกผลตรวจ</LinkButton></Td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty title="ไม่มีล็อตรอตรวจ" />
          )}
        </Card>
      )}
      <Card title="ผลการตรวจ">
        {data.length === 0 ? (
          <Empty icon={<ClipboardCheck className="size-10" />} title="ยังไม่มีผลตรวจ" />
        ) : (
          <Table head={["ล็อต / สัญญา", "ตรวจโดย", "รับ", "การกระจายเกรด", "ปฏิเสธ", "ประเด็น"]}>
            {data.map((i) => (
              <tr key={i.id}>
                <Td>
                  <div className="font-medium">{i.lot_code}</div>
                  <Link href={`/contracts/${i.contract_id}`} className="text-xs text-green-800 hover:underline">{i.contract_code}</Link>
                </Td>
                <Td><div>{i.inspector.name}</div><div className="text-xs text-slate-500">{fmtDateTime(i.inspected_at)}</div></Td>
                <Td className="tabular">{fmtKg(i.received_kg)}</Td>
                <Td className="min-w-[180px]">
                  <SegmentBar
                    total={i.received_kg}
                    segments={[
                      ...i.grades.map((g, k) => ({ label: `เกรด ${g.grade}`, value: g.quantity_kg, className: GRADE_COLORS[k % GRADE_COLORS.length] })),
                      { label: "ปฏิเสธ", value: i.rejected_kg, className: "bg-red-400" },
                    ]}
                  />
                  <div className="mt-1 text-xs text-slate-500">{i.grades.map((g) => `${g.grade} ${fmtKg(g.quantity_kg)}`).join(" · ")}</div>
                </Td>
                <Td className="tabular">{fmtKg(i.rejected_kg)}</Td>
                <Td>{i.flags.length ? <div className="flex flex-wrap gap-1">{i.flags.map((f) => <Badge key={f.code} tone="amber">{FLAG_LABEL[f.code] ?? f.code}</Badge>)}</div> : <Badge tone="green">ตรงสัญญา</Badge>}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
