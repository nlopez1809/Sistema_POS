# 🚀 Guía de Deploy — POS System

Tiempo estimado: **20-30 minutos** para el primer deploy.

---

## Requisitos previos

- Node.js 18+
- Cuenta en [Supabase](https://supabase.com) (gratis)
- Cuenta en [Vercel](https://vercel.com) (gratis)
- (Opcional) Cuenta en [Resend](https://resend.com) para emails

---

## Paso 1 — Crear proyecto en Supabase

1. Ve a [app.supabase.com](https://app.supabase.com) → **New project**
2. Guarda el **Project URL** y la **anon key** (Settings → API)
3. En el **SQL Editor**, ejecuta los archivos en este orden:

```
backend/supabase/1_schema.sql
backend/supabase/2_migration_suppliers.sql
backend/supabase/4_migration_expenses_loyalty.sql
backend/supabase/5_rls_policies.sql
```

> En desarrollo también puedes correr `3_seed.sql` para datos de demo.

---

## Paso 2 — Configurar variables de entorno

```bash
cd frontend
cp .env.example .env.local
```

Edita `.env.local`:

```env
VITE_SUPABASE_URL=https://TU_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...TU_ANON_KEY...

# Opcional — monitoreo de errores
# VITE_SENTRY_DSN=https://xxx@sentry.io/xxx

# Opcional — versión para Sentry releases
# VITE_APP_VERSION=1.0.0
```

---

## Paso 3 — Deploy automático (recomendado)

```bash
# Desde la raíz del proyecto
chmod +x deploy.sh
./deploy.sh
```

El script hace todo: instala dependencias, corre tests, compila y despliega.

---

## Paso 3 — Deploy manual (alternativo)

### Frontend → Vercel

```bash
cd frontend
npm install
npm run test          # verificar que todo pasa
npm run build         # compilar
vercel --prod         # desplegar
```

Configurar vars en Vercel dashboard o con CLI:

```bash
vercel env add VITE_SUPABASE_URL      production
vercel env add VITE_SUPABASE_ANON_KEY production
```

### Edge Functions → Supabase

```bash
# Instalar Supabase CLI
npm install -g supabase

# Login
supabase login

# Deploy functions
supabase functions deploy create-user       --project-ref TU_PROJECT_REF
supabase functions deploy send-ticket-email --project-ref TU_PROJECT_REF

# Secrets para email
supabase secrets set RESEND_API_KEY=re_xxx        --project-ref TU_PROJECT_REF
supabase secrets set FROM_EMAIL=noreply@tuapp.com --project-ref TU_PROJECT_REF
```

El **Project Ref** está en Supabase → Settings → General.

---

## Paso 4 — Crear el primer usuario administrador

1. En Supabase → **Authentication → Users → Add user**:
   - Email: `admin@tuempresa.com`
   - Password: (una contraseña segura, mínimo 8 caracteres)
   - Auto-confirm: ✓

2. En **SQL Editor**:

```sql
INSERT INTO users (auth_id, name, email, role)
VALUES (
  (SELECT id FROM auth.users WHERE email = 'admin@tuempresa.com'),
  'Administrador',
  'admin@tuempresa.com',
  'admin'
);
```

3. Ingresa al sistema → el **Onboarding Wizard** te guía para configurar empresa, sucursal y primeros productos.

---

## Paso 5 — Dominio personalizado (para vender)

En Vercel → tu proyecto → **Settings → Domains → Add**:

```
tupos.com      → www.tupos.com
pos.tutienda.com
```

Configura los registros DNS según indica Vercel (generalmente un CNAME o A record).

---

## Configuración de Supabase Auth para producción

En Supabase → **Authentication → Settings**:

| Setting | Valor recomendado |
|---------|-------------------|
| Site URL | `https://tupos.com` |
| Redirect URLs | `https://tupos.com/**` |
| Email confirmations | ✓ Habilitado |
| SMTP personalizado | Conectar Resend/SendGrid (límite free = 3/hora) |

### SMTP con Resend (recomendado, gratis hasta 3000/mes)

1. Crea cuenta en [resend.com](https://resend.com)
2. Verifica tu dominio
3. En Supabase → Auth → SMTP:
   - Host: `smtp.resend.com`
   - Port: `587`
   - User: `resend`
   - Password: `tu_api_key`
   - Sender: `noreply@tudominio.com`

---

## Monitoreo de errores con Sentry (opcional pero recomendado)

1. Crea proyecto en [sentry.io](https://sentry.io) (gratis hasta 5000 eventos/mes)
2. Copia el DSN
3. Instala el SDK:
   ```bash
   cd frontend && npm install @sentry/react
   ```
4. Agrega a `.env.local`:
   ```
   VITE_SENTRY_DSN=https://xxx@sentry.io/xxx
   ```
5. Agrega en Vercel dashboard como variable de producción

El sistema ya tiene el módulo `monitoring.ts` integrado — automáticamente captura errores y trackea eventos de venta, login y sync offline.

---

## Correr tests antes de cada deploy

```bash
cd frontend

# Todos los tests (5 archivos, 116 casos)
npm run test

# Con coverage report
npm run test:coverage

# UI interactiva
npm run test:ui
```

**Los tests cubren:** lógica del carrito, cálculo de totales, IVA, descuentos, arqueo de caja, movimientos de stock, exportación CSV/PDF, programa de puntos, y cola offline.

---

## Estructura de archivos de deploy

```
pos-system/
├── deploy.sh                          ← Script automático
├── frontend/
│   ├── .env.example                   ← Copiar a .env.local
│   ├── src/lib/monitoring.ts          ← Sentry integration
│   └── dist/                          ← Build de producción (Vercel)
├── backend/
│   ├── supabase/
│   │   ├── 1_schema.sql               ← Tablas base
│   │   ├── 2_migration_suppliers.sql  ← Proveedores
│   │   ├── 3_seed.sql                 ← Solo dev
│   │   ├── 4_migration_expenses_loyalty.sql
│   │   └── 5_rls_policies.sql         ← CRÍTICO para producción
│   └── functions/
│       ├── create-user/               ← Edge Function
│       └── send-ticket-email/         ← Edge Function
```

---

## Checklist final antes de lanzar

- [ ] SQL 1, 2, 4 y 5 ejecutados en Supabase (en ese orden)
- [ ] Variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` en Vercel
- [ ] Site URL configurado en Supabase Auth
- [ ] Edge Functions desplegadas
- [ ] Secret `RESEND_API_KEY` configurado (para emails de tickets)
- [ ] Primer usuario admin creado en Supabase Auth
- [ ] Onboarding wizard completado (empresa + sucursal + productos)
- [ ] Primera venta de prueba realizada y verificada
- [ ] Dominio personalizado configurado
- [ ] Tests corriendo sin errores (`npm run test`)

---

## Soporte y mantenimiento

Para actualizar el sistema:
```bash
git pull
cd frontend && npm install
npm run test
vercel --prod
```

Para ver logs de las Edge Functions:
```bash
supabase functions logs create-user       --project-ref TU_PROJECT_REF
supabase functions logs send-ticket-email --project-ref TU_PROJECT_REF
```
