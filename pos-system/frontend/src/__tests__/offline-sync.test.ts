import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Testeamos la lógica pura sin IDB (que no existe en jsdom) ─

// Re-implementamos las funciones puras para test
const generateLocalId = () =>
  `offline_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

const makePayload = (overrides: any = {}) => ({
  company_id:     'c1',
  branch_id:      'b1',
  user_id:        'u1',
  subtotal:       100,
  discount:       0,
  tax:            0,
  total:          100,
  paid_amount:    100,
  change_amount:  0,
  payment_method: 'cash',
  items: [
    { product_id: 'p1', name: 'Coca Cola', price: 15, cost: 10, quantity: 2, discount: 0, subtotal: 30 },
  ],
  ...overrides,
});

// Simulación in-memory del store de ventas offline
class MemoryOfflineStore {
  private sales: Map<string, any> = new Map();

  async save(payload: any): Promise<string> {
    const localId = generateLocalId();
    this.sales.set(localId, {
      localId,
      createdAt: new Date().toISOString(),
      synced:    false,
      payload,
    });
    return localId;
  }

  async getPending(): Promise<any[]> {
    return Array.from(this.sales.values()).filter(s => !s.synced);
  }

  async getCount(): Promise<number> {
    return (await this.getPending()).length;
  }

  async markSynced(localId: string): Promise<void> {
    const s = this.sales.get(localId);
    if (s) this.sales.set(localId, { ...s, synced: true });
  }

  async markError(localId: string, error: string): Promise<void> {
    const s = this.sales.get(localId);
    if (s) this.sales.set(localId, { ...s, syncError: error });
  }

  async clearSynced(): Promise<void> {
    for (const [id, s] of this.sales.entries()) {
      if (s.synced) this.sales.delete(id);
    }
  }

  async sync(apiCreate: (p: any) => Promise<any>) {
    const pending = await this.getPending();
    let synced = 0, failed = 0;
    const errors: string[] = [];

    for (const sale of pending) {
      try {
        await apiCreate(sale.payload);
        await this.markSynced(sale.localId);
        synced++;
      } catch (err: any) {
        await this.markError(sale.localId, err.message ?? 'Error');
        errors.push(err.message);
        failed++;
      }
    }
    return { synced, failed, errors };
  }

  clear() { this.sales.clear(); }
}

// ── Tests ─────────────────────────────────────────────────────

describe('OfflineSync — cola de ventas', () => {
  let store: MemoryOfflineStore;

  beforeEach(() => { store = new MemoryOfflineStore(); });
  afterEach(() => { store.clear(); });

  // ── saveSaleOffline ────────────────────────────────────────
  describe('guardar venta offline', () => {
    it('genera un localId único por venta', async () => {
      const id1 = await store.save(makePayload());
      const id2 = await store.save(makePayload());
      expect(id1).not.toBe(id2);
    });

    it('localId tiene formato offline_TIMESTAMP_RANDOM', async () => {
      const id = await store.save(makePayload());
      expect(id).toMatch(/^offline_\d+_[a-z0-9]+$/);
    });

    it('venta guardada aparece en pendientes', async () => {
      await store.save(makePayload());
      const pending = await store.getPending();
      expect(pending).toHaveLength(1);
    });

    it('venta guardada tiene synced=false', async () => {
      await store.save(makePayload());
      const [sale] = await store.getPending();
      expect(sale.synced).toBe(false);
    });

    it('el payload se preserva íntegro', async () => {
      const payload = makePayload({ total: 250.50, payment_method: 'card' });
      await store.save(payload);
      const [sale] = await store.getPending();
      expect(sale.payload.total).toBe(250.50);
      expect(sale.payload.payment_method).toBe('card');
    });

    it('múltiples ventas se encolan correctamente', async () => {
      await store.save(makePayload());
      await store.save(makePayload());
      await store.save(makePayload());
      expect(await store.getCount()).toBe(3);
    });
  });

  // ── sync ───────────────────────────────────────────────────
  describe('sincronización con Supabase', () => {
    it('sincroniza todas las ventas pendientes', async () => {
      await store.save(makePayload());
      await store.save(makePayload());

      const mockCreate = vi.fn().mockResolvedValue({ id: 'server-id' });
      const result = await store.sync(mockCreate);

      expect(mockCreate).toHaveBeenCalledTimes(2);
      expect(result.synced).toBe(2);
      expect(result.failed).toBe(0);
    });

    it('marca las ventas como synced tras éxito', async () => {
      await store.save(makePayload());
      await store.sync(vi.fn().mockResolvedValue({}));
      expect(await store.getCount()).toBe(0);
    });

    it('maneja errores de red sin perder ventas', async () => {
      await store.save(makePayload());

      const mockCreate = vi.fn().mockRejectedValue(new Error('Network error'));
      const result = await store.sync(mockCreate);

      expect(result.failed).toBe(1);
      expect(result.errors[0]).toBe('Network error');
      // La venta sigue en cola (no se pierde)
      const pending = await store.getPending();
      expect(pending[0].syncError).toBe('Network error');
    });

    it('sincroniza ventas exitosas aunque otras fallen', async () => {
      await store.save(makePayload({ user_id: 'u1' }));
      await store.save(makePayload({ user_id: 'u2' }));

      let calls = 0;
      const mockCreate = vi.fn().mockImplementation(async () => {
        calls++;
        if (calls === 1) throw new Error('Fallo en primera venta');
        return { id: 'ok' };
      });

      const result = await store.sync(mockCreate);
      expect(result.synced).toBe(1);
      expect(result.failed).toBe(1);
    });

    it('clearSynced elimina solo ventas ya sincronizadas', async () => {
      const id1 = await store.save(makePayload());
      const id2 = await store.save(makePayload());

      await store.markSynced(id1);
      await store.clearSynced();

      const pending = await store.getPending();
      expect(pending).toHaveLength(1);
      expect(pending[0].localId).toBe(id2);
    });

    it('sync de cola vacía no llama a la API', async () => {
      const mockCreate = vi.fn();
      const result = await store.sync(mockCreate);
      expect(mockCreate).not.toHaveBeenCalled();
      expect(result.synced).toBe(0);
    });
  });

  // ── payload integrity ──────────────────────────────────────
  describe('integridad del payload', () => {
    it('los ítems de la venta se preservan completos', async () => {
      const items = [
        { product_id: 'p1', name: 'Coca Cola', price: 15, cost: 10, quantity: 3, discount: 0, subtotal: 45 },
        { product_id: 'p2', name: 'Agua',      price: 4.5, cost: 2.5, quantity: 2, discount: 0, subtotal: 9 },
      ];
      await store.save(makePayload({ items, total: 54 }));
      const [sale] = await store.getPending();
      expect(sale.payload.items).toHaveLength(2);
      expect(sale.payload.items[0].name).toBe('Coca Cola');
      expect(sale.payload.items[1].subtotal).toBe(9);
    });

    it('la fecha de creación se registra correctamente', async () => {
      const before = Date.now();
      await store.save(makePayload());
      const after  = Date.now();
      const [sale] = await store.getPending();
      const ts = new Date(sale.createdAt).getTime();
      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(after);
    });

    it('la sesión de caja se incluye si se proporciona', async () => {
      await store.save(makePayload({ cash_session_id: 'session-123' }));
      const [sale] = await store.getPending();
      expect(sale.payload.cash_session_id).toBe('session-123');
    });

    it('el cliente se incluye si se proporciona', async () => {
      await store.save(makePayload({ customer_id: 'cust-456' }));
      const [sale] = await store.getPending();
      expect(sale.payload.customer_id).toBe('cust-456');
    });
  });
});

// ── Detección de conectividad ─────────────────────────────────
describe('detección de conectividad', () => {
  const checkOnline = () => navigator.onLine;

  it('navigator.onLine está disponible', () => {
    // En el entorno de test (jsdom) por defecto es true
    expect(typeof navigator.onLine).toBe('boolean');
  });

  it('el evento online se dispara al reconectar', () => {
    const handler = vi.fn();
    window.addEventListener('online', handler);
    window.dispatchEvent(new Event('online'));
    expect(handler).toHaveBeenCalledTimes(1);
    window.removeEventListener('online', handler);
  });

  it('el evento offline se dispara al desconectar', () => {
    const handler = vi.fn();
    window.addEventListener('offline', handler);
    window.dispatchEvent(new Event('offline'));
    expect(handler).toHaveBeenCalledTimes(1);
    window.removeEventListener('offline', handler);
  });
});
