import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, ShoppingCart, Package, TrendingUp,
  Users, Settings, LogOut, ChevronLeft, ChevronRight,
  Store, Bell, CircleDot, Wallet, UserCircle2, Truck
} from 'lucide-react';
import { useAppStore } from '../../store';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';
import OfflineBanner, { OnlineIndicator } from '../ui/OfflineBanner';

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard'         },
  { to: '/pos',       icon: ShoppingCart,    label: 'Caja / POS'        },
  { to: '/inventory', icon: Package,         label: 'Inventario'        },
  { to: '/customers', icon: UserCircle2,     label: 'Clientes'          },
  { to: '/suppliers', icon: Truck,           label: 'Proveedores'       },
  { to: '/reports',   icon: TrendingUp,      label: 'Reportes'          },
  { to: '/caja',      icon: Wallet,          label: 'Turno de caja'     },
  { to: '/users',     icon: Users,           label: 'Usuarios'          },
  { to: '/settings',  icon: Settings,        label: 'Configuración'     },
];

export default function AppLayout() {
  const { user, company, branch, setUser, setCompany, setBranch, setCurrentSession } = useAppStore();
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null); setCompany(null); setBranch(null); setCurrentSession(null);
    toast.success('Sesión cerrada');
    navigate('/login');
  };

  return (
    <div className="app-shell">
      <style>{shellStyles}</style>
      <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-logo">
          <div className="logo-icon"><Store size={18} /></div>
          {!collapsed && <span className="logo-text">{company?.name ?? 'POS System'}</span>}
        </div>

        <nav className="sidebar-nav">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <Icon size={16} />
              {!collapsed && <span>{label}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="user-info">
            <div className="user-avatar">{user?.name?.slice(0, 2).toUpperCase() ?? 'US'}</div>
            {!collapsed && (
              <>
                <div className="user-meta">
                  <span className="user-name">{user?.name}</span>
                  <span className="user-role">{user?.role}</span>
                </div>
                <button onClick={handleLogout} className="logout-btn" title="Cerrar sesión">
                  <LogOut size={14} />
                </button>
              </>
            )}
          </div>
          <button onClick={() => setCollapsed(c => !c)} className="collapse-btn">
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <span className="branch-badge">
              <CircleDot size={10} className="branch-dot" />
              {branch?.name ?? 'Sin sucursal'}
            </span>
          </div>
          <div className="topbar-right">
            <OnlineIndicator />
            <button className="topbar-icon-btn" title="Notificaciones"><Bell size={15} /></button>
            <div className="topbar-user">{user?.name}</div>
          </div>
        </header>
        <OfflineBanner />
        <main className="page-content"><Outlet /></main>
      </div>
    </div>
  );
}

const shellStyles = `
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#0f0f11}
  .app-shell{display:flex;height:100vh;background:#0f0f11;color:#e8e6e1;font-family:'DM Sans',system-ui,sans-serif}
  .sidebar{width:220px;min-width:220px;background:#131318;border-right:1px solid #1e1e25;display:flex;flex-direction:column;transition:width .2s ease,min-width .2s ease;overflow:hidden}
  .sidebar.collapsed{width:60px;min-width:60px}
  .sidebar-logo{display:flex;align-items:center;gap:10px;padding:16px 14px 12px;border-bottom:1px solid #1e1e25;min-height:56px}
  .logo-icon{width:30px;height:30px;border-radius:8px;background:#5c6df0;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:#fff}
  .logo-text{font-size:13px;font-weight:600;white-space:nowrap;color:#e8e6e1;overflow:hidden;text-overflow:ellipsis}
  .sidebar-nav{flex:1;padding:10px 8px;display:flex;flex-direction:column;gap:1px;overflow-y:auto;scrollbar-width:none}
  .sidebar-nav::-webkit-scrollbar{display:none}
  .nav-item{display:flex;align-items:center;gap:9px;padding:8px 10px;border-radius:7px;color:#6b6a65;font-size:13px;text-decoration:none;transition:all .12s;white-space:nowrap;overflow:hidden}
  .nav-item:hover{background:#1a1a1f;color:#e8e6e1}
  .nav-item.active{background:#1a1a2e;color:#a5b4fc}
  .nav-item svg{flex-shrink:0}
  .sidebar-bottom{padding:8px;border-top:1px solid #1e1e25;display:flex;flex-direction:column;gap:4px}
  .user-info{display:flex;align-items:center;gap:8px;padding:6px 4px;border-radius:8px;min-height:42px}
  .user-avatar{width:28px;height:28px;border-radius:7px;background:#5c6df022;border:1px solid #5c6df044;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#a5b4fc;flex-shrink:0}
  .user-meta{flex:1;min-width:0}
  .user-name{display:block;font-size:12px;font-weight:500;color:#e8e6e1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .user-role{display:block;font-size:10px;color:#4a4a55;text-transform:capitalize}
  .logout-btn{background:none;border:none;color:#4a4a55;cursor:pointer;padding:4px;border-radius:6px;flex-shrink:0;display:flex;align-items:center;transition:color .1s}
  .logout-btn:hover{color:#ef4444}
  .collapse-btn{width:100%;padding:7px;background:#1a1a1f;border:1px solid #2a2a30;border-radius:8px;color:#6b6a65;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s}
  .collapse-btn:hover{border-color:#3a3a45;color:#e8e6e1}
  .main-area{flex:1;display:flex;flex-direction:column;overflow:hidden}
  .topbar{height:46px;background:#131318;border-bottom:1px solid #1e1e25;display:flex;align-items:center;justify-content:space-between;padding:0 18px;flex-shrink:0}
  .branch-badge{display:flex;align-items:center;gap:6px;font-size:12px;color:#6b6a65}
  .branch-dot{color:#22c55e}
  .topbar-right{display:flex;align-items:center;gap:8px}
  .topbar-icon-btn{background:none;border:1px solid #2a2a30;border-radius:7px;color:#6b6a65;cursor:pointer;padding:5px 7px;display:flex;align-items:center;transition:all .1s}
  .topbar-icon-btn:hover{border-color:#3a3a45;color:#e8e6e1}
  .topbar-user{font-size:12px;color:#6b6a65;padding:5px 10px;background:#1a1a1f;border:1px solid #2a2a30;border-radius:7px}
  .page-content{flex:1;overflow-y:auto}
`;
