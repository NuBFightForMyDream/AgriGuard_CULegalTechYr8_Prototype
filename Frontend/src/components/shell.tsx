"use client";

import {
  BadgeCheck,
  ClipboardCheck,
  FileSignature,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  ShieldCheck,
  ShoppingBasket,
  Sprout,
  SplitSquareHorizontal,
  Store,
  Truck,
  Wallet,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SWRConfig } from "swr";
import { ApiError, fetcher } from "@/lib/api";
import { ROLE } from "@/lib/labels";
import { useSession } from "@/lib/session";
import type { Role, User } from "@/lib/types";
import { cx } from "./ui";

type NavItem = { href: string; label: string; icon: React.ElementType };

function navFor(user: User): NavItem[] {
  const common = {
    dashboard: { href: "/dashboard", label: "แดชบอร์ด", icon: LayoutDashboard },
    contracts: { href: "/contracts", label: "สัญญา HarvestLock", icon: FileSignature },
    deliveries: { href: "/deliveries", label: "เก็บเกี่ยว & ขนส่ง", icon: Truck },
    quality: { href: "/quality", label: "GradeProof", icon: ClipboardCheck },
    payments: { href: "/payments", label: "การชำระเงิน", icon: Wallet },
    history: { href: "/history", label: "ประวัติธุรกรรม", icon: History },
  };
  const byRole: Record<Role, NavItem[]> = {
    FARMER: [
      common.dashboard,
      { href: "/produce", label: "ผลผลิตของฉัน", icon: Sprout },
      { href: "/marketplace", label: "ตลาดคำขอซื้อ", icon: Store },
      { href: "/offers", label: "ข้อเสนอซื้อ", icon: ShoppingBasket },
      { href: "/allocation", label: "Smart Allocation", icon: SplitSquareHorizontal },
      common.contracts,
      common.deliveries,
      { ...common.quality, label: "ผล GradeProof" },
      common.payments,
      { href: "/buyers", label: "AgriTrust ผู้ซื้อ", icon: ShieldCheck },
      common.history,
    ],
    BUYER: [
      common.dashboard,
      { href: "/requests", label: "คำขอซื้อ", icon: ShoppingBasket },
      { href: "/farms", label: "ค้นหาสวน", icon: Search },
      { href: "/offers", label: "ข้อเสนอของฉัน", icon: Store },
      { ...common.contracts, label: "คำสั่งซื้อ & HarvestLock" },
      { ...common.deliveries, label: "สินค้าที่กำลังมา" },
      { ...common.quality, label: "ตรวจคุณภาพ" },
      common.payments,
      { href: `/buyers/${user.organization.id}`, label: "AgriTrust ของฉัน", icon: ShieldCheck },
      common.history,
    ],
    INSPECTOR: [
      { ...common.dashboard, label: "คิวตรวจคุณภาพ" },
      { ...common.quality, label: "ผลการตรวจ" },
      common.deliveries,
      common.history,
    ],
    ADMIN: [
      { ...common.dashboard, label: "ภาพรวมแพลตฟอร์ม" },
      { ...common.contracts, label: "ธุรกรรมทั้งหมด" },
      { href: "/buyers", label: "Trust & Risk", icon: ShieldCheck },
      { ...common.history, label: "Audit Logs" },
    ],
  };
  return byRole[user.role];
}

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cx("flex items-center gap-2", className)}>
      <div className="flex size-8 items-center justify-center rounded-lg bg-green-800 text-lime-300">
        <BadgeCheck className="size-5" />
      </div>
      <div className="leading-tight">
        <div className="font-semibold text-slate-900">AgriGuard</div>
        <div className="text-[11px] text-slate-500">Secure Every Harvest</div>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, ready, signOut } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (ready && !user) router.replace("/login");
  }, [ready, user, router]);
  useEffect(() => setOpen(false), [pathname]);

  if (!ready || !user) return null;
  const nav = navFor(user);
  const isActive = (href: string) => pathname === href || (href !== "/dashboard" && pathname.startsWith(href + "/"));

  const sidebar = (
    <nav className="flex h-full flex-col">
      <Logo className="px-5 py-5" />
      <div className="flex-1 space-y-0.5 overflow-y-auto px-3">
        {nav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cx(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium",
              isActive(item.href) ? "bg-green-50 text-green-900" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
            )}
          >
            <item.icon className={cx("size-4", isActive(item.href) ? "text-green-700" : "text-slate-400")} />
            {item.label}
          </Link>
        ))}
      </div>
      <div className="border-t border-slate-200 p-4 text-xs text-slate-500">
        Phase 1 · เดโม — การชำระเงินและลายเซ็นเป็นการจำลอง
      </div>
    </nav>
  );

  return (
    <SWRConfig
      value={{
        fetcher,
        onError: (e) => {
          if (e instanceof ApiError && e.status === 401) signOut();
          if (e instanceof ApiError && e.status === 409 && e.message === "ONBOARDING_REQUIRED") router.replace("/onboarding");
        },
      }}
    >
      <div className="min-h-screen lg:pl-64">
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-slate-200 bg-white lg:block">{sidebar}</aside>
        {open && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-slate-900/40" onClick={() => setOpen(false)} />
            <aside className="absolute inset-y-0 left-0 w-72 bg-white shadow-xl">
              <button className="absolute right-3 top-5 rounded p-1 text-slate-500" onClick={() => setOpen(false)} aria-label="ปิดเมนู">
                <X className="size-5" />
              </button>
              {sidebar}
            </aside>
          </div>
        )}
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6">
          <button className="rounded p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label="เปิดเมนู">
            <Menu className="size-5" />
          </button>
          <Logo className="lg:hidden" />
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right text-sm leading-tight sm:block">
              <div className="font-medium text-slate-900">{user.name}</div>
              <div className="text-xs text-slate-500">
                {ROLE[user.role]} · {user.organization.name}
              </div>
            </div>
            <button
              onClick={() => {
                signOut();
                router.replace("/login");
              }}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50"
            >
              <LogOut className="size-4" />
              <span className="hidden sm:inline">สลับผู้ใช้</span>
            </button>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">{children}</main>
      </div>
    </SWRConfig>
  );
}
