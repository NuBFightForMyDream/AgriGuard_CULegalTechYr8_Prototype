"use client";

import { ArrowDown, ArrowRight, ArrowUpRight, Check, RotateCcw, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { Reveal } from "@/components/reveal";
import { Logo } from "@/components/shell";
import { useToast } from "@/components/toast";
import { Avatar, ErrorState, Skeleton, cx } from "@/components/ui";
import { post } from "@/lib/api";
import { ROLE } from "@/lib/labels";
import { useSession } from "@/lib/session";
import { demoLoginEnabled, googleEnabled, signInWithGoogle } from "@/lib/supabase";
import type { Role, User } from "@/lib/types";

/* Copy below is taken from the pitch deck (Appendix/Deck, Appendix/Feasibility). */

const KEYWORDS = ["HarvestLock", "Smart Allocation", "GradeProof", "AgriTrust", "QR Trace", "AgriBot"];

const PAINS: { who: string; items: string[] }[] = [
  { who: "เกษตรกร", items: ["ผู้ซื้อยกเลิก / กดราคาตอนเก็บเกี่ยว", "เถียงกันเรื่องเกรด", "ได้เงินช้า ไม่มีหลักฐาน"] },
  { who: "ผู้ซื้อ & โรงงาน", items: ["หาสวนที่ตรงสเปกยาก", "คุณภาพ การส่งของไม่แน่นอน", "จีนเข้มเรื่องตรวจสอบย้อนกลับ"] },
];

const FEATURES: { name: string; title: string; body: string }[] = [
  { name: "HarvestLock", title: "ล็อกราคาก่อนเก็บเกี่ยว", body: "ตกลงราคาตามเกรดและมัดจำล่วงหน้า สัญญามี terms hash และ audit log แก้ย้อนหลังไม่ได้" },
  { name: "Smart Allocation", title: "แบ่งผลผลิตให้ผู้ซื้อหลายราย", body: "เทียบข้อเสนอด้วยรายได้และความเสี่ยง กัน overbooking ด้วยการล็อกปริมาณจริง" },
  { name: "GradeProof", title: "ผลตรวจเกรดคือหลักฐาน", body: "ผู้ตรวจ QC บันทึกน้ำหนักตามเกรด ระบบคำนวณยอดสุทธิ = Σ(กก. × ราคาตามเกรด) − มัดจำ" },
  { name: "AgriTrust", title: "ความน่าเชื่อถือจากธุรกรรมจริง", body: "คะแนนคิดจากธุรกรรมที่ตรวจสอบแล้วเท่านั้น ไม่ใช่คำบอกเล่า และอุทธรณ์ได้" },
  { name: "QR Trace", title: "ตรวจสอบย้อนกลับรายล็อต", body: "ทุกล็อตมี QR สำหรับส่งออก ไม่แสดงข้อมูลส่วนบุคคลหรือราคา" },
  { name: "AgriBot", title: "ถามสัญญาและกฎหมายได้ทันที", body: "Legal AI ตอบพร้อมแหล่งอ้างอิง ถ้าเรื่องเสี่ยงจะส่งให้คนตรวจ" },
];

const FLOW = ["คำขอซื้อ", "จับคู่สวน", "ข้อเสนอ", "จัดสรร", "HarvestLock", "เก็บเกี่ยว", "ส่งมอบ", "GradeProof", "ชำระเงิน", "AgriTrust"];

const NUMBERS: [string, string][] = [
  ["฿171,000 ล้าน", "มูลค่าส่งออกผลไม้สดไทย ปี 2025"],
  ["2.08 ล้านตัน", "ผลไม้สดที่ส่งออกในปีเดียว"],
  ["10 ขั้น", "ทุกดีลมีหลักฐานตั้งแต่ต้นจนจบ"],
  ["~฿10", "ต้นทุน AI ต่อหนึ่งดีล"],
];

const ROLE_HINT: Record<Role, string> = {
  FARMER: "ลงประกาศผลผลิต จัดสรร ติดตามเงิน",
  BUYER: "คำขอซื้อ จับคู่สวน ยืนยัน HarvestLock",
  INSPECTOR: "รับล็อต บันทึกผล GradeProof",
  ADMIN: "ภาพรวมแพลตฟอร์มและ Audit log",
};

export default function LoginPage() {
  const { data: users, error, isLoading, mutate } = useSWR<User[]>(demoLoginEnabled ? "/demo/users" : null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { signIn } = useSession();
  const router = useRouter();
  const toast = useToast();

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  const choose = (u: User) => {
    signIn({ ...u, auth: "demo" });
    router.push("/dashboard");
  };

  async function reset() {
    setResetting(true);
    try {
      await post("/demo/reset");
      await mutate();
      toast("success", "รีเซ็ตข้อมูลเดโมเรียบร้อย");
    } catch (e) {
      toast("error", e instanceof Error ? e.message : String(e));
    } finally {
      setResetting(false);
    }
  }

  async function google() {
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : String(e));
      setGoogleLoading(false);
    }
  }

  const groups: Role[] = ["FARMER", "BUYER", "INSPECTOR", "ADMIN"];

  return (
    <div className="min-h-dvh overflow-x-clip bg-[#fafaf7] text-green-950">
      {/* Nav */}
      <header className={cx("fixed inset-x-0 top-0 z-40 transition", scrolled ? "bg-[#fafaf7]/80 backdrop-blur-xl" : "bg-transparent")}>
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-5 sm:px-8">
          <Logo />
          <nav className="ml-auto hidden items-center gap-7 text-sm text-slate-500 md:flex">
            <a href="#problem" className="hover:text-green-950">ปัญหา</a>
            <a href="#features" className="hover:text-green-950">ฟีเจอร์</a>
            <a href="#flow" className="hover:text-green-950">ขั้นตอน</a>
            <a href="#plans" className="hover:text-green-950">แผนบริการ</a>
          </nav>
          <a href="#signin" className="ml-auto rounded-full bg-green-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-green-900 md:ml-0">
            เข้าสู่ระบบ
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="relative mx-auto flex min-h-[100svh] max-w-6xl flex-col justify-center px-5 pt-24 pb-16 sm:px-8">
        <div className="glow-lime pointer-events-none absolute -right-40 top-10 size-[38rem] opacity-70" />
        <div className="relative">
          <div className="animate-rise inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm ring-1 ring-slate-900/[0.06]">
            <span className="size-1.5 rounded-full bg-lime-500" />
            ระบบจัดการดีลก่อนเก็บเกี่ยว สำหรับสวนและผู้ส่งออก
          </div>
          <h1 className="animate-rise mt-6 text-[44px] font-semibold leading-[1.02] tracking-[-0.035em] [animation-delay:80ms] sm:text-7xl lg:text-[92px]">
            Secure Every Harvest.
            <br />
            <span className="text-green-700/50">Trust Every Trade.</span>
          </h1>
          <p className="animate-rise mt-6 max-w-xl text-lg leading-relaxed text-slate-600 [animation-delay:160ms]">
            ล็อกราคาก่อนเก็บ ตรวจเกรดด้วยหลักฐาน ได้เงินตามสัญญา — แทนการตกลงด้วยปากเปล่าที่จบด้วยการกดราคาตอนเก็บเกี่ยว
          </p>
          <div className="animate-rise mt-8 flex flex-wrap items-center gap-3 [animation-delay:240ms]">
            <a href="#signin" className="group inline-flex items-center gap-2 rounded-full bg-green-950 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-green-950/20 transition hover:bg-green-900">
              เริ่มใช้งาน <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
            </a>
            <a href="#features" className="inline-flex items-center gap-2 rounded-full px-5 py-3.5 text-sm font-semibold text-green-950 ring-1 ring-inset ring-slate-900/10 transition hover:bg-white">
              ดูว่าทำงานอย่างไร
            </a>
          </div>
        </div>
        <div className="animate-rise relative mt-16 flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium text-slate-400 [animation-delay:320ms]">
          {KEYWORDS.map((k) => (
            <span key={k}>{k}</span>
          ))}
        </div>
        <a href="#problem" className="absolute bottom-8 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-1 text-xs text-slate-400 sm:flex" aria-label="เลื่อนลง">
          <ArrowDown className="size-4 animate-bounce" />
        </a>
      </section>

      {/* Problem → ERRC */}
      <section id="problem" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-24 sm:px-8 sm:py-32">
        <Reveal>
          <p className="text-sm font-medium text-green-700">ปัญหา</p>
          <h2 className="mt-3 max-w-3xl text-4xl font-semibold leading-tight tracking-[-0.03em] sm:text-6xl">
            ตกลงด้วยปากเปล่า
            <br />
            <span className="text-slate-400">เสียตอนเก็บเกี่ยว</span>
          </h2>
        </Reveal>
        <div className="mt-14 grid gap-10 sm:grid-cols-2">
          {PAINS.map((p, i) => (
            <Reveal key={p.who} delay={i * 120}>
              <div className="border-t border-slate-900/10 pt-6">
                <div className="text-sm text-slate-500">Pain ของ{p.who}</div>
                <ul className="mt-4 space-y-3">
                  {p.items.map((t) => (
                    <li key={t} className="flex items-start gap-3 text-xl font-medium tracking-tight sm:text-2xl">
                      <X className="mt-1.5 size-5 shrink-0 text-red-400" />
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal className="mt-16">
          <div className="grid gap-px overflow-hidden rounded-[28px] bg-slate-900/[0.06] sm:grid-cols-2">
            <div className="bg-[#fafaf7] p-7">
              <div className="text-xs font-semibold tracking-wide text-slate-400">ตัดออก</div>
              <p className="mt-2 text-lg font-medium text-slate-500 line-through decoration-red-300">ตกลงด้วยปากเปล่า · กดราคาตอนเก็บเกี่ยว</p>
            </div>
            <div className="bg-green-950 p-7 text-white">
              <div className="text-xs font-semibold tracking-wide text-lime-300">เพิ่มขึ้น</div>
              <p className="mt-2 text-lg font-medium">ความโปร่งใสของราคา · หลักฐานทุกขั้นตอน · ความมั่นใจว่าได้เงิน</p>
            </div>
          </div>
        </Reveal>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-24 sm:px-8 sm:py-32">
        <Reveal>
          <p className="text-sm font-medium text-green-700">AgriGuard</p>
          <h2 className="mt-3 max-w-3xl text-4xl font-semibold leading-tight tracking-[-0.03em] sm:text-6xl">
            สัญญา + QC + หลักฐาน + trace
            <br />
            <span className="text-slate-400">ในที่เดียว</span>
          </h2>
        </Reveal>
        <ol className="mt-14 border-b border-slate-900/10">
          {FEATURES.map((f, i) => (
            <Reveal as="li" key={f.name} delay={i * 40} className="group grid gap-2 border-t border-slate-900/10 py-7 sm:grid-cols-[4rem_14rem_1fr] sm:items-baseline sm:gap-6">
              <span className="tabular text-sm text-slate-400">{String(i + 1).padStart(2, "0")}</span>
              <span className="text-2xl font-semibold tracking-tight transition group-hover:text-green-700 sm:text-[28px]">{f.name}</span>
              <span>
                <span className="block text-lg font-medium text-green-950">{f.title}</span>
                <span className="mt-1 block text-slate-500">{f.body}</span>
              </span>
            </Reveal>
          ))}
        </ol>
      </section>

      {/* Flow */}
      <section id="flow" className="scroll-mt-20 py-24 sm:py-32">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <Reveal>
            <p className="text-sm font-medium text-green-700">ขั้นตอน</p>
            <h2 className="mt-3 text-4xl font-semibold leading-tight tracking-[-0.03em] sm:text-6xl">
              10 ขั้น <span className="text-slate-400">ครบทุกดีล</span>
            </h2>
          </Reveal>
        </div>
        <Reveal className="mt-12">
          <ol className="no-scrollbar mx-auto flex max-w-6xl snap-x gap-3 overflow-x-auto px-5 pb-2 sm:px-8">
            {FLOW.map((s, i) => (
              <li
                key={s}
                className={cx(
                  "flex w-40 shrink-0 snap-start flex-col justify-between rounded-[24px] p-5 sm:w-44",
                  ["HarvestLock", "GradeProof", "AgriTrust"].includes(s) ? "bg-green-950 text-white" : "bg-white ring-1 ring-slate-900/[0.06]",
                )}
              >
                <span className={cx("tabular text-xs", ["HarvestLock", "GradeProof", "AgriTrust"].includes(s) ? "text-lime-300" : "text-slate-400")}>{String(i + 1).padStart(2, "0")}</span>
                <span className="mt-10 text-lg font-semibold tracking-tight">{s}</span>
              </li>
            ))}
          </ol>
        </Reveal>
      </section>

      {/* Numbers */}
      <section className="px-3 sm:px-5">
        <div className="relative mx-auto max-w-[88rem] overflow-hidden rounded-[36px] bg-green-950 px-5 py-20 text-white sm:px-8 sm:py-28">
          <div className="glow-lime pointer-events-none absolute -left-40 -top-40 size-[36rem] opacity-60" />
          <div className="relative mx-auto max-w-6xl">
            <Reveal>
              <h2 className="max-w-3xl text-4xl font-semibold leading-tight tracking-[-0.03em] sm:text-5xl">
                ตลาดใหญ่ และปัญหามีจริง
              </h2>
              <p className="mt-4 max-w-xl text-green-100/70">เริ่มจากผู้ส่งออกที่ต้องมี trace ส่งจีน แล้วให้ผู้ซื้อพาสวนที่ซื้ออยู่แล้วเข้ามาในระบบ</p>
            </Reveal>
            <div className="mt-14 grid grid-cols-2 gap-x-6 gap-y-10 lg:grid-cols-4">
              {NUMBERS.map(([n, l], i) => (
                <Reveal key={n} delay={i * 100} className="border-t border-white/15 pt-5">
                  <div className="tabular text-3xl font-semibold tracking-tight text-lime-300 sm:text-4xl">{n}</div>
                  <div className="mt-2 text-sm text-green-100/70">{l}</div>
                </Reveal>
              ))}
            </div>
            <p className="relative mt-12 text-xs text-green-100/40">ที่มา: กระทรวงพาณิชย์, OPS MOAC</p>
          </div>
        </div>
      </section>

      {/* Plans */}
      <section id="plans" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-24 sm:px-8 sm:py-32">
        <Reveal>
          <p className="text-sm font-medium text-green-700">แผนบริการ</p>
          <h2 className="mt-3 max-w-3xl text-4xl font-semibold leading-tight tracking-[-0.03em] sm:text-6xl">
            ฟีเจอร์ที่ปกป้องคุณ
            <br />
            <span className="text-slate-400">ใช้ฟรีเสมอ</span>
          </h2>
        </Reveal>
        <div className="mt-14 grid gap-10 lg:grid-cols-[1fr_1.4fr]">
          <Reveal>
            <div className="text-sm text-slate-500">เกษตรกร · จ่ายเฉพาะเมื่อเงินเข้าแล้ว · ฤดูแรกฟรี</div>
            <PlanRows
              rows={[
                ["Free", "0.5% ต่อดีล", "เพดาน ฿3,000/ดีล · สัญญา หลักฐาน ข้อพิพาท AgriBot ครบ"],
                ["Farm Pro", "฿1,500/ฤดู + 0.3%", "Smart Allocation · พยากรณ์ผลผลิต · AI เกรด · QR trace"],
              ]}
            />
          </Reveal>
          <Reveal delay={120}>
            <div className="text-sm text-slate-500">ผู้ซื้อ & โรงงาน · ล้ง ผู้ส่งออก โรงงานแปรรูป modern trade</div>
            <PlanRows
              rows={[
                ["Basic", "฿0 + 1% ต่อดีล", "ผู้ใช้ 1 คน · สูงสุด 3 สวนต่อคำขอซื้อ"],
                ["Premium", "฿3,000/เดือน + 0.6%", "ทีม 10 คน · Procurement Insights · Supplier scorecard · QR trace ส่งออก"],
                ["Enterprise", "ตามปริมาณ", "หลายโรงงาน · สายอนุมัติ · แผนวัตถุดิบล่วงหน้า · API & ERP · SLA"],
              ]}
              highlight="Enterprise"
            />
          </Reveal>
        </div>
      </section>

      {/* Sign in */}
      <section id="signin" className="scroll-mt-16 px-3 pb-6 sm:px-5">
        <div className="mx-auto max-w-[88rem] rounded-[36px] bg-white px-5 py-16 shadow-[0_1px_2px_rgb(12_31_23/0.04)] ring-1 ring-slate-900/[0.05] sm:px-8 sm:py-24">
          <div className="mx-auto max-w-4xl">
            <Reveal>
              <h2 className="text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">เข้าสู่ระบบ</h2>
              <p className="mt-3 max-w-xl text-slate-500">
                ใช้บัญชี Google หรือเลือกผู้ใช้เดโม — สถานการณ์ตัวอย่าง: สวนกรีนวัลเลย์มีมะม่วงน้ำดอกไม้ 5,000 กก. และผู้ซื้อ 3 รายยื่นข้อเสนอรวม 7,500 กก.
              </p>
              <button
                disabled={!googleEnabled || googleLoading}
                onClick={google}
                title={googleEnabled ? undefined : "ตั้งค่า NEXT_PUBLIC_SUPABASE_URL และ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ก่อน"}
                className="mt-8 inline-flex w-full items-center justify-center gap-3 rounded-full bg-green-950 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-green-900 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 sm:w-auto"
              >
                <GoogleIcon />
                {googleLoading ? "กำลังเปิด Google…" : "เข้าสู่ระบบด้วย Google"}
              </button>
              {!googleEnabled && <p className="mt-2 text-xs text-slate-400">Google sign-in ยังไม่ได้ตั้งค่าในสภาพแวดล้อมนี้</p>}
            </Reveal>

            {demoLoginEnabled && (
              <div className="mt-14">
                <div className="flex items-center gap-4 text-xs font-medium tracking-wide text-slate-400">
                  ผู้ใช้เดโม <span className="h-px flex-1 bg-slate-900/10" />
                </div>
                {error && <div className="mt-6"><ErrorState error={error} /></div>}
                {isLoading && <div className="mt-6 space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}</div>}
                <div className="mt-6 space-y-10">
                  {users &&
                    groups.map((role) => {
                      const list = users.filter((u) => u.role === role);
                      if (!list.length) return null;
                      return (
                        <Reveal key={role}>
                          <div className="mb-2 flex flex-wrap items-baseline gap-x-3">
                            <h3 className="font-semibold">{ROLE[role]}</h3>
                            <span className="text-sm text-slate-400">{ROLE_HINT[role]}</span>
                          </div>
                          <div className="grid gap-x-6 sm:grid-cols-2">
                            {list.map((u) => (
                              <button
                                key={u.id}
                                onClick={() => choose(u)}
                                className="group flex items-center gap-3 border-b border-slate-900/[0.06] py-3 text-left transition hover:border-green-700/40"
                              >
                                <Avatar name={u.name} />
                                <span className="min-w-0 flex-1 leading-tight">
                                  <span className="block truncate font-medium">{u.name}</span>
                                  <span className="block truncate text-sm text-slate-500">{u.organization.name}{u.title ? ` · ${u.title}` : ""}</span>
                                </span>
                                <ArrowUpRight className="size-4 shrink-0 text-slate-300 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-green-700" />
                              </button>
                            ))}
                          </div>
                        </Reveal>
                      );
                    })}
                </div>
                <div className="mt-12 flex flex-wrap items-center gap-3 text-sm text-slate-500">
                  <button onClick={reset} disabled={resetting} className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 font-medium text-green-950 ring-1 ring-inset ring-slate-900/10 transition hover:bg-slate-50 disabled:opacity-60">
                    <RotateCcw className={cx("size-4", resetting && "animate-spin")} />
                    รีเซ็ตข้อมูลเดโม
                  </button>
                  ล้างธุรกรรมทั้งหมดและกลับไปเริ่มสถานการณ์ตัวอย่างใหม่
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
        <div className="text-3xl font-semibold tracking-[-0.03em] sm:text-5xl">
          Secure Every Harvest. <span className="text-slate-400">Trust Every Trade.</span>
        </div>
        <p className="mt-6 text-xs text-slate-400">ต้นแบบ · การชำระเงิน มัดจำ และ e-signature ในระบบเป็นการจำลอง · ราคาแพ็กเกจเป็นข้อเสนอเบื้องต้น</p>
      </footer>
    </div>
  );
}

function PlanRows({ rows, highlight }: { rows: [string, string, string][]; highlight?: string }) {
  return (
    <ul className="mt-4 border-b border-slate-900/10">
      {rows.map(([name, price, body]) => (
        <li key={name} className="grid gap-1 border-t border-slate-900/10 py-5 sm:grid-cols-[8rem_1fr] sm:gap-4">
          <span className={cx("flex items-center gap-2 text-xl font-semibold tracking-tight", name === highlight && "text-green-700")}>
            {name}
          </span>
          <span>
            <span className="block font-medium">{price}</span>
            <span className="mt-0.5 flex items-start gap-1.5 text-sm text-slate-500">
              <Check className="mt-0.5 size-3.5 shrink-0 text-green-600" />
              {body}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path fill="#4285F4" d="M22.6 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.8 3.3-8.1z" />
      <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.8 14.2a6.6 6.6 0 0 1 0-4.3V7.1H2.1a11 11 0 0 0 0 9.9l3.7-2.8z" />
      <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.1l3.7 2.8c.9-2.6 3.3-4.5 6.2-4.5z" />
    </svg>
  );
}
