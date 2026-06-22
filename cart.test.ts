import { describe, it, expect, beforeEach } from 'vitest';
import { useCartStore } from '@/store';
import type { Product } from '../../shared/types';

// ── Helpers ───────────────────────────────────────────────────
const makeProduct = (overrides: Partial<Product> = {}): Product => ({
  id:         overrides.id         ?? 'prod-001',
  company_id: 'company-001',
  name:       overrides.name       ?? 'Coca Cola 2L',
  price:      overrides.price      ?? 15.00,
  cost:       overrides.cost       ?? 10.00,
  unit:       'unit',
  has_stock:  true,
  is_active:  true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
});

const resetCart = () => useCartStore.getState().clearCart();

// ── Suite ─────────────────────────────────────────────────────
describe('CartStore', () => {

  beforeEach(() => resetCart());

  describe('addItem', () => {
    it('agrega un producto nuevo al carrito', () => {
      useCartStore.getState().addItem(makeProduct());
      const { items } = useCartStore.getState();
      expect(items).toHaveLength(1);
      expect(items[0].product.id).toBe('prod-001');
      expect(items[0].quantity).toBe(1);
    });

    it('incrementa la cantidad si el producto ya existe', () => {
      const p = makeProduct();
      useCartStore.getState().addItem(p);
      useCartStore.getState().addItem(p);
      const { items } = useCartStore.getState();
      expect(items).toHaveLength(1);
      expect(items[0].quantity).toBe(2);
    });

    it('permite agregar una cantidad específica', () => {
      useCartStore.getState().addItem(makeProduct(), 3);
      expect(useCartStore.getState().items[0].quantity).toBe(3);
    });

    it('agrega múltiples productos distintos', () => {
      useCartStore.getState().addItem(makeProduct({ id: 'p1', price: 10 }));
      useCartStore.getState().addItem(makeProduct({ id: 'p2', price: 20 }));
      expect(useCartStore.getState().items).toHaveLength(2);
    });
  });

  describe('cálculo de subtotales por ítem', () => {
    it('subtotal = precio × cantidad', () => {
      useCartStore.getState().addItem(makeProduct({ price: 15 }), 3);
      expect(useCartStore.getState().items[0].subtotal).toBeCloseTo(45);
    });

    it('subtotal se recalcula al cambiar cantidad', () => {
      useCartStore.getState().addItem(makeProduct({ price: 10 }), 2);
      useCartStore.getState().updateQuantity('prod-001', 5);
      expect(useCartStore.getState().items[0].subtotal).toBeCloseTo(50);
    });

    it('subtotal considera descuento por ítem', () => {
      useCartStore.getState().addItem(makeProduct({ price: 20 }), 1);
      useCartStore.getState().updateDiscount('prod-001', 5);
      expect(useCartStore.getState().items[0].subtotal).toBeCloseTo(15);
    });
  });

  describe('totales del carrito', () => {
    it('total es la suma de subtotales', () => {
      useCartStore.getState().addItem(makeProduct({ id: 'p1', price: 10 }), 2);
      useCartStore.getState().addItem(makeProduct({ id: 'p2', price: 15 }), 1);
      const { totals } = useCartStore.getState();
      expect(totals.subtotal).toBeCloseTo(35);
      expect(totals.total).toBeCloseTo(35);
    });

    it('descuento global fijo se resta del subtotal', () => {
      useCartStore.getState().addItem(makeProduct({ id: 'p1', price: 100 }), 1);
      useCartStore.getState().setGlobalDiscount(20);
      const { totals } = useCartStore.getState();
      expect(totals.subtotal).toBeCloseTo(100);
      expect(totals.discount).toBeCloseTo(20);
      expect(totals.total).toBeCloseTo(80);
    });

    it('total nunca es negativo aunque el descuento supere el subtotal', () => {
      useCartStore.getState().addItem(makeProduct({ price: 10 }), 1);
      useCartStore.getState().setGlobalDiscount(50);
      expect(useCartStore.getState().totals.total).toBe(0);
    });

    it('totales se resetean al limpiar carrito', () => {
      useCartStore.getState().addItem(makeProduct(), 5);
      useCartStore.getState().setGlobalDiscount(10);
      useCartStore.getState().clearCart();
      const { totals } = useCartStore.getState();
      expect(totals.subtotal).toBe(0);
      expect(totals.total).toBe(0);
      expect(totals.discount).toBe(0);
    });

    it('descuento porcentual funciona correctamente', () => {
      useCartStore.getState().addItem(makeProduct({ id: 'p1', price: 100 }), 1);
      useCartStore.getState().setDiscountConfig({ type: 'percent', value: 10 });
      const { totals } = useCartStore.getState();
      expect(totals.discount).toBeCloseTo(10);
      expect(totals.total).toBeCloseTo(90);
    });
  });

  describe('removeItem y updateQuantity', () => {
    it('removeItem elimina el producto del carrito', () => {
      useCartStore.getState().addItem(makeProduct({ id: 'p1' }));
      useCartStore.getState().addItem(makeProduct({ id: 'p2' }));
      useCartStore.getState().removeItem('p1');
      expect(useCartStore.getState().items).toHaveLength(1);
      expect(useCartStore.getState().items[0].product.id).toBe('p2');
    });

    it('updateQuantity a 0 elimina el producto', () => {
      useCartStore.getState().addItem(makeProduct());
      useCartStore.getState().updateQuantity('prod-001', 0);
      expect(useCartStore.getState().items).toHaveLength(0);
    });

    it('los totales se actualizan al remover un ítem', () => {
      useCartStore.getState().addItem(makeProduct({ id: 'p1', price: 50 }));
      useCartStore.getState().addItem(makeProduct({ id: 'p2', price: 30 }));
      useCartStore.getState().removeItem('p1');
      expect(useCartStore.getState().totals.total).toBeCloseTo(30);
    });
  });

  describe('cliente asociado', () => {
    it('setCustomer asigna un cliente al carrito', () => {
      const customer = { id: 'c1', company_id: 'co1', name: 'María López', points: 0 };
      useCartStore.getState().setCustomer(customer);
      expect(useCartStore.getState().customer?.name).toBe('María López');
    });

    it('clearCart también limpia el cliente', () => {
      useCartStore.getState().setCustomer({ id: 'c1', company_id: 'co1', name: 'Test', points: 0 });
      useCartStore.getState().clearCart();
      expect(useCartStore.getState().customer).toBeNull();
    });
  });

  describe('casos borde', () => {
    it('precio con decimales se calcula correctamente', () => {
      useCartStore.getState().addItem(makeProduct({ price: 4.50 }), 3);
      expect(useCartStore.getState().totals.total).toBeCloseTo(13.50);
    });

    it('carrito vacío tiene todos los totales en 0', () => {
      const { totals, items } = useCartStore.getState();
      expect(items).toHaveLength(0);
      expect(totals.subtotal).toBe(0);
      expect(totals.total).toBe(0);
      expect(totals.discount).toBe(0);
      expect(totals.tax).toBe(0);
    });

    it('operaciones múltiples mantienen consistencia', () => {
      useCartStore.getState().addItem(makeProduct({ id: 'p1', price: 15 }), 2);   // 30
      useCartStore.getState().addItem(makeProduct({ id: 'p2', price: 8.50 }), 1); // 8.50
      useCartStore.getState().addItem(makeProduct({ id: 'p3', price: 22 }), 3);   // 66
      // subtotal = 104.50
      useCartStore.getState().updateDiscount('p1', 5);
      // subtotal p1 = 30-5=25 → total items = 25+8.50+66 = 99.50
      useCartStore.getState().setGlobalDiscount(9.50);
      // total = 99.50 - 9.50 = 90.00
      const { totals } = useCartStore.getState();
      expect(totals.subtotal).toBeCloseTo(99.50);
      expect(totals.discount).toBeCloseTo(9.50);
      expect(totals.total).toBeCloseTo(90.00);
    });
  });
});
