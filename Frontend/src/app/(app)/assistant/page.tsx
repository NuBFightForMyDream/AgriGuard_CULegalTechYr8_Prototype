"use client";

import { Info } from "lucide-react";
import useSWR from "swr";
import { LegalChat } from "@/components/legal-chat";
import { Card, PageHeader } from "@/components/ui";
import type { AiStatus } from "@/lib/types";

const QUESTIONS = [
  "สัญญา HarvestLock ผูกพันเมื่อไหร่",
  "เปิดข้อพิพาทแล้วคะแนน AgriTrust ลดไหม",
  "ผู้ซื้อใหม่ที่ยังไม่มีประวัติจะได้คะแนนเท่าไร",
  "ลายเซ็นอิเล็กทรอนิกส์ในระบบนี้ใช้ได้ตามกฎหมายไหม",
  "ระบบเก็บข้อมูลส่วนตัวอะไรบ้าง",
];

export default function AssistantPage() {
  const { data: status } = useSWR<AiStatus>("/ai/status");
  return (
    <>
      <PageHeader title="ผู้ช่วยกฎหมาย AI" subtitle="ถามเรื่องกติกาแพลตฟอร์ม สัญญา ข้อพิพาท AgriTrust และข้อมูลส่วนบุคคล — ตอบจากเอกสารที่อนุมัติเท่านั้น พร้อมแหล่งอ้างอิง" />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2"><LegalChat suggestions={QUESTIONS} /></Card>
        <Card title="ข้อควรรู้">
          <ul className="space-y-3 text-sm text-slate-600">
            <li className="flex gap-2"><Info className="mt-0.5 size-4 shrink-0" />ไม่ใช่คำปรึกษาทางกฎหมาย ใช้ประกอบความเข้าใจเท่านั้น</li>
            <li className="flex gap-2"><Info className="mt-0.5 size-4 shrink-0" />ตอบจากเอกสารนโยบายของแพลตฟอร์มและข้อสัญญา ถ้าไม่พบจะบอกว่าไม่พบ ไม่เดาคำตอบ</li>
            <li className="flex gap-2"><Info className="mt-0.5 size-4 shrink-0" />ระบบตัดอีเมลและเบอร์โทรออกก่อนส่งให้ AI และบันทึกทุกคำตอบไว้ตรวจสอบ</li>
            <li className="flex gap-2"><Info className="mt-0.5 size-4 shrink-0" />ถามเรื่องสัญญาฉบับใดฉบับหนึ่งได้ที่หน้าสัญญานั้น (ผู้ช่วยอ่านสัญญา)</li>
          </ul>
          {status && <p className="mt-4 text-xs text-slate-500">{status.available ? `โมเดล ${status.model} (${status.provider === "gemini" ? "Google Gemini" : "Anthropic Claude"})` : "ยังไม่ได้ตั้งค่า AI — จะแสดงเอกสารที่เกี่ยวข้องแทนคำตอบ"}</p>}
        </Card>
      </div>
    </>
  );
}
