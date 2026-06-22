import { describe, it, expect, beforeEach } from 'vitest';
import {
  calcPointsEarned,
  calcRedeemValue,
  calcMaxRedeemable,
  type LoyaltyConfig,
} from '@/lib/loyalty';

// ── Default config for tests ──────────────────────────────────
const defaultConfig: LoyaltyConfig = {
  enabled:    true,
  earnRate:   10,     // 1 pto cada Bs 10
  redeemRate: 0.50,   // 1 pto = Bs 0.50
  minRedeem:  10,     // mínimo 10 puntos para canjear
};

// ── 1. Acumulación de puntos ──────────────────────────────────
describe('calcPointsEarned', () => {
  it('gana 1 punto por cada Bs 10 gastados', () => {
    expect(calcPointsEarned(100, defaultConfig)).toBe(10);
  });

  it('redondea hacia abajo (no fracciones de punto)', () => {
    expect(calcPointsEarned(95, defaultConfig)).toBe(9);
    expect(calcPointsEarned(109, defaultConfig)).toBe(10);
  });

  it('compra menor al earnRate da 0 puntos', () => {
    expect(calcPointsEarned(5, defaultConfig)).toBe(0);
    expect(calcPointsEarned(9.99, defaultConfig)).toBe(0);
  });

  it('retorna 0 si el programa está desactivado', () => {
    const cfg = { ...defaultConfig, enabled: false };
    expect(calcPointsEarned(200, cfg)).toBe(0);
  });

  it('retorna 0 si earnRate es 0 (evita división por cero)', () => {
    const cfg = { ...defaultConfig, earnRate: 0 };
    expect(calcPointsEarned(200, cfg)).toBe(0);
  });

  it('compra de Bs 150 da 15 puntos con earnRate 10', () => {
    expect(calcPointsEarned(150, defaultConfig)).toBe(15);
  });

  it('con earnRate de 5, la acumulación es el doble', () => {
    const cfg = { ...defaultConfig, earnRate: 5 };
    expect(calcPointsEarned(100, cfg)).toBe(20);
  });
});

// ── 2. Valor de canje ─────────────────────────────────────────
describe('calcRedeemValue', () => {
  it('10 puntos a Bs 0.50 = Bs 5.00', () => {
    expect(calcRedeemValue(10, defaultConfig)).toBeCloseTo(5.00);
  });

  it('1 punto = redeemRate en Bs', () => {
    expect(calcRedeemValue(1, defaultConfig)).toBeCloseTo(0.50);
  });

  it('0 puntos = Bs 0.00', () => {
    expect(calcRedeemValue(0, defaultConfig)).toBe(0);
  });

  it('100 puntos a Bs 0.50 = Bs 50.00', () => {
    expect(calcRedeemValue(100, defaultConfig)).toBeCloseTo(50.00);
  });

  it('con redeemRate de 1 Bs, 20 puntos = Bs 20.00', () => {
    const cfg = { ...defaultConfig, redeemRate: 1 };
    expect(calcRedeemValue(20, cfg)).toBeCloseTo(20.00);
  });
});

// ── 3. Máximo canjeable ───────────────────────────────────────
describe('calcMaxRedeemable', () => {
  it('no puede canjear más puntos que los disponibles', () => {
    const max = calcMaxRedeemable(50, 200, defaultConfig);
    expect(max).toBeLessThanOrEqual(50);
  });

  it('no puede canjear más de lo que vale el total', () => {
    // Con 1000 puntos a Bs 0.50 = Bs 500, pero el total es Bs 30
    // Máximo = floor(30 / 0.50) = 60 puntos, limitado a 60
    const max = calcMaxRedeemable(1000, 30, defaultConfig);
    expect(calcRedeemValue(max, defaultConfig)).toBeLessThanOrEqual(30);
  });

  it('retorna 0 si los puntos disponibles son menores al mínimo', () => {
    const max = calcMaxRedeemable(5, 200, defaultConfig); // min = 10
    expect(max).toBe(0);
  });

  it('retorna 0 si el programa está desactivado', () => {
    const cfg = { ...defaultConfig, enabled: false };
    expect(calcMaxRedeemable(100, 200, cfg)).toBe(0);
  });

  it('retorna 0 si hay 0 puntos', () => {
    expect(calcMaxRedeemable(0, 200, defaultConfig)).toBe(0);
  });

  it('límite correcto: disponibles < máximo por total', () => {
    // 30 puntos disponibles, total Bs 200 (permitiría hasta 400 pts)
    // Resultado = 30 (limitado por disponibles)
    const max = calcMaxRedeemable(30, 200, defaultConfig);
    expect(max).toBe(30);
  });

  it('límite correcto: disponibles > máximo por total', () => {
    // 500 puntos disponibles, total Bs 20 (permite hasta 40 pts)
    const max = calcMaxRedeemable(500, 20, defaultConfig);
    expect(max).toBe(40);
  });
});

// ── 4. Flujo completo de una venta con puntos ─────────────────
describe('flujo completo de venta con puntos', () => {
  it('venta de Bs 100: gana 10 puntos, canjea 0', () => {
    const earned = calcPointsEarned(100, defaultConfig);
    expect(earned).toBe(10);
    // Balance después: points_before + 10
  });

  it('venta con canje: descuento correcto y puntos restados', () => {
    const availablePoints = 50;
    const total           = 80;
    const pointsToRedeem  = 20; // canjea 20 puntos

    const discount = calcRedeemValue(pointsToRedeem, defaultConfig); // Bs 10
    expect(discount).toBeCloseTo(10);

    const totalAfterRedeem = total - discount; // Bs 70
    expect(totalAfterRedeem).toBeCloseTo(70);

    // Puntos ganados son sobre el total DESPUÉS del descuento
    const pointsEarned = calcPointsEarned(totalAfterRedeem, defaultConfig);
    expect(pointsEarned).toBe(7);

    // Balance final: 50 - 20 (canjeados) + 7 (ganados) = 37
    const balanceFinal = availablePoints - pointsToRedeem + pointsEarned;
    expect(balanceFinal).toBe(37);
  });

  it('cliente sin puntos no puede canjear aunque el total sea alto', () => {
    const max = calcMaxRedeemable(0, 500, defaultConfig);
    expect(max).toBe(0);
  });

  it('exactamente en el mínimo puede canjear', () => {
    const max = calcMaxRedeemable(10, 200, defaultConfig); // min = 10
    expect(max).toBeGreaterThan(0);
  });

  it('un punto menos del mínimo no puede canjear', () => {
    const max = calcMaxRedeemable(9, 200, defaultConfig); // min = 10
    expect(max).toBe(0);
  });
});

// ── 5. IVA — lógica de cálculo ────────────────────────────────
describe('Cálculo de IVA', () => {
  // IVA incluido en precio
  const calcTaxIncluded = (total: number, taxRate: number) => {
    if (taxRate <= 0) return 0;
    return total - total / (1 + taxRate / 100);
  };

  // IVA añadido
  const calcTaxAdded = (subtotal: number, taxRate: number) => {
    if (taxRate <= 0) return 0;
    return subtotal * (taxRate / 100);
  };

  it('IVA incluido del 13%: extrae correctamente de Bs 113', () => {
    expect(calcTaxIncluded(113, 13)).toBeCloseTo(13, 0);
  });

  it('IVA incluido del 16%: extrae de Bs 116', () => {
    const tax = calcTaxIncluded(116, 16);
    expect(tax).toBeCloseTo(16, 0);
  });

  it('IVA añadido del 18%: suma a Bs 100 da Bs 18', () => {
    expect(calcTaxAdded(100, 18)).toBeCloseTo(18);
  });

  it('IVA 0%: no hay impuesto', () => {
    expect(calcTaxIncluded(100, 0)).toBe(0);
    expect(calcTaxAdded(100, 0)).toBe(0);
  });

  it('IVA incluido: el total no cambia', () => {
    // El precio ya tiene IVA, solo se extrae para mostrar
    const total = 100;
    const tax   = calcTaxIncluded(total, 13);
    expect(total).toBe(100); // el total no varía
    expect(tax).toBeGreaterThan(0);
  });

  it('IVA añadido: el total sí aumenta', () => {
    const subtotal = 100;
    const tax      = calcTaxAdded(subtotal, 15);
    const total    = subtotal + tax;
    expect(total).toBeCloseTo(115);
  });
});

// ── 6. Descuento porcentual vs fijo ──────────────────────────
describe('Descuento porcentual vs fijo en carrito', () => {
  const applyDiscount = (subtotal: number, type: 'fixed' | 'percent', value: number) => {
    const amount = type === 'fixed'
      ? Math.min(value, subtotal)
      : Math.min(subtotal * value / 100, subtotal);
    return { discount: parseFloat(amount.toFixed(2)), total: Math.max(0, subtotal - amount) };
  };

  it('descuento fijo Bs 20 sobre Bs 100 da total Bs 80', () => {
    const { discount, total } = applyDiscount(100, 'fixed', 20);
    expect(discount).toBe(20);
    expect(total).toBe(80);
  });

  it('descuento 10% sobre Bs 100 da total Bs 90', () => {
    const { discount, total } = applyDiscount(100, 'percent', 10);
    expect(discount).toBe(10);
    expect(total).toBe(90);
  });

  it('descuento 15% sobre Bs 79.50 es correcto', () => {
    const { discount, total } = applyDiscount(79.50, 'percent', 15);
    expect(discount).toBeCloseTo(11.93, 1);
    expect(total).toBeCloseTo(67.58, 1);
  });

  it('descuento no puede exceder el subtotal', () => {
    const { discount, total } = applyDiscount(50, 'fixed', 200);
    expect(discount).toBe(50);
    expect(total).toBe(0);
  });

  it('100% de descuento da total 0', () => {
    const { total } = applyDiscount(150, 'percent', 100);
    expect(total).toBe(0);
  });

  it('descuento 0 no altera el total', () => {
    expect(applyDiscount(100, 'fixed',   0).total).toBe(100);
    expect(applyDiscount(100, 'percent', 0).total).toBe(100);
  });
});
