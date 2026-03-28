"""
Tests: Company model has SSO + billing fields after migration.
These are unit-level model tests — no DB needed for column inspection.
"""
from app.models.organization import Company


def test_company_has_sso_provider_column():
    cols = {c.key for c in Company.__mapper__.columns}
    assert "sso_provider" in cols, "Missing sso_provider on Company"


def test_company_has_sso_domain_column():
    cols = {c.key for c in Company.__mapper__.columns}
    assert "sso_domain" in cols, "Missing sso_domain on Company"


def test_company_has_stripe_customer_id_column():
    cols = {c.key for c in Company.__mapper__.columns}
    assert "stripe_customer_id" in cols, "Missing stripe_customer_id on Company"


def test_company_has_stripe_subscription_id_column():
    cols = {c.key for c in Company.__mapper__.columns}
    assert "stripe_subscription_id" in cols, "Missing stripe_subscription_id on Company"


def test_company_has_plan_tier_column():
    cols = {c.key for c in Company.__mapper__.columns}
    assert "plan_tier" in cols, "Missing plan_tier on Company"


def test_company_plan_tier_default_is_starter():
    company = Company(name="Test Co", slug="test-co")
    assert company.plan_tier == "starter"
