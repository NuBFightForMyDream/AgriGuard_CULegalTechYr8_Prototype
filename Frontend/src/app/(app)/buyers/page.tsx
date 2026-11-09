"use client";

import Link from "next/link";
import useSWR from "swr";
import { TrustBadge } from "@/components/trust";
import { Badge, Card, ErrorState, PageHeader, PageSkeleton, Table, Td } from "@/components/ui";
import { BUSINESS_TYPE } from "@/lib/labels";
import type { Org, TrustSummary } from "@/lib/types";

export default function BuyersPage() {
  const { data, error } = useSWR<(Org & { trust: TrustSummary })[]>("/buyers");
  if (error) return <ErrorState error={error} />;
  if (!data) return <PageSkeleton />;
  return (
    <>
      <PageHeader title="AgriTrust ผู้ซื้อ" subtitle="ความน่าเชื่อถือจากธุรกรรมที่ตรวจสอบแล้ว — ไม่ใช่คะแนนเครดิต และผู้ซื้อใหม่ไม่ถูกลงโทษเพราะไม่มีประวัติ" />
      <Card>
        <Table head={["ผู้ซื้อ", "ประเภท", "จังหวัด", "ยืนยันธุรกิจ", "AgriTrust", ""]}>
          {data.map((b) => (
            <tr key={b.id} className="hover:bg-slate-50">
              <Td className="font-medium">{b.name}</Td>
              <Td>{b.business_type ? BUSINESS_TYPE[b.business_type] : "—"}</Td>
              <Td>{b.province ?? "—"}</Td>
              <Td>{b.verified ? <Badge tone="green">ยืนยันแล้ว</Badge> : <Badge tone="gray">รอยืนยัน</Badge>}</Td>
              <Td><TrustBadge trust={b.trust} /></Td>
              <Td><Link href={`/buyers/${b.id}`} className="text-sm text-green-800 hover:underline">ดูโปรไฟล์</Link></Td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
