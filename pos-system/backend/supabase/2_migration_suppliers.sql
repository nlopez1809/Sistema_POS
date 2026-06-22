-- ============================================================
-- SUPPLIERS & PURCHASES — Migración adicional
-- Ejecutar DESPUÉS del schema.sql principal
-- ============================================================

-- ── Suppliers ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS suppliers (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  contact_name TEXT,
  phone        TEXT,
  email        TEXT,
  address      TEXT,
  notes        TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_suppliers_company ON suppliers(company_id);
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_isolation" ON suppliers
  USING (company_id = (SELECT company_id FROM users WHERE auth_id = auth.uid()));

-- ── Purchases (compras a proveedores) ─────────────────────────
CREATE TABLE IF NOT EXISTS purchases (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id  UUID NOT NULL REFERENCES companies(id),
  branch_id   UUID NOT NULL REFERENCES branches(id),
  supplier_id UUID REFERENCES suppliers(id),
  reference   TEXT,
  total       NUMERIC(12,2) NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'received'
              CHECK (status IN ('pending','received','cancelled')),
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_purchases_company ON purchases(company_id, created_at DESC);
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_isolation" ON purchases
  USING (company_id = (SELECT company_id FROM users WHERE auth_id = auth.uid()));

-- ── Purchase Items ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchase_items (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  purchase_id  UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  product_id   UUID NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL,
  quantity     NUMERIC(12,3) NOT NULL,
  cost         NUMERIC(12,2) NOT NULL,
  subtotal     NUMERIC(12,2) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase ON purchase_items(purchase_id);

-- ── Trigger: update product cost on purchase ──────────────────
CREATE OR REPLACE FUNCTION update_product_cost_on_purchase()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE products SET cost = NEW.cost, updated_at = NOW()
  WHERE id = NEW.product_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_cost_on_purchase
  AFTER INSERT ON purchase_items
  FOR EACH ROW EXECUTE FUNCTION update_product_cost_on_purchase();
