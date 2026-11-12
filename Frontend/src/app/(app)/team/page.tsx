"use client";

import { Building2, Copy, Factory, GitBranch, KeyRound, Plug, ShieldCheck, UserPlus, Webhook } from "lucide-react";
import { useState } from "react";
import { PlanBadge, PlanGate, useMyPlan } from "@/components/plan";
import { useToast } from "@/components/toast";
import { Avatar, Badge, Button, Card, Input, PageHeader, cx } from "@/components/ui";
import { PLANS } from "@/lib/plans";
import { useSession } from "@/lib/session";

/** Sample colleagues and sites: the prototype has one demo user per buyer org, so the rest is illustrative. */
const SAMPLE_TEAM = [
  { name: "วรรณา ศรีสุข", role: "ผู้อนุมัติการสั่งซื้อ", site: "สำนักงานใหญ่" },
  { name: "กิตติ พรหมมา", role: "ฝ่ายจัดซื้อ", site: "โรงงาน 2" },
  { name: "ปวีณา แก้วใส", role: "ฝ่ายควบคุมคุณภาพ", site: "โรงงาน 1" },
  { name: "สุรชัย ทองดี", role: "ฝ่ายบัญชี (ดูอย่างเดียว)", site: "สำนักงานใหญ่" },
];

const SITES = [
  { name: "สำนักงานใหญ่", place: "กรุงเทพมหานคร", buyers: 2, monthly: "฿1.2M" },
  { name: "โรงงาน 1 · แปรรูปผลไม้แช่แข็ง", place: "ฉะเชิงเทรา", buyers: 2, monthly: "฿2.8M" },
  { name: "โรงงาน 2 · น้ำผลไม้", place: "ระยอง", buyers: 1, monthly: "฿0.9M" },
];

const CONNECTORS = [
  { name: "SAP S/4HANA", note: "ส่ง PO และรับใบรับสินค้าอัตโนมัติ", on: true },
  { name: "Oracle NetSuite", note: "ซิงก์ผู้ขายและยอดชำระ", on: false },
  { name: "Express Accounting", note: "ลงบัญชีค่าวัตถุดิบตามยอดสุทธิหลังตรวจเกรด", on: true },
];

export default function TeamPage() {
  const { user } = useSession();
  const [plan] = useMyPlan();
  const toast = useToast();
  const [email, setEmail] = useState("");
  if (!user) return null;
  const used = 1 + SAMPLE_TEAM.length;

  return (
    <>
      <PageHeader
        eyebrow={<span className="flex items-center gap-2">{user.organization.name} <PlanBadge plan={plan} /></span>}
        title="ทีม & ระบบองค์กร"
        subtitle="จัดการผู้ใช้ สาขา สายอนุมัติ และการเชื่อมต่อระบบขององค์กร"
      />

      <PlanGate need="PREMIUM" title="ทีมจัดซื้อหลายคน">
        <Card
          title="สมาชิกในทีม"
          action={<span className="text-sm text-slate-500">ผู้ใช้ <b className="tabular text-slate-900">{used}</b> คน · แผน {PLANS[plan].name} {PLANS[plan].seats === "1 คน" ? "ใช้ได้ 1 คน" : "เพิ่มได้หลายคน"}</span>}
        >
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              if (!email.trim()) return;
              toast("success", `ส่งคำเชิญถึง ${email} แล้ว (จำลอง)`);
              setEmail("");
            }}
          >
            <Input type="email" placeholder="อีเมลเพื่อนร่วมทีม" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Button type="submit" className="shrink-0"><UserPlus className="size-4" />เชิญเข้าทีม</Button>
          </form>
          <ul className="mt-4 divide-y divide-slate-100">
            <li className="flex items-center gap-3 py-3">
              <Avatar name={user.name} />
              <div className="min-w-0 flex-1 leading-tight">
                <div className="truncate font-medium text-slate-900">{user.name} <span className="text-xs font-normal text-slate-400">(คุณ)</span></div>
                <div className="truncate text-xs text-slate-500">{user.title ?? "ผู้ดูแลบัญชี"}</div>
              </div>
              <Badge tone="green">ผู้ดูแล</Badge>
            </li>
            {SAMPLE_TEAM.map((m) => (
              <li key={m.name} className="flex items-center gap-3 py-3">
                <Avatar name={m.name} />
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="truncate font-medium text-slate-900">{m.name}</div>
                  <div className="truncate text-xs text-slate-500">{m.role}{plan === "ENTERPRISE" && ` · ${m.site}`}</div>
                </div>
                <Badge>สมาชิก</Badge>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-400">สมาชิกนอกจากคุณเป็นข้อมูลตัวอย่างในต้นแบบ</p>
        </Card>
      </PlanGate>

      <div className="mt-8 mb-3 flex items-center gap-2">
        <h2 className="text-lg font-semibold tracking-tight text-slate-900">สำหรับองค์กรขนาดใหญ่</h2>
        <PlanBadge plan="ENTERPRISE" />
      </div>
      <PlanGate need="ENTERPRISE" title={`ระบบองค์กร (${PLANS.ENTERPRISE.name})`}>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title={<span className="flex items-center gap-2"><Factory className="size-4 text-green-700" />โรงงาน & สาขา</span>}>
            <ul className="space-y-2">
              {SITES.map((s) => (
                <li key={s.name} className="flex items-center gap-3 rounded-2xl bg-canvas p-3">
                  <span className="flex size-10 items-center justify-center rounded-2xl bg-white text-green-800 shadow-sm"><Building2 className="size-5" /></span>
                  <div className="min-w-0 flex-1 leading-tight">
                    <div className="truncate text-sm font-medium text-slate-900">{s.name}</div>
                    <div className="text-xs text-slate-500">{s.place} · ผู้จัดซื้อ {s.buyers} คน</div>
                  </div>
                  <div className="text-right leading-tight">
                    <div className="tabular text-sm font-semibold text-slate-900">{s.monthly}</div>
                    <div className="text-[11px] text-slate-400">ต่อเดือน</div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <Card title={<span className="flex items-center gap-2"><GitBranch className="size-4 text-green-700" />สายอนุมัติการสั่งซื้อ</span>}>
            <ol className="relative space-y-4 border-l-2 border-dashed border-green-200 pl-5 text-sm">
              {[
                ["ไม่เกิน ฿200,000", "ผู้จัดซื้อยืนยัน HarvestLock ได้เอง"],
                ["฿200,000 – ฿1,000,000", "ต้องได้รับอนุมัติจากผู้จัดการฝ่ายจัดซื้อ"],
                ["เกิน ฿1,000,000 หรือสวน AgriTrust ต่ำกว่า 70", "ผู้อำนวยการโรงงาน + ฝ่ายควบคุมคุณภาพ"],
              ].map(([when, who], i) => (
                <li key={when} className="relative">
                  <span className="absolute -left-[29px] top-0 flex size-5 items-center justify-center rounded-full bg-green-900 text-[10px] font-semibold text-lime-300">{i + 1}</span>
                  <div className="font-medium text-slate-900">{when}</div>
                  <div className="text-slate-500">{who}</div>
                </li>
              ))}
            </ol>
          </Card>

          <Card title={<span className="flex items-center gap-2"><Plug className="size-4 text-green-700" />เชื่อมต่อ ERP</span>}>
            <ul className="divide-y divide-slate-100">
              {CONNECTORS.map((c) => (
                <li key={c.name} className="flex items-center gap-3 py-3 first:pt-0">
                  <div className="min-w-0 flex-1 leading-tight">
                    <div className="text-sm font-medium text-slate-900">{c.name}</div>
                    <div className="text-xs text-slate-500">{c.note}</div>
                  </div>
                  <span className={cx("rounded-full px-2.5 py-1 text-xs font-medium", c.on ? "bg-green-50 text-green-800" : "bg-slate-100 text-slate-500")}>{c.on ? "เชื่อมแล้ว" : "ยังไม่เชื่อม"}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card title={<span className="flex items-center gap-2"><KeyRound className="size-4 text-green-700" />API, webhook & SSO</span>}>
            <div className="space-y-3 text-sm">
              <div>
                <div className="mb-1 text-xs text-slate-500">API key (production)</div>
                <div className="flex items-center gap-2 rounded-2xl bg-canvas px-3 py-2 font-mono text-xs text-slate-700">
                  <span className="flex-1 truncate">agk_live_••••••••••••••••3f9a</span>
                  <button type="button" onClick={() => toast("success", "คัดลอก API key แล้ว (จำลอง)")} className="rounded-full p-1 text-slate-500 hover:bg-white" aria-label="คัดลอก"><Copy className="size-3.5" /></button>
                </div>
              </div>
              <div className="flex items-start gap-2.5 rounded-2xl bg-canvas p-3">
                <Webhook className="mt-0.5 size-4 shrink-0 text-green-700" />
                <div className="min-w-0 leading-tight">
                  <div className="font-medium text-slate-900">Webhook</div>
                  <div className="truncate text-xs text-slate-500">contract.confirmed · lot.inspected · settlement.paid</div>
                </div>
              </div>
              <div className="flex items-start gap-2.5 rounded-2xl bg-canvas p-3">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-green-700" />
                <div className="min-w-0 leading-tight">
                  <div className="font-medium text-slate-900">Single sign-on</div>
                  <div className="text-xs text-slate-500">Microsoft Entra ID · Google Workspace</div>
                </div>
              </div>
            </div>
          </Card>
        </div>
        <p className="mt-3 text-xs text-slate-400">สาขา สายอนุมัติ และการเชื่อมต่อในหน้านี้เป็นตัวอย่างการตั้งค่าในต้นแบบ</p>
      </PlanGate>
    </>
  );
}
