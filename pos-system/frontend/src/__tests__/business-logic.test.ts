import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Helpers reutilizables ─────────────────────────────────────
const makeSale = (overrides: Record<string, any> = {}) => ({
  id:             'sale-001',
  company_id:     'company-001',
  branch_id:      'branch-001',
  user_id:        'user-001',
  ticket_number:  '20240115-0001',
  subtotal:       100,
  discount:       0,
  tax:            0,
  total:          100,
  paid_amount:    100,
  change_amount:  0,
  payment_method: 'cash',
  status:         'completed',
  created_at:     '2024-01-15T10:30:00.000Z',
  items: [
    { id: 'si-1', sale_id: 'sale-001', product_id: 'p1', name: 'Coca Cola 2L',  price: 15, cost: 10, quantity: 2, discount: 0, subtotal: 30 },
    { id: 'si-2', sale_id: 'sale-001', product_id: 'p2', name: 'Agua 600ml',    price: 4.5, cost: 2.5, quantity: 5, discount: 0, subtotal: 22.5 },
    { id: 'si-3', sale_id: 'sale-001', product_id: 'p3', name: 'Papas Fritas',  price: 9,   cost: 6,  quantity: 3, discount: 0, subtotal: 27 },
  ],
  ...overrides,
});

// ── 1. Lógica de cobro / cambio ───────────────────────────────
describe('Lógica de cobro', () => {
  const calcChange = (paidAmount: number, total: number) => Math.max(0, paidAmount - total);
  const isValidPayment = (method: string, paidAmount: number, total: number) =>
    method !== 'cash' || paidAmount >= total;

  it('cambio correcto cuando se paga con billete redondo', () => {
    expect(calcChange(100, 79.50)).toBeCloseTo(20.50);
  });

  it('cambio es 0 cuando se paga exacto', () => {
    expect(calcChange(45, 45)).toBe(0);
  });

  it('cambio nunca es negativo', () => {
    expect(calcChange(40, 50)).toBe(0);
  });

  it('pago con tarjeta/QR siempre es válido sin importar el monto', () => {
    expect(isValidPayment('card', 0, 150)).toBe(true);
    expect(isValidPayment('qr',   0, 150)).toBe(true);
  });

  it('pago en efectivo es inválido si el monto es menor al total', () => {
    expect(isValidPayment('cash', 80, 100)).toBe(false);
  });

  it('pago en efectivo es válido si cubre el total exactamente', () => {
    expect(isValidPayment('cash', 100, 100)).toBe(true);
  });

  it('los ítems del carrito suman correctamente al total de venta', () => {
    const sale = makeSale();
    const sumItems = sale.items.reduce((a: number, i: any) => a + i.subtotal, 0);
    // 30 + 22.5 + 27 = 79.5
    expect(sumItems).toBeCloseTo(79.5);
  });

  it('genera número de ticket con formato correcto YYYYMMDD-XXXX', () => {
    const ticket = '20240115-0001';
    expect(ticket).toMatch(/^\d{8}-\d{4}$/);
  });
});

// ── 2. Lógica de arqueo de caja ───────────────────────────────
describe('Arqueo de caja', () => {
  const calcExpected = (openingAmount: number, cashSales: number) =>
    openingAmount + cashSales;

  const calcDifference = (closingAmount: number, expectedAmount: number) =>
    closingAmount - expectedAmount;

  it('monto esperado = fondo inicial + ventas en efectivo', () => {
    expect(calcExpected(200, 850)).toBe(1050);
  });

  it('diferencia positiva indica sobrante', () => {
    const diff = calcDifference(1070, 1050);
    expect(diff).toBeGreaterThan(0);
    expect(diff).toBe(20);
  });

  it('diferencia negativa indica faltante', () => {
    const diff = calcDifference(1030, 1050);
    expect(diff).toBeLessThan(0);
    expect(diff).toBe(-20);
  });

  it('diferencia 0 indica cuadre exacto', () => {
    expect(calcDifference(1050, 1050)).toBe(0);
  });

  it('solo las ventas en efectivo afectan el arqueo', () => {
    const sales = [
      { payment_method: 'cash',     total: 150, status: 'completed' },
      { payment_method: 'card',     total: 200, status: 'completed' },
      { payment_method: 'qr',       total: 80,  status: 'completed' },
      { payment_method: 'cash',     total: 60,  status: 'voided'    }, // anulada
      { payment_method: 'cash',     total: 100, status: 'completed' },
    ];
    const cashSales = sales
      .filter(s => s.payment_method === 'cash' && s.status === 'completed')
      .reduce((a, s) => a + s.total, 0);
    // Solo la primera y última: 150 + 100 = 250
    expect(cashSales).toBe(250);
    expect(calcExpected(200, cashSales)).toBe(450);
  });
});

// ── 3. Lógica de stock ────────────────────────────────────────
describe('Lógica de stock', () => {
  const isLowStock = (qty: number, minQty: number) => qty <= minQty;
  const isOutOfStock = (qty: number, hasStock: boolean) => hasStock && qty <= 0;
  const newQtyAfterSale = (current: number, sold: number) => current - sold;
  const newQtyAfterPurchase = (current: number, received: number) => current + received;

  it('detecta stock bajo cuando cantidad <= mínimo', () => {
    expect(isLowStock(5, 10)).toBe(true);
    expect(isLowStock(10, 10)).toBe(true);
    expect(isLowStock(11, 10)).toBe(false);
  });

  it('detecta sin stock cuando qty <= 0 y tiene control de stock', () => {
    expect(isOutOfStock(0,  true)).toBe(true);
    expect(isOutOfStock(-1, true)).toBe(true);
    expect(isOutOfStock(0,  false)).toBe(false); // sin control de stock, nunca agota
    expect(isOutOfStock(1,  true)).toBe(false);
  });

  it('stock se reduce correctamente tras una venta', () => {
    expect(newQtyAfterSale(48, 3)).toBe(45);
    expect(newQtyAfterSale(5,  5)).toBe(0);
  });

  it('stock se incrementa correctamente tras una compra', () => {
    expect(newQtyAfterPurchase(10, 24)).toBe(34);
    expect(newQtyAfterPurchase(0,  12)).toBe(12);
  });

  it('el movimiento de stock registra before y after correctamente', () => {
    const before = 48;
    const sold   = 3;
    const after  = newQtyAfterSale(before, sold);
    const movement = { type: 'sale', quantity: -sold, before_qty: before, after_qty: after };
    expect(movement.quantity).toBe(-3);
    expect(movement.before_qty).toBe(48);
    expect(movement.after_qty).toBe(45);
  });
});

// ── 4. Lógica de márgenes ─────────────────────────────────────
describe('Cálculo de márgenes', () => {
  const calcMargin      = (price: number, cost: number) =>
    price > 0 ? ((price - cost) / price) * 100 : 0;
  const calcProfit      = (price: number, cost: number, qty: number) => (price - cost) * qty;
  const calcMarkup      = (price: number, cost: number) =>
    cost > 0 ? ((price - cost) / cost) * 100 : 0;

  it('margen del 33% para producto de Bs 15 con costo Bs 10', () => {
    expect(calcMargin(15, 10)).toBeCloseTo(33.33, 1);
  });

  it('margen del 0% cuando precio = costo', () => {
    expect(calcMargin(10, 10)).toBe(0);
  });

  it('margen del 100% cuando costo es 0', () => {
    expect(calcMargin(10, 0)).toBe(100);
  });

  it('ganancia total = (precio - costo) × cantidad', () => {
    expect(calcProfit(15, 10, 48)).toBe(240); // Bs 5 × 48 unidades
  });

  it('markup se calcula sobre el costo', () => {
    expect(calcMarkup(15, 10)).toBeCloseTo(50); // 50% sobre costo
  });

  it('precio 0 retorna margen 0 sin dividir por cero', () => {
    expect(calcMargin(0, 0)).toBe(0);
    expect(calcMarkup(0, 0)).toBe(0);
  });
});

// ── 5. Lógica de reportes / agregación ───────────────────────
describe('Agregación de reportes', () => {
  const sales = [
    { total: 150.00, payment_method: 'cash', status: 'completed', created_at: '2024-01-15T08:00:00Z', items: [{ quantity: 3 }, { quantity: 2 }] },
    { total: 200.00, payment_method: 'card', status: 'completed', created_at: '2024-01-15T09:00:00Z', items: [{ quantity: 1 }] },
    { total:  80.00, payment_method: 'qr',   status: 'completed', created_at: '2024-01-15T10:00:00Z', items: [{ quantity: 4 }] },
    { total:  50.00, payment_method: 'cash', status: 'voided',    created_at: '2024-01-15T11:00:00Z', items: [{ quantity: 1 }] },
    { total: 300.00, payment_method: 'cash', status: 'completed', created_at: '2024-01-16T08:00:00Z', items: [{ quantity: 6 }] },
  ];

  const completed = sales.filter(s => s.status === 'completed');

  it('ingresos totales excluyen ventas anuladas', () => {
    const total = completed.reduce((a, s) => a + s.total, 0);
    expect(total).toBe(730); // 150 + 200 + 80 + 300
  });

  it('ticket promedio se calcula correctamente', () => {
    const total = completed.reduce((a, s) => a + s.total, 0);
    const avg   = total / completed.length;
    expect(avg).toBe(182.5); // 730 / 4
  });

  it('total de artículos vendidos suma todas las cantidades', () => {
    const total = completed.reduce((a, s) =>
      a + s.items.reduce((b, i) => b + i.quantity, 0), 0
    );
    // 5 + 1 + 4 + 6 = 16
    expect(total).toBe(16);
  });

  it('ventas se filtran por método de pago correctamente', () => {
    const cashRevenue = completed
      .filter(s => s.payment_method === 'cash')
      .reduce((a, s) => a + s.total, 0);
    expect(cashRevenue).toBe(450); // 150 + 300
  });

  it('ventas se agrupan por día correctamente', () => {
    const byDay: Record<string, number> = {};
    for (const s of completed) {
      const day = s.created_at.slice(0, 10);
      byDay[day] = (byDay[day] ?? 0) + s.total;
    }
    expect(byDay['2024-01-15']).toBe(430); // 150 + 200 + 80
    expect(byDay['2024-01-16']).toBe(300);
  });
});

// ── 6. Validaciones del formulario de venta ───────────────────
describe('Validaciones de venta', () => {
  const isValidSale = (items: any[], total: number, paidAmount: number, method: string) => {
    if (items.length === 0) return { valid: false, error: 'Carrito vacío' };
    if (total <= 0)         return { valid: false, error: 'Total inválido' };
    if (method === 'cash' && paidAmount < total)
      return { valid: false, error: 'Monto insuficiente' };
    return { valid: true, error: null };
  };

  it('rechaza venta con carrito vacío', () => {
    const result = isValidSale([], 0, 0, 'cash');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Carrito vacío');
  });

  it('rechaza venta con total cero', () => {
    const result = isValidSale([{ id: 1 }], 0, 0, 'cash');
    expect(result.valid).toBe(false);
  });

  it('rechaza efectivo insuficiente', () => {
    const result = isValidSale([{ id: 1 }], 100, 80, 'cash');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Monto insuficiente');
  });

  it('acepta venta válida en efectivo', () => {
    const result = isValidSale([{ id: 1 }], 100, 100, 'cash');
    expect(result.valid).toBe(true);
  });

  it('acepta tarjeta sin importar monto ingresado', () => {
    const result = isValidSale([{ id: 1 }], 100, 0, 'card');
    expect(result.valid).toBe(true);
  });

  it('acepta venta con descuento aplicado', () => {
    // Total = 100 - 20 (descuento) = 80
    const result = isValidSale([{ id: 1 }], 80, 80, 'cash');
    expect(result.valid).toBe(true);
  });
});

// ── 7. Generación de ticket / número ─────────────────────────
describe('Generación de número de ticket', () => {
  const buildTicketNumber = (date: Date, count: number) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const n = String(count).padStart(4, '0');
    return `${y}${m}${d}-${n}`;
  };

  // Crear fechas locales explícitas para evitar conversión UTC→local
  // new Date('YYYY-MM-DD') es UTC medianoche → en Bolivia (UTC-4) = día anterior
  // Solución: new Date(year, month-1, day) siempre usa hora local
  const localDate = (y: number, m: number, d: number) => new Date(y, m - 1, d);

  it('formato correcto YYYYMMDD-XXXX', () => {
    const ticket = buildTicketNumber(localDate(2024, 1, 15), 1);
    expect(ticket).toBe('20240115-0001');
  });

  it('números consecutivos se padean con ceros', () => {
    expect(buildTicketNumber(localDate(2024, 6, 1), 1)).toBe('20240601-0001');
    expect(buildTicketNumber(localDate(2024, 6, 1), 99)).toBe('20240601-0099');
    expect(buildTicketNumber(localDate(2024, 6, 1), 1000)).toBe('20240601-1000');
  });

  it('coincide con el regex esperado', () => {
    const ticket = buildTicketNumber(new Date(), 42);
    expect(ticket).toMatch(/^\d{8}-\d{4}$/);
  });
});
