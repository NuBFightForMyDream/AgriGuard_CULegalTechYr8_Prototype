"""Reference data: products, provinces, grades, rejection reasons.

Product rules are data, not code, so new fruit types need no code changes (see Products/README.md scope note).
"""

PRODUCTS: dict[str, dict] = {
    "mango": {"th": "มะม่วง", "varieties": ["น้ำดอกไม้", "เขียวเสวย", "มหาชนก"], "grades": ["A", "B", "C"]},
    "durian": {"th": "ทุเรียน", "varieties": ["หมอนทอง", "ชะนี", "ก้านยาว"], "grades": ["A", "B", "C"]},
    "mangosteen": {"th": "มังคุด", "varieties": ["ผิวมัน", "ผิวลาย"], "grades": ["A", "B", "C"]},
    "longan": {"th": "ลำไย", "varieties": ["อีดอ", "สีชมพู"], "grades": ["AA", "A", "B"]},
    "orange": {"th": "ส้ม", "varieties": ["สายน้ำผึ้ง", "เขียวหวาน"], "grades": ["A", "B", "C"]},
    "rambutan": {"th": "เงาะ", "varieties": ["โรงเรียน", "สีชมพู"], "grades": ["A", "B", "C"]},
    "other": {"th": "อื่น ๆ", "varieties": [], "grades": ["A", "B", "C"]},
}

# Approximate province centroids, used for distance scoring in matching.
PROVINCES: dict[str, tuple[float, float]] = {
    "กรุงเทพมหานคร": (13.7563, 100.5018),
    "จันทบุรี": (12.6114, 102.1039),
    "ระยอง": (12.6814, 101.2816),
    "ตราด": (12.2428, 102.5175),
    "ชลบุรี": (13.3611, 100.9847),
    "ฉะเชิงเทรา": (13.6904, 101.0779),
    "สมุทรปราการ": (13.5991, 100.5998),
    "นครปฐม": (13.8199, 100.0622),
    "นครราชสีมา": (14.9799, 102.0977),
    "พิษณุโลก": (16.8211, 100.2659),
    "เชียงใหม่": (18.7883, 98.9853),
    "ลำพูน": (18.5745, 99.0087),
    "ชุมพร": (10.4930, 99.1800),
    "สุราษฎร์ธานี": (9.1382, 99.3215),
}

REJECTION_REASONS: dict[str, str] = {
    "ROT": "เน่าเสีย",
    "PEST_DAMAGE": "แมลงทำลาย",
    "BRUISING": "ช้ำ / บอบช้ำ",
    "UNDERSIZE": "ขนาดเล็กกว่าเกณฑ์",
    "OTHER": "อื่น ๆ (ไม่อยู่ในเงื่อนไขสัญญา)",
}

DEFAULT_REJECTION_CONDITIONS = ["ROT", "PEST_DAMAGE", "BRUISING", "UNDERSIZE"]
DEFAULT_TOLERANCE_PCT = 5
DEFAULT_SAMPLING_METHOD = "สุ่มตัวอย่าง 10% ของแต่ละล็อต"
