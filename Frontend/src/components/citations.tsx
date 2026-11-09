"use client";

import { FileText, ScrollText } from "lucide-react";
import { useState } from "react";
import type { Citation } from "@/lib/types";
import { cx } from "./ui";

/** Source chips under an AI answer; click to read the exact source text. */
export function Citations({ items }: { items: Citation[] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!items.length) return null;
  const shown = items.find((c) => c.id === open);
  return (
    <div className="mt-2">
      <div className="flex flex-wrap gap-1.5">
        {items.map((c) => (
          <button
            key={c.id}
            onClick={() => setOpen(open === c.id ? null : c.id)}
            className={cx(
              "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] ring-1 ring-inset",
              c.kind === "contract" ? "bg-sky-50 text-sky-800 ring-sky-200" : "bg-slate-50 text-slate-700 ring-slate-200",
              open === c.id && "ring-2",
            )}
            title={c.title}
          >
            {c.kind === "contract" ? <ScrollText className="size-3" /> : <FileText className="size-3" />}
            {c.kind === "contract" ? `สัญญา: ${c.title}` : c.title.split(" — ")[1] ?? c.title}
          </button>
        ))}
      </div>
      {shown && (
        <blockquote className="mt-2 rounded-md border-l-2 border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <div className="mb-0.5 font-medium text-slate-700">{shown.title}</div>
          {shown.quote}
        </blockquote>
      )}
    </div>
  );
}
