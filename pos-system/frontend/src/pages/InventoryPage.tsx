import React, { useState } from 'react';
import {
  Plus, Search, Edit2, Package, AlertTriangle,
  ChevronUp, ChevronDown, X, Save, Loader2, Barcode
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../../store';
import { productsApi } from '../../lib/supabase';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';
import type { Product, Category } from '../../../shared/types';

// ── Helpers ───────────────────────────────────────────────────
const fmt = (n: number) => `Bs ${n.toFixed(2)}`;

type SortKey = 'name' | 'price' | 'stock' | 'category';
type SortDir = 'asc' | 'desc';

// ── Product Form Modal ────────────────────────────────────────
function ProductModal({
  product,
  categories,
  companyId,
  branchId,
  onClose,
}: {
  product?: Product;
  categories: Category[];
  companyId: string;
  branchId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const isEdit = !!product;

  const [form, setForm] = useState({
    name: product?.name ?? '',
    sku: product?.sku ?? '',
    barcode: product?.barcode ?? '',
    price: product?.price?.toString() ?? '',
    cost: product?.cost?.toString() ?? '',
    category_id: product?.category_id ?? '',
    unit: product?.unit ?? 'unit',
    has_stock: product?.has_stock ?? true,
    is_active: product?.is_active ?? true,
    description: product?.description ?? '',
  });
  const [stockQty, setStockQty] = useState('');
  const [minQty, setMinQty] = useState('');

  const set = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }));

  const saveMutation = useMutation({
    mutationFn: async () => {
        const payload = {
        ...form,
        company_id: companyId,
        price: parseFloat(form.price) || 0,
        cost: parseFloat(form.cost) || 0,
        category_id: form.category_id || undefined,
      };

      if (isEdit) {
        return productsApi.update(product!.id, payload);
      } else {
        const newProduct = await productsApi.create(payload as any);
        // Create initial stock record
        if (form.has_stock) {
          await supabase.from('stock').insert({
            product_id: newProduct.id,
            branch_id: branchId,
            quantity: parseFloat(stockQty) || 0,
            min_quantity: parseFloat(minQty) || 0,
          });
        }
        return newProduct;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products', companyId, branchId] });
      qc.invalidateQueries({ queryKey: ['products'] });
      toast.success(isEdit ? 'Producto actualizado' : 'Producto creado');
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const units = ['unit', 'kg', 'g', 'l', 'ml', 'm', 'box', 'pack'];

  return (
    <div className="inv-modal-overlay" onClick={onClose}>
      <div className="inv-modal" onClick={e => e.stopPropagation()}>
        <div className="inv-modal-header">
          <h2>{isEdit ? 'Editar producto' : 'Nuevo producto'}</h2>
          <button onClick={onClose}><X size={18}/></button>
        </div>

        <div className="inv-modal-body">
          <div className="form-row">
            <div className="form-group full">
              <label>Nombre *</label>
              <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Coca Cola 2L"/>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>SKU</label>
              <input value={form.sku} onChange={e => set('sku', e.target.value)} placeholder="COC2L"/>
            </div>
            <div className="form-group">
              <label><Barcode size={12} className="inline-icon"/>Código de barras</label>
              <input value={form.barcode} onChange={e => set('barcode', e.target.value)} placeholder="7500435000038"/>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Precio de venta *</label>
              <input type="number" value={form.price} onChange={e => set('price', e.target.value)} placeholder="0.00" min="0" step="0.50"/>
            </div>
            <div className="form-group">
              <label>Costo</label>
              <input type="number" value={form.cost} onChange={e => set('cost', e.target.value)} placeholder="0.00" min="0" step="0.50"/>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Categoría</label>
              <select value={form.category_id} onChange={e => set('category_id', e.target.value)}>
                <option value="">Sin categoría</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Unidad</label>
              <select value={form.unit} onChange={e => set('unit', e.target.value)}>
                {units.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>

          {!isEdit && form.has_stock && (
            <div className="form-row">
              <div className="form-group">
                <label>Stock inicial</label>
                <input type="number" value={stockQty} onChange={e => setStockQty(e.target.value)} placeholder="0" min="0"/>
              </div>
              <div className="form-group">
                <label>Stock mínimo</label>
                <input type="number" value={minQty} onChange={e => setMinQty(e.target.value)} placeholder="0" min="0"/>
              </div>
            </div>
          )}

          <div className="form-row">
            <div className="form-group full">
              <label>Descripción</label>
              <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={2} placeholder="Opcional…"/>
            </div>
          </div>

          <div className="form-toggles">
            <label className="toggle-label">
              <input type="checkbox" checked={form.has_stock} onChange={e => set('has_stock', e.target.checked)}/>
              <span>Controlar stock</span>
            </label>
            <label className="toggle-label">
              <input type="checkbox" checked={form.is_active} onChange={e => set('is_active', e.target.checked)}/>
              <span>Producto activo</span>
            </label>
          </div>
        </div>

        <div className="inv-modal-footer">
          <button onClick={onClose} className="btn-ghost">Cancelar</button>
          <button
            onClick={() => saveMutation.mutate()}
            disabled={!form.name || !form.price || saveMutation.isPending}
            className="btn-primary"
          >
            {saveMutation.isPending ? <><Loader2 size={14} className="spin"/>Guardando…</> : <><Save size={14}/>Guardar</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Stock Adjustment Modal ────────────────────────────────────
function StockModal({ product, companyId, branchId, userId, onClose }: {
  product: Product; companyId: string; branchId: string; userId: string; onClose: () => void;
}) {
  const qc = useQueryClient();
  const currentQty = product.stock?.quantity ?? 0;
  const [newQty, setNewQty] = useState(currentQty.toString());
  const [notes, setNotes] = useState('');

  const mutation = useMutation({
    mutationFn: () => productsApi.updateStock(product.id, branchId, parseFloat(newQty), userId, notes),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products', companyId, branchId] });
      qc.invalidateQueries({ queryKey: ['products'] });
      toast.success('Stock actualizado');
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const diff = parseFloat(newQty) - currentQty;

  return (
    <div className="inv-modal-overlay" onClick={onClose}>
      <div className="inv-modal small" onClick={e => e.stopPropagation()}>
        <div className="inv-modal-header">
          <h2>Ajuste de stock</h2>
          <button onClick={onClose}><X size={18}/></button>
        </div>
        <div className="inv-modal-body">
          <div className="stock-product-name">{product.name}</div>
          <div className="stock-current">Stock actual: <strong>{currentQty}</strong> {product.unit}</div>
          <div className="form-group">
            <label>Nueva cantidad</label>
            <input type="number" value={newQty} onChange={e => setNewQty(e.target.value)} min="0" step="1" autoFocus/>
          </div>
          {newQty && (
            <div className={`stock-diff ${diff > 0 ? 'positive' : diff < 0 ? 'negative' : ''}`}>
              {diff > 0 ? '+' : ''}{diff.toFixed(0)} unidades
            </div>
          )}
          <div className="form-group">
            <label>Motivo (opcional)</label>
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ej: Compra a proveedor"/>
          </div>
        </div>
        <div className="inv-modal-footer">
          <button onClick={onClose} className="btn-ghost">Cancelar</button>
          <button onClick={() => mutation.mutate()} disabled={!newQty || mutation.isPending} className="btn-primary">
            {mutation.isPending ? <Loader2 size={14} className="spin"/> : <Save size={14}/>} Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Inventory Page ───────────────────────────────────────
export default function InventoryPage() {
  const { company, branch, user } = useAppStore();
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [showModal, setShowModal] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | undefined>();
  const [stockProduct, setStockProduct] = useState<Product | undefined>();
  const [filterLow, setFilterLow] = useState(false);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products', company?.id, branch?.id],
    queryFn: () => productsApi.list(company!.id, branch!.id),
    enabled: !!company?.id && !!branch?.id,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories', company?.id],
    queryFn: async () => {
      const { data } = await supabase.from('categories').select('*').eq('company_id', company!.id).eq('is_active', true);
      return data ?? [];
    },
    enabled: !!company?.id,
  });

  const filtered = products
    .filter(p => {
      const s = search.toLowerCase();
      const matchSearch = !s || p.name.toLowerCase().includes(s) || p.sku?.toLowerCase().includes(s) || p.barcode?.includes(s);
      const matchLow = !filterLow || (p.has_stock && (p.stock?.quantity ?? 0) <= (p.stock?.min_quantity ?? 0));
      return matchSearch && matchLow;
    })
    .sort((a, b) => {
      let va: number | string, vb: number | string;
      if (sortKey === 'name')     { va = a.name; vb = b.name; }
      else if (sortKey === 'price') { va = a.price; vb = b.price; }
      else if (sortKey === 'stock') { va = a.stock?.quantity ?? 0; vb = b.stock?.quantity ?? 0; }
      else { va = a.category?.name ?? ''; vb = b.category?.name ?? ''; }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

  const lowStockCount = products.filter(p => p.has_stock && (p.stock?.quantity ?? 0) <= (p.stock?.min_quantity ?? 0)).length;

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const SortIcon = ({ k }: { k: SortKey }) => sortKey === k
    ? (sortDir === 'asc' ? <ChevronUp size={12}/> : <ChevronDown size={12}/>)
    : null;

  return (
    <div className="inv-layout">
      <style>{invStyles}</style>

      <div className="inv-header">
        <div className="inv-title">
          <Package size={20}/>
          <h1>Inventario</h1>
          <span className="inv-count">{products.length} productos</span>
        </div>
          <div className="inv-actions">
          {lowStockCount > 0 && (
            <button onClick={() => setFilterLow(f => !f)} className={`btn-warn ${filterLow ? 'active' : ''}`}>
              <AlertTriangle size={14}/>
              {lowStockCount} con stock bajo
            </button>
          )}
          <button
            onClick={() => {
              if (!branch || !branch.id) {
                toast.error('Asigna una sucursal antes de crear productos');
                return;
              }
              setEditProduct(undefined);
              setShowModal(true);
            }}
            className="btn-primary"
          >
            <Plus size={16}/> Nuevo producto
          </button>
        </div>
      </div>

      <div className="inv-toolbar">
        <div className="inv-search">
          <Search size={14}/>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre, SKU o código…"
          />
          {search && <button onClick={() => setSearch('')}><X size={12}/></button>}
        </div>
      </div>

      <div className="inv-table-wrap">
        <table className="inv-table">
          <thead>
            <tr>
              <th onClick={() => toggleSort('name')} className="sortable">Producto <SortIcon k="name"/></th>
              <th onClick={() => toggleSort('category')} className="sortable">Categoría <SortIcon k="category"/></th>
              <th onClick={() => toggleSort('price')} className="sortable right">Precio <SortIcon k="price"/></th>
              <th className="right">Costo</th>
              <th className="right">Margen</th>
              <th onClick={() => toggleSort('stock')} className="sortable right">Stock <SortIcon k="stock"/></th>
              <th className="center">Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} className="table-loading"><Loader2 size={20} className="spin"/> Cargando…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="table-empty">Sin productos{search ? ` para "${search}"` : ''}</td></tr>
            ) : filtered.map(p => {
              const qty = p.stock?.quantity ?? 0;
              const minQty = p.stock?.min_quantity ?? 0;
              const lowStock = p.has_stock && qty <= minQty;
              const margin = p.price > 0 ? ((p.price - p.cost) / p.price * 100).toFixed(0) : '—';

              return (
                <tr key={p.id} className={lowStock ? 'row-warn' : ''}>
                  <td>
                    <div className="product-cell">
                      <span className="product-cell-name">{p.name}</span>
                      <span className="product-cell-sku">{p.sku || p.barcode || '—'}</span>
                    </div>
                  </td>
                  <td>
                    {p.category && (
                      <span className="category-tag" style={{ background: p.category.color + '22', color: p.category.color }}>
                        {p.category.name}
                      </span>
                    )}
                  </td>
                  <td className="right bold">{fmt(p.price)}</td>
                  <td className="right muted">{fmt(p.cost)}</td>
                  <td className="right">
                    <span className={`margin-badge ${parseFloat(margin as string) > 30 ? 'high' : parseFloat(margin as string) > 15 ? 'mid' : 'low'}`}>
                      {margin}%
                    </span>
                  </td>
                  <td className="right">
                    {p.has_stock ? (
                      <span className={`stock-cell ${lowStock ? 'low' : ''}`}>
                        {lowStock && <AlertTriangle size={12}/>}
                        {qty}
                      </span>
                    ) : <span className="muted">—</span>}
                  </td>
                  <td className="center">
                    <span className={`status-dot ${p.is_active ? 'active' : 'inactive'}`}>
                      {p.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="actions-cell">
                    {p.has_stock && (
                      <button onClick={() => setStockProduct(p)} className="action-btn" title="Ajustar stock">
                        <Package size={14}/>
                      </button>
                    )}
                    <button onClick={() => { setEditProduct(p); setShowModal(true); }} className="action-btn" title="Editar">
                      <Edit2 size={14}/>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showModal && (
        <ProductModal
          product={editProduct}
          categories={categories}
          companyId={company!.id}
          branchId={branch!.id}
          onClose={() => setShowModal(false)}
        />
      )}

      {stockProduct && (
        <StockModal
          product={stockProduct}
          companyId={company!.id}
          branchId={branch!.id}
          userId={user!.id}
          onClose={() => setStockProduct(undefined)}
        />
      )}
    </div>
  );
}

const invStyles = `
  .inv-layout {
    padding: 24px;
    background: #0f0f11;
    min-height: 100%;
    color: #e8e6e1;
    font-family: 'DM Sans', 'Inter', sans-serif;
    display: flex; flex-direction: column; gap: 16px;
  }
  .inv-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
  .inv-title { display: flex; align-items: center; gap: 10px; }
  .inv-title h1 { font-size: 20px; font-weight: 600; margin: 0; }
  .inv-count { font-size: 12px; background: #1a1a1f; border: 1px solid #2a2a30; border-radius: 20px; padding: 2px 10px; color: #6b6a65; }
  .inv-actions { display: flex; gap: 8px; align-items: center; }

  .btn-primary {
    display: flex; align-items: center; gap: 6px;
    background: var(--c-primary); border: none; border-radius: 8px;
    color: #fff; font-size: 13px; font-weight: 500; padding: 8px 14px; cursor: pointer;
    transition: background .15s;
  }
  .btn-primary:hover:not(:disabled) { background: var(--c-primary-hover); }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-ghost { display: flex; align-items: center; gap: 6px; background: none; border: 1px solid #2a2a30; border-radius: 8px; color: #9997a0; font-size: 13px; padding: 8px 14px; cursor: pointer; }
  .btn-ghost:hover { border-color: #3a3a45; }
  .btn-warn { display: flex; align-items: center; gap: 6px; background: #451a03; border: 1px solid #78350f; border-radius: 8px; color: #d97706; font-size: 13px; padding: 8px 12px; cursor: pointer; }
  .btn-warn.active { background: #78350f; }

  .inv-toolbar { display: flex; gap: 8px; }
  .inv-search {
    display: flex; align-items: center; gap: 8px;
    background: #1a1a1f; border: 1px solid #2a2a30; border-radius: 8px; padding: 0 12px;
    flex: 1; max-width: 400px; color: #6b6a65;
  }
  .inv-search input { background: none; border: none; color: #e8e6e1; font-size: 13px; padding: 9px 0; outline: none; flex: 1; }
  .inv-search input::placeholder { color: #3a3a42; }
  .inv-search button { background: none; border: none; color: #4a4a55; cursor: pointer; }

  .inv-table-wrap { overflow: auto; border-radius: 12px; border: 1px solid #1e1e25; }
  .inv-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .inv-table thead { background: #131318; }
  .inv-table th { padding: 10px 14px; text-align: left; font-weight: 500; color: #6b6a65; white-space: nowrap; border-bottom: 1px solid #1e1e25; }
  .inv-table th.sortable { cursor: pointer; user-select: none; }
  .inv-table th.sortable:hover { color: #e8e6e1; }
  .inv-table th.right, .inv-table td.right { text-align: right; }
  .inv-table th.center, .inv-table td.center { text-align: center; }
  .inv-table tbody tr { border-bottom: 1px solid #1a1a1f; transition: background .1s; }
  .inv-table tbody tr:hover { background: #131318; }
  .inv-table tbody tr.row-warn { background: #1a1000; }
  .inv-table td { padding: 12px 14px; vertical-align: middle; }

  .product-cell { display: flex; flex-direction: column; gap: 2px; }
  .product-cell-name { font-weight: 500; color: #e8e6e1; }
  .product-cell-sku { font-size: 11px; color: #4a4a55; font-family: monospace; }

  .category-tag { font-size: 11px; padding: 3px 8px; border-radius: 20px; font-weight: 500; }
  .bold { font-weight: 600; color: #e8e6e1; }
  .muted { color: #4a4a55; }
  .right { text-align: right; }

  .margin-badge { font-size: 11px; padding: 2px 7px; border-radius: 20px; font-weight: 600; }
  .margin-badge.high { background: #0f2d1a; color: #22c55e; }
  .margin-badge.mid  { background: #1a1a03; color: #d97706; }
  .margin-badge.low  { background: #1a0505; color: #ef4444; }

  .stock-cell { display: flex; align-items: center; gap: 4px; justify-content: flex-end; font-weight: 600; }
  .stock-cell.low { color: #d97706; }

  .status-dot { font-size: 11px; padding: 3px 10px; border-radius: 20px; font-weight: 500; }
  .status-dot.active { background: #0f2d1a; color: #22c55e; }
  .status-dot.inactive { background: #1a1a1f; color: #4a4a55; }

  .actions-cell { display: flex; gap: 4px; justify-content: flex-end; }
  .action-btn { background: none; border: 1px solid #2a2a30; border-radius: 6px; color: #6b6a65; cursor: pointer; padding: 5px 7px; transition: all .1s; display: flex; align-items: center; }
  .action-btn:hover { border-color: var(--c-primary); color: var(--c-primary-text); }

  .table-loading, .table-empty { text-align: center; padding: 40px; color: #4a4a55; }
  .table-loading { display: flex; align-items: center; justify-content: center; gap: 8px; }

  /* Modal */
  .inv-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.75); display: flex; align-items: center; justify-content: center; z-index: 100; }
  .inv-modal { background: #1a1a1f; border: 1px solid #2a2a30; border-radius: 16px; width: 520px; max-width: 95vw; max-height: 90vh; display: flex; flex-direction: column; }
  .inv-modal.small { width: 380px; }
  .inv-modal-header { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px 16px; border-bottom: 1px solid #1e1e25; }
  .inv-modal-header h2 { font-size: 16px; font-weight: 600; }
  .inv-modal-header button { background: none; border: none; color: #6b6a65; cursor: pointer; }
  .inv-modal-body { padding: 20px 24px; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; }
  .inv-modal-footer { padding: 16px 24px; border-top: 1px solid #1e1e25; display: flex; justify-content: flex-end; gap: 8px; }

  .form-row { display: flex; gap: 12px; }
  .form-group { display: flex; flex-direction: column; gap: 5px; flex: 1; }
  .form-group.full { flex: 100%; }
  .form-group label { font-size: 12px; color: #6b6a65; display: flex; align-items: center; gap: 4px; }
  .form-group input, .form-group select, .form-group textarea {
    background: #131318; border: 1px solid #2a2a30; border-radius: 8px;
    padding: 9px 12px; color: #e8e6e1; font-size: 13px; outline: none;
    transition: border-color .15s; width: 100%;
  }
  .form-group input:focus, .form-group select:focus, .form-group textarea:focus { border-color: var(--c-primary); }
  .form-group textarea { resize: vertical; }
  .form-group select option { background: #1a1a1f; }
  .inline-icon { display: inline; vertical-align: middle; }

  .form-toggles { display: flex; gap: 20px; }
  .toggle-label { display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px; color: #9997a0; }
  .toggle-label input[type=checkbox] { accent-color: var(--c-primary); width: 15px; height: 15px; }

  .stock-product-name { font-size: 15px; font-weight: 600; color: #e8e6e1; }
  .stock-current { font-size: 13px; color: #6b6a65; }
  .stock-diff { font-size: 15px; font-weight: 600; text-align: center; padding: 8px; border-radius: 8px; }
  .stock-diff.positive { background: #0f2d1a; color: #22c55e; }
  .stock-diff.negative { background: #1a0505; color: #ef4444; }

  .spin { animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
`;
