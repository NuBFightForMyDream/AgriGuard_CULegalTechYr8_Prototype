"use client";

import { Loader2, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import type { Tone } from "@/lib/labels";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

const TONES: Record<Tone, string> = {
  gray: "bg-slate-100 text-slate-700 ring-slate-200",
  green: "bg-green-50 text-green-800 ring-green-200",
  lime: "bg-lime-50 text-lime-800 ring-lime-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  blue: "bg-sky-50 text-sky-800 ring-sky-200",
  violet: "bg-violet-50 text-violet-800 ring-violet-200",
};

export function Badge({ tone = "gray", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", TONES[tone], className)}>
      {children}
    </span>
  );
}

export function StatusBadge({ map, value }: { map: Record<string, [string, Tone]>; value: string }) {
  const [label, tone] = map[value] ?? [value, "gray"];
  return <Badge tone={tone}>{label}</Badge>;
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  loading?: boolean;
};

const VARIANTS = {
  primary: "bg-green-800 text-white hover:bg-green-900 disabled:bg-green-800/50",
  secondary: "bg-white text-slate-800 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 disabled:text-slate-400",
  ghost: "text-slate-700 hover:bg-slate-100 disabled:text-slate-400",
  danger: "bg-white text-red-600 ring-1 ring-inset ring-red-200 hover:bg-red-50 disabled:text-red-300",
};

export function Button({ variant = "primary", size = "md", loading, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-xl font-medium transition-colors disabled:cursor-not-allowed",
        size === "sm" ? "px-2.5 py-1.5 text-sm" : "px-4 py-2 text-sm",
        VARIANTS[variant],
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

export function LinkButton({ href, variant = "primary", size = "md", className, children }: { href: string; variant?: ButtonProps["variant"]; size?: "sm" | "md"; className?: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-xl font-medium transition-colors",
        size === "sm" ? "px-2.5 py-1.5 text-sm" : "px-4 py-2 text-sm",
        VARIANTS[variant ?? "primary"],
        className,
      )}
    >
      {children}
    </Link>
  );
}

export function Card({ title, action, children, className, bodyClassName }: { title?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <section className={cx("min-w-0 rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-900/[0.03]", className)}>
      {(title || action) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3.5">
          <h2 className="text-[15px] font-semibold text-slate-900">{title}</h2>
          {action}
        </header>
      )}
      <div className={bodyClassName ?? "p-5"}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; eyebrow?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-sm text-slate-500">{eyebrow}</div>}
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, icon, tone }: { label: string; value: React.ReactNode; hint?: React.ReactNode; icon?: React.ReactNode; tone?: "default" | "warn" }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-900/[0.03]">
      <div className="flex items-center justify-between text-sm text-slate-500">
        <span>{label}</span>
        {icon && <span className={tone === "warn" ? "text-amber-500" : "text-green-700"}>{icon}</span>}
      </div>
      <div className="tabular mt-2 text-2xl font-semibold text-slate-900">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

export function Empty({ icon, title, children }: { icon?: React.ReactNode; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      {icon && <div className="text-slate-300">{icon}</div>}
      <div className="font-medium text-slate-700">{title}</div>
      {children && <div className="max-w-md text-sm text-slate-500">{children}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-lg bg-slate-200/70", className)} />;
}

export function PageSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-64" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}

export function ErrorState({ error }: { error: Error }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
      โหลดข้อมูลไม่สำเร็จ: {error.message}
    </div>
  );
}

export function Field({ label, hint, error, children, className, group }: { label: string; hint?: React.ReactNode; error?: string | null; children: React.ReactNode; className?: string; group?: boolean }) {
  // `group` for button groups: a <label> would forward clicks to (and name) only the first button.
  const Tag = group ? "div" : "label";
  return (
    <Tag className={cx("block text-sm", className)} {...(group ? { role: "group", "aria-label": label } : {})}>
      <span className="mb-1 block font-medium text-slate-700">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </Tag>
  );
}

const inputCls =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-green-700 focus:ring-2 focus:ring-green-700/20 disabled:bg-slate-50";

export const Input = (p: React.InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cx(inputCls, p.className)} />;
export const Select = (p: React.SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cx(inputCls, p.className)} />;
export const Textarea = (p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea rows={3} {...p} className={cx(inputCls, p.className)} />;

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={cx("m-auto w-[calc(100%-2rem)] rounded-xl p-0 shadow-xl backdrop:bg-slate-900/40", wide ? "max-w-2xl" : "max-w-lg")}
    >
      {open && (
        <div>
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
            <h2 className="font-semibold">{title}</h2>
            <button onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="ปิด">
              <X className="size-4" />
            </button>
          </div>
          <div className="max-h-[75vh] overflow-y-auto p-5">{children}</div>
        </div>
      )}
    </dialog>
  );
}

/** Stacked bar for supply states (estimated vs reserved vs contracted). */
export function SegmentBar({ segments, total }: { segments: { value: number; className: string; label: string }[]; total: number }) {
  return (
    <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100" role="img" aria-label={segments.map((s) => `${s.label} ${s.value}`).join(", ")}>
      {segments.map((s) =>
        s.value > 0 ? <div key={s.label} className={s.className} style={{ width: `${Math.min(100, (s.value / total) * 100)}%` }} title={s.label} /> : null,
      )}
    </div>
  );
}

export function Meter({ value, className }: { value: number; className?: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
      <div className={cx("h-full rounded-full bg-green-600", className)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function DL({ items, cols = 2 }: { items: [React.ReactNode, React.ReactNode][]; cols?: 1 | 2 | 3 }) {
  return (
    <dl className={cx("grid gap-x-6 gap-y-3 text-sm", cols === 3 ? "sm:grid-cols-3" : cols === 2 ? "sm:grid-cols-2" : "")}>
      {items.map(([k, v], i) => (
        <div key={i} className="min-w-0">
          <dt className="text-slate-500">{k}</dt>
          <dd className="mt-0.5 font-medium text-slate-900">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Table({ head, children }: { head: React.ReactNode[]; children: React.ReactNode }) {
  return (
    <div className="-mx-5 overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
            {head.map((h, i) => (
              <th key={i} className="whitespace-nowrap px-5 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  );
}

export const Td = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <td className={cx("whitespace-nowrap px-5 py-3 align-middle", className)}>{children}</td>
);

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: string; count?: number }[] }) {
  return (
    <div className="mb-4 flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1 text-sm">
      {tabs.map((t) => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={cx("rounded-lg px-3 py-1.5 font-medium", value === t.value ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900")}
        >
          {t.label}
          {t.count !== undefined && <span className="ml-1.5 text-xs text-slate-400">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

const AVATAR_TONES = [
  "bg-green-100 text-green-800",
  "bg-sky-100 text-sky-800",
  "bg-amber-100 text-amber-800",
  "bg-violet-100 text-violet-800",
  "bg-rose-100 text-rose-800",
  "bg-teal-100 text-teal-800",
];

/** First visible letter: skips Thai leading vowels (เ แ โ ใ ไ) and bracketed prefixes. */
export function initial(name: string): string {
  const s = name.replace(/^[\s(]+/, "");
  const ch = [...s].find((c) => !"เแโใไ".includes(c)) ?? "?";
  return ch.toUpperCase();
}

export function Avatar({ name, size = "md", className, icon }: { name: string; size?: "sm" | "md" | "lg" | "xl"; className?: string; icon?: React.ReactNode }) {
  const hash = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const sizes = { sm: "size-8 text-sm", md: "size-10 text-base", lg: "size-12 text-lg", xl: "size-16 text-2xl" };
  return (
    <span className={cx("inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold", sizes[size], AVATAR_TONES[hash % AVATAR_TONES.length], className)} aria-hidden>
      {icon ?? initial(name)}
    </span>
  );
}

/** Horizontal filter chips (scrolls sideways on phones). */
export function Chips<T extends string>({ value, onChange, items, className }: { value: T; onChange: (v: T) => void; items: { value: T; label: string; count?: number }[]; className?: string }) {
  return (
    <div className={cx("-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0", className)} role="tablist">
      {items.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cx(
            "shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium ring-1 ring-inset transition",
            value === t.value ? "bg-green-800 text-white ring-green-800" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50",
          )}
        >
          {t.label}
          {t.count !== undefined && <span className={cx("ml-1.5 text-xs", value === t.value ? "text-green-100" : "text-slate-400")}>{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** Link tabs joining pages that share one menu item (e.g. offers + allocation). */
export function SubNav({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <nav className="mb-4 flex gap-1 overflow-x-auto rounded-xl bg-white p-1 shadow-sm ring-1 ring-slate-200/80 sm:w-fit" aria-label="หน้าย่อย">
      {items.map((i) => {
        const active = pathname === i.href || pathname.startsWith(i.href + "/");
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={active ? "page" : undefined}
            className={cx("shrink-0 whitespace-nowrap rounded-lg px-4 py-1.5 text-sm font-medium", active ? "bg-green-800 text-white" : "text-slate-600 hover:bg-slate-50")}
          >
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
