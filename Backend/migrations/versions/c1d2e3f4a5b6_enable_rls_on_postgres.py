"""Enable row-level security on every public table (Postgres only).

Supabase exposes the public schema through its Data API to anyone with the publishable key. RLS with no policies
blocks that path entirely; the AgriGuard API connects as the table owner, which bypasses RLS, and enforces
authorization itself (Technical/deployment.md). No-op on SQLite.

Revision ID: c1d2e3f4a5b6
Revises: 90eceadce6b7
"""

from alembic import op

revision = "c1d2e3f4a5b6"
down_revision = "90eceadce6b7"
branch_labels = None
depends_on = None


def _tables():
    return [
        "organizations", "users", "farms", "produce_listings", "purchase_requests", "purchase_offers",
        "allocation_plans", "allocation_items", "contracts", "contract_versions", "contract_acceptances",
        "produce_lots", "qc_inspections", "qc_grade_items", "settlements", "payments", "trust_events",
        "disputes", "dispute_statements", "evidence_files", "trust_appeals", "quality_standards",
        "notifications", "audit_logs", "alembic_version",
    ]


def upgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        return
    for t in _tables():
        op.execute(f'ALTER TABLE public."{t}" ENABLE ROW LEVEL SECURITY')


def downgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        return
    for t in _tables():
        op.execute(f'ALTER TABLE public."{t}" DISABLE ROW LEVEL SECURITY')
