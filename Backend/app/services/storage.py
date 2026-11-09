"""Private evidence storage. Local disk for development; Supabase Storage when SUPABASE_URL and
SUPABASE_SECRET_KEY are set (Technical/deployment.md). Files are only reachable through short-lived signed URLs."""

import hashlib
import hmac
import time
from pathlib import Path

import httpx

from app.config import settings

LINK_SECONDS = 300


class LocalStorage:
    name = "local"

    def __init__(self, root: str):
        self.root = Path(root)

    def put(self, key: str, data: bytes, content_type: str) -> None:
        path = self.root / key
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    def path(self, key: str) -> Path:
        return self.root / key

    def get(self, key: str) -> bytes:
        return (self.root / key).read_bytes()

    def signed_url(self, file_id: str, key: str) -> str:
        exp = int(time.time()) + LINK_SECONDS
        return f"/api/files/{file_id}/raw?exp={exp}&sig={sign(file_id, exp)}"


class SupabaseStorage:
    name = "supabase"

    def __init__(self, url: str, key: str, bucket: str):
        self.base = f"{url}/storage/v1"
        self.bucket = bucket
        self.headers = {"apikey": key}
        if key.startswith("eyJ"):  # legacy service_role JWT also goes in Authorization
            self.headers["Authorization"] = f"Bearer {key}"

    def put(self, key: str, data: bytes, content_type: str) -> None:
        r = httpx.post(f"{self.base}/object/{self.bucket}/{key}", content=data, timeout=30,
                       headers={**self.headers, "content-type": content_type, "x-upsert": "false"})
        r.raise_for_status()

    def get(self, key: str) -> bytes:
        r = httpx.get(f"{self.base}/object/authenticated/{self.bucket}/{key}", headers=self.headers, timeout=30)
        r.raise_for_status()
        return r.content

    def signed_url(self, file_id: str, key: str) -> str:
        r = httpx.post(f"{self.base}/object/sign/{self.bucket}/{key}", json={"expiresIn": LINK_SECONDS},
                       headers=self.headers, timeout=15)
        r.raise_for_status()
        return f"{self.base}{r.json()['signedURL']}"


def sign(file_id: str, exp: int) -> str:
    return hmac.new(settings.file_url_secret.encode(), f"{file_id}:{exp}".encode(), hashlib.sha256).hexdigest()


def verify(file_id: str, exp: int, sig: str) -> bool:
    return exp >= time.time() and hmac.compare_digest(sign(file_id, exp), sig)


def storage():
    if settings.supabase_url and settings.supabase_secret_key:
        return SupabaseStorage(settings.supabase_url, settings.supabase_secret_key, settings.storage_bucket)
    return LocalStorage(settings.upload_dir)
