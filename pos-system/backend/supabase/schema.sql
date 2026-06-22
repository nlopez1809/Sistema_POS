-- ============================================================
-- POS SYSTEM — Supabase Schema
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- COMPANIES (multi-tenant)
-- ============================================================
CREATE TABLE companies (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  ruc         TEXT,
  address     TEXT,
  phone       TEXT,
  email       TEXT,
  logo_url    TEXT,
  currency    TEXT NOT NULL DEFAULT 'BOB',
  timezone    TEXT NOT NULL DEFAULT 'America/La_Paz',
  plan        TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free','starter','pro','enterprise')),
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- BRANCHES (sucursales)
-- ============================================================
CREATE TABLE branches (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  address     TEXT,
  phone       TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id   UUID REFERENCES branches(id),
  auth_id     UUID UNIQUE, -- Supabase auth.users reference
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'cashier' CHECK (role IN ('superadmin','admin','manager','cashier')),
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, email)
);

-- ============================================================
-- CATEGORIES
-- ============================================================
CREATE TABLE categories (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  color       TEXT DEFAULT '#6366f1',
  icon        TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, name)
);

-- ============================================================
-- PRODUCTS
-- ============================================================
CREATE TABLE products (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  category_id   UUID REFERENCES categories(id),
  name          TEXT NOT NULL,
  description   TEXT,
  sku           TEXT,
  barcode       TEXT,
  price         NUMERIC(12,2) NOT NULL DEFAULT 0,
  cost          NUMERIC(12,2) NOT NULL DEFAULT 0,
  unit          TEXT NOT NULL DEFAULT 'unit' CHECK (unit IN ('unit','kg','g','l','ml','m','box','pack')),
  image_url     TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  has_stock     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, sku)
);

-- ============================================================
-- STOCK (por sucursal)
-- ============================================================
CREATE TABLE stock (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id    UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  branch_id     UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  quantity      NUMERIC(12,3) NOT NULL DEFAULT 0,
  min_quantity  NUMERIC(12,3) NOT NULL DEFAULT 0,
  max_quantity  NUMERIC(12,3),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, branch_id)
);

-- ============================================================
-- CUSTOMERS
-- ============================================================
CREATE TABLE customers (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  email       TEXT,
  phone       TEXT,
  document    TEXT,
  address     TEXT,
  points      INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- CASH REGISTERS (cajas)
-- ============================================================
CREATE TABLE cash_registers (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id       UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- CASH SESSIONS (turnos / sesiones de caja)
-- ============================================================
CREATE TABLE cash_sessions (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cash_register_id  UUID NOT NULL REFERENCES cash_registers(id),
  user_id           UUID NOT NULL REFERENCES users(id),
  opening_amount    NUMERIC(12,2) NOT NULL DEFAULT 0,
  closing_amount    NUMERIC(12,2),
  expected_amount   NUMERIC(12,2),
  difference        NUMERIC(12,2),
  status            TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  notes             TEXT,
  opened_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at         TIMESTAMPTZ
);

-- ============================================================
-- SALES (ventas / tickets)
-- ============================================================
CREATE TABLE sales (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  branch_id       UUID NOT NULL REFERENCES branches(id),
  cash_session_id UUID REFERENCES cash_sessions(id),
  user_id         UUID NOT NULL REFERENCES users(id),
  customer_id     UUID REFERENCES customers(id),
  ticket_number   TEXT NOT NULL,
  subtotal        NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount        NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax             NUMERIC(12,2) NOT NULL DEFAULT 0,
  total           NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid_amount     NUMERIC(12,2) NOT NULL DEFAULT 0,
  change_amount   NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_method  TEXT NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash','card','qr','transfer','mixed')),
  status          TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','voided','pending')),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, ticket_number)
);

-- ============================================================
-- SALE ITEMS
-- ============================================================
CREATE TABLE sale_items (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sale_id     UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id  UUID NOT NULL REFERENCES products(id),
  name        TEXT NOT NULL, -- snapshot del nombre en el momento de la venta
  price       NUMERIC(12,2) NOT NULL,
  cost        NUMERIC(12,2) NOT NULL DEFAULT 0,
  quantity    NUMERIC(12,3) NOT NULL,
  discount    NUMERIC(12,2) NOT NULL DEFAULT 0,
  subtotal    NUMERIC(12,2) NOT NULL
);

-- ============================================================
-- STOCK MOVEMENTS (trazabilidad)
-- ============================================================
CREATE TABLE stock_movements (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id  UUID NOT NULL REFERENCES products(id),
  branch_id   UUID NOT NULL REFERENCES branches(id),
  user_id     UUID REFERENCES users(id),
  sale_id     UUID REFERENCES sales(id),
  type        TEXT NOT NULL CHECK (type IN ('sale','purchase','adjustment','transfer','void')),
  quantity    NUMERIC(12,3) NOT NULL, -- positivo = entrada, negativo = salida
  before_qty  NUMERIC(12,3) NOT NULL,
  after_qty   NUMERIC(12,3) NOT NULL,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_products_company ON products(company_id);
CREATE INDEX idx_products_barcode ON products(barcode);
CREATE INDEX idx_sales_company_date ON sales(company_id, created_at DESC);
CREATE INDEX idx_sales_branch ON sales(branch_id);
CREATE INDEX idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX idx_stock_product ON stock(product_id);
CREATE INDEX idx_stock_branch ON stock(branch_id);
CREATE INDEX idx_stock_movements_product ON stock_movements(product_id, created_at DESC);

-- ============================================================
-- ROW LEVEL SECURITY (multi-tenant isolation)
-- ============================================================
ALTER TABLE companies         ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches          ENABLE ROW LEVEL SECURITY;
ALTER TABLE users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories        ENABLE ROW LEVEL SECURITY;
ALTER TABLE products          ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock             ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers         ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales             ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements   ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_sessions     ENABLE ROW LEVEL SECURITY;

-- Política base: los usuarios solo ven datos de su company
CREATE POLICY "company_isolation" ON products
  USING (company_id = (
    SELECT company_id FROM users WHERE auth_id = auth.uid()
  ));

CREATE POLICY "company_isolation" ON sales
  USING (company_id = (
    SELECT company_id FROM users WHERE auth_id = auth.uid()
  ));

CREATE POLICY "company_isolation" ON categories
  USING (company_id = (
    SELECT company_id FROM users WHERE auth_id = auth.uid()
  ));

CREATE POLICY "company_isolation" ON customers
  USING (company_id = (
    SELECT company_id FROM users WHERE auth_id = auth.uid()
  ));

-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_companies_updated_at BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-update stock after sale
CREATE OR REPLACE FUNCTION deduct_stock_on_sale()
RETURNS TRIGGER AS $$
DECLARE
  v_branch_id UUID;
  v_before    NUMERIC;
BEGIN
  SELECT branch_id INTO v_branch_id FROM sales WHERE id = NEW.sale_id;

  SELECT quantity INTO v_before FROM stock
    WHERE product_id = NEW.product_id AND branch_id = v_branch_id;

  UPDATE stock
    SET quantity = quantity - NEW.quantity, updated_at = NOW()
    WHERE product_id = NEW.product_id AND branch_id = v_branch_id;

  INSERT INTO stock_movements (product_id, branch_id, sale_id, type, quantity, before_qty, after_qty)
    VALUES (NEW.product_id, v_branch_id, NEW.sale_id, 'sale', -NEW.quantity, v_before, v_before - NEW.quantity);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_deduct_stock AFTER INSERT ON sale_items
  FOR EACH ROW EXECUTE FUNCTION deduct_stock_on_sale();

-- Generate ticket number (YYYYMMDD-XXXX)
CREATE OR REPLACE FUNCTION generate_ticket_number(p_company_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_date TEXT;
  v_count INTEGER;
BEGIN
  v_date := TO_CHAR(NOW(), 'YYYYMMDD');
  SELECT COUNT(*) + 1 INTO v_count
    FROM sales
    WHERE company_id = p_company_id
      AND DATE(created_at) = CURRENT_DATE;
  RETURN v_date || '-' || LPAD(v_count::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;
