"use client";

import useSWR from "swr";
import { Badge, Button, Card, ErrorState, PageHeader, PageSkeleton, SubNav, Table, Td } from "@/components/ui";
import { post } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { BUSINESS_TYPE, SUBNAV } from "@/lib/labels";
import type { Org } from "@/lib/types";
import { useAction } from "@/lib/useAction";

type AdminOrg = Org & { created_at: string; members: { name: string; email: string }[] };

export default function VerificationPage() {
  const { data, error } = useSWR<AdminOrg[]>("/admin/organizations");
  const { run, pending } = useAction();
  if (error) return <ErrorState error={error} />;
  if (!data) return <PageSkeleton />;
  const waiting = data.filter((o) => !o.verified).length;
  return (
    <>
      <SubNav items={SUBNAV.adminPeople} />
      <PageHeader title="ยืนยันธุรกิจ" subtitle={`รอตรวจสอบ ${waiting} องค์กร — ตรวจจากข้อมูลที่ลงทะเบียน; ยังไม่ได้เชื่อมการตรวจเอกสารนิติบุคคลกับระบบภายนอก`} />
      <Card>
        <Table head={["องค์กร", "ประเภท", "จังหวัด", "สมาชิก", "ลงทะเบียน", "สถานะ", ""]}>
          {data.map((o) => (
            <tr key={o.id}>
              <Td className="font-medium">{o.name}</Td>
              <Td>{o.kind === "FARM" ? "สวน" : `ผู้ซื้อ${o.business_type ? ` · ${BUSINESS_TYPE[o.business_type]}` : ""}`}</Td>
              <Td>{o.province ?? "—"}</Td>
              <Td className="text-xs text-slate-600">{o.members.map((m) => m.name).join(", ") || "—"}</Td>
              <Td>{fmtDate(o.created_at)}</Td>
              <Td>{o.verified ? <Badge tone="green">ยืนยันแล้ว</Badge> : <Badge tone="amber">รอยืนยัน</Badge>}</Td>
              <Td>
                <Button
                  size="sm"
                  variant={o.verified ? "ghost" : "primary"}
                  loading={pending}
                  onClick={() => run(() => post(`/admin/organizations/${o.id}/verify`, { verified: !o.verified }), o.verified ? "ยกเลิกการยืนยันแล้ว" : `ยืนยัน ${o.name} แล้ว`)}
                >
                  {o.verified ? "ยกเลิกการยืนยัน" : "ยืนยัน"}
                </Button>
              </Td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
