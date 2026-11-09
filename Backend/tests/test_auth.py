import time
import uuid

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from sqlalchemy import text

from app import deps
from app.config import settings
from app.db import Base, engine
from app.migrate import upgrade_to_head
from tests.conftest import FARMER

URL = "https://demo-project.supabase.co"
KEY = ec.generate_private_key(ec.SECP256R1())


class FakeJWKS:
    def get_signing_key_from_jwt(self, token):
        return type("K", (), {"key": KEY.public_key()})()


@pytest.fixture()
def supabase(monkeypatch):
    monkeypatch.setattr(settings, "supabase_url", URL)
    monkeypatch.setattr(deps, "jwks_client", lambda: FakeJWKS())


def token(sub=None, **over):
    claims = {
        "sub": str(sub or uuid.uuid4()), "aud": "authenticated", "iss": f"{URL}/auth/v1",
        "exp": int(time.time()) + 600, "email": "new.buyer@gmail.com",
        "user_metadata": {"full_name": "Kanya Buyer"}, **over,
    }
    return {"Authorization": f"Bearer {jwt.encode(claims, KEY, algorithm='ES256')}"}


def test_google_user_onboards_then_uses_api(client, supabase):
    h = token()
    assert client.get("/api/me", headers=h).json()["detail"] == "ONBOARDING_REQUIRED"
    assert client.get("/api/auth/session", headers=h).json()["onboarding_required"] is True
    r = client.post("/api/onboarding", headers=h, json={
        "role": "BUYER", "organization_name": "Kanya Fresh Co.", "province": "กรุงเทพมหานคร", "business_type": "WHOLESALER"})
    assert r.status_code == 201, r.text
    me = client.get("/api/me", headers=h).json()
    assert me["name"] == "Kanya Buyer" and me["role"] == "BUYER" and me["organization"]["verified"] is False
    assert client.post("/api/onboarding", headers=h, json={"role": "BUYER", "organization_name": "x2", "province": "ชลบุรี"}).status_code == 409


def test_cannot_self_assign_admin(client, supabase):
    r = client.post("/api/onboarding", headers=token(), json={"role": "ADMIN", "organization_name": "Evil", "province": "ชลบุรี"})
    assert r.status_code == 422


@pytest.mark.parametrize("bad", [{"aud": "anon"}, {"iss": "https://evil.example/auth/v1"}, {"exp": int(time.time()) - 10}])
def test_rejects_invalid_tokens(client, supabase, bad):
    assert client.get("/api/me", headers=token(**bad)).status_code == 401


def test_rejects_token_signed_by_another_key(client, supabase):
    other = ec.generate_private_key(ec.SECP256R1())
    claims = {"sub": str(uuid.uuid4()), "aud": "authenticated", "iss": f"{URL}/auth/v1", "exp": int(time.time()) + 600}
    h = {"Authorization": f"Bearer {jwt.encode(claims, other, algorithm='ES256')}"}
    assert client.get("/api/me", headers=h).status_code == 401


def test_demo_login_can_be_disabled(client, monkeypatch):
    assert client.get("/api/me", headers=FARMER).status_code == 200
    monkeypatch.setattr(settings, "demo_login", False)
    assert client.get("/api/me", headers=FARMER).status_code == 401


def test_migrations_build_the_full_schema():
    Base.metadata.drop_all(engine)
    with engine.begin() as c:
        c.execute(text("DROP TABLE IF EXISTS alembic_version"))
    upgrade_to_head()
    from alembic import command
    from alembic.config import Config
    from app.migrate import ROOT
    cfg = Config(str(ROOT / "alembic.ini"))
    cfg.set_main_option("script_location", str(ROOT / "migrations"))
    cfg.attributes["configure_logger"] = False
    command.check(cfg)  # raises if models and migrations have drifted
    Base.metadata.drop_all(engine)
    with engine.begin() as c:
        c.execute(text("DROP TABLE alembic_version"))
