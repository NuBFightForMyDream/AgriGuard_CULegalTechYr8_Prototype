"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";

/** QR label for a lot: encodes only an opaque trace URL, never personal data. */
export function LotQr({ token, code }: { token: string; code: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  useEffect(() => {
    const u = `${window.location.origin}/trace/${token}`;
    setUrl(u);
    QRCode.toDataURL(u, { margin: 1, width: 240, color: { dark: "#111827", light: "#ffffff" } }).then(setSrc).catch(() => {});
  }, [token]);
  if (!src) return null;
  return (
    <div className="flex items-center gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL */}
      <img src={src} alt={`QR ของล็อต ${code}`} className="size-24 rounded border border-slate-200" />
      <div className="min-w-0 text-xs text-slate-500">
        <div className="font-mono text-slate-700">{code}</div>
        <a href={url} target="_blank" rel="noreferrer" className="break-all text-green-800 hover:underline">หน้าตรวจสอบย้อนกลับ</a>
        <div className="mt-1">QR เก็บเพียงลิงก์อ้างอิง ไม่มีข้อมูลส่วนบุคคล</div>
      </div>
    </div>
  );
}
