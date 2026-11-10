"use client";

import {
  Activity,
  BadgeCheck,
  Bot,
  ClipboardCheck,
  ClipboardList,
  FileSignature,
  History,
  Home,
  LayoutGrid,
  LogOut,
  MessageCircle,
  MessagesSquare,
  Scale,
  Search,
  ShieldCheck,
  ShoppingBasket,
  Siren,
  Sprout,
  Truck,
  Users,
  Wallet,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import useSWR, { SWRConfig } from "swr";
import { ApiError, fetcher } from "@/lib/api";
import { ROLE } from "@/lib/labels";
import { useSession } from "@/lib/session";
import type { Role, User } from "@/lib/types";
import { NavChat } from "./nav-chat";
import { NotificationBell } from "./notifications";
import { Avatar, cx } from "./ui";

type NavItem = { href: string; label: string; icon: React.ElementType; short?: string; also?: string[] };

/** The five tabs from the app sketch: home, search, chat, status, community. */
function tabsFor(user: User): NavItem[] {
  const home = { href: "/dashboard", label: "หน้าแรก", short: "หน้าแรก", icon: Home };
  const chat = { href: "/chat", label: "แชท", short: "แชท", icon: MessageCircle };
  const status = { href: "/status", label: "สถานะการซื้อขาย", short: "สถานะ", icon: Activity };
  const community = { href: "/community", label: "ชุมชน", short: "ชุมชน", icon: MessagesSquare };
  const byRole: Record<Role, NavItem[]> = {
    FARMER: [home, { href: "/marketplace", label: "ค้นหาผู้ซื้อ", short: "ค้นหา", icon: Search }, chat, status, community],
    BUYER: [home, { href: "/farms", label: "ค้นหาสวน", short: "ค้นหา", icon: Search }, chat, status, community],
    INSPECTOR: [{ ...home, label: "คิวตรวจคุณภาพ" }, { href: "/quality", label: "ผลการตรวจ", short: "ผลตรวจ", icon: ClipboardCheck }, { href: "/disputes", label: "ตรวจซ้ำ", short: "ตรวจซ้ำ", icon: Scale }, community],
    ADMIN: [{ ...home, label: "ภาพรวม" }, { href: "/contracts", label: "ธุรกรรมทั้งหมด", short: "ธุรกรรม", icon: FileSignature }, { href: "/disputes", label: "ข้อพิพาท", short: "ข้อพิพาท", icon: Scale }, community],
  };
  return byRole[user.role];
}

/** The few tools not in the tabs (desktop "เครื่องมือ", phone menu sheet). Related pages share one item and show tabs (SubNav). */
function toolsFor(user: User): NavItem[] {
  const c = {
    payments: { href: "/payments", label: "การชำระเงิน", icon: Wallet },
    disputes: { href: "/disputes", label: "ข้อพิพาท", icon: Scale },
    history: { href: "/history", label: "ประวัติธุรกรรม", icon: History },
    law: { href: "/chat/agribot", label: "AgriBot", icon: Bot },
  };
  const byRole: Record<Role, NavItem[]> = {
    FARMER: [
      { href: "/produce", label: "ผลผลิตของฉัน", icon: Sprout },
      { href: "/offers", label: "ข้อเสนอ & จัดสรร", icon: ShoppingBasket, also: ["/allocation"] },
      { href: "/deliveries", label: "ขนส่ง & ผลตรวจ", icon: Truck, also: ["/quality"] },
      c.payments,
      c.disputes,
      c.history,
    ],
    BUYER: [
      { href: "/requests", label: "คำขอซื้อ & ข้อเสนอ", icon: ShoppingBasket, also: ["/offers"] },
      { href: "/deliveries", label: "รับของ & ผลตรวจ", icon: Truck, also: ["/quality"] },
      c.payments,
      c.disputes,
      { href: `/buyers/${user.organization.id}`, label: "AgriTrust ของฉัน", icon: ShieldCheck },
      c.history,
    ],
    INSPECTOR: [{ href: "/deliveries", label: "ล็อตที่กำลังขนส่ง", icon: Truck }, c.law, c.history],
    ADMIN: [
      { href: "/admin/users", label: "ผู้ใช้ & องค์กร", icon: Users, also: ["/admin/verification"] },
      { href: "/admin/quality", label: "มาตรฐานคุณภาพ", icon: ClipboardList },
      { href: "/admin/risk", label: "AgriTrust & ความเสี่ยง", icon: Siren, also: ["/admin/appeals", "/buyers"] },
      c.law,
      { ...c.history, label: "Audit Logs" },
    ],
  };
  return byRole[user.role];
}

export function Logo({ className, light }: { className?: string; light?: boolean }) {
  return (
    <div className={cx("flex items-center gap-2", className)}>
      <div className="flex size-8 items-center justify-center rounded-xl bg-green-800 text-lime-300 shadow-sm">
        <BadgeCheck className="size-5" />
      </div>
      <div className="leading-tight">
        <div className={cx("font-semibold", light ? "text-white" : "text-slate-900")}>AgriGuard</div>
        <div className={cx("text-[11px]", light ? "text-green-100" : "text-slate-500")}>Secure Every Harvest</div>
      </div>
    </div>
  );
}

function useUnreadChats(user: User) {
  const trader = user.role === "FARMER" || user.role === "BUYER";
  const { data } = useSWR<{ unread: number }>(trader ? "/chats/unread" : null, { refreshInterval: 10000 });
  return data?.unread ?? 0;
}

function Dot({ n, className }: { n: number; className?: string }) {
  if (!n) return null;
  return (
    <span className={cx("flex min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-[18px] text-white", className)}>
      {n > 9 ? "9+" : n}
    </span>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, ready, signOut } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (ready && !user) router.replace("/login");
  }, [ready, user, router]);

  if (!ready || !user) return null;
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
      <Frame user={user}>{children}</Frame>
    </SWRConfig>
  );
}

function Frame({ user, children }: { user: User; children: React.ReactNode }) {
  const { signOut } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [menu, setMenu] = useState(false);
  const unread = useUnreadChats(user);
  useEffect(() => setMenu(false), [pathname]);

  const tabs = tabsFor(user);
  const tools = toolsFor(user);
  const hit = (href: string) => pathname === href || (href !== "/dashboard" && pathname.startsWith(href + "/"));
  const isActive = (href: string, also: string[] = []) => hit(href) || also.some(hit);
  const leave = () => {
    signOut();
    router.replace("/login");
  };
  // Full-height screens (a chat thread) hide the phone header/tab bar padding.
  const immersive = /^\/chat\/.+/.test(pathname);

  const navLink = (item: NavItem, badge = 0) => (
    <Link
      key={item.href}
      href={item.href}
      className={cx(
        "flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition",
        isActive(item.href, item.also) ? "bg-green-800 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
      )}
    >
      <item.icon className={cx("size-4", isActive(item.href, item.also) ? "text-lime-300" : "text-slate-400")} />
      <span className="flex-1">{item.label}</span>
      <Dot n={badge} />
    </Link>
  );

  const profile = (
    <div className="flex items-center gap-3">
      <Avatar name={user.name} />
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-sm font-semibold text-slate-900">{user.name}</div>
        <div className="truncate text-xs text-slate-500">{ROLE[user.role]} · {user.organization.name}</div>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh lg:pl-72 print:pl-0">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 flex-col border-r border-slate-200/80 bg-white lg:flex print:hidden">
        <Logo className="px-5 py-5" />
        <div className="flex-1 space-y-6 overflow-y-auto px-3 pb-4">
          <div className="space-y-1">
            <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">เมนูหลัก</div>
            {tabs.map((t) => navLink(t, t.href === "/chat" ? unread : 0))}
          </div>
          <div className="space-y-1">
            <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">เครื่องมือ</div>
            {tools.map((t) => navLink(t))}
          </div>
        </div>
        <div className="space-y-3 border-t border-slate-200/80 p-4">
          {profile}
          <button onClick={leave} className="flex w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50">
            <LogOut className="size-4" />
            สลับผู้ใช้ / ออกจากระบบ
          </button>
        </div>
      </aside>

      {/* Top bar: phone shows the logo, desktop shows only actions */}
      <header className={cx("sticky top-0 z-20 h-14 items-center gap-3 border-b border-slate-200/70 bg-white/85 px-4 backdrop-blur sm:px-6 print:hidden", immersive ? "hidden lg:flex" : "flex")}>
        <Logo className="lg:hidden" />
        <div className="ml-auto flex items-center gap-2">
          <NotificationBell />
          <button onClick={() => setMenu(true)} className="rounded-full lg:hidden" aria-label="เปิดเมนู">
            <Avatar name={user.name} size="sm" />
          </button>
          <div className="hidden items-center gap-2 lg:flex">
            <span className="text-right text-sm leading-tight">
              <span className="block font-medium text-slate-900">{user.name}</span>
              <span className="block text-xs text-slate-500">{ROLE[user.role]}</span>
            </span>
            <Avatar name={user.name} size="sm" />
          </div>
        </div>
      </header>

      <main className={cx("mx-auto max-w-7xl print:p-0", immersive ? "lg:px-6 lg:py-6" : "px-4 py-5 pb-28 sm:px-6 lg:py-8 lg:pb-12")}>{children}</main>

      {/* Phone bottom tab bar (from the sketch) */}
      <nav
        className={cx(
          "fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/80 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden print:hidden",
          immersive && "hidden",
        )}
        aria-label="เมนูหลัก"
      >
        <div className="mx-auto grid max-w-md grid-cols-5 px-1">
          {tabs.map((t) => {
            const active = isActive(t.href);
            if (t.href === "/chat") {
              return (
                <Link key={t.href} href={t.href} className="relative -mt-5 flex flex-col items-center gap-0.5" aria-current={active ? "page" : undefined}>
                  <span className={cx("flex size-14 items-center justify-center rounded-full text-white shadow-lg shadow-green-900/25 ring-4 ring-white", active ? "bg-green-900" : "bg-green-800")}>
                    <t.icon className="size-6" />
                  </span>
                  <span className={cx("text-[11px] font-medium", active ? "text-green-900" : "text-slate-500")}>{t.short}</span>
                  <Dot n={unread} className="absolute right-3 top-0" />
                </Link>
              );
            }
            return (
              <Link key={t.href} href={t.href} className="flex flex-col items-center gap-0.5 py-2" aria-current={active ? "page" : undefined}>
                <span className={cx("flex h-7 w-12 items-center justify-center rounded-full transition", active && "bg-green-100")}>
                  <t.icon className={cx("size-5", active ? "text-green-800" : "text-slate-400")} />
                </span>
                <span className={cx("text-[11px] font-medium", active ? "text-green-900" : "text-slate-500")}>{t.short}</span>
              </Link>
            );
          })}
          {tabs.length < 5 && (
            <button onClick={() => setMenu(true)} className="flex flex-col items-center gap-0.5 py-2">
              <span className="flex h-7 w-12 items-center justify-center"><LayoutGrid className="size-5 text-slate-400" /></span>
              <span className="text-[11px] font-medium text-slate-500">เมนู</span>
            </button>
          )}
        </div>
      </nav>

      {/* Phone menu sheet: profile + every tool */}
      {menu && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setMenu(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-3xl bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl">
            <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-slate-200" />
            <div className="flex items-start justify-between gap-3">
              {profile}
              <button onClick={() => setMenu(false)} className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100" aria-label="ปิดเมนู"><X className="size-5" /></button>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-2">
              {tools.map((t) => (
                <Link key={t.href} href={t.href} className={cx("flex flex-col items-center gap-1.5 rounded-2xl p-3 text-center text-xs font-medium", isActive(t.href, t.also) ? "bg-green-50 text-green-900" : "bg-slate-50 text-slate-700")}>
                  <t.icon className="size-5 text-green-800" />
                  {t.label}
                </Link>
              ))}
            </div>
            <button onClick={leave} className="mt-5 flex w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm text-slate-600 ring-1 ring-inset ring-slate-200">
              <LogOut className="size-4" />
              สลับผู้ใช้ / ออกจากระบบ
            </button>
          </div>
        </div>
      )}
      <NavChat />
    </div>
  );
}
