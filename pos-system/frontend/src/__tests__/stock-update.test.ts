import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('productsApi.updateStock', () => {
  let productsApi: any;
  let supabase: any;

  const stockQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn(),
    upsert: vi.fn(),
  };

  const movementQuery = {
    insert: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const actualSupabaseModule = await vi.importActual('../lib/supabase');
    productsApi = actualSupabaseModule.productsApi;
    supabase = actualSupabaseModule.supabase;

    supabase.from = vi.fn((table: string) => {
      if (table === 'stock') return stockQuery;
      if (table === 'stock_movements') return movementQuery;
      throw new Error(`Unexpected supabase table: ${table}`);
    });
  });

  it('reads current stock and writes updated stock and movement', async () => {
    stockQuery.single.mockResolvedValue({ data: { quantity: 5 }, error: null });
    stockQuery.upsert.mockResolvedValue({ data: null, error: null });
    movementQuery.insert.mockResolvedValue({ data: null, error: null });

    await productsApi.updateStock('prod-1', 'branch-1', 8, 'user-1', 'Ajuste por inventario');

    expect(supabase.from).toHaveBeenCalledWith('stock');
    expect(stockQuery.select).toHaveBeenCalledWith('quantity');
    expect(stockQuery.eq).toHaveBeenCalledWith('product_id', 'prod-1');
    expect(stockQuery.eq).toHaveBeenCalledWith('branch_id', 'branch-1');
    expect(stockQuery.single).toHaveBeenCalled();
    expect(stockQuery.upsert).toHaveBeenCalledWith(
      { product_id: 'prod-1', branch_id: 'branch-1', quantity: 8 },
      { onConflict: ['product_id', 'branch_id'] }
    );
    expect(movementQuery.insert).toHaveBeenCalledWith({
      product_id: 'prod-1',
      branch_id: 'branch-1',
      user_id: 'user-1',
      type: 'adjustment',
      quantity: 3,
      before_qty: 5,
      after_qty: 8,
      notes: 'Ajuste por inventario',
    });
  });

  it('throws when stock upsert returns an error', async () => {
    stockQuery.single.mockResolvedValue({ data: { quantity: 2 }, error: null });
    stockQuery.upsert.mockResolvedValue({ data: null, error: { message: 'dup key' } });

    await expect(
      productsApi.updateStock('prod-2', 'branch-2', 1, 'user-2', 'Error test')
    ).rejects.toEqual({ message: 'dup key' });
  });
});
