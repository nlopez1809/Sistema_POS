# 🧾 POS System — Sistema de Punto de Venta Web

Sistema POS moderno construido con **React + Supabase**, diseñado para ser vendible como SaaS a pequeños y medianos comercios.

---

## 🏗️ Stack Tecnológico

| Capa | Tecnología |
|------|------------|
| Frontend | React 18 + TypeScript + Vite |
| Estilos | CSS-in-JS (vanilla, sin Tailwind) |
| Estado | Zustand + React Query |
| Backend | Supabase (PostgreSQL + Auth + RLS) |
| Deploy FE | Vercel |
| Deploy DB | Supabase Cloud |

---

## 📁 Estructura del Proyecto

```
pos-system/
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── LoginPage.tsx        # Auth con Supabase
│   │   │   ├── POSPage.tsx          # Pantalla de cobro (corazón del sistema)
│   │   │   ├── InventoryPage.tsx    # CRUD de productos y ajuste de stock
│   │   │   ├── ReportsPage.tsx      # Gráficos y KPIs con Recharts
│   │   │   ├── UsersPage.tsx        # Gestión de usuarios y roles
│   │   │   └── CashSessionPage.tsx  # Apertura/cierre de caja
│   │   ├── components/layout/
│   │   │   └── AppLayout.tsx        # Sidebar + topbar + routing
│   │   ├── lib/
│   │   │   └── supabase.ts          # Cliente + APIs (products, sales, reports, cash)
│   │   ├── store/
│   │   │   └── index.ts             # Zustand: AppStore + CartStore
│   │   ├── hooks/
│   │   │   └── usePrint.ts          # Impresión browser + ESC/POS térmico
│   │   └── App.tsx                  # Router + guards de auth y roles
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
├── backend/
│   ├── supabase/
│   │   ├── schema.sql               # Tablas, RLS, triggers, funciones
│   │   └── seed.sql                 # Datos de demo
│   └── functions/
│       └── create-user/index.ts     # Edge Function para crear usuarios
└── shared/
    └── types.ts                     # TypeScript types compartidos
```

---

## 🚀 Setup Local (5 minutos)

### 1. Crear proyecto en Supabase

1. Ve a [supabase.com](https://supabase.com) → New Project
2. Copia el **Project URL** y **anon key** desde Settings → API

### 2. Ejecutar schema en Supabase

```sql
-- En el SQL Editor de Supabase:
-- 1. Pega y ejecuta backend/supabase/schema.sql
-- 2. Pega y ejecuta backend/supabase/seed.sql
```

### 3. Configurar variables de entorno

```bash
cd frontend
cp .env.example .env.local
# Edita .env.local con tus credenciales de Supabase
```

### 4. Instalar dependencias y correr

```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

### 5. Crear primer usuario admin

En Supabase → Authentication → Users → Add user:
- Email: `admin@tutienda.com`
- Password: (tu contraseña)

Luego en SQL Editor:
```sql
-- Obtén el auth_id del usuario recién creado
SELECT id FROM auth.users WHERE email = 'admin@tutienda.com';

-- Crea el perfil asociado
INSERT INTO users (company_id, auth_id, name, email, role)
VALUES (
  '11111111-1111-1111-1111-111111111111',  -- ID empresa demo del seed
  'PASTE-AUTH-ID-AQUI',
  'Administrador',
  'admin@tutienda.com',
  'admin'
);
```

---

## 🌐 Deploy en Vercel + Supabase

### Frontend (Vercel)

```bash
# Instala Vercel CLI
npm i -g vercel

# Deploy desde /frontend
cd frontend
vercel

# Configura las env vars en el dashboard de Vercel:
# VITE_SUPABASE_URL=...
# VITE_SUPABASE_ANON_KEY=...
```

O conecta el repo en [vercel.com](https://vercel.com) directamente.

### Edge Functions (Supabase)

```bash
# Instala Supabase CLI
npm i -g supabase

# Deploy función de crear usuarios
supabase functions deploy create-user --project-ref TU_PROJECT_REF
```

---

## 📦 Módulos Implementados

### ✅ POS / Caja
- Búsqueda por nombre, SKU o código de barras (compatible con lectores)
- Filtro por categorías con colores
- Carrito con ajuste de cantidades y descuentos por ítem
- Modal de cobro: efectivo (con cálculo de cambio y montos rápidos), tarjeta, QR
- Generación automática de número de ticket (YYYYMMDD-XXXX)
- Descuento de stock automático al confirmar venta (trigger SQL)
- Impresión de ticket en browser o impresora térmica ESC/POS

### ✅ Inventario
- Listado con ordenamiento por nombre, precio, stock, categoría
- Filtro de productos con stock bajo
- CRUD completo de productos (nombre, SKU, barcode, precio, costo, categoría, unidad)
- Cálculo de margen de ganancia en tiempo real
- Ajuste manual de stock con registro de movimiento y motivo
- Stock inicial al crear producto

### ✅ Reportes
- KPIs del período: ingresos, ventas, ticket promedio, artículos
- Gráfico de línea: ingresos por día
- Gráfico de barras: número de ventas por día
- Ranking de productos más vendidos (horizontal bar + donut pie)
- Alertas de productos con stock bajo
- Selector de rango: últimos 7 o 30 días

### ✅ Usuarios y Roles
- Roles: Admin, Gerente, Cajero (con protección de rutas)
- CRUD de usuarios con resumen por rol
- Activar/desactivar usuarios
- Búsqueda por nombre o correo

### ✅ Turno de Caja
- Apertura de caja con fondo inicial
- Estadísticas en tiempo real del turno (efectivo, tarjeta, QR)
- Listado de ventas del turno
- Cierre con conteo físico, cálculo de diferencia (sobrante/faltante)
- Historial de turnos anteriores con diferencias

---

## 🔒 Seguridad

- **Row Level Security (RLS)** en Supabase: cada empresa solo ve sus datos
- **JWT tokens** con auto-refresh via Supabase Auth
- **Guards de ruta** por rol en el frontend
- **Edge Functions** con service role para operaciones admin (crear usuarios)
- Backups automáticos diarios incluidos en Supabase Cloud

---

## 🖨️ Impresión de Tickets

El sistema soporta dos métodos:

1. **Browser print** (sin instalación): abre ventana de impresión estándar. Compatible con cualquier impresora.
2. **ESC/POS directo** (via Web Serial API): envío directo a impresoras térmicas Epson, Star, Bixolon, etc. Solo funciona en Chrome/Edge con impresora conectada por USB.

Para usar ESC/POS en el POSPage, llama `usePrint().printTicketESCPOS(sale)` tras confirmar la venta.

---

## 💰 Modelo de Negocio SaaS Recomendado

| Plan | Precio/mes | Límites |
|------|-----------|---------|
| Free | Gratis | 100 ventas/mes, 1 usuario |
| Starter | $29 USD | Ilimitado, 3 usuarios, 1 sucursal |
| Pro | $59 USD | Ilimitado, 10 usuarios, 3 sucursales |
| Enterprise | $99+ USD | Ilimitado, usuarios ilimitados, N sucursales |

---

## 🗺️ Roadmap (próximas funciones)

- [ ] Facturación electrónica (Bolivia: SIN/SIAT, México: SAT, etc.)
- [ ] App móvil del dueño (React Native / Expo)
- [ ] Módulo de compras a proveedores
- [ ] Descuentos automáticos y promociones
- [ ] Programa de puntos/fidelización de clientes
- [ ] Integración MercadoPago / Culqi / Kushki
- [ ] Módulo de gastos y caja chica
- [ ] WhatsApp API para envío de recibos digitales
- [ ] Multi-sucursal con transferencias de inventario
- [ ] Dashboard del dueño en tiempo real (WebSockets)

---

## 📞 Soporte

Este sistema está listo para ser desplegado y vendido. Para customizaciones o soporte técnico, contáctanos.

---

*Desarrollado con React + Supabase • Stack 100% serverless • Deploy en minutos*
