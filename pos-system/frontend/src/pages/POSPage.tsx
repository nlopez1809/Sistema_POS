import React, { useState, useRef, useCallback } from 'react';
import {
  Search, ShoppingCart, Trash2, Plus, Minus, X,
  CreditCard, Banknote, QrCode, ChevronRight,
  Receipt, Loader2, CheckCircle2,
  AlertCircle, Package, Printer, SkipForward, Tag, Mail
} from 'lucide-react';
import { useCartStore, useAppStore } from '../../store';
import { productsApi, salesApi } from '../../lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usePrint } from '../../hooks/usePrint';
import { useOfflineSync } from '../../lib/offlineSync';
import { useEmail } from '../../lib/useEmail';
import { track } from '../../lib/monitoring';
import LoyaltyPanel from '../components/pos/LoyaltyPanel';
import toast from 'react-hot-toast';
import type { Product, PaymentMethod, Sale } from '../../../shared/types';

const fmt = (n: number) => `Bs ${n.toFixed(2)}`;

// ── Discount Panel ─────────────────────────────────────────────
function DiscountPanel() {
  const { setDiscountConfig, discountConfig, items } = useCartStore() as any;
  const [open, setOpen] = useState(false);
  const [type, setType]   = useState<'fixed' | 'percent'>(discountConfig?.type ?? 'fixed');
  const [value, setValue] = useState(discountConfig?.value > 0 ? String(discountConfig.value) : '');

  if (items.length === 0) return null;

  const apply = () => {
    const v = parseFloat(value) || 0;
    setDiscountConfig({ type, value: v });
    setOpen(false);
  };

  const clear = () => {
    setValue('');
    setDiscountConfig({ type: 'fixed', value: 0 });
    setOpen(false);
  };

  const hasDiscount = (discountConfig?.value ?? 0) > 0;

  return (
    <div className="discount-panel">
      <button onClick={() => setOpen(o => !o)} className={`discount-toggle ${hasDiscount ? 'active' : ''}`}>
        <Tag size={12} />
        {hasDiscount
          ? `Descuento: ${discountConfig.type === 'percent' ? `${discountConfig.value}%` : `Bs ${discountConfig.value}`}`
          : 'Agregar descuento'}
      </button>
      {open && (
        <div className="discount-popover">
          <div className="discount-type-tabs">
            <button onClick={() => setType('fixed')}   className={type === 'fixed'   ? 'active' : ''}>Bs fijo</button>
            <button onClick={() => setType('percent')} className={type === 'percent' ? 'active' : ''}>%</button>
          </div>
          <div className="discount-input-row">
            <input
              type="number"
              value={value}
              onChange={e => setValue(e.target.value)}
              placeholder={type === 'fixed' ? '0.00' : '0'}
              min="0"
              max={type === 'percent' ? '100' : undefined}
              step={type === 'fixed' ? '0.50' : '1'}
              autoFocus
              onKeyDown={e => e.key === 'Enter' && apply()}
            />
            <span className="discount-unit">{type === 'percent' ? '%' : 'Bs'}</span>
          </div>
          <div className="discount-actions">
            <button onClick={clear}  className="disc-btn-clear">Quitar</button>
            <button onClick={apply}  className="disc-btn-apply">Aplicar</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Product Card ──────────────────────────────────────────────
function ProductCard({ product, onAdd }: { product: Product; onAdd: (p: Product) => void }) {
  const qty = product.stock?.quantity ?? 0;
  const low = qty <= (product.stock?.min_quantity ?? 0);
  const outOfStock = product.has_stock && qty <= 0;

  return (
    <button
      onClick={() => !outOfStock && onAdd(product)}
      disabled={outOfStock}
      className={`pos-product-card ${outOfStock ? 'out-of-stock' : ''} ${low && !outOfStock ? 'low-stock' : ''}`}
    >
      <div className="product-icon"><Package size={22} /></div>
      <div className="product-info">
        <span className="product-name">{product.name}</span>
        <span className="product-sku">{product.sku || product.barcode || '—'}</span>
      </div>
      <div className="product-footer">
        <span className="product-price">{fmt(product.price)}</span>
        {product.has_stock && (
          <span className={`stock-badge ${low ? 'low' : ''} ${outOfStock ? 'empty' : ''}`}>
            {outOfStock ? 'Sin stock' : `${qty} uds`}
          </span>
        )}
      </div>
    </button>
  );
}

// ── Cart Line ─────────────────────────────────────────────────
function CartLine({ item }: { item: ReturnType<typeof useCartStore.getState>['items'][0] }) {
  const { updateQuantity, removeItem } = useCartStore();
  return (
    <div className="cart-line">
      <div className="cart-line-info">
        <span className="cart-line-name">{item.product.name}</span>
        <span className="cart-line-price">{fmt(item.price)} × {item.quantity}</span>
      </div>
      <div className="cart-line-controls">
        <button onClick={() => updateQuantity(item.product.id, item.quantity - 1)} className="qty-btn"><Minus size={12} /></button>
        <span className="qty-value">{item.quantity}</span>
        <button onClick={() => updateQuantity(item.product.id, item.quantity + 1)} className="qty-btn"><Plus size={12} /></button>
        <span className="cart-line-subtotal">{fmt(item.subtotal)}</span>
        <button onClick={() => removeItem(item.product.id)} className="remove-btn"><X size={14} /></button>
      </div>
    </div>
  );
}

// ── Payment Modal ─────────────────────────────────────────────
function PaymentModal({
  total, onConfirm, onClose, loading, qrPaymentUrl,
}: {
  total: number;
  onConfirm: (method: PaymentMethod, paidAmount: number) => void;
  onClose: () => void;
  loading: boolean;
  qrPaymentUrl?: string | null;
}) {
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [paid, setPaid] = useState('');

  const paidNum = parseFloat(paid) || 0;
  const change = Math.max(0, paidNum - total);
  const valid = method !== 'cash' || paidNum >= total;

  const quickAmounts = [
    Math.ceil(total / 10) * 10,
    Math.ceil(total / 50) * 50,
    Math.ceil(total / 100) * 100,
  ].filter((v, i, a) => a.indexOf(v) === i && v >= total);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="payment-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Procesar pago</h2>
          <button onClick={onClose}><X size={20} /></button>
        </div>

        <div className="total-display">
          <span className="total-label">Total a cobrar</span>
          <span className="total-amount">{fmt(total)}</span>
        </div>

        <div className="payment-methods">
          {([
            { id: 'cash', label: 'Efectivo', Icon: Banknote },
            { id: 'card', label: 'Tarjeta',  Icon: CreditCard },
            { id: 'qr',   label: 'QR',       Icon: QrCode },
          ] as const).map(({ id, label, Icon }) => (
            <button key={id} onClick={() => setMethod(id)} className={`method-btn ${method === id ? 'active' : ''}`}>
              <Icon size={20} />{label}
            </button>
          ))}
        </div>

        {method === 'qr' && qrPaymentUrl && (
          <div className="qr-payment-display">
            <p className="qr-instruction">Muestra este QR al cliente para que realice el pago</p>
            <img src={qrPaymentUrl} alt="QR de pago" className="qr-payment-img" />
          </div>
        )}

        {method === 'cash' && (
          <>
            <div className="cash-input-section">
              <label>Monto recibido</label>
              <input
                type="number" value={paid} onChange={e => setPaid(e.target.value)}
                placeholder={total.toFixed(2)} className="cash-input" autoFocus min={0} step="0.50"
              />
            </div>
            <div className="quick-amounts">
              {quickAmounts.slice(0, 4).map(a => (
                <button key={a} onClick={() => setPaid(a.toString())} className="quick-btn">Bs {a}</button>
              ))}
              <button onClick={() => setPaid(total.toFixed(2))} className="quick-btn exact">Exacto</button>
            </div>
            {paidNum >= total && (
              <div className="change-display">
                <span>Cambio</span>
                <span className="change-amount">{fmt(change)}</span>
              </div>
            )}
          </>
        )}

        <button
          onClick={() => onConfirm(method, method === 'cash' ? paidNum : total)}
          disabled={!valid || loading}
          className={`confirm-btn ${valid ? 'ready' : ''}`}
        >
          {loading
            ? <><Loader2 size={18} className="spin" /> Procesando...</>
            : <><CheckCircle2 size={18} /> Confirmar venta</>
          }
        </button>
      </div>
    </div>
  );
}

// ── Sale Success Modal ────────────────────────────────────────
function SaleSuccessModal({ sale, onClose }: { sale: Sale; onClose: () => void }) {
  const { printTicketBrowser } = usePrint();
  const { sendTicketEmail }    = useEmail();
  const [emailInput, setEmailInput]   = useState('');
  const [showEmail,  setShowEmail]    = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);

  const handlePrint = () => printTicketBrowser(sale);

  const handleSendEmail = async () => {
    if (!emailInput.trim()) return;
    setSendingEmail(true);
    try {
      await sendTicketEmail({ to: emailInput.trim(), sale });
      toast.success(`Recibo enviado a ${emailInput}`);
      setShowEmail(false);
      setEmailInput('');
    } catch (err: any) {
      toast.error(err.message ?? 'Error enviando email');
    } finally {
      setSendingEmail(false);
    }
  };

  const methodLabel: Record<string, string> = {
    cash: 'Efectivo', card: 'Tarjeta', qr: 'QR',
    transfer: 'Transferencia', mixed: 'Mixto',
  };

  return (
    <div className="modal-overlay">
      <div className="success-modal">
        <div className="success-icon-wrap">
          <div className="success-icon">
            <CheckCircle2 size={40} color="#22c55e" />
          </div>
        </div>

        <h2 className="success-title">¡Venta completada!</h2>
        <p className="success-ticket">{sale.ticket_number}</p>

        <div className="success-details">
          <div className="success-row">
            <span>Total cobrado</span>
            <span className="success-val">{fmt(sale.total)}</span>
          </div>
          <div className="success-row">
            <span>Método de pago</span>
            <span>{methodLabel[sale.payment_method] ?? sale.payment_method}</span>
          </div>
          {sale.change_amount > 0 && (
            <div className="success-row highlight">
              <span>Cambio a entregar</span>
              <span className="success-change">{fmt(sale.change_amount)}</span>
            </div>
          )}
        </div>

        {/* Email section */}
        {showEmail ? (
          <div className="success-email-form">
            <input
              type="email"
              value={emailInput}
              onChange={e => setEmailInput(e.target.value)}
              placeholder="correo@cliente.com"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleSendEmail()}
              className="success-email-input"
            />
            <div className="success-email-actions">
              <button onClick={() => setShowEmail(false)} className="success-email-cancel">Cancelar</button>
              <button onClick={handleSendEmail} disabled={!emailInput.trim() || sendingEmail} className="success-email-send">
                {sendingEmail ? <Loader2 size={13} className="spin" /> : null}
                {sendingEmail ? 'Enviando…' : 'Enviar'}
              </button>
            </div>
          </div>
        ) : (
          <div className="success-actions">
            <button onClick={handlePrint} className="success-btn-print">
              <Printer size={16} /> Imprimir
            </button>
            <button onClick={() => setShowEmail(true)} className="success-btn-email">
              <Mail size={16} /> Email
            </button>
            <button onClick={onClose} className="success-btn-next">
              <SkipForward size={16} /> Nueva venta
            </button>
          </div>
        )}

        <p className="success-hint">El ticket se imprimirá en una nueva ventana</p>
      </div>
    </div>
  );
}

// ── Main POS Page ─────────────────────────────────────────────
export default function POSPage() {
  const { user, company, branch, currentSession } = useAppStore();
  const { items, totals, addItem, clearCart } = useCartStore();
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [completedSale, setCompletedSale] = useState<Sale | null>(null);
  const qc = useQueryClient();

  const { isOnline, saveOffline, getCachedProducts, cacheProducts } = useOfflineSync();

  // Load products — con fallback a caché offline
  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products', company?.id, branch?.id],
    queryFn: async () => {
      if (!company?.id || !branch?.id) return [];
      if (!isOnline) {
        // Sin conexión: usar caché local
        return getCachedProducts(company.id);
      }
      const data = await productsApi.list(company.id, branch.id);
      // Actualizar caché para uso offline futuro
      cacheProducts(data).catch(console.error);
      return data;
    },
    enabled: !!company?.id && !!branch?.id,
    staleTime: 30_000,
  });

  const filtered = products.filter(p => {
    const matchSearch = !search
      || p.name.toLowerCase().includes(search.toLowerCase())
      || p.barcode === search
      || p.sku?.toLowerCase().includes(search.toLowerCase());
    const matchCat = !activeCategory || p.category_id === activeCategory;
    return matchSearch && matchCat;
  });

  const categories = Array.from(
    new Map(products.filter(p => p.category).map(p => [p.category!.id, p.category!])).values()
  );

  const saleMutation = useMutation({
    mutationFn: async ({ method, paidAmount }: { method: PaymentMethod; paidAmount: number }) => {
      if (!company || !branch || !user) throw new Error('Sesión inválida');

      const payload = {
        company_id:     company.id,
        branch_id:      branch.id,
        user_id:        user.id,
        cash_session_id: currentSession?.id,
        subtotal:       totals.subtotal,
        discount:       totals.discount,
        tax:            totals.tax,
        total:          totals.total,
        paid_amount:    paidAmount,
        change_amount:  Math.max(0, paidAmount - totals.total),
        payment_method: method,
        items: items.map(i => ({
          product_id: i.product.id,
          name:       i.product.name,
          price:      i.price,
          cost:       i.product.cost,
          quantity:   i.quantity,
          discount:   i.discount,
          subtotal:   i.subtotal,
        })),
      };

      // Si no hay conexión → guardar en cola offline
      if (!isOnline) {
        const localId = await saveOffline(payload);
        toast('Venta guardada localmente. Se sincronizará al reconectar.', {
          icon: '📶',
          duration: 4000,
        });
        // Devolver un objeto "sale" simulado para el modal de éxito
        return {
          id:             localId,
          ticket_number: `LOCAL-${localId.slice(-6).toUpperCase()}`,
          ...payload,
          status: 'pending' as const,
          created_at: new Date().toISOString(),
        } as unknown as Sale;
      }

      return salesApi.create(payload) as Promise<Sale>;
    },
    onSuccess: (sale) => {
      clearCart();
      setShowPayment(false);
      qc.invalidateQueries({ queryKey: ['products', company.id, branch.id] });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['session-sales'] });
      // Trackear evento de venta para Sentry
      track.sale(sale.total, sale.payment_method).catch(() => {});
      // Construir objeto sale completo con items para el ticket
      const saleWithItems = {
        ...sale,
        items: items.map(i => ({
          id: '',
          sale_id: sale.id,
          product_id: i.product.id,
          name: i.product.name,
          price: i.price,
          cost: i.product.cost,
          quantity: i.quantity,
          discount: i.discount,
          subtotal: i.subtotal,
        })),
      };
      setCompletedSale(saleWithItems as Sale);
    },
    onError: (err: Error) => toast.error(`Error: ${err.message}`),
  });

  const searchRef = useRef<HTMLInputElement>(null);
  const handleSearchKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && search.length > 3) {
      const found = products.find(p => p.barcode === search || p.sku === search);
      if (found) { addItem(found); setSearch(''); }
    }
  }, [search, products, addItem]);

  const handleCloseSuccess = () => {
    setCompletedSale(null);
    // Enfocar el buscador para la siguiente venta
    setTimeout(() => searchRef.current?.focus(), 100);
  };

  return (
    <div className="pos-layout">
      <style>{posStyles}</style>

      {/* ── Left: Products ── */}
      <div className="pos-products-panel">
        <div className="pos-search">
          <Search size={16} className="search-icon" />
          <input
            ref={searchRef}
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={handleSearchKey}
            placeholder="Buscar producto o escanear código…"
            className="search-input"
            autoFocus
          />
          {search && <button onClick={() => setSearch('')} className="search-clear"><X size={14} /></button>}
        </div>

        <div className="category-bar">
          <button onClick={() => setActiveCategory(null)} className={`cat-pill ${!activeCategory ? 'active' : ''}`}>
            Todos
          </button>
          {categories.map(c => (
            <button
              key={c.id}
              onClick={() => setActiveCategory(activeCategory === c.id ? null : c.id)}
              className={`cat-pill ${activeCategory === c.id ? 'active' : ''}`}
              style={activeCategory === c.id
                ? { background: c.color, borderColor: c.color, color: '#fff' }
                : { borderColor: c.color + '60' }}
            >
              {c.name}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="loading-state"><Loader2 size={28} className="spin" /><span>Cargando productos…</span></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state"><AlertCircle size={28} /><span>Sin resultados</span></div>
        ) : (
          <div className="products-grid">
            {filtered.map(p => <ProductCard key={p.id} product={p} onAdd={addItem} />)}
          </div>
        )}
      </div>

      {/* ── Right: Cart ── */}
      <div className="pos-cart-panel">
        <div className="cart-header">
          <ShoppingCart size={18} />
          <span>Ticket</span>
          {items.length > 0 && (
            <button onClick={clearCart} className="clear-cart-btn" title="Limpiar carrito">
              <Trash2 size={14} />
            </button>
          )}
        </div>

        <div className="cart-items">
          {items.length === 0 ? (
            <div className="cart-empty">
              <ShoppingCart size={40} strokeWidth={1} />
              <p>Agrega productos<br />al ticket</p>
            </div>
          ) : (
            items.map(item => <CartLine key={item.product.id} item={item} />)
          )}
        </div>

        {/* Loyalty panel — visible when customer selected */}
        {(useCartStore.getState() as any).customer && items.length > 0 && (
          <div style={{ padding: '0 16px' }}>
            <LoyaltyPanel
              customer={(useCartStore.getState() as any).customer}
              cartTotal={totals.total}
              setGlobalDiscount={(n) => useCartStore.getState().setGlobalDiscount(n)}
            />
          </div>
        )}

        {items.length > 0 && (
          <div className="cart-totals">
            {/* Discount controls */}
            <DiscountPanel />

            <div className="totals-row">
              <span>Subtotal</span><span>{fmt(totals.subtotal)}</span>
            </div>
            {totals.discount > 0 && (
              <div className="totals-row discount">
                <span>
                  Descuento
                  {(useCartStore.getState() as any).discountConfig?.type === 'percent'
                    ? ` (${(useCartStore.getState() as any).discountConfig.value}%)`
                    : ''}
                </span>
                <span>-{fmt(totals.discount)}</span>
              </div>
            )}
            {totals.tax > 0 && (
              <div className="totals-row tax">
                <span>IVA ({(useCartStore.getState() as any).taxRate ?? 0}%)</span>
                <span>{fmt(totals.tax)}</span>
              </div>
            )}
            <div className="totals-row total">
              <span>TOTAL</span><span>{fmt(totals.total)}</span>
            </div>
            <div className="totals-row muted">
              <span>{items.reduce((a, i) => a + i.quantity, 0)} producto(s)</span>
            </div>
          </div>
        )}

        <div className="cart-actions">
          <button
            onClick={() => setShowPayment(true)}
            disabled={items.length === 0}
            className="pay-btn"
          >
            <Receipt size={18} />
            Cobrar {items.length > 0 ? fmt(totals.total) : ''}
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Modals */}
      {showPayment && (
        <PaymentModal
          total={totals.total}
          loading={saleMutation.isPending}
          onClose={() => setShowPayment(false)}
          onConfirm={(method, paidAmount) => saleMutation.mutate({ method, paidAmount })}
          qrPaymentUrl={company?.qr_payment_url}
        />
      )}

      {completedSale && (
        <SaleSuccessModal
          sale={completedSale}
          onClose={handleCloseSuccess}
        />
      )}
    </div>
  );
}

const posStyles = `
  .pos-layout { display:flex; height:calc(100vh - 46px); background:#0f0f11; color:#e8e6e1; font-family:'DM Sans','Inter',sans-serif; }
  .pos-products-panel { flex:1; display:flex; flex-direction:column; padding:16px; gap:12px; overflow:hidden; }
  .pos-search { position:relative; display:flex; align-items:center; }
  .search-icon { position:absolute; left:12px; color:#6b6a65; }
  .search-input { width:100%; background:#1a1a1f; border:1px solid #2a2a30; border-radius:10px; padding:10px 36px; color:#e8e6e1; font-size:14px; outline:none; transition:border-color .15s; }
  .search-input:focus { border-color:var(--c-primary); }
  .search-input::placeholder { color:#4a4a55; }
  .search-clear { position:absolute; right:10px; background:none; border:none; color:#6b6a65; cursor:pointer; padding:4px; }
  .category-bar { display:flex; gap:8px; overflow-x:auto; scrollbar-width:none; padding-bottom:2px; }
  .category-bar::-webkit-scrollbar { display:none; }
  .cat-pill { white-space:nowrap; padding:5px 14px; border-radius:20px; border:1px solid #2a2a30; background:transparent; color:#9997a0; font-size:12px; cursor:pointer; transition:all .15s; }
  .cat-pill.active { background:var(--c-primary); border-color:var(--c-primary); color:#fff; }
  .cat-pill:hover:not(.active) { border-color:#3a3a45; color:#e8e6e1; }
  .products-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); gap:10px; overflow-y:auto; padding-right:4px; scrollbar-width:thin; scrollbar-color:#2a2a30 transparent; }
  .pos-product-card { background:#1a1a1f; border:1px solid #24242a; border-radius:12px; padding:14px 12px 10px; cursor:pointer; text-align:left; transition:all .15s; display:flex; flex-direction:column; gap:8px; color:inherit; }
  .pos-product-card:hover:not(.out-of-stock) { border-color:var(--c-primary); background:#1e1e28; transform:translateY(-1px); }
  .pos-product-card:active:not(.out-of-stock) { transform:scale(0.98); }
  .pos-product-card.out-of-stock { opacity:0.45; cursor:not-allowed; }
  .pos-product-card.low-stock { border-color:#d97706; }
  .product-icon { color:var(--c-primary); }
  .product-info { display:flex; flex-direction:column; gap:2px; }
  .product-name { font-size:13px; font-weight:500; line-height:1.3; color:#e8e6e1; }
  .product-sku { font-size:11px; color:#5a5a65; font-family:monospace; }
  .product-footer { display:flex; align-items:center; justify-content:space-between; margin-top:auto; }
  .product-price { font-size:14px; font-weight:600; color:var(--c-primary-text); }
  .stock-badge { font-size:10px; padding:2px 7px; border-radius:20px; background:#1f2937; color:#6b7280; }
  .stock-badge.low { background:#451a03; color:#d97706; }
  .stock-badge.empty { background:#3b0000; color:#ef4444; }
  .loading-state, .empty-state { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; color:#4a4a55; flex:1; font-size:14px; }
  .pos-cart-panel { width:340px; min-width:300px; display:flex; flex-direction:column; background:#131318; border-left:1px solid #1e1e25; }
  .cart-header { display:flex; align-items:center; gap:8px; padding:16px 16px 12px; border-bottom:1px solid #1e1e25; font-size:13px; font-weight:500; color:#9997a0; }
  .clear-cart-btn { margin-left:auto; background:none; border:none; color:#4a4a55; cursor:pointer; padding:4px; border-radius:6px; transition:color .15s,background .15s; }
  .clear-cart-btn:hover { color:#ef4444; background:#2a1515; }
  .cart-items { flex:1; overflow-y:auto; padding:8px; scrollbar-width:thin; scrollbar-color:#2a2a30 transparent; }
  .cart-empty { height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; color:#3a3a42; text-align:center; font-size:13px; line-height:1.5; }
  .cart-line { display:flex; align-items:center; gap:8px; padding:10px 8px; border-radius:8px; border-bottom:1px solid #1a1a1f; }
  .cart-line:hover { background:#1a1a1f; }
  .cart-line-info { flex:1; min-width:0; }
  .cart-line-name { display:block; font-size:13px; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:#e8e6e1; }
  .cart-line-price { display:block; font-size:11px; color:#6b6a65; margin-top:2px; }
  .cart-line-controls { display:flex; align-items:center; gap:6px; flex-shrink:0; }
  .qty-btn { width:22px; height:22px; border-radius:6px; border:1px solid #2a2a30; background:#1a1a1f; color:#9997a0; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all .1s; }
  .qty-btn:hover { border-color:var(--c-primary); color:var(--c-primary-text); }
  .qty-value { font-size:13px; font-weight:600; min-width:18px; text-align:center; color:#e8e6e1; }
  .cart-line-subtotal { font-size:13px; font-weight:600; color:var(--c-primary-text); min-width:56px; text-align:right; }
  .remove-btn { background:none; border:none; color:#3a3a42; cursor:pointer; padding:2px; border-radius:4px; transition:color .1s; }
  .remove-btn:hover { color:#ef4444; }
  .cart-totals { padding:12px 16px; border-top:1px solid #1e1e25; display:flex; flex-direction:column; gap:6px; }
  .totals-row { display:flex; justify-content:space-between; font-size:13px; color:#6b6a65; }
  .totals-row.discount { color:#34d399; }
  .totals-row.tax { color:#f59e0b; }
  .totals-row.total { font-size:20px; font-weight:700; color:#e8e6e1; padding-top:8px; border-top:1px solid #2a2a30; margin-top:4px; }
  .totals-row.muted { font-size:11px; color:#3a3a42; }

  /* Discount panel */
  .discount-panel { position:relative; }
  .discount-toggle {
    width:100%; display:flex; align-items:center; gap:6px;
    background:none; border:1px dashed #2a2a30; border-radius:8px;
    color:#4a4a55; font-size:12px; padding:6px 10px; cursor:pointer;
    transition:all .15s; margin-bottom:4px;
  }
  .discount-toggle.active { border-color:#34d39955; color:#34d399; background:#0f2d1a44; }
  .discount-toggle:hover { border-color:#3a3a45; color:#9997a0; }
  .discount-popover {
    position:absolute; bottom:calc(100% + 4px); left:0; right:0;
    background:#1a1a1f; border:1px solid #2a2a30; border-radius:10px;
    padding:12px; display:flex; flex-direction:column; gap:8px; z-index:10;
    box-shadow:0 8px 30px rgba(0,0,0,.4);
    animation:fadeUp .15s ease;
  }
  @keyframes fadeUp { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
  .discount-type-tabs { display:flex; gap:4px; }
  .discount-type-tabs button {
    flex:1; padding:5px; background:none; border:1px solid #2a2a30;
    border-radius:6px; color:#6b6a65; font-size:12px; cursor:pointer; transition:all .1s;
  }
  .discount-type-tabs button.active { background:#1a1a2e; border-color:var(--c-primary); color:var(--c-primary-text); }
  .discount-input-row { display:flex; align-items:center; gap:6px; }
  .discount-input-row input {
    flex:1; background:#131318; border:1px solid #2a2a30; border-radius:7px;
    padding:8px 10px; color:#e8e6e1; font-size:15px; font-weight:600; outline:none;
    transition:border-color .15s;
  }
  .discount-input-row input:focus { border-color:var(--c-primary); }
  .discount-unit { font-size:14px; color:#6b6a65; min-width:18px; }
  .discount-actions { display:flex; gap:6px; }
  .disc-btn-clear { flex:1; padding:6px; background:none; border:1px solid #2a2a30; border-radius:7px; color:#6b6a65; font-size:12px; cursor:pointer; }
  .disc-btn-clear:hover { border-color:#ef4444; color:#ef4444; }
  .disc-btn-apply { flex:1; padding:6px; background:var(--c-primary); border:none; border-radius:7px; color:#fff; font-size:12px; font-weight:600; cursor:pointer; }
  .disc-btn-apply:hover { background:var(--c-primary-hover); }

  .cart-actions { padding:12px 16px 16px; }
  .pay-btn { width:100%; display:flex; align-items:center; justify-content:center; gap:8px; padding:14px; background:var(--c-primary); border:none; border-radius:12px; color:#fff; font-size:16px; font-weight:600; cursor:pointer; transition:all .15s; }
  .pay-btn:hover:not(:disabled) { background:var(--c-primary-hover); transform:translateY(-1px); }
  .pay-btn:disabled { opacity:0.35; cursor:not-allowed; }

  /* Payment modal */
  .modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,.7); display:flex; align-items:center; justify-content:center; z-index:100; backdrop-filter:blur(2px); }
  .payment-modal { background:#1a1a1f; border:1px solid #2a2a30; border-radius:20px; padding:28px; width:380px; max-width:95vw; display:flex; flex-direction:column; gap:20px; }
  .modal-header { display:flex; align-items:center; justify-content:space-between; }
  .modal-header h2 { font-size:18px; font-weight:600; }
  .modal-header button { background:none; border:none; color:#6b6a65; cursor:pointer; padding:4px; }
  .total-display { background:#0f0f11; border-radius:14px; padding:20px; text-align:center; display:flex; flex-direction:column; gap:4px; }
  .total-label { font-size:13px; color:#6b6a65; }
  .total-amount { font-size:36px; font-weight:700; color:var(--c-primary-text); }
  .payment-methods { display:flex; gap:8px; }
  .method-btn { flex:1; display:flex; flex-direction:column; align-items:center; gap:6px; padding:12px 8px; background:#131318; border:1px solid #2a2a30; border-radius:10px; color:#9997a0; font-size:12px; cursor:pointer; transition:all .15s; }
  .method-btn.active { border-color:var(--c-primary); background:#1a1a2e; color:var(--c-primary-text); }
  .method-btn:hover:not(.active) { border-color:#3a3a45; color:#e8e6e1; }
  .cash-input-section { display:flex; flex-direction:column; gap:6px; }
  .cash-input-section label { font-size:12px; color:#6b6a65; }
  .cash-input { background:#131318; border:1px solid #2a2a30; border-radius:10px; padding:12px 14px; color:#e8e6e1; font-size:20px; font-weight:600; outline:none; transition:border-color .15s; width:100%; }
  .cash-input:focus { border-color:var(--c-primary); }
  .quick-amounts { display:flex; gap:8px; flex-wrap:wrap; }
  .quick-btn { padding:6px 12px; background:#1a1a1f; border:1px solid #2a2a30; border-radius:8px; color:#9997a0; font-size:12px; cursor:pointer; transition:all .1s; }
  .quick-btn:hover { border-color:var(--c-primary); color:var(--c-primary-text); }
  .quick-btn.exact { border-color:#34d399; color:#34d399; }
  .change-display { display:flex; justify-content:space-between; align-items:center; background:#0f1f15; border:1px solid #1a3a2a; border-radius:10px; padding:12px 16px; }
  .change-display span:first-child { font-size:13px; color:#6b7280; }
  .change-amount { font-size:22px; font-weight:700; color:#34d399; }
  .confirm-btn { display:flex; align-items:center; justify-content:center; gap:8px; padding:14px; background:#2a2a30; border:none; border-radius:12px; color:#6b6a65; font-size:15px; font-weight:600; cursor:not-allowed; transition:all .15s; }
  .confirm-btn.ready { background:#22c55e; color:#fff; cursor:pointer; }
  .confirm-btn.ready:hover { background:#16a34a; }
  .confirm-btn:disabled { opacity:0.6; }

  .qr-payment-display { display:flex; flex-direction:column; align-items:center; gap:12px; padding:16px; background:#0f0f11; border-radius:14px; }
  .qr-instruction { font-size:13px; color:#6b6a65; text-align:center; }
  .qr-payment-img { width:200px; height:200px; object-fit:contain; border-radius:12px; background:#fff; padding:8px; }

  /* Success modal */
  .success-modal {
    background:#1a1a1f; border:1px solid #2a2a30; border-radius:24px;
    padding:36px 32px; width:360px; max-width:95vw;
    display:flex; flex-direction:column; align-items:center; gap:16px;
    animation: successPop .3s cubic-bezier(.175,.885,.32,1.275) forwards;
  }
  @keyframes successPop {
    from { opacity:0; transform:scale(.85) translateY(20px); }
    to   { opacity:1; transform:scale(1) translateY(0); }
  }
  .success-icon-wrap { margin-bottom:4px; }
  .success-icon {
    width:72px; height:72px; border-radius:50%;
    background:#0f2d1a; border:2px solid #22c55e33;
    display:flex; align-items:center; justify-content:center;
    animation: iconPulse .6s ease forwards;
  }
  @keyframes iconPulse {
    0%   { transform:scale(0.6); opacity:0; }
    60%  { transform:scale(1.1); }
    100% { transform:scale(1);   opacity:1; }
  }
  .success-title { font-size:22px; font-weight:700; color:#e8e6e1; margin:0; }
  .success-ticket { font-family:monospace; font-size:13px; color:#4a4a55; background:#131318; border:1px solid #2a2a30; border-radius:8px; padding:4px 12px; }
  .success-details { width:100%; background:#131318; border-radius:12px; overflow:hidden; }
  .success-row { display:flex; justify-content:space-between; align-items:center; padding:11px 16px; border-bottom:1px solid #1a1a1f; font-size:13px; color:#6b6a65; }
  .success-row:last-child { border:none; }
  .success-row.highlight { background:#0f1f15; }
  .success-val { font-weight:700; color:#e8e6e1; font-size:15px; }
  .success-change { font-size:20px; font-weight:700; color:#22c55e; }
  .success-actions { display:flex; gap:8px; width:100%; margin-top:4px; flex-wrap:wrap; }
  .success-btn-print {
    flex:1; display:flex; align-items:center; justify-content:center; gap:7px;
    padding:11px; background:#1a1a2e; border:1px solid var(--c-primary)66;
    border-radius:11px; color:var(--c-primary-text); font-size:13px; font-weight:500;
    cursor:pointer; transition:all .15s; min-width:80px;
  }
  .success-btn-print:hover { background:#1e1e38; border-color:var(--c-primary); }
  .success-btn-email {
    flex:1; display:flex; align-items:center; justify-content:center; gap:7px;
    padding:11px; background:#1a1a1f; border:1px solid #2a2a30;
    border-radius:11px; color:#9997a0; font-size:13px; font-weight:500;
    cursor:pointer; transition:all .15s; min-width:80px;
  }
  .success-btn-email:hover { border-color:var(--c-primary); color:var(--c-primary-text); }
  .success-btn-next {
    flex:1; display:flex; align-items:center; justify-content:center; gap:7px;
    padding:11px; background:#22c55e; border:none;
    border-radius:11px; color:#fff; font-size:13px; font-weight:600;
    cursor:pointer; transition:all .15s; min-width:80px;
  }
  .success-btn-next:hover { background:#16a34a; transform:translateY(-1px); }
  .success-email-form { width:100%; display:flex; flex-direction:column; gap:8px; }
  .success-email-input { width:100%; background:#131318; border:1px solid #2a2a30; border-radius:10px; padding:11px 14px; color:#e8e6e1; font-size:14px; outline:none; transition:border-color .15s; }
  .success-email-input:focus { border-color:var(--c-primary); }
  .success-email-actions { display:flex; gap:8px; }
  .success-email-cancel { flex:1; padding:10px; background:none; border:1px solid #2a2a30; border-radius:9px; color:#9997a0; font-size:13px; cursor:pointer; }
  .success-email-send { flex:2; display:flex; align-items:center; justify-content:center; gap:6px; padding:10px; background:var(--c-primary); border:none; border-radius:9px; color:#fff; font-size:13px; font-weight:600; cursor:pointer; transition:background .15s; }
  .success-email-send:hover:not(:disabled) { background:var(--c-primary-hover); }
  .success-email-send:disabled { opacity:0.5; cursor:not-allowed; }
  .success-hint { font-size:11px; color:#2a2a38; margin-top:-8px; }

  .spin { animation:spin 1s linear infinite; }
  @keyframes spin { to { transform:rotate(360deg); } }
`;
