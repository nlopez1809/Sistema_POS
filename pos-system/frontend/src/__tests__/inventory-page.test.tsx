import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAppStore } from '@/store';
import * as supabaseModule from '../lib/supabase';
import InventoryPage from '../pages/InventoryPage';

const makeProduct = (overrides: Partial<any> = {}) => ({
  id: 'prod-001',
  company_id: 'company-001',
  name: 'Coca Cola 2L',
  description: 'Refresco',
  sku: 'COC2L',
  barcode: '7500435000038',
  price: 15.0,
  cost: 10.0,
  unit: 'unit',
  has_stock: true,
  is_active: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  category_id: null,
  category: null,
  stock: { quantity: 5, min_quantity: 2, branch_id: 'branch-001' },
  ...overrides,
});

const resetAppStore = () => {
  useAppStore.setState({
    user: { id: 'user-001', name: 'Admin', role: 'admin', email: 'admin@example.com' },
    company: { id: 'company-001', name: 'Mi empresa' },
    branch: { id: 'branch-001', name: 'Sucursal Central' },
  });
};

const makeQueryClient = () => new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

describe('InventoryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAppStore();

    const categoriesQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: [], error: null }),
    };

    vi.spyOn(supabaseModule.supabase, 'from').mockImplementation((table: string) => {
      if (table === 'categories') return categoriesQuery as any;
      throw new Error(`Unexpected supabase table: ${table}`);
    });
  });

  it('refetches products after a stock adjustment', async () => {
    const initialProduct = makeProduct();
    const updatedProduct = makeProduct({ stock: { quantity: 12, min_quantity: 2, branch_id: 'branch-001' } });

    const listMock = vi.spyOn(supabaseModule.productsApi, 'list');
    const updateStockMock = vi.spyOn(supabaseModule.productsApi, 'updateStock');

    listMock
      .mockResolvedValueOnce([initialProduct])
      .mockResolvedValueOnce([updatedProduct])
      .mockResolvedValue([updatedProduct]);
    updateStockMock.mockResolvedValue(undefined);

    const queryClient = makeQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <InventoryPage />
      </QueryClientProvider>
    );

    expect(await screen.findByText('Coca Cola 2L')).toBeInTheDocument();
    expect(listMock).toHaveBeenCalledTimes(1);

    userEvent.click(screen.getByTitle('Ajustar stock'));

    const modal = await screen.findByText('Ajuste de stock');
    const modalNode = modal.closest('.inv-modal');
    expect(modalNode).toBeTruthy();

    const input = within(modalNode as HTMLElement).getByDisplayValue('5');
    await userEvent.clear(input);
    await userEvent.type(input, '12');

    const saveButton = within(modalNode as HTMLElement).getByRole('button', { name: /Guardar/i });
    await userEvent.click(saveButton);

    await waitFor(() => {
      expect(updateStockMock).toHaveBeenCalledWith('prod-001', 'branch-001', 12, 'user-001', '');
    });

    expect(listMock).toHaveBeenCalled();

    const row = screen.getByText('Coca Cola 2L').closest('tr');
    expect(row).toBeTruthy();
    await waitFor(() => {
      expect(within(row as HTMLElement).getByText('12')).toBeInTheDocument();
    });
  });
});
