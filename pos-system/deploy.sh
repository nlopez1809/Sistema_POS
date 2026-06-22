#!/usr/bin/env bash
# ============================================================
# deploy.sh — Script de deploy completo para POS System
# Uso: chmod +x deploy.sh && ./deploy.sh
# ============================================================
set -euo pipefail

# ── Colores para output ───────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✓${NC} $1"; }
info() { echo -e "${BLUE}→${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC}  $1"; }
fail() { echo -e "${RED}✗${NC} $1"; exit 1; }
step() { echo -e "\n${CYAN}══ $1 ══${NC}"; }

echo -e "${CYAN}"
echo "  ╔═══════════════════════════════════╗"
echo "  ║   POS System — Deploy Script      ║"
echo "  ╚═══════════════════════════════════╝"
echo -e "${NC}"

# ── 1. Verificar herramientas requeridas ─────────────────────
step "1. Verificando herramientas"

command -v node    >/dev/null 2>&1 || fail "Node.js no instalado. Instala desde nodejs.org"
command -v npm     >/dev/null 2>&1 || fail "npm no encontrado."
command -v git     >/dev/null 2>&1 || fail "Git no instalado."

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  fail "Node.js 18+ requerido (tienes v$NODE_VERSION)"
fi
ok "Node.js $(node -v)"

# Verificar Vercel CLI
if ! command -v vercel >/dev/null 2>&1; then
  warn "Vercel CLI no instalado. Instalando..."
  npm install -g vercel
fi
ok "Vercel CLI $(vercel --version)"

# Verificar Supabase CLI
if ! command -v supabase >/dev/null 2>&1; then
  warn "Supabase CLI no instalado. Instalando..."
  npm install -g supabase
fi
ok "Supabase CLI $(supabase --version)"

# ── 2. Variables de entorno ──────────────────────────────────
step "2. Verificando variables de entorno"

ENV_FILE="frontend/.env.local"
if [ ! -f "$ENV_FILE" ]; then
  if [ -f "frontend/.env.example" ]; then
    cp frontend/.env.example "$ENV_FILE"
    warn "Creado $ENV_FILE desde .env.example"
    warn "IMPORTANTE: Edita $ENV_FILE con tus credenciales de Supabase antes de continuar"
    echo ""
    echo "  Necesitas:"
    echo "  → VITE_SUPABASE_URL=https://xxxx.supabase.co"
    echo "  → VITE_SUPABASE_ANON_KEY=eyJ..."
    echo ""
    read -p "¿Ya editaste el archivo .env.local? (s/n): " confirm
    [ "$confirm" = "s" ] || fail "Edita el .env.local y vuelve a correr el script."
  else
    fail "No se encontró .env.example en frontend/"
  fi
fi

# Validar que las vars no sean placeholder
SUPABASE_URL=$(grep VITE_SUPABASE_URL "$ENV_FILE" | cut -d'=' -f2)
SUPABASE_KEY=$(grep VITE_SUPABASE_ANON_KEY "$ENV_FILE" | cut -d'=' -f2)

[[ "$SUPABASE_URL" == *"XXXXXX"* ]] && fail "VITE_SUPABASE_URL todavía tiene el valor placeholder."
[[ "$SUPABASE_KEY" == *"..."* ]]    && fail "VITE_SUPABASE_ANON_KEY todavía tiene el valor placeholder."
[[ -z "$SUPABASE_URL" ]]            && fail "VITE_SUPABASE_URL está vacío en $ENV_FILE"
[[ -z "$SUPABASE_KEY" ]]            && fail "VITE_SUPABASE_ANON_KEY está vacío en $ENV_FILE"

ok "Variables de entorno configuradas"

# ── 3. Base de datos ─────────────────────────────────────────
step "3. Base de datos Supabase"

echo ""
echo "  Debes ejecutar las migraciones en el SQL Editor de Supabase:"
echo "  https://app.supabase.com → Tu proyecto → SQL Editor"
echo ""
echo "  Archivos a ejecutar en orden:"
echo "  1. backend/supabase/1_schema.sql"
echo "  2. backend/supabase/2_migration_suppliers.sql"
echo "  3. backend/supabase/4_migration_expenses_loyalty.sql"
echo "  4. backend/supabase/5_rls_policies.sql"
echo "  (Solo en dev): 3. backend/supabase/3_seed.sql"
echo ""
read -p "¿Ya ejecutaste las migraciones? (s/n): " db_done
[ "$db_done" = "s" ] || warn "Recuerda ejecutar las migraciones antes de usar el sistema."

# ── 4. Instalar dependencias y build ─────────────────────────
step "4. Build del frontend"

cd frontend

info "Instalando dependencias..."
npm install --silent
ok "Dependencias instaladas"

info "Ejecutando tests..."
if npm run test 2>/dev/null; then
  ok "Todos los tests pasan"
else
  warn "Algunos tests fallaron. Revisa antes de hacer deploy a producción."
  read -p "¿Continuar igualmente? (s/n): " cont
  [ "$cont" = "s" ] || fail "Deploy cancelado por tests fallidos."
fi

info "Compilando para producción..."
npm run build
ok "Build completado → dist/"

cd ..

# ── 5. Deploy a Vercel ───────────────────────────────────────
step "5. Deploy a Vercel"

cd frontend

info "Configurando variables de entorno en Vercel..."
vercel env add VITE_SUPABASE_URL     production <<< "$SUPABASE_URL"     2>/dev/null || warn "VITE_SUPABASE_URL ya configurado"
vercel env add VITE_SUPABASE_ANON_KEY production <<< "$SUPABASE_KEY"   2>/dev/null || warn "VITE_SUPABASE_ANON_KEY ya configurado"

info "Desplegando a Vercel..."
DEPLOY_URL=$(vercel --prod --yes 2>/dev/null | tail -1)
ok "Deploy exitoso: $DEPLOY_URL"

cd ..

# ── 6. Edge Functions ────────────────────────────────────────
step "6. Edge Functions de Supabase"

# Extraer project ref del URL
PROJECT_REF=$(echo "$SUPABASE_URL" | sed 's|https://||' | cut -d'.' -f1)

if [ -n "$PROJECT_REF" ]; then
  info "Desplegando Edge Functions..."

  supabase functions deploy create-user      --project-ref "$PROJECT_REF" 2>/dev/null && ok "create-user desplegado" || warn "Error desplegando create-user"
  supabase functions deploy send-ticket-email --project-ref "$PROJECT_REF" 2>/dev/null && ok "send-ticket-email desplegado" || warn "Error desplegando send-ticket-email"

  echo ""
  warn "IMPORTANTE: Configura el secret RESEND_API_KEY para el envío de emails:"
  echo "  supabase secrets set RESEND_API_KEY=re_xxx --project-ref $PROJECT_REF"
  echo "  supabase secrets set FROM_EMAIL=noreply@tudominio.com --project-ref $PROJECT_REF"
else
  warn "No se pudo extraer el project ref. Deploy de functions manual:"
  echo "  supabase functions deploy create-user --project-ref TU_PROJECT_REF"
  echo "  supabase functions deploy send-ticket-email --project-ref TU_PROJECT_REF"
fi

# ── 7. Primer usuario ────────────────────────────────────────
step "7. Crear primer usuario administrador"

echo ""
echo "  En Supabase → Authentication → Users → Add user:"
echo "  • Email:    admin@tuempresa.com"
echo "  • Password: (una contraseña segura)"
echo ""
echo "  Luego en SQL Editor ejecuta:"
echo ""
echo "  INSERT INTO users (auth_id, name, email, role)"
echo "  VALUES ("
echo "    (SELECT id FROM auth.users WHERE email = 'admin@tuempresa.com'),"
echo "    'Administrador',"
echo "    'admin@tuempresa.com',"
echo "    'admin'"
echo "  );"
echo ""
echo "  El sistema detectará que no tiene empresa asignada"
echo "  y lo llevará al Onboarding Wizard automáticamente."
echo ""

# ── Resumen final ────────────────────────────────────────────
step "✅ Deploy completado"

echo ""
echo -e "  ${GREEN}Sistema desplegado correctamente${NC}"
echo ""
echo "  Próximos pasos:"
echo "  1. Visita la URL de Vercel y crea tu empresa con el wizard"
echo "  2. Agrega tus productos (o importa desde Excel)"
echo "  3. Abre la caja y realiza tu primera venta de prueba"
echo ""
echo -e "  ${CYAN}URLs útiles:${NC}"
echo "  • Vercel dashboard:  https://vercel.com/dashboard"
echo "  • Supabase dashboard: https://app.supabase.com"
echo "  • Logs de funciones:  supabase functions logs --project-ref $PROJECT_REF"
echo ""
