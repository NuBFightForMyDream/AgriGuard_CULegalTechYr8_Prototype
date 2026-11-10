"use client";

import useSWR from "swr";
import { Badge, Card, ErrorState, PageHeader, PageSkeleton, Select, SubNav, Table, Td } from "@/components/ui";
import { post } from "@/lib/api";
import { ACTOR_TONE, ROLE, SUBNAV } from "@/lib/labels";
import { useSession } from "@/lib/session";
import type { Role, User } from "@/lib/types";
import { useAction } from "@/lib/useAction";

type AdminUser = User & { sign_in: "google" | "demo" };

export default function AdminUsersPage() {
  const { user: me } = useSession();
  const { data, error } = useSWR<AdminUser[]>("/admin/users");
  const { run, pending } = useAction();
  if (error) return <ErrorState error={error} />;
  if (!data) return <PageSkeleton />;
  return (
    <>
      <SubNav items={SUBNAV.adminPeople} />
      <PageHeader title="ผู้ใช้และสิทธิ์" subtitle="ผู้ใช้ Google เลือกได้เฉพาะเกษตรกรหรือผู้ซื้อ — สิทธิ์ผู้ตรวจคุณภาพและผู้ดูแลระบบมอบโดยผู้ดูแลเท่านั้น" />
      <Card>
        <Table head={["ผู้ใช้", "องค์กร", "เข้าสู่ระบบ", "บทบาท", "เปลี่ยนบทบาท"]}>
          {data.map((u) => {
            const options: Role[] = u.organization.kind === "FARM" ? ["FARMER", "INSPECTOR", "ADMIN"] : u.organization.kind === "BUYER" ? ["BUYER", "INSPECTOR", "ADMIN"] : ["INSPECTOR", "ADMIN"];
            return (
              <tr key={u.id}>
                <Td><div className="font-medium">{u.name}</div><div className="text-xs text-slate-500">{u.email}</div></Td>
                <Td className="max-w-[220px] truncate">{u.organization.name}</Td>
                <Td><Badge tone={u.sign_in === "google" ? "blue" : "gray"}>{u.sign_in === "google" ? "Google" : "เดโม"}</Badge></Td>
                <Td><Badge tone={ACTOR_TONE[u.role]}>{ROLE[u.role]}</Badge></Td>
                <Td>
                  <Select
                    value={u.role}
                    disabled={pending || u.id === me?.id}
                    onChange={(e) => run(() => post(`/admin/users/${u.id}/role`, { role: e.target.value }), `เปลี่ยนบทบาท ${u.name} แล้ว`)}
                    className="w-40 py-1.5"
                  >
                    {options.map((r) => <option key={r} value={r}>{ROLE[r]}</option>)}
                  </Select>
                </Td>
              </tr>
            );
          })}
        </Table>
      </Card>
    </>
  );
}
