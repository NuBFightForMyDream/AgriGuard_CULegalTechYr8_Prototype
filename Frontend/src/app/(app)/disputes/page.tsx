"use client";

import { Scale } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { Card, Empty, ErrorState, PageHeader, PageSkeleton, StatusBadge, Table, Tabs, Td } from "@/components/ui";
import { fmtDateTime, fmtTHB } from "@/lib/format";
import { DISPUTE_OUTCOME, DISPUTE_STATUS } from "@/lib/labels";
import { useSession } from "@/lib/session";
import type { DisputeBrief } from "@/lib/types";

const OPEN = ["OPEN", "EVIDENCE_COLLECTION", "UNDER_REVIEW", "REINSPECTION_REQUESTED"];

export default function DisputesPage() {
  const { user } = useSession();
  const { data, error } = useSWR<DisputeBrief[]>("/disputes");
  const [tab, setTab] = useState<"OPEN" | "DONE">("OPEN");
  if (error) return <ErrorState error={error} />;
  if (!data || !user) return <PageSkeleton />;
  const open = data.filter((d) => OPEN.includes(d.status));
  const shown = tab === "OPEN" ? open : data.filter((d) => !OPEN.includes(d.status));
  const subtitle =
    user.role === "ADMIN"
      ? "พิจารณาหลักฐานจากทั้งสองฝ่าย ขอตรวจซ้ำได้ และบันทึกผลพร้อมปรับยอดชำระ"
      : user.role === "INSPECTOR"
        ? "ข้อพิพาทที่ผู้ตรวจทานขอให้ตรวจคุณภาพซ้ำ"
        : "เปิดข้อพิพาทได้จากหน้าสัญญา — ข้อพิพาทที่ยังไม่ยุติไม่กระทบ AgriTrust";
  return (
    <>
      <PageHeader title="ข้อพิพาท" subtitle={subtitle} />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "OPEN", label: "ยังไม่ยุติ", count: open.length },
          { value: "DONE", label: "ยุติแล้ว", count: data.length - open.length },
        ]}
      />
      <Card>
        {shown.length === 0 ? (
          <Empty icon={<Scale className="size-10" />} title="ไม่มีข้อพิพาท" />
        ) : (
          <Table head={["เลขที่", "ประเภท", "สัญญา", "ผู้เปิด → คู่กรณี", "ยอดโต้แย้ง / กันไว้", "เปิดเมื่อ", "สถานะ"]}>
            {shown.map((d) => (
              <tr key={d.id} className="hover:bg-slate-50">
                <Td><Link href={`/disputes/${d.id}`} className="font-medium text-green-800 hover:underline">{d.code}</Link></Td>
                <Td>{d.category_label}</Td>
                <Td><Link href={`/contracts/${d.contract_id}`} className="hover:underline">{d.contract_code}</Link></Td>
                <Td className="max-w-[260px] truncate">{d.opened_by_org.name} → {d.against_org.name}</Td>
                <Td className="tabular">{fmtTHB(d.disputed_amount)} / {fmtTHB(d.held_amount)}</Td>
                <Td className="text-xs text-slate-500">{fmtDateTime(d.created_at)}</Td>
                <Td>
                  <StatusBadge map={DISPUTE_STATUS} value={d.status} />
                  {d.outcome && <div className="mt-1 text-xs text-slate-500">{DISPUTE_OUTCOME[d.outcome]}</div>}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
