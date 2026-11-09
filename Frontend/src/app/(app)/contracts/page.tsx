"use client";

import { useState } from "react";
import useSWR from "swr";
import { OrdersTable } from "@/components/orders";
import { Card, ErrorState, PageHeader, PageSkeleton, Tabs } from "@/components/ui";
import { useSession } from "@/lib/session";
import type { ContractBrief } from "@/lib/types";

type Tab = "ACTIVE" | "AWAITING" | "DONE" | "STOPPED";
const STOPPED = ["CANCELLED", "RESERVATION_EXPIRED"];

export default function ContractsPage() {
  const { user } = useSession();
  const { data, error } = useSWR<ContractBrief[]>("/contracts");
  const [tab, setTab] = useState<Tab>("ACTIVE");
  if (error) return <ErrorState error={error} />;
  if (!data || !user) return <PageSkeleton />;
  const groups: Record<Tab, ContractBrief[]> = {
    ACTIVE: data.filter((c) => !STOPPED.includes(c.order_status) && c.order_status !== "COMPLETED"),
    AWAITING: data.filter((c) => c.order_status === "AWAITING_CONFIRMATION"),
    DONE: data.filter((c) => c.order_status === "COMPLETED"),
    STOPPED: data.filter((c) => STOPPED.includes(c.order_status)),
  };
  return (
    <>
      <PageHeader
        title={user.role === "BUYER" ? "คำสั่งซื้อ & HarvestLock" : "สัญญา HarvestLock"}
        subtitle="ข้อตกลงก่อนเก็บเกี่ยวแยกรายผู้ซื้อ — ไม่ผูกพันจนกว่าทั้งสองฝ่ายยอมรับฉบับเดียวกัน คลิกเพื่อเปิดพื้นที่ติดตามคำสั่งซื้อ"
      />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "ACTIVE", label: "กำลังดำเนินการ", count: groups.ACTIVE.length },
          { value: "AWAITING", label: "รอผู้ซื้อยืนยัน", count: groups.AWAITING.length },
          { value: "DONE", label: "เสร็จสิ้น", count: groups.DONE.length },
          { value: "STOPPED", label: "ยกเลิก/หมดอายุ", count: groups.STOPPED.length },
        ]}
      />
      <Card><OrdersTable orders={groups[tab]} role={user.role} /></Card>
    </>
  );
}
