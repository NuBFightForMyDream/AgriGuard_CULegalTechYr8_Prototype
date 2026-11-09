"use client";

import { FileText, ImageIcon, Paperclip, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { absoluteUrl, api, upload } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import { ROLE } from "@/lib/labels";
import type { EvidenceFile } from "@/lib/types";
import { useAction } from "@/lib/useAction";
import { Button, Input, Modal } from "./ui";

function useSignedUrl(fileId: string, enabled: boolean) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    api<{ url: string }>(`/files/${fileId}/link`).then((r) => alive && setUrl(absoluteUrl(r.url))).catch(() => {});
    return () => {
      alive = false;
    };
  }, [fileId, enabled]);
  return url;
}

function Thumb({ f, onOpen }: { f: EvidenceFile; onOpen: () => void }) {
  const isImage = f.content_type.startsWith("image/") && f.content_type !== "image/heic";
  const url = useSignedUrl(f.id, isImage);
  return (
    <button onClick={onOpen} className="group flex w-28 flex-col overflow-hidden rounded-lg border border-slate-200 text-left hover:border-green-700" title={f.filename}>
      <div className="flex h-20 items-center justify-center bg-slate-50">
        {isImage && url ? (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL, not optimizable
          <img src={url} alt={f.filename} className="h-full w-full object-cover" />
        ) : f.content_type === "application/pdf" ? (
          <FileText className="size-7 text-slate-400" />
        ) : (
          <ImageIcon className="size-7 text-slate-300" />
        )}
      </div>
      <div className="truncate px-2 py-1 text-[11px] text-slate-600">{f.filename}</div>
    </button>
  );
}

/** Evidence list + uploader for one entity (lot, dispute, settlement). Files are private; links expire in 5 minutes. */
export function EvidencePanel({ files, entityType, entityId, canUpload, label = "หลักฐาน" }: {
  files: EvidenceFile[];
  entityType: EvidenceFile["entity_type"];
  entityId: string;
  canUpload: boolean;
  label?: string;
}) {
  const mine = files.filter((f) => f.entity_type === entityType && f.entity_id === entityId);
  const input = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState("");
  const [open, setOpen] = useState<EvidenceFile | null>(null);
  const { run, pending } = useAction();
  const openUrl = useSignedUrl(open?.id ?? "", !!open);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    for (const file of picked) {
      const form = new FormData();
      form.append("entity_type", entityType);
      form.append("entity_id", entityId);
      if (note) form.append("note", note);
      form.append("file", file);
      await run(() => upload(`/files`, form), `แนบ ${file.name} แล้ว`);
    }
    setNote("");
    if (input.current) input.current.value = "";
  }

  return (
    <div className="text-sm">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-slate-500"><Paperclip className="size-3.5" />{label} ({mine.length})</div>
      {mine.length > 0 && <div className="flex flex-wrap gap-2">{mine.map((f) => <Thumb key={f.id} f={f} onOpen={() => setOpen(f)} />)}</div>}
      {canUpload && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="คำอธิบาย (ไม่บังคับ)" className="max-w-[220px] py-1.5" />
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/heic,application/pdf" multiple className="hidden" onChange={onPick} />
          <Button size="sm" variant="secondary" loading={pending} onClick={() => input.current?.click()}><Upload className="size-4" />แนบไฟล์</Button>
          <span className="text-xs text-slate-400">รูปภาพหรือ PDF ไม่เกิน 10 MB</span>
        </div>
      )}
      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.filename ?? ""} wide>
        {open && (
          <div className="space-y-3 text-sm">
            {open.content_type.startsWith("image/") && openUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
              <img src={openUrl} alt={open.filename} className="max-h-[60vh] w-full rounded-lg object-contain" />
            ) : openUrl ? (
              <a href={openUrl} target="_blank" rel="noreferrer" className="text-green-800 underline">เปิดไฟล์ (ลิงก์หมดอายุใน 5 นาที)</a>
            ) : null}
            {open.note && <p>{open.note}</p>}
            <p className="text-xs text-slate-500">
              แนบโดย {open.uploaded_by.name} ({ROLE[open.uploaded_by.role]}) · {fmtDateTime(open.created_at)} · {(open.size_bytes / 1024).toFixed(0)} KB
            </p>
            <p className="break-all font-mono text-xs text-slate-500">SHA-256 {open.sha256}</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
