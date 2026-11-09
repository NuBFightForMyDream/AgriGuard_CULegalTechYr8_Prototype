"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { Badge, Card, Empty, ErrorState, PageHeader, PageSkeleton, Table, Tabs, Td } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import { ACTOR_TONE, ROLE } from "@/lib/labels";
import type { AuditEvent } from "@/lib/types";

type Filter = "ALL" | "FARMER" | "BUYER" | "INSPECTOR" | "SYSTEM";

export default function HistoryPage() {
  const { data, error } = useSWR<AuditEvent[]>("/history");
  const [filter, setFilter] = useState<Filter>("ALL");
  if (error) return <ErrorState error={error} />;
  if (!data) return <PageSkeleton />;
  const shown = filter === "ALL" ? data : data.filter((e) => e.actor_role === filter);
  const count = (r: Filter) => data.filter((e) => e.actor_role === r).length;
  return (
    <>
      <PageHeader title="ประวัติธุรกรรม" subtitle="บันทึกตรวจสอบได้ของทุกการเปลี่ยนสถานะ: ใคร ทำอะไร เมื่อไร สถานะเดิม/ใหม่" />
      <Tabs
        value={filter}
        onChange={setFilter}
        tabs={[
          { value: "ALL", label: "ทั้งหมด", count: data.length },
          { value: "FARMER", label: "เกษตรกร", count: count("FARMER") },
          { value: "BUYER", label: "ผู้ซื้อ", count: count("BUYER") },
          { value: "INSPECTOR", label: "ผู้ตรวจ", count: count("INSPECTOR") },
          { value: "SYSTEM", label: "ระบบ", count: count("SYSTEM") },
        ]}
      />
      <Card>
        {shown.length === 0 ? (
          <Empty title="ไม่มีรายการ" />
        ) : (
          <Table head={["เวลา", "ผู้ดำเนินการ", "รายการ", "เหตุการณ์", "สถานะ"]}>
            {shown.map((e) => (
              <tr key={e.id}>
                <Td className="text-xs text-slate-500">{fmtDateTime(e.created_at)}</Td>
                <Td><Badge tone={ACTOR_TONE[e.actor_role]}>{e.actor?.name ?? ROLE[e.actor_role]}</Badge></Td>
                <Td>{e.contract_id ? <Link href={`/contracts/${e.contract_id}`} className="text-green-800 hover:underline">{e.entity_code}</Link> : e.entity_code ?? "—"}</Td>
                <Td className="min-w-[280px] whitespace-normal">{e.message}</Td>
                <Td className="text-xs text-slate-500">{e.from_status || e.to_status ? `${e.from_status ?? "—"} → ${e.to_status ?? "—"}` : "—"}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
