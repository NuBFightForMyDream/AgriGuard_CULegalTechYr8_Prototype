"use client";

import { Scale } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { post } from "@/lib/api";
import { DISPUTE_CATEGORY } from "@/lib/labels";
import type { ContractDetail, DisputeDetail } from "@/lib/types";
import { useAction } from "@/lib/useAction";
import { Button, Field, Input, Modal, Select, Textarea } from "./ui";

export function OpenDisputeButton({ c }: { c: ContractDetail }) {
  const [open, setOpen] = useState(false);
  const { run, pending } = useAction();
  const router = useRouter();
  if (!c.actions.includes("OPEN_DISPUTE")) return null;
  return (
    <>
      <Button variant="danger" size="sm" onClick={() => setOpen(true)}>
        <Scale className="size-4" />
        เปิดข้อพิพาท
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={`เปิดข้อพิพาท · ${c.code}`} wide>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const d = await run(
              () =>
                post<DisputeDetail>(`/contracts/${c.id}/disputes`, {
                  category: f.get("category"),
                  description: f.get("description"),
                  disputed_amount: Number(f.get("disputed_amount") || 0),
                  evidence_note: f.get("evidence_note") || null,
                }),
              "เปิดข้อพิพาทแล้ว — อีกฝ่ายมีเวลาชี้แจง 48 ชั่วโมง",
            );
            if (d) router.push(`/disputes/${d.id}`);
          }}
        >
          <p className="text-sm text-slate-600">
            คำสั่งซื้อจะถูกระงับชั่วคราว ยอดที่โต้แย้งถูกกันไว้จากการชำระ ทั้งสองฝ่ายส่งคำชี้แจงและหลักฐาน แล้วผู้ตรวจทานของแพลตฟอร์มพิจารณา การเปิดข้อพิพาทไม่หักคะแนน AgriTrust ของใคร
          </p>
          <Field label="ประเภทข้อพิพาท">
            <Select name="category" required>
              {Object.entries(DISPUTE_CATEGORY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
          <Field label="รายละเอียด"><Textarea name="description" required minLength={10} rows={4} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="ยอดที่โต้แย้ง (บาท)" hint="ถ้ามี — ระบบกันยอดนี้ไว้จากยอดค้างชำระ"><Input name="disputed_amount" type="number" min="0" step="0.01" /></Field>
            <Field label="หลักฐาน" hint="Phase 2: แนบไฟล์ได้ในหน้าข้อพิพาท"><Input name="evidence_note" placeholder="เช่น ภาพก่อนขนส่ง 8 ภาพ" /></Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>ยกเลิก</Button>
            <Button type="submit" variant="danger" loading={pending}>เปิดข้อพิพาท</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
