import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  AppState, CartState, CartItem, CartTotals,
  User, Company, Branch, CashSession, Customer, Product
} from '../../shared/types';

// ── App Store ─────────────────────────────────────────────────

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      user: null,
      company: null,
      branch: null,
      currentSession: null,
      setUser:           (user)    => set({ user }),
      setCompany:        (company) => set({ company }),
      setBranch:         (branch)  => set({ branch }),
      setCurrentSession: (session) => set({ currentSession: session }),
    }),
    { name: 'pos-app-store', partialize: (s) => ({ user: s.user, company: s.company, branch: s.branch }) }
  )
);

// ── Cart totals engine ────────────────────────────────────────
// Supports:
//   - Per-item discount (fixed Bs)
//   - Global discount (fixed Bs OR percentage)
//   - Configurable tax rate (from localStorage pref_taxRate)
//   - Tax can be "included in price" or "added on top"

export interface DiscountConfig {
  type:  'fixed' | 'percent';
  value: number;
}

function getTaxRate(): number {
  const stored = localStorage.getItem('pref_taxRate');
  return Math.max(0, parseFloat(stored ?? '0') || 0);
}

function getTaxMode(): 'included' | 'added' {
  return (localStorage.getItem('pref_taxMode') ?? 'included') as 'included' | 'added';
}

function computeTotals(
  items:          CartItem[],
  discountConfig: DiscountConfig,
  taxRate:        number = getTaxRate(),
  taxMode:        'included' | 'added' = getTaxMode(),
): CartTotals {
  const itemsSubtotal = items.reduce((acc, i) => acc + i.subtotal, 0);

  // Compute discount amount
  let discountAmount = 0;
  if (discountConfig.type === 'fixed') {
    discountAmount = discountConfig.value;
  } else {
    // percent
    discountAmount = (itemsSubtotal * discountConfig.value) / 100;
  }
  discountAmount = Math.min(discountAmount, itemsSubtotal); // can't exceed subtotal

  const afterDiscount = Math.max(0, itemsSubtotal - discountAmount);

  // Compute tax
  let tax = 0;
  let total = afterDiscount;
  if (taxRate > 0) {
    if (taxMode === 'included') {
      // Tax is already inside the price — extract it for display
      tax = afterDiscount - afterDiscount / (1 + taxRate / 100);
    } else {
      // Tax added on top
      tax   = afterDiscount * (taxRate / 100);
      total = afterDiscount + tax;
    }
  }

  return {
    subtotal: itemsSubtotal,
    discount: discountAmount,
    tax:      parseFloat(tax.toFixed(2)),
    total:    parseFloat(total.toFixed(2)),
  };
}

// Extended CartState with new discount config
export interface CartStateExtended extends CartState {
  discountConfig: DiscountConfig;
  setDiscountConfig: (cfg: DiscountConfig) => void;
  taxRate: number;
  taxMode: 'included' | 'added';
  refreshTaxSettings: () => void;
}

export const useCartStore = create<CartStateExtended>()((set, get) => ({
  items:          [],
  customer:       null,
  discount:       0,
  discountConfig: { type: 'fixed', value: 0 },
  taxRate:        getTaxRate(),
  taxMode:        getTaxMode(),
  totals:         { subtotal: 0, discount: 0, tax: 0, total: 0 },

  // Reload tax settings from localStorage (called after settings change)
  refreshTaxSettings: () => {
    const taxRate = getTaxRate();
    const taxMode = getTaxMode();
    const { items, discountConfig } = get();
    set({ taxRate, taxMode, totals: computeTotals(items, discountConfig, taxRate, taxMode) });
  },

  addItem: (product: Product, quantity = 1) => {
    const { items, discountConfig, taxRate, taxMode } = get();
    const existing = items.find(i => i.product.id === product.id);
    let newItems: CartItem[];
    if (existing) {
      newItems = items.map(i =>
        i.product.id === product.id
          ? { ...i, quantity: i.quantity + quantity, subtotal: (i.quantity + quantity) * i.price - i.discount }
          : i
      );
    } else {
      newItems = [...items, {
        product, quantity,
        price:    product.price,
        discount: 0,
        subtotal: product.price * quantity,
      }];
    }
    set({ items: newItems, totals: computeTotals(newItems, discountConfig, taxRate, taxMode) });
  },

  removeItem: (productId: string) => {
    const { discountConfig, taxRate, taxMode } = get();
    const newItems = get().items.filter(i => i.product.id !== productId);
    set({ items: newItems, totals: computeTotals(newItems, discountConfig, taxRate, taxMode) });
  },

  updateQuantity: (productId: string, quantity: number) => {
    if (quantity <= 0) { get().removeItem(productId); return; }
    const { items, discountConfig, taxRate, taxMode } = get();
    const newItems = items.map(i =>
      i.product.id === productId
        ? { ...i, quantity, subtotal: quantity * i.price - i.discount }
        : i
    );
    set({ items: newItems, totals: computeTotals(newItems, discountConfig, taxRate, taxMode) });
  },

  updateDiscount: (productId: string, itemDiscount: number) => {
    const { items, discountConfig, taxRate, taxMode } = get();
    const newItems = items.map(i =>
      i.product.id === productId
        ? { ...i, discount: itemDiscount, subtotal: i.quantity * i.price - itemDiscount }
        : i
    );
    set({ items: newItems, totals: computeTotals(newItems, discountConfig, taxRate, taxMode) });
  },

  setCustomer: (customer) => set({ customer }),

  // Legacy compat: fixed discount in Bs
  setGlobalDiscount: (value: number) => {
    const { items, taxRate, taxMode } = get();
    const discountConfig: DiscountConfig = { type: 'fixed', value };
    set({ discount: value, discountConfig, totals: computeTotals(items, discountConfig, taxRate, taxMode) });
  },

  // New: set discount with type (fixed | percent)
  setDiscountConfig: (cfg: DiscountConfig) => {
    const { items, taxRate, taxMode } = get();
    set({ discount: cfg.value, discountConfig: cfg, totals: computeTotals(items, cfg, taxRate, taxMode) });
  },

  clearCart: () => set({
    items: [], customer: null, discount: 0,
    discountConfig: { type: 'fixed', value: 0 },
    totals: { subtotal: 0, discount: 0, tax: 0, total: 0 },
  }),
}));
