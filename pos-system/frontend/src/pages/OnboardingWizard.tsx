import React, { useState } from 'react';
import {
  Store, MapPin, Package, Users, CheckCircle2,
  ArrowRight, ArrowLeft, Loader2, Plus, Trash2,
  ChevronRight, Sparkles, Upload
} from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

// ── Types ─────────────────────────────────────────────────────
interface WizardData {
  company: {
    name: string;
    ruc: string;
    phone: string;
    email: string;
    address: string;
    currency: string;
  };
  branch: {
    name: string;
    address: string;
  };
  categories: string[];
  products: Array<{
    name: string;
    price: string;
    cost: string;
    stock: string;
    categoryIndex: number;
  }>;
}

const CURRENCIES = [
  { code: 'BOB', label: 'Boliviano — Bs' },
  { code: 'USD', label: 'Dólar — $' },
  { code: 'PEN', label: 'Sol peruano — S/' },
  { code: 'COP', label: 'Peso colombiano — $' },
  { code: 'ARS', label: 'Peso argentino — $' },
  { code: 'MXN', label: 'Peso mexicano — $' },
  { code: 'CLP', label: 'Peso chileno — $' },
];

const DEFAULT_CATEGORIES = ['Bebidas', 'Alimentos', 'Limpieza', 'Abarrotes', 'Otros'];

const STEPS = [
  { id: 1, icon: Store,    label: 'Tu empresa'   },
  { id: 2, icon: MapPin,   label: 'Sucursal'     },
  { id: 3, icon: Package,  label: 'Productos'    },
  { id: 4, icon: Users,    label: 'Confirmar'    },
];

// ── Step indicators ───────────────────────────────────────────
function StepBar({ current }: { current: number }) {
  return (
    <div className="step-bar">
      {STEPS.map((s, i) => {
        const Icon = s.icon;
        const done   = current > s.id;
        const active = current === s.id;
        return (
          <React.Fragment key={s.id}>
            <div className={`step-item ${active ? 'active' : ''} ${done ? 'done' : ''}`}>
              <div className="step-circle">
                {done ? <CheckCircle2 size={16} /> : <Icon size={16} />}
              </div>
              <span className="step-label">{s.label}</span>
            </div>
            {i < STEPS.length - 1 && <div className={`step-line ${done ? 'done' : ''}`} />}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ── Step 1: Company ───────────────────────────────────────────
function StepCompany({ data, onChange, onNext }: {
  data: WizardData['company'];
  onChange: (d: Partial<WizardData['company']>) => void;
  onNext: () => void;
}) {
  const set = (k: string, v: string) => onChange({ [k]: v });
  const valid = data.name.trim().length >= 2;

  return (
    <div className="step-content">
      <div className="step-hero">
        <div className="step-hero-icon" style={{ background: '#5c6df020', color: '#5c6df0' }}>
          <Store size={28} />
        </div>
        <h2>¿Cómo se llama tu negocio?</h2>
        <p>Esta información aparecerá en tus tickets de venta</p>
      </div>

      <div className="wiz-form">
        <div className="wiz-field required">
          <label>Nombre del negocio *</label>
          <input
            value={data.name}
            onChange={e => set('name', e.target.value)}
            placeholder="Ej: Tienda Don Mario, Minimarket Central…"
            autoFocus
          />
        </div>

        <div className="wiz-row">
          <div className="wiz-field">
            <label>NIT / RUC</label>
            <input value={data.ruc} onChange={e => set('ruc', e.target.value)} placeholder="1234567" />
          </div>
          <div className="wiz-field">
            <label>Teléfono</label>
            <input value={data.phone} onChange={e => set('phone', e.target.value)} placeholder="+591 70000000" />
          </div>
        </div>

        <div className="wiz-field">
          <label>Correo electrónico</label>
          <input type="email" value={data.email} onChange={e => set('email', e.target.value)} placeholder="info@mitienda.com" />
        </div>

        <div className="wiz-field">
          <label>Dirección</label>
          <input value={data.address} onChange={e => set('address', e.target.value)} placeholder="Av. Ejemplo #123, Ciudad" />
        </div>

        <div className="wiz-field">
          <label>Moneda de trabajo</label>
          <select value={data.currency} onChange={e => set('currency', e.target.value)}>
            {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
          </select>
        </div>
      </div>

      <div className="step-footer">
        <div />
        <button onClick={onNext} disabled={!valid} className="btn-next">
          Siguiente <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}

// ── Step 2: Branch ────────────────────────────────────────────
function StepBranch({ data, onChange, onNext, onBack }: {
  data: WizardData['branch'];
  onChange: (d: Partial<WizardData['branch']>) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const set = (k: string, v: string) => onChange({ [k]: v });
  const valid = data.name.trim().length >= 2;

  return (
    <div className="step-content">
      <div className="step-hero">
        <div className="step-hero-icon" style={{ background: '#34d39920', color: '#34d399' }}>
          <MapPin size={28} />
        </div>
        <h2>Tu punto de venta</h2>
        <p>Define tu primera sucursal o caja. Puedes agregar más después.</p>
      </div>

      <div className="wiz-form">
        <div className="wiz-field required">
          <label>Nombre de la sucursal *</label>
          <input
            value={data.name}
            onChange={e => set('name', e.target.value)}
            placeholder="Ej: Tienda Principal, Caja 1, Sucursal Centro…"
            autoFocus
          />
          <span className="field-hint">Este nombre verás en la pantalla de caja</span>
        </div>

        <div className="wiz-field">
          <label>Dirección de la sucursal</label>
          <input
            value={data.address}
            onChange={e => set('address', e.target.value)}
            placeholder="Puede ser la misma que la empresa"
          />
        </div>
      </div>

      <div className="step-footer">
        <button onClick={onBack} className="btn-back"><ArrowLeft size={16} /> Atrás</button>
        <button onClick={onNext} disabled={!valid} className="btn-next">
          Siguiente <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}

// ── Step 3: Products ──────────────────────────────────────────
function StepProducts({ data, onChangeCategories, onChangeProducts, onNext, onBack }: {
  data: WizardData;
  onChangeCategories: (cats: string[]) => void;
  onChangeProducts: (prods: WizardData['products']) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const [newCat, setNewCat] = useState('');
  const cats = data.categories;
  const prods = data.products;

  const addCategory = () => {
    if (newCat.trim() && !cats.includes(newCat.trim())) {
      onChangeCategories([...cats, newCat.trim()]);
      setNewCat('');
    }
  };

  const removeCategory = (i: number) => {
    const updated = cats.filter((_, idx) => idx !== i);
    onChangeCategories(updated);
    // Reset products that had this category
    onChangeProducts(prods.map(p => p.categoryIndex === i
      ? { ...p, categoryIndex: -1 }
      : p.categoryIndex > i
        ? { ...p, categoryIndex: p.categoryIndex - 1 }
        : p
    ));
  };

  const addProduct = () => {
    onChangeProducts([...prods, { name: '', price: '', cost: '', stock: '', categoryIndex: -1 }]);
  };

  const updateProduct = (i: number, k: string, v: string | number) => {
    onChangeProducts(prods.map((p, idx) => idx === i ? { ...p, [k]: v } : p));
  };

  const removeProduct = (i: number) => {
    onChangeProducts(prods.filter((_, idx) => idx !== i));
  };

  const loadSampleProducts = () => {
    onChangeCategories(['Bebidas', 'Snacks', 'Lácteos']);
    onChangeProducts([
      { name: 'Coca Cola 2L',   price: '15.00', cost: '10.00', stock: '24', categoryIndex: 0 },
      { name: 'Agua 600ml',     price: '4.50',  cost: '2.50',  stock: '48', categoryIndex: 0 },
      { name: 'Papas Fritas',   price: '9.00',  cost: '6.00',  stock: '30', categoryIndex: 1 },
      { name: 'Leche PIL 1L',   price: '8.50',  cost: '6.00',  stock: '20', categoryIndex: 2 },
    ]);
  };

  return (
    <div className="step-content wide">
      <div className="step-hero">
        <div className="step-hero-icon" style={{ background: '#f59e0b20', color: '#f59e0b' }}>
          <Package size={28} />
        </div>
        <h2>Agrega tus primeros productos</h2>
        <p>Puedes agregar todos tus productos después. Solo unos pocos para comenzar.</p>
      </div>

      {/* Sample data button */}
      <button onClick={loadSampleProducts} className="sample-btn">
        <Sparkles size={14} /> Cargar productos de ejemplo
      </button>

      {/* Categories */}
      <div className="wiz-section">
        <div className="wiz-section-title">Categorías</div>
        <div className="categories-row">
          {cats.map((c, i) => (
            <span key={i} className="cat-chip">
              {c}
              <button onClick={() => removeCategory(i)}><Trash2 size={10} /></button>
            </span>
          ))}
          <div className="cat-add">
            <input
              value={newCat}
              onChange={e => setNewCat(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addCategory()}
              placeholder="Nueva categoría…"
            />
            <button onClick={addCategory} disabled={!newCat.trim()}><Plus size={14} /></button>
          </div>
        </div>
      </div>

      {/* Products */}
      <div className="wiz-section">
        <div className="wiz-section-title">
          Productos
          <span className="wiz-section-count">{prods.length}</span>
        </div>

        {prods.length === 0 ? (
          <div className="prods-empty">
            <Package size={32} strokeWidth={1} color="#2a2a38" />
            <p>Sin productos aún</p>
            <button onClick={addProduct} className="btn-add-product"><Plus size={13} /> Agregar producto</button>
          </div>
        ) : (
          <>
            <div className="products-grid-header">
              <span>Nombre *</span>
              <span>Precio *</span>
              <span>Costo</span>
              <span>Stock inicial</span>
              <span>Categoría</span>
              <span></span>
            </div>
            {prods.map((p, i) => (
              <div key={i} className="product-row">
                <input
                  value={p.name}
                  onChange={e => updateProduct(i, 'name', e.target.value)}
                  placeholder="Nombre del producto"
                />
                <input
                  type="number" value={p.price}
                  onChange={e => updateProduct(i, 'price', e.target.value)}
                  placeholder="0.00" min="0" step="0.50"
                />
                <input
                  type="number" value={p.cost}
                  onChange={e => updateProduct(i, 'cost', e.target.value)}
                  placeholder="0.00" min="0" step="0.50"
                />
                <input
                  type="number" value={p.stock}
                  onChange={e => updateProduct(i, 'stock', e.target.value)}
                  placeholder="0" min="0"
                />
                <select value={p.categoryIndex} onChange={e => updateProduct(i, 'categoryIndex', parseInt(e.target.value))}>
                  <option value={-1}>Sin categoría</option>
                  {cats.map((c, ci) => <option key={ci} value={ci}>{c}</option>)}
                </select>
                <button onClick={() => removeProduct(i)} className="remove-row-btn"><Trash2 size={13} /></button>
              </div>
            ))}
            <button onClick={addProduct} className="btn-add-row">
              <Plus size={13} /> Agregar producto
            </button>
          </>
        )}
      </div>

      <div className="step-footer">
        <button onClick={onBack} className="btn-back"><ArrowLeft size={16} /> Atrás</button>
        <button onClick={onNext} className="btn-next">
          Siguiente <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}

// ── Step 4: Confirm & Create ──────────────────────────────────
function StepConfirm({ data, onBack, onFinish, loading }: {
  data: WizardData;
  onBack: () => void;
  onFinish: () => void;
  loading: boolean;
}) {
  const validProducts = data.products.filter(p => p.name.trim() && parseFloat(p.price) > 0);

  return (
    <div className="step-content">
      <div className="step-hero">
        <div className="step-hero-icon" style={{ background: '#22c55e20', color: '#22c55e' }}>
          <CheckCircle2 size={28} />
        </div>
        <h2>¡Todo listo!</h2>
        <p>Revisa tu configuración antes de crear el sistema</p>
      </div>

      <div className="confirm-sections">
        <div className="confirm-card">
          <div className="confirm-card-header"><Store size={14} /><span>Empresa</span></div>
          <div className="confirm-rows">
            <div className="confirm-row"><span>Nombre</span><strong>{data.company.name}</strong></div>
            {data.company.ruc     && <div className="confirm-row"><span>NIT/RUC</span><strong>{data.company.ruc}</strong></div>}
            {data.company.phone   && <div className="confirm-row"><span>Teléfono</span><strong>{data.company.phone}</strong></div>}
            {data.company.email   && <div className="confirm-row"><span>Email</span><strong>{data.company.email}</strong></div>}
            <div className="confirm-row"><span>Moneda</span><strong>{data.company.currency}</strong></div>
          </div>
        </div>

        <div className="confirm-card">
          <div className="confirm-card-header"><MapPin size={14} /><span>Sucursal</span></div>
          <div className="confirm-rows">
            <div className="confirm-row"><span>Nombre</span><strong>{data.branch.name}</strong></div>
            {data.branch.address && <div className="confirm-row"><span>Dirección</span><strong>{data.branch.address}</strong></div>}
          </div>
        </div>

        <div className="confirm-card">
          <div className="confirm-card-header"><Package size={14} /><span>Catálogo inicial</span></div>
          <div className="confirm-rows">
            <div className="confirm-row">
              <span>Categorías</span>
              <strong>{data.categories.length > 0 ? data.categories.join(', ') : 'Ninguna'}</strong>
            </div>
            <div className="confirm-row">
              <span>Productos</span>
              <strong>{validProducts.length} producto(s)</strong>
            </div>
          </div>
        </div>
      </div>

      <div className="confirm-note">
        <CheckCircle2 size={14} color="#22c55e" />
        <span>Podrás editar todo esto después desde la configuración</span>
      </div>

      <div className="step-footer">
        <button onClick={onBack} className="btn-back" disabled={loading}>
          <ArrowLeft size={16} /> Atrás
        </button>
        <button onClick={onFinish} disabled={loading} className="btn-finish">
          {loading
            ? <><Loader2 size={16} className="spin" /> Creando tu sistema…</>
            : <><Sparkles size={16} /> ¡Crear mi POS!</>
          }
        </button>
      </div>
    </div>
  );
}

// ── Main Wizard ───────────────────────────────────────────────
export default function OnboardingWizard() {
  const { user, setCompany, setBranch } = useAppStore();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [data, setData] = useState<WizardData>({
    company: { name: '', ruc: '', phone: '', email: '', address: '', currency: 'BOB' },
    branch:  { name: 'Sucursal Principal', address: '' },
    categories: [...DEFAULT_CATEGORIES],
    products: [],
  });

  const updateCompany   = (d: Partial<WizardData['company']>)  => setData(p => ({ ...p, company: { ...p.company, ...d } }));
  const updateBranch    = (d: Partial<WizardData['branch']>)   => setData(p => ({ ...p, branch:  { ...p.branch,  ...d } }));
  const updateCategories = (cats: string[])                    => setData(p => ({ ...p, categories: cats }));
  const updateProducts   = (prods: WizardData['products'])     => setData(p => ({ ...p, products: prods }));

  const setupMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Sin sesión de usuario');

      // 1. Create company
      const { data: company, error: cErr } = await supabase
        .from('companies')
        .insert({
          name:     data.company.name,
          ruc:      data.company.ruc      || null,
          phone:    data.company.phone    || null,
          email:    data.company.email    || null,
          address:  data.company.address  || null,
          currency: data.company.currency,
          timezone: 'America/La_Paz',
          plan:     'free',
        })
        .select().single();
      if (cErr) throw cErr;

      // 2. Create branch
      const { data: branch, error: bErr } = await supabase
        .from('branches')
        .insert({
          company_id: company.id,
          name:       data.branch.name,
          address:    data.branch.address || null,
          is_active:  true,
        })
        .select().single();
      if (bErr) throw bErr;

      // 3. Create cash register for the branch
      await supabase.from('cash_registers').insert({
        branch_id: branch.id,
        name: 'Caja 1',
        is_active: true,
      });

      // 4. Assign user to company
      const { error: uErr } = await supabase
        .from('users')
        .update({ company_id: company.id, branch_id: branch.id, role: 'admin' })
        .eq('id', user.id);
      if (uErr) throw uErr;

      // 5. Create categories
      const catIds: Record<number, string> = {};
      if (data.categories.length > 0) {
        const { data: cats, error: catErr } = await supabase
          .from('categories')
          .insert(data.categories.map(name => ({ company_id: company.id, name, color: '#5c6df0', is_active: true })))
          .select();
        if (catErr) throw catErr;
        cats?.forEach((c, i) => { catIds[i] = c.id; });
      }

      // 6. Create products + stock
      const validProducts = data.products.filter(p => p.name.trim() && parseFloat(p.price) > 0);
      for (const p of validProducts) {
        const { data: prod, error: pErr } = await supabase
          .from('products')
          .insert({
            company_id:  company.id,
            category_id: p.categoryIndex >= 0 ? catIds[p.categoryIndex] : null,
            name:        p.name.trim(),
            price:       parseFloat(p.price)  || 0,
            cost:        parseFloat(p.cost)   || 0,
            has_stock:   true,
            is_active:   true,
            unit:        'unit',
          })
          .select().single();
        if (pErr) throw pErr;

        // Create stock record
        await supabase.from('stock').insert({
          product_id:   prod.id,
          branch_id:    branch.id,
          quantity:     parseFloat(p.stock) || 0,
          min_quantity: 0,
        });
      }

      return { company, branch };
    },
    onSuccess: ({ company, branch }) => {
      setCompany(company);
      setBranch(branch);
      navigate('/dashboard');
      toast.success(`¡Bienvenido a tu POS, ${data.company.name}! 🎉`);
    },
    onError: (e: Error) => {
      toast.error(`Error al crear el sistema: ${e.message}`);
      console.error(e);
    },
  });

  return (
    <div className="wizard-root">
      <style>{wizStyles}</style>

      {/* Background glow */}
      <div className="wiz-bg" aria-hidden />

      <div className="wizard-shell">
        {/* Logo */}
        <div className="wiz-logo">
          <div className="wiz-logo-icon"><Store size={20} /></div>
          <span>POS System</span>
        </div>

        {/* Step bar */}
        <StepBar current={step} />

        {/* Step content */}
        <div className="wiz-card">
          {step === 1 && (
            <StepCompany
              data={data.company}
              onChange={updateCompany}
              onNext={() => setStep(2)}
            />
          )}
          {step === 2 && (
            <StepBranch
              data={data.branch}
              onChange={updateBranch}
              onNext={() => setStep(3)}
              onBack={() => setStep(1)}
            />
          )}
          {step === 3 && (
            <StepProducts
              data={data}
              onChangeCategories={updateCategories}
              onChangeProducts={updateProducts}
              onNext={() => setStep(4)}
              onBack={() => setStep(2)}
            />
          )}
          {step === 4 && (
            <StepConfirm
              data={data}
              onBack={() => setStep(3)}
              onFinish={() => setupMutation.mutate()}
              loading={setupMutation.isPending}
            />
          )}
        </div>

        <p className="wiz-legal">Puedes editar toda esta información en Configuración después de crear tu cuenta.</p>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────
const wizStyles = `
  .wizard-root {
    min-height: 100vh; background: #0a0a0e;
    display: flex; align-items: flex-start; justify-content: center;
    padding: 32px 16px 60px; font-family: 'DM Sans','Inter',sans-serif;
    color: #e8e6e1; position: relative; overflow-x: hidden;
  }
  .wiz-bg {
    position: fixed; inset: 0; pointer-events: none;
    background:
      radial-gradient(ellipse 70% 50% at 15% 15%, #5c6df018 0%, transparent 60%),
      radial-gradient(ellipse 50% 50% at 85% 80%, #34d39910 0%, transparent 60%);
  }
  .wizard-shell {
    width: 100%; max-width: 680px;
    display: flex; flex-direction: column; align-items: center; gap: 28px;
    position: relative; z-index: 1;
  }

  /* Logo */
  .wiz-logo { display: flex; align-items: center; gap: 10px; font-size: 18px; font-weight: 700; color: #e8e6e1; }
  .wiz-logo-icon { width: 38px; height: 38px; border-radius: 10px; background: #5c6df0; display: flex; align-items: center; justify-content: center; color: #fff; }

  /* Step bar */
  .step-bar { display: flex; align-items: center; gap: 0; width: 100%; max-width: 520px; }
  .step-item { display: flex; flex-direction: column; align-items: center; gap: 5px; flex-shrink: 0; }
  .step-circle {
    width: 36px; height: 36px; border-radius: 50%;
    border: 1.5px solid #2a2a30; background: #131318;
    display: flex; align-items: center; justify-content: center;
    color: #4a4a55; transition: all .2s;
  }
  .step-item.active .step-circle  { border-color: #5c6df0; background: #1a1a2e; color: #a5b4fc; }
  .step-item.done   .step-circle  { border-color: #22c55e; background: #0f2d1a; color: #22c55e; }
  .step-label { font-size: 11px; color: #4a4a55; white-space: nowrap; }
  .step-item.active .step-label { color: #a5b4fc; }
  .step-item.done   .step-label { color: #22c55e; }
  .step-line { flex: 1; height: 1.5px; background: #2a2a30; margin: 0 4px; margin-bottom: 16px; transition: background .2s; }
  .step-line.done { background: #22c55e; }

  /* Card */
  .wiz-card {
    width: 100%; background: #131318;
    border: 1px solid #1e1e25; border-radius: 20px;
    overflow: hidden;
  }
  .wiz-card .step-content.wide { max-width: 100%; }

  /* Step content */
  .step-content { padding: 32px; display: flex; flex-direction: column; gap: 24px; }
  .step-hero { display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; }
  .step-hero-icon { width: 60px; height: 60px; border-radius: 16px; display: flex; align-items: center; justify-content: center; }
  .step-hero h2 { font-size: 22px; font-weight: 700; color: #e8e6e1; }
  .step-hero p  { font-size: 13px; color: #6b6a65; max-width: 380px; line-height: 1.5; }

  /* Form */
  .wiz-form { display: flex; flex-direction: column; gap: 14px; }
  .wiz-row  { display: flex; gap: 12px; }
  .wiz-row .wiz-field { flex: 1; }
  .wiz-field { display: flex; flex-direction: column; gap: 5px; }
  .wiz-field label { font-size: 12px; color: #6b6a65; font-weight: 500; }
  .wiz-field input, .wiz-field select {
    background: #1a1a1f; border: 1px solid #2a2a30; border-radius: 10px;
    padding: 11px 14px; color: #e8e6e1; font-size: 14px; outline: none;
    transition: border-color .15s; width: 100%;
  }
  .wiz-field input:focus, .wiz-field select:focus { border-color: #5c6df0; }
  .wiz-field input::placeholder { color: #3a3a42; }
  .wiz-field select option { background: #1a1a1f; }
  .wiz-field.required label::after { content: ' *'; color: #5c6df0; }
  .field-hint { font-size: 11px; color: #3a3a42; margin-top: 1px; }

  /* Footer */
  .step-footer { display: flex; align-items: center; justify-content: space-between; padding-top: 8px; }
  .btn-back {
    display: flex; align-items: center; gap: 7px;
    background: none; border: 1px solid #2a2a30; border-radius: 10px;
    color: #9997a0; font-size: 14px; padding: 10px 18px; cursor: pointer;
    transition: all .15s;
  }
  .btn-back:hover:not(:disabled) { border-color: #3a3a45; color: #e8e6e1; }
  .btn-back:disabled { opacity: 0.4; cursor: not-allowed; }
  .btn-next {
    display: flex; align-items: center; gap: 7px;
    background: #5c6df0; border: none; border-radius: 10px;
    color: #fff; font-size: 14px; font-weight: 600; padding: 10px 20px; cursor: pointer;
    transition: all .15s;
  }
  .btn-next:hover:not(:disabled) { background: #4f60e6; transform: translateY(-1px); }
  .btn-next:disabled { opacity: 0.4; cursor: not-allowed; }
  .btn-finish {
    display: flex; align-items: center; gap: 7px;
    background: #22c55e; border: none; border-radius: 10px;
    color: #fff; font-size: 15px; font-weight: 700; padding: 12px 24px; cursor: pointer;
    transition: all .15s;
  }
  .btn-finish:hover:not(:disabled) { background: #16a34a; transform: translateY(-1px); }
  .btn-finish:disabled { opacity: 0.5; cursor: not-allowed; }

  /* Sample button */
  .sample-btn {
    display: flex; align-items: center; gap: 7px; width: fit-content;
    background: #1a1a2e; border: 1px dashed #5c6df066; border-radius: 8px;
    color: #a5b4fc; font-size: 12px; padding: 7px 14px; cursor: pointer;
    transition: all .15s;
  }
  .sample-btn:hover { background: #1e1e38; border-color: #5c6df0; }

  /* Category chips */
  .wiz-section { display: flex; flex-direction: column; gap: 10px; }
  .wiz-section-title {
    font-size: 12px; font-weight: 600; color: #6b6a65;
    text-transform: uppercase; letter-spacing: .05em;
    display: flex; align-items: center; gap: 8px;
  }
  .wiz-section-count { background: #1a1a1f; border: 1px solid #2a2a30; border-radius: 20px; padding: 1px 8px; font-size: 11px; color: #4a4a55; font-weight: 400; text-transform: none; letter-spacing: 0; }
  .categories-row { display: flex; flex-wrap: wrap; gap: 7px; align-items: center; }
  .cat-chip {
    display: flex; align-items: center; gap: 5px;
    background: #1a1a2e; border: 1px solid #5c6df044;
    border-radius: 20px; padding: 4px 10px 4px 12px;
    font-size: 12px; color: #a5b4fc;
  }
  .cat-chip button { background: none; border: none; color: #4a4a55; cursor: pointer; display: flex; align-items: center; padding: 1px; }
  .cat-chip button:hover { color: #ef4444; }
  .cat-add { display: flex; align-items: center; background: #1a1a1f; border: 1px solid #2a2a30; border-radius: 20px; overflow: hidden; }
  .cat-add input { background: none; border: none; color: #e8e6e1; font-size: 12px; padding: 5px 12px; outline: none; width: 130px; }
  .cat-add input::placeholder { color: #3a3a42; }
  .cat-add button { background: none; border: none; border-left: 1px solid #2a2a30; color: #5c6df0; cursor: pointer; padding: 5px 10px; display: flex; align-items: center; }
  .cat-add button:disabled { color: #2a2a30; cursor: not-allowed; }

  /* Products grid */
  .prods-empty { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 30px; color: #3a3a42; font-size: 13px; }
  .btn-add-product { display: flex; align-items: center; gap: 5px; background: #5c6df0; border: none; border-radius: 8px; color: #fff; font-size: 12px; padding: 7px 14px; cursor: pointer; }
  .products-grid-header {
    display: grid; grid-template-columns: 2fr 90px 90px 90px 130px 32px;
    gap: 8px; font-size: 11px; color: #4a4a55; padding: 0 2px; font-weight: 500;
  }
  .product-row {
    display: grid; grid-template-columns: 2fr 90px 90px 90px 130px 32px;
    gap: 8px; align-items: center;
  }
  .product-row input, .product-row select {
    background: #1a1a1f; border: 1px solid #2a2a30; border-radius: 7px;
    padding: 8px 10px; color: #e8e6e1; font-size: 13px; outline: none;
    width: 100%; transition: border-color .15s;
  }
  .product-row input:focus, .product-row select:focus { border-color: #5c6df0; }
  .product-row select option { background: #1a1a1f; }
  .remove-row-btn { background: none; border: 1px solid #2a2a30; border-radius: 6px; color: #4a4a55; cursor: pointer; padding: 6px; display: flex; align-items: center; justify-content: center; transition: all .1s; }
  .remove-row-btn:hover { border-color: #ef4444; color: #ef4444; }
  .btn-add-row { display: flex; align-items: center; gap: 5px; background: none; border: 1px dashed #2a2a30; border-radius: 7px; color: #6b6a65; font-size: 12px; padding: 8px 14px; cursor: pointer; transition: all .1s; width: fit-content; margin-top: 2px; }
  .btn-add-row:hover { border-color: #5c6df0; color: #a5b4fc; }

  /* Confirm */
  .confirm-sections { display: flex; flex-direction: column; gap: 10px; }
  .confirm-card { background: #1a1a1f; border: 1px solid #1e1e25; border-radius: 12px; overflow: hidden; }
  .confirm-card-header { display: flex; align-items: center; gap: 8px; padding: 11px 16px; background: #131318; border-bottom: 1px solid #1e1e25; font-size: 12px; font-weight: 600; color: #6b6a65; }
  .confirm-rows { display: flex; flex-direction: column; }
  .confirm-row { display: flex; justify-content: space-between; align-items: center; padding: 9px 16px; border-bottom: 1px solid #131318; font-size: 13px; }
  .confirm-row:last-child { border: none; }
  .confirm-row span { color: #6b6a65; }
  .confirm-row strong { color: #e8e6e1; font-weight: 500; text-align: right; max-width: 280px; overflow: hidden; text-overflow: ellipsis; }
  .confirm-note { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #4a4a55; padding: 10px 14px; background: #0f2d1a22; border: 1px solid #22c55e22; border-radius: 8px; }

  .wiz-legal { font-size: 11px; color: #2a2a38; text-align: center; }
  .spin { animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
`;
