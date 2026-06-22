import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

// ── Helpers ──────────────────────────────────────────────────

/** Obtiene el user_id de Supabase Auth activo */
export async function getAuthUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/** Obtiene el perfil del usuario actual desde la tabla users */
export async function getCurrentUser() {
  const authId = await getAuthUserId();
  if (!authId) return null;

  const { data, error } = await supabase
    .from('users')
    .select('*, company:companies(*), branch:branches(*)')
    .eq('auth_id', authId)
    .single();

  if (error) throw error;
  return data;
}

// ── Products API ──────────────────────────────────────────────

export const productsApi = {
  async list(companyId: string, branchId: string) {
    const { data, error } = await supabase
      .from('products')
      .select(`
        *,
        category:categories(id, name, color),
        stock(quantity, min_quantity, branch_id)
      `)
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('name');

    if (error) throw error;

    // Filtrar el stock del branch correcto en el cliente
    // (evita que stock!inner excluya productos sin fila de stock)
    return (data ?? []).map((p: any) => ({
      ...p,
      stock: Array.isArray(p.stock)
        ? p.stock.find((s: any) => s.branch_id === branchId) ?? null
        : p.stock ?? null,
    }));
  },

  async search(companyId: string, branchId: string, query: string) {
    const { data, error } = await supabase
      .from('products')
      .select(`*, category:categories(id,name,color), stock(quantity, min_quantity)`)
      .eq('company_id', companyId)
      .eq('is_active', true)
      .or(`name.ilike.%${query}%,barcode.eq.${query},sku.ilike.%${query}%`)
      .limit(20);

    if (error) throw error;
    return data;
  },

  async create(product: Omit<import('../../shared/types').Product, 'id' | 'created_at' | 'updated_at'>) {
    const { data, error } = await supabase
      .from('products')
      .insert(product)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(id: string, updates: Partial<import('../../shared/types').Product>) {
    const { data, error } = await supabase
      .from('products')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateStock(productId: string, branchId: string, newQuantity: number, userId: string, notes?: string) {
    // Get current stock
    const { data: current } = await supabase
      .from('stock')
      .select('quantity')
      .eq('product_id', productId)
      .eq('branch_id', branchId)
      .single();

    const before = current?.quantity ?? 0;
    const diff = newQuantity - before;

    // Update stock
    await supabase
      .from('stock')
      .upsert({ product_id: productId, branch_id: branchId, quantity: newQuantity })
      .eq('product_id', productId)
      .eq('branch_id', branchId);

    // Record movement
    await supabase.from('stock_movements').insert({
      product_id: productId,
      branch_id: branchId,
      user_id: userId,
      type: 'adjustment',
      quantity: diff,
      before_qty: before,
      after_qty: newQuantity,
      notes,
    });
  },
};

// ── Sales API ─────────────────────────────────────────────────

export const salesApi = {
  async create(sale: {
    company_id: string;
    branch_id: string;
    user_id: string;
    customer_id?: string;
    cash_session_id?: string;
    subtotal: number;
    discount: number;
    tax: number;
    total: number;
    paid_amount: number;
    change_amount: number;
    payment_method: string;
    notes?: string;
    items: Array<{
      product_id: string;
      name: string;
      price: number;
      cost: number;
      quantity: number;
      discount: number;
      subtotal: number;
    }>;
  }) {
    // Generate ticket number via DB function
    const { data: ticketData } = await supabase
      .rpc('generate_ticket_number', { p_company_id: sale.company_id });

    const { data: saleData, error: saleError } = await supabase
      .from('sales')
      .insert({
        company_id: sale.company_id,
        branch_id: sale.branch_id,
        user_id: sale.user_id,
        customer_id: sale.customer_id,
        cash_session_id: sale.cash_session_id,
        ticket_number: ticketData,
        subtotal: sale.subtotal,
        discount: sale.discount,
        tax: sale.tax,
        total: sale.total,
        paid_amount: sale.paid_amount,
        change_amount: sale.change_amount,
        payment_method: sale.payment_method,
        notes: sale.notes,
        status: 'completed',
      })
      .select()
      .single();

    if (saleError) throw saleError;

    const items = sale.items.map(item => ({ ...item, sale_id: saleData.id }));
    const { error: itemsError } = await supabase.from('sale_items').insert(items);
    if (itemsError) throw itemsError;

    return saleData;
  },

  async list(companyId: string, filters: { date_from?: string; date_to?: string; limit?: number }) {
    let query = supabase
      .from('sales')
      .select(`*, customer:customers(name), user:users(name), items:sale_items(*)`)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    if (filters.date_from) query = query.gte('created_at', filters.date_from);
    if (filters.date_to)   query = query.lte('created_at', filters.date_to);
    if (filters.limit)     query = query.limit(filters.limit);

    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  async void(saleId: string) {
    const { error } = await supabase
      .from('sales')
      .update({ status: 'voided' })
      .eq('id', saleId);
    if (error) throw error;
  },
};

// ── Reports API ───────────────────────────────────────────────

export const reportsApi = {
  async dailySummary(companyId: string, dateFrom: string, dateTo: string) {
    const { data, error } = await supabase
      .from('sales')
      .select('created_at, total, status, items:sale_items(quantity)')
      .eq('company_id', companyId)
      .eq('status', 'completed')
      .gte('created_at', dateFrom)
      .lte('created_at', dateTo)
      .order('created_at');

    if (error) throw error;
    return data;
  },

  async topProducts(companyId: string, dateFrom: string, dateTo: string, limit = 10) {
    const { data, error } = await supabase
      .from('sale_items')
      .select(`
        product_id, name, quantity, subtotal,
        sale:sales!inner(company_id, status, created_at)
      `)
      .eq('sale.company_id', companyId)
      .eq('sale.status', 'completed')
      .gte('sale.created_at', dateFrom)
      .lte('sale.created_at', dateTo);

    if (error) throw error;

    // Aggregate by product
    const agg: Record<string, { name: string; qty: number; revenue: number }> = {};
    for (const item of data ?? []) {
      if (!agg[item.product_id]) agg[item.product_id] = { name: item.name, qty: 0, revenue: 0 };
      agg[item.product_id].qty += item.quantity;
      agg[item.product_id].revenue += item.subtotal;
    }

    return Object.entries(agg)
      .map(([id, v]) => ({ product_id: id, ...v }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, limit);
  },

  async lowStock(companyId: string, branchId: string) {
    const { data, error } = await supabase
      .from('stock')
      .select(`
        quantity, min_quantity,
        product:products!inner(id, name, sku, company_id)
      `)
      .eq('product.company_id', companyId)
      .eq('branch_id', branchId)
      .filter('quantity', 'lte', 'min_quantity');

    if (error) throw error;
    return data;
  },
};

// ── Cash Sessions API ─────────────────────────────────────────

export const cashSessionsApi = {
  async open(cashRegisterId: string, userId: string, openingAmount: number) {
    const { data, error } = await supabase
      .from('cash_sessions')
      .insert({ cash_register_id: cashRegisterId, user_id: userId, opening_amount: openingAmount, status: 'open' })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async close(sessionId: string, closingAmount: number, notes?: string) {
    // Get expected amount from sales sum
    const { data: sales } = await supabase
      .from('sales')
      .select('total, payment_method')
      .eq('cash_session_id', sessionId)
      .eq('status', 'completed');

    const cashSales = (sales ?? []).filter(s => s.payment_method === 'cash').reduce((a, s) => a + s.total, 0);
    const { data: session } = await supabase.from('cash_sessions').select('opening_amount').eq('id', sessionId).single();
    const expected = (session?.opening_amount ?? 0) + cashSales;

    const { data, error } = await supabase
      .from('cash_sessions')
      .update({ status: 'closed', closing_amount: closingAmount, expected_amount: expected, difference: closingAmount - expected, notes, closed_at: new Date().toISOString() })
      .eq('id', sessionId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async getCurrent(cashRegisterId: string) {
    const { data } = await supabase
      .from('cash_sessions')
      .select('*')
      .eq('cash_register_id', cashRegisterId)
      .eq('status', 'open')
      .order('opened_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return data;
  },
};
