"""Navigation chatbot: understands what the user wants to do and links to the right page.

Destinations come only from a fixed, role-filtered catalog plus the user's own pending tasks (the Backend reads
them from the database and passes them in as Dest objects with ids "task:..."), so the bot can never send anyone to a page that does not exist or that their role cannot use.
Works without an AI key (keyword matching); with a key, the model picks destinations by id and writes the reply,
and every id is validated before it reaches the user.
"""

from dataclasses import dataclass

from agriguard_ai.providers import redact
from agriguard_ai.retrieval import grams

PROMPT_VERSION = "nav-v1"


@dataclass(frozen=True)
class Dest:
    id: str
    route: str
    label: str
    description: str
    keywords: str = ""


ALL = "FARMER BUYER INSPECTOR ADMIN"
CATALOG: list[tuple[str, Dest]] = [
    (ALL, Dest("dashboard", "/dashboard", "แดชบอร์ด", "ภาพรวมงาน ตัวเลขสำคัญ และความเคลื่อนไหวล่าสุด", "หน้าแรก ภาพรวม สรุป")),
    ("FARMER", Dest("produce", "/produce", "ผลผลิตของฉัน", "ดูประกาศผลผลิต ปริมาณที่จองแล้ว ทำสัญญาแล้ว และที่ยังว่าง", "สต็อก ผลผลิต ประกาศ ของที่มี")),
    ("FARMER", Dest("produce_new", "/produce/new", "ลงประกาศผลผลิต", "ลงขายผลผลิตที่คาดว่าจะเก็บเกี่ยว เพื่อให้ผู้ซื้อยื่นข้อเสนอ", "ลงขาย ขาย ประกาศใหม่ เพิ่มผลผลิต มะม่วง ทุเรียน มังคุด ลำไย")),
    ("FARMER", Dest("marketplace", "/marketplace", "ตลาดคำขอซื้อ", "ดูว่าผู้ซื้อรายไหนกำลังหาผลผลิตแบบที่คุณมี", "หาผู้ซื้อ ใครอยากซื้อ ตลาด ความต้องการ")),
    ("FARMER", Dest("offers_in", "/offers", "ข้อเสนอซื้อ", "ข้อเสนอที่ผู้ซื้อส่งมา เทียบราคาและ AgriTrust ปฏิเสธได้", "ข้อเสนอ ราคาที่ได้ ใครเสนอ")),
    ("FARMER", Dest("allocation", "/allocation", "Smart Allocation", "แบ่งผลผลิตให้ผู้ซื้อหลายราย แบบกำหนดเอง ตามสัดส่วน รายได้สูงสุด หรือคำนึงความเสี่ยง", "แบ่ง จัดสรร เลือกผู้ซื้อ ขายให้ใคร")),
    ("FARMER BUYER ADMIN", Dest("contracts", "/contracts", "สัญญา HarvestLock", "สัญญาก่อนเก็บเกี่ยวแต่ละฉบับ ลงนาม ติดตามคำสั่งซื้อ แก้ไขสัญญา", "สัญญา ลงนาม เซ็น คำสั่งซื้อ ออเดอร์")),
    ("FARMER INSPECTOR", Dest("deliveries", "/deliveries", "เก็บเกี่ยว & ขนส่ง", "ล็อตที่เก็บเกี่ยว น้ำหนัก การส่ง และ QR ตรวจสอบย้อนกลับ", "ขนส่ง ส่งของ ล็อต เก็บเกี่ยว QR")),
    ("BUYER", Dest("incoming", "/deliveries", "สินค้าที่กำลังมา", "ล็อตที่สวนส่งมา ยืนยันรับสินค้าและน้ำหนัก", "ของมาเมื่อไร รับของ ขนส่ง")),
    ("FARMER BUYER INSPECTOR", Dest("quality", "/quality", "GradeProof (ตรวจคุณภาพ)", "ผลตรวจคุณภาพแยกเกรด เทียบกับสัญญา และคิวรอตรวจ", "คุณภาพ เกรด ตรวจ QC ของเสีย ปฏิเสธสินค้า")),
    ("FARMER BUYER", Dest("payments", "/payments", "การชำระเงิน", "ยอดที่คำนวณจากผลตรวจ ยอดค้าง กำหนดชำระ (จำลอง)", "เงิน จ่าย ชำระ โอน ยอดค้าง ได้เงินเมื่อไร")),
    ("FARMER BUYER INSPECTOR ADMIN", Dest("disputes", "/disputes", "ข้อพิพาท", "เรื่องที่โต้แย้งกัน ส่งคำชี้แจง ติดตามผลพิจารณา", "ร้องเรียน โต้แย้ง ไม่ยุติธรรม ข้อพิพาท ปัญหา")),
    ("FARMER ADMIN", Dest("buyers", "/buyers", "AgriTrust ผู้ซื้อ", "ดูความน่าเชื่อถือของผู้ซื้อจากธุรกรรมที่ตรวจสอบแล้ว", "เชื่อถือได้ไหม ผู้ซื้อดีไหม คะแนน trust")),
    ("BUYER", Dest("requests", "/requests", "คำขอซื้อ", "คำขอซื้อของบริษัทและสวนที่ระบบจับคู่ให้", "คำขอซื้อ หาสวน ต้องการซื้อ")),
    ("BUYER", Dest("requests_new", "/requests/new", "สร้างคำขอซื้อ", "บอกความต้องการ ปริมาณ เกรด ช่วงรับสินค้า แล้วระบบจับคู่สวนให้", "อยากซื้อ ต้องการซื้อ สั่งซื้อ หาผลผลิต มะม่วง ทุเรียน")),
    ("BUYER", Dest("farms", "/farms", "ค้นหาสวน", "ดูผลผลิตที่สวนประกาศไว้และส่งข้อเสนอ", "หาสวน ค้นหา เกษตรกร ผู้ขาย")),
    ("BUYER", Dest("offers_out", "/offers", "ข้อเสนอของฉัน", "ข้อเสนอที่ส่งให้สวน สถานะ และถอนข้อเสนอ", "ข้อเสนอ ยื่นราคา")),
    ("BUYER", Dest("my_trust", "/buyers/{org}", "AgriTrust ของฉัน", "คะแนนความน่าเชื่อถือของบริษัท ที่มาของคะแนน และการอุทธรณ์", "คะแนน trust อุทธรณ์ ความน่าเชื่อถือ")),
    ("FARMER BUYER INSPECTOR ADMIN", Dest("history", "/history", "ประวัติธุรกรรม", "บันทึกทุกการเปลี่ยนแปลง ใครทำอะไรเมื่อไร", "ประวัติ ย้อนหลัง log บันทึก")),
    ("FARMER BUYER INSPECTOR ADMIN", Dest("assistant", "/assistant", "ผู้ช่วยกฎหมาย AI", "ถามเรื่องสัญญา กติกา ข้อพิพาท AgriTrust และข้อมูลส่วนบุคคล พร้อมแหล่งอ้างอิง", "กฎหมาย สิทธิ ข้อกฎหมาย สัญญาผูกพันไหม PDPA ลายเซ็น")),
    ("ADMIN", Dest("admin_users", "/admin/users", "ผู้ใช้และสิทธิ์", "ให้สิทธิ์ผู้ตรวจคุณภาพหรือผู้ดูแล", "ผู้ใช้ สิทธิ์ role")),
    ("ADMIN", Dest("admin_verify", "/admin/verification", "ยืนยันธุรกิจ", "ตรวจและยืนยันองค์กรที่ลงทะเบียนใหม่", "ยืนยัน verify องค์กร")),
    ("ADMIN", Dest("admin_quality", "/admin/quality", "มาตรฐานคุณภาพ", "เกณฑ์คัดเกรดของผลผลิตแต่ละชนิด", "มาตรฐาน เกณฑ์ เกรด")),
    ("ADMIN", Dest("admin_risk", "/admin/risk", "Trust & Risk", "สัญญาณความผิดปกติให้ตรวจทาน", "ความเสี่ยง ผิดปกติ ทุจริต")),
    ("ADMIN", Dest("admin_appeals", "/admin/appeals", "อุทธรณ์ AgriTrust", "พิจารณาคำอุทธรณ์คะแนนของผู้ซื้อ", "อุทธรณ์")),
]

ACTION_TH = {
    "ACCEPT_HARVESTLOCK": "ลงนามยืนยัน HarvestLock", "RECORD_HARVEST": "บันทึกการเก็บเกี่ยว", "DISPATCH_LOT": "ส่งล็อต",
    "RECEIVE_LOT": "ยืนยันรับสินค้า", "RECORD_QC": "บันทึกผลตรวจคุณภาพ", "RECORD_PAYMENT": "ชำระเงิน",
    "CONFIRM_PAYMENT_RECEIVED": "ยืนยันได้รับเงิน", "RESPOND_AMENDMENT": "ตอบรับการแก้ไขสัญญา",
}
TASK_WORDS = ("งาน", "ค้าง", "ต้องทำ", "รอ", "ด่วน", "อะไรบ้าง", "todo", "pending")


def catalog_for(role: str, organization_id: str) -> list[Dest]:
    out = []
    for roles, d in CATALOG:
        if role in roles.split():
            out.append(Dest(d.id, d.route.replace("{org}", str(organization_id)), d.label, d.description, d.keywords))
    return out


def _score(query: str, d: Dest) -> float:
    q, t = grams(query), grams(f"{d.label} {d.description} {d.keywords}")
    shared = sum(min(q[g], t[g]) for g in q.keys() & t.keys())
    return shared / (sum(q.values()) or 1)


def action(d: Dest) -> dict:
    return {"id": d.id, "route": d.route, "label": d.label, "description": d.description, "task": d.id.startswith("task:")}


def rule_reply(message: str, dests: list[Dest], tasks: list[Dest]) -> dict:
    wants_tasks = any(w in message.lower() for w in TASK_WORDS)
    if wants_tasks and tasks:
        return {"reply": f"ตอนนี้มีงานรอคุณ {len(tasks)} เรื่อง เลือกได้เลยครับ", "actions": [action(t) for t in tasks[:4]]}
    ranked = sorted(dests, key=lambda d: _score(message, d), reverse=True)
    best = [d for d in ranked[:3] if _score(message, d) > 0.12]
    if not best:
        return {"reply": "ยังไม่แน่ใจว่าต้องการไปหน้าไหน ลองบอกสิ่งที่อยากทำ เช่น \"ลงขายผลผลิต\" \"ดูสัญญา\" หรือ \"มีงานอะไรค้าง\" ครับ",
                "actions": [action(d) for d in dests[:3]]}
    return {"reply": f"ไปที่ \"{best[0].label}\" ได้เลยครับ — {best[0].description}", "actions": [action(d) for d in best]}


SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["reply", "destination_ids", "suggestions"],
    "properties": {
        "reply": {"type": "string"},
        "destination_ids": {"type": "array", "items": {"type": "string"}},
        "suggestions": {"type": "array", "items": {"type": "string"}},
    },
}

SYSTEM = """You are the in-app guide of AgriGuard, a Thai platform where farmers sell produce to buyers through
pre-harvest contracts (HarvestLock), quality checks (GradeProof), settlement and a buyer reliability score (AgriTrust).
Your job is to understand what the user wants to do and send them to the right page.

Rules:
- Reply in friendly, plain Thai, at most 3 short sentences. Explain briefly what they will do on that page.
- Choose up to 3 destination ids, best first, ONLY from DESTINATIONS. Never invent pages or URLs.
- If the user asks what they need to do, or about pending work, prefer ids starting with "task:".
- For questions about contract terms, rights, law or platform rules, send them to "assistant" (the legal assistant)
  and do not give legal advice yourself.
- If nothing fits, say so and suggest what they could ask instead; return no ids.
- suggestions: up to 3 short follow-up things the user might type next, in Thai."""


def nav_content(role: str, current_path: str | None, dests: list[Dest], history: list[dict], message: str) -> list[dict]:
    listing = "\n".join(f"- {d.id}: {d.label} — {d.description}" for d in dests)
    convo = "\n".join(f"{'ผู้ใช้' if h['role'] == 'user' else 'ผู้ช่วย'}: {redact(h['text'])[:500]}" for h in history[-6:])
    return [{"type": "text", "text": (
        f"USER ROLE: {role}\nCURRENT PAGE: {current_path or '-'}\n\nDESTINATIONS:\n{listing}\n\n"
        f"CONVERSATION SO FAR:\n{convo or '(none)'}\n\nUSER: {redact(message)}")}]


def nav_result(output: dict, dests: list[Dest]) -> dict:
    """Keep only destination ids that exist for this user (deduplicated, max 3)."""
    by_id = {d.id: d for d in dests}
    actions = [action(by_id[i]) for i in dict.fromkeys(output.get("destination_ids", [])) if i in by_id][:3]
    return {"reply": output.get("reply", ""), "actions": actions, "suggestions": output.get("suggestions", [])[:3]}
