-- ============================================================
-- MIGRATION: RLS policies completas para producción
-- Ejecutar DESPUÉS de todos los schemas anteriores
-- ============================================================
-- Este archivo cubre todas las tablas que tienen RLS habilitado
-- pero no tenían política de lectura/escritura explícita.
-- Sin estas políticas los usuarios autenticados no pueden
-- leer sus propios datos → pantallas en blanco en producción.
-- ============================================================

-- ── Helper function: obtiene company_id del usuario actual ────
CREATE OR REPLACE FUNCTION auth_company_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT company_id FROM users WHERE auth_id = auth.uid() LIMIT 1;
$$;

-- ── Helper function: obtiene el rol del usuario actual ────────
CREATE OR REPLACE FUNCTION auth_user_role()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT role FROM users WHERE auth_id = auth.uid() LIMIT 1;
$$;

-- ── Helper function: verifica si el usuario es admin/manager ──
CREATE OR REPLACE FUNCTION auth_is_manager()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT role IN ('superadmin','admin','manager')
  FROM users WHERE auth_id = auth.uid() LIMIT 1;
$$;

-- ============================================================
-- COMPANIES
-- ============================================================
DROP POLICY IF EXISTS "company_isolation" ON companies;

-- Leer: solo su propia empresa
CREATE POLICY "companies_select" ON companies
  FOR SELECT USING (id = auth_company_id());

-- Actualizar: solo admin/manager de esa empresa
CREATE POLICY "companies_update" ON companies
  FOR UPDATE USING (id = auth_company_id() AND auth_is_manager());

-- Insertar: solo durante onboarding (usuario sin empresa asignada)
CREATE POLICY "companies_insert" ON companies
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND company_id IS NULL)
    OR auth_is_manager()
  );

-- ============================================================
-- BRANCHES
-- ============================================================
DROP POLICY IF EXISTS "company_isolation" ON branches;

CREATE POLICY "branches_select" ON branches
  FOR SELECT USING (company_id = auth_company_id());

CREATE POLICY "branches_insert" ON branches
  FOR INSERT WITH CHECK (company_id = auth_company_id() AND auth_is_manager());

CREATE POLICY "branches_update" ON branches
  FOR UPDATE USING (company_id = auth_company_id() AND auth_is_manager());

CREATE POLICY "branches_delete" ON branches
  FOR DELETE USING (company_id = auth_company_id() AND auth_is_manager());

-- ============================================================
-- USERS
-- ============================================================
DROP POLICY IF EXISTS "company_isolation" ON users;

-- Leer: todos los usuarios de la empresa (para el módulo de usuarios)
CREATE POLICY "users_select" ON users
  FOR SELECT USING (company_id = auth_company_id());

-- Insertar: solo admin puede crear usuarios
CREATE POLICY "users_insert" ON users
  FOR INSERT WITH CHECK (
    company_id = auth_company_id()
    AND auth_user_role() IN ('superadmin','admin')
  );

-- Actualizar: admin actualiza cualquiera, usuario actualiza su propio perfil
CREATE POLICY "users_update" ON users
  FOR UPDATE USING (
    company_id = auth_company_id()
    AND (
      auth_user_role() IN ('superadmin','admin')
      OR auth_id = auth.uid()
    )
  );

-- ============================================================
-- CATEGORIES
-- ============================================================
DROP POLICY IF EXISTS "company_isolation" ON categories;

CREATE POLICY "categories_select" ON categories
  FOR SELECT USING (company_id = auth_company_id());

CREATE POLICY "categories_insert" ON categories
  FOR INSERT WITH CHECK (company_id = auth_company_id() AND auth_is_manager());

CREATE POLICY "categories_update" ON categories
  FOR UPDATE USING (company_id = auth_company_id() AND auth_is_manager());

CREATE POLICY "categories_delete" ON categories
  FOR DELETE USING (company_id = auth_company_id() AND auth_is_manager());

-- ============================================================
-- PRODUCTS
-- ============================================================
DROP POLICY IF EXISTS "company_isolation" ON products;

CREATE POLICY "products_select" ON products
  FOR SELECT USING (company_id = auth_company_id());

CREATE POLICY "products_insert" ON products
  FOR INSERT WITH CHECK (company_id = auth_company_id() AND auth_is_manager());

CREATE POLICY "products_update" ON products
  FOR UPDATE USING (company_id = auth_company_id() AND auth_is_manager());

CREATE POLICY "products_delete" ON products
  FOR DELETE USING (company_id = auth_company_id() AND auth_is_manager());

-- ============================================================
-- STOCK
-- ============================================================
DROP POLICY IF EXISTS "company_isolation" ON stock;

-- Stock: acceso via producto → empresa
CREATE POLICY "stock_select" ON stock
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM products p
      WHERE p.id = stock.product_id AND p.company_id = auth_company_id()
    )
  );

CREATE POLICY "stock_insert" ON stock
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM products p
      WHERE p.id = product_id AND p.company_id = auth_company_id()
    )
  );

CREATE POLICY "stock_update" ON stock
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM products p
      WHERE p.id = stock.product_id AND p.company_id = auth_company_id()
    )
  );

-- ============================================================
-- CUSTOMERS
-- ============================================================
DROP POLICY IF EXISTS "company_isolation" ON customers;

CREATE POLICY "customers_select" ON customers
  FOR SELECT USING (company_id = auth_company_id());

CREATE POLICY "customers_insert" ON customers
  FOR INSERT WITH CHECK (company_id = auth_company_id());

CREATE POLICY "customers_update" ON customers
  FOR UPDATE USING (company_id = auth_company_id());

-- ============================================================
-- CASH REGISTERS
-- ============================================================
DROP POLICY IF EXISTS "company_isolation" ON cash_registers;

CREATE POLICY "cash_registers_select" ON cash_registers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM branches b
      WHERE b.id = cash_registers.branch_id AND b.company_id = auth_company_id()
    )
  );

CREATE POLICY "cash_registers_insert" ON cash_registers
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM branches b
      WHERE b.id = branch_id AND b.company_id = auth_company_id()
    ) AND auth_is_manager()
  );

-- ============================================================
-- CASH SESSIONS
-- ============================================================
DROP POLICY IF EXISTS "company_isolation" ON cash_sessions;

CREATE POLICY "cash_sessions_select" ON cash_sessions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM cash_registers cr
      JOIN branches b ON b.id = cr.branch_id
      WHERE cr.id = cash_sessions.cash_register_id
        AND b.company_id = auth_company_id()
    )
  );

CREATE POLICY "cash_sessions_insert" ON cash_sessions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM cash_registers cr
      JOIN branches b ON b.id = cr.branch_id
      WHERE cr.id = cash_register_id AND b.company_id = auth_company_id()
    )
  );

CREATE POLICY "cash_sessions_update" ON cash_sessions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM cash_registers cr
      JOIN branches b ON b.id = cr.branch_id
      WHERE cr.id = cash_sessions.cash_register_id
        AND b.company_id = auth_company_id()
    )
  );

-- ============================================================
-- SALES
-- ============================================================
DROP POLICY IF EXISTS "company_isolation" ON sales;

CREATE POLICY "sales_select" ON sales
  FOR SELECT USING (company_id = auth_company_id());

CREATE POLICY "sales_insert" ON sales
  FOR INSERT WITH CHECK (company_id = auth_company_id());

-- Solo anular (update status), no borrar físico
CREATE POLICY "sales_update" ON sales
  FOR UPDATE USING (company_id = auth_company_id() AND auth_is_manager());

-- ============================================================
-- SALE ITEMS
-- ============================================================
DROP POLICY IF EXISTS "company_isolation" ON sale_items;

CREATE POLICY "sale_items_select" ON sale_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM sales s
      WHERE s.id = sale_items.sale_id AND s.company_id = auth_company_id()
    )
  );

CREATE POLICY "sale_items_insert" ON sale_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM sales s
      WHERE s.id = sale_id AND s.company_id = auth_company_id()
    )
  );

-- ============================================================
-- STOCK MOVEMENTS
-- ============================================================
DROP POLICY IF EXISTS "company_isolation" ON stock_movements;

CREATE POLICY "stock_movements_select" ON stock_movements
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM products p
      WHERE p.id = stock_movements.product_id AND p.company_id = auth_company_id()
    )
  );

CREATE POLICY "stock_movements_insert" ON stock_movements
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM products p
      WHERE p.id = product_id AND p.company_id = auth_company_id()
    )
  );

-- ============================================================
-- SUPPLIERS (migration_suppliers.sql)
-- ============================================================
DROP POLICY IF EXISTS "company_isolation" ON suppliers;

CREATE POLICY "suppliers_select" ON suppliers
  FOR SELECT USING (company_id = auth_company_id());

CREATE POLICY "suppliers_insert" ON suppliers
  FOR INSERT WITH CHECK (company_id = auth_company_id() AND auth_is_manager());

CREATE POLICY "suppliers_update" ON suppliers
  FOR UPDATE USING (company_id = auth_company_id() AND auth_is_manager());

-- ============================================================
-- PURCHASES
-- ============================================================
DROP POLICY IF EXISTS "company_isolation" ON purchases;

CREATE POLICY "purchases_select" ON purchases
  FOR SELECT USING (company_id = auth_company_id());

CREATE POLICY "purchases_insert" ON purchases
  FOR INSERT WITH CHECK (company_id = auth_company_id() AND auth_is_manager());

-- ============================================================
-- PURCHASE ITEMS
-- ============================================================
CREATE POLICY "purchase_items_select" ON purchase_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM purchases p
      WHERE p.id = purchase_items.purchase_id AND p.company_id = auth_company_id()
    )
  );

CREATE POLICY "purchase_items_insert" ON purchase_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM purchases p
      WHERE p.id = purchase_id AND p.company_id = auth_company_id()
    )
  );

-- ============================================================
-- EXPENSES
-- ============================================================
DROP POLICY IF EXISTS "company_isolation" ON expenses;

CREATE POLICY "expenses_select" ON expenses
  FOR SELECT USING (company_id = auth_company_id());

CREATE POLICY "expenses_insert" ON expenses
  FOR INSERT WITH CHECK (company_id = auth_company_id());

CREATE POLICY "expenses_delete" ON expenses
  FOR DELETE USING (
    company_id = auth_company_id()
    AND (
      user_id = (SELECT id FROM users WHERE auth_id = auth.uid() LIMIT 1)
      OR auth_is_manager()
    )
  );

-- ============================================================
-- LOYALTY TRANSACTIONS
-- ============================================================
CREATE POLICY "loyalty_select" ON loyalty_transactions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM customers c
      WHERE c.id = loyalty_transactions.customer_id
        AND c.company_id = auth_company_id()
    )
  );

CREATE POLICY "loyalty_insert" ON loyalty_transactions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM customers c
      WHERE c.id = customer_id AND c.company_id = auth_company_id()
    )
  );

-- ============================================================
-- GRANTS: permitir a usuarios autenticados llamar las funciones
-- ============================================================
GRANT EXECUTE ON FUNCTION auth_company_id()    TO authenticated;
GRANT EXECUTE ON FUNCTION auth_user_role()     TO authenticated;
GRANT EXECUTE ON FUNCTION auth_is_manager()    TO authenticated;
GRANT EXECUTE ON FUNCTION generate_ticket_number(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_customer_points(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION redeem_customer_points(UUID, INTEGER, UUID) TO authenticated;

-- ============================================================
-- VERIFICACIÓN FINAL
-- ============================================================
-- Después de correr este script, verifica con:
-- SELECT tablename, policyname, cmd, qual
-- FROM pg_policies
-- WHERE schemaname = 'public'
-- ORDER BY tablename, cmd;
