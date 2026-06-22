-- ============================================================
-- MIGRATION: expenses + loyalty support
-- Ejecutar después de schema.sql y migration_suppliers.sql
-- ============================================================

-- ── Expenses (gastos de caja) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS expenses (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id   UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  session_id  UUID REFERENCES cash_sessions(id),
  user_id     UUID NOT NULL REFERENCES users(id),
  category    TEXT NOT NULL,
  description TEXT NOT NULL,
  amount      NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expenses_company   ON expenses(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_session   ON expenses(session_id);
CREATE INDEX IF NOT EXISTS idx_expenses_branch    ON expenses(branch_id);

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_isolation" ON expenses
  USING (company_id = (SELECT company_id FROM users WHERE auth_id = auth.uid()));

-- ── Loyalty transactions log ──────────────────────────────────
-- (Opcional: para auditoría de puntos)
CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id  UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  sale_id      UUID REFERENCES sales(id),
  type         TEXT NOT NULL CHECK (type IN ('earn', 'redeem', 'adjustment', 'expire')),
  points       INTEGER NOT NULL,           -- positivo = ganados, negativo = canjeados
  balance_after INTEGER NOT NULL,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loyalty_customer ON loyalty_transactions(customer_id, created_at DESC);

ALTER TABLE loyalty_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_isolation" ON loyalty_transactions
  USING (EXISTS (
    SELECT 1 FROM customers c
    JOIN users u ON u.company_id = c.company_id
    WHERE c.id = loyalty_transactions.customer_id
      AND u.auth_id = auth.uid()
  ));

-- ── RPC: increment customer points (atomic) ───────────────────
CREATE OR REPLACE FUNCTION increment_customer_points(
  p_customer_id UUID,
  p_points      INTEGER
)
RETURNS INTEGER AS $$
DECLARE
  v_new_balance INTEGER;
BEGIN
  UPDATE customers
    SET points = points + p_points
    WHERE id = p_customer_id
    RETURNING points INTO v_new_balance;

  INSERT INTO loyalty_transactions (customer_id, type, points, balance_after)
    VALUES (
      p_customer_id,
      CASE WHEN p_points >= 0 THEN 'earn' ELSE 'redeem' END,
      p_points,
      v_new_balance
    );

  RETURN v_new_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── RPC: redeem points ────────────────────────────────────────
CREATE OR REPLACE FUNCTION redeem_customer_points(
  p_customer_id UUID,
  p_points      INTEGER,
  p_sale_id     UUID DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
  v_current  INTEGER;
  v_new      INTEGER;
BEGIN
  SELECT points INTO v_current FROM customers WHERE id = p_customer_id FOR UPDATE;
  IF v_current < p_points THEN
    RAISE EXCEPTION 'Puntos insuficientes (tiene %, intenta canjear %)', v_current, p_points;
  END IF;
  v_new := v_current - p_points;
  UPDATE customers SET points = v_new WHERE id = p_customer_id;
  INSERT INTO loyalty_transactions (customer_id, sale_id, type, points, balance_after)
    VALUES (p_customer_id, p_sale_id, 'redeem', -p_points, v_new);
  RETURN v_new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── View: session summary (útil para el cierre de caja) ───────
CREATE OR REPLACE VIEW session_summary AS
SELECT
  cs.id                                                           AS session_id,
  cs.status,
  cs.opened_at,
  cs.closed_at,
  cs.opening_amount,
  cs.closing_amount,
  cs.expected_amount,
  cs.difference,
  COUNT(s.id) FILTER (WHERE s.status = 'completed')              AS total_sales,
  COALESCE(SUM(s.total) FILTER (WHERE s.status = 'completed'), 0) AS total_revenue,
  COALESCE(SUM(s.total) FILTER (WHERE s.status = 'completed' AND s.payment_method = 'cash'), 0) AS cash_revenue,
  COALESCE(SUM(s.total) FILTER (WHERE s.status = 'completed' AND s.payment_method = 'card'), 0) AS card_revenue,
  COALESCE(SUM(s.total) FILTER (WHERE s.status = 'completed' AND s.payment_method = 'qr'),   0) AS qr_revenue,
  COALESCE(SUM(e.amount), 0)                                      AS total_expenses,
  COALESCE(SUM(s.total) FILTER (WHERE s.status = 'completed' AND s.payment_method = 'cash'), 0)
    - COALESCE(SUM(e.amount), 0)                                  AS net_cash
FROM cash_sessions cs
LEFT JOIN sales    s ON s.cash_session_id = cs.id
LEFT JOIN expenses e ON e.session_id = cs.id
GROUP BY cs.id;

-- ── Índice adicional en sales para búsqueda por ticket ────────
CREATE INDEX IF NOT EXISTS idx_sales_ticket ON sales(company_id, ticket_number);

-- ── Trigger: auto-register loyalty transaction on sale ────────
-- (Opcional — las reglas de negocio de puntos se manejan en el frontend)
-- Se puede activar si se quiere llevar auditoría server-side completa

COMMENT ON TABLE expenses IS 'Gastos y egresos registrados durante un turno de caja';
COMMENT ON TABLE loyalty_transactions IS 'Historial de movimientos del programa de puntos';
COMMENT ON VIEW session_summary IS 'Resumen consolidado de ventas, gastos y métodos de pago por sesión de caja';
