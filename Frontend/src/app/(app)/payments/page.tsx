"use client";

import { Wallet } from "lucide-react";
import Link from "next/link";
import useSWR from "swr";
import { Card, Empty, ErrorState, PageHeader, PageSkeleton, Stat, StatusBadge, Table, Td } from "@/components/ui";
import { fmtDate, fmtTHB } from "@/lib/format";
import { SETTLEMENT_STATUS, productName } from "@/lib/labels";
import { useSession } from "@/lib/session";
import type { Settlement } from "@/lib/types";

export default function PaymentsPage() {
  const { user } = useSession();
  const { data, error } = useSWR<Settlement[]>("/settlements");
  if (error) return <ErrorState error={error} />;
  if (!data || !user) return <PageSkeleton />;
  const sum = (f: (s: Settlement) => number) => data.reduce((a, s) => a + Number(f(s)), 0);
  return (
    <>
      <PageHeader title="การชำระเงิน" subtitle="ยอดคำนวณจากปริมาณที่ผ่านการตรวจและราคาตามสัญญา — Phase 1 เป็นการชำระเงินจำลอง ไม่มีการโอนเงินจริงหรือ escrow" />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="มูลค่ารวมตามผลตรวจ" value={fmtTHB(sum((s) => s.gross_amount))} />
        <Stat label={user.role === "BUYER" ? "ชำระแล้ว" : "ได้รับแล้ว"} value={fmtTHB(sum((s) => s.paid_amount))} />
        <Stat label="ค้างชำระ" value={fmtTHB(sum((s) => s.outstanding))} tone="warn" />
      </div>
      <Card className="mt-6">
        {data.length === 0 ? (
          <Empty icon={<Wallet className="size-10" />} title="ยังไม่มีรายการชำระเงิน">รายการจะถูกสร้างอัตโนมัติหลังบันทึกผล GradeProof</Empty>
        ) : (
          <Table head={["สัญญา", "ผลผลิต", user.role === "BUYER" ? "สวน" : "ผู้ซื้อ", "รวม", "มัดจำ", "สุทธิ", "ชำระแล้ว", "ครบกำหนด", "สถานะ"]}>
            {data.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50">
                <Td><Link href={`/contracts/${s.contract_id}`} className="font-medium text-green-800 hover:underline">{s.contract_code}</Link></Td>
                <Td>{productName(s.product_type, s.variety)}</Td>
                <Td className="max-w-[200px] truncate">{user.role === "BUYER" ? s.farmer.name : s.buyer.name}</Td>
                <Td className="tabular">{fmtTHB(s.gross_amount)}</Td>
                <Td className="tabular">{fmtTHB(s.deposit_amount)}</Td>
                <Td className="tabular font-medium">{fmtTHB(s.net_amount)}</Td>
                <Td className="tabular">{fmtTHB(s.paid_amount)}</Td>
                <Td>{fmtDate(s.due_date)}</Td>
                <Td><StatusBadge map={SETTLEMENT_STATUS} value={s.status} /></Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
