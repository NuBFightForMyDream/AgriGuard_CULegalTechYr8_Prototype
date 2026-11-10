import { MessagesSquare } from "lucide-react";

/** Desktop placeholder beside the list; on phones the layout shows only the list here. */
export default function ChatHome() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white/60 p-8 text-center text-slate-500">
      <MessagesSquare className="size-10 text-slate-300" />
      <div className="font-medium text-slate-700">เลือกแชททางซ้าย</div>
      <p className="max-w-sm text-sm">คุยกับคู่ค้าได้ในที่เดียว พร้อมเห็นสถานะดีลของกันและกัน หรือถาม AgriBot เรื่องสัญญาและกฎหมาย</p>
    </div>
  );
}
