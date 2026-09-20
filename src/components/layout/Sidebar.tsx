import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, Building2, BedDouble, GraduationCap, 
  Receipt, Ticket, History, Users, UserCog, Activity, Terminal, Mail, Sparkles,
  Menu, X, PanelLeftClose, PanelLeft, Cpu, FileSignature, Compass, DoorOpen, Wrench, Box
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isAnakOwner?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, isAnakOwner: propIsAnakOwner }) => {
  const { user } = useAuth();
  const rawRole = (user?.raw_role || user?.role || '').trim().toLowerCase();
  const userAccess = ((user as any)?.access || '').toLowerCase();
  const userEmail = (user?.email || '').toLowerCase();

  const [simulatedRole, setSimulatedRole] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search).get('role') || new URLSearchParams(window.location.search).get('portal');
      if (p === 'anak_owner') return 'anak_owner';
      return localStorage.getItem('samara_simulated_role');
    }
    return null;
  });

  useEffect(() => {
    const handler = (e: any) => {
      setSimulatedRole(e.detail?.role || null);
    };
    window.addEventListener('samara-role-simulate', handler);
    return () => window.removeEventListener('samara-role-simulate', handler);
  }, []);

  const isAnakOwner = Boolean(
    propIsAnakOwner ||
    rawRole === 'anak_owner' || 
    rawRole === 'anak owner' ||
    userAccess.includes('anak owner') ||
    userEmail.includes('anakowner') ||
    userEmail === 'sabita@samarastay.co' ||
    simulatedRole === 'anak_owner' ||
    (typeof window !== 'undefined' && (
      localStorage.getItem('samara_simulated_role') === 'anak_owner' ||
      new URLSearchParams(window.location.search).get('role') === 'anak_owner' ||
      new URLSearchParams(window.location.search).get('portal') === 'anak_owner'
    ))
  );

  const allMenuItems = [
    { id: 'dashboard', name: 'Dashboard', icon: LayoutDashboard },
    { id: 'properties', name: 'Properti Kos', icon: Building2 },
    { id: 'map_coordinates', name: 'Peta & Titik GPS', icon: Compass },
    { id: 'rooms', name: 'Kamar Hunian', icon: BedDouble },
    { id: 'facilities', name: 'Master Fasilitas', icon: Sparkles },
    { id: 'surveys', name: 'Antrian Survey', icon: GraduationCap },
    { id: 'finance', name: 'Keuangan & PBJT', icon: Receipt },
    { id: 'coupons', name: 'Promo Diskon', icon: Ticket },
    { id: 'bookings_history', name: 'Riwayat Sewa', icon: History },
    { id: 'tenants', name: 'Daftar Penghuni', icon: Users },
    { id: 'assets', name: 'Aset & Inventaris', icon: Box },
    { id: 'staff_ops', name: 'Operasional & Staf', icon: Wrench },
    { id: 'settings', name: 'Pengaturan & Ttd Owner', icon: FileSignature },
    { id: 'user_roles', name: 'User & Akses', icon: UserCog },
    { id: 'email_integration', name: 'Integrasi Email', icon: Mail },
    { id: 'midtrans_logs', name: 'Midtrans Logs', icon: Terminal },
    { id: 'observability', name: 'Health & Observability', icon: Cpu },
    { id: 'activity_logs', name: 'Log Aktivitas', icon: Activity }
  ];

  // Eksklusi menu untuk role 'anak_owner':
  // 14. User & Akses (user_roles)
  // 15. Integrasi Email (email_integration)
  // 16. Midtrans Logs (midtrans_logs)
  // 17. Health & Observability (observability)
  // 18. Log Aktivitas (activity_logs)
  // Menu lengkap hanya untuk Super Admin
  const forbiddenForAnakOwner = new Set([
    'email_integration',
    'midtrans_logs',
    'observability',
    'activity_logs',
    'user_roles'
  ]);

  const menuItems = allMenuItems.filter(item => {
    if (isAnakOwner && forbiddenForAnakOwner.has(item.id)) {
      return false;
    }
    return true;
  });

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // Set default collapse state based on window size on mount
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768 && window.innerWidth < 1024) {
        setIsCollapsed(true);
      } else if (window.innerWidth >= 1024) {
        setIsCollapsed(false);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const activeItem = menuItems.find(item => item.id === activeTab) || menuItems[0];

  return (
    <>
      {/* MOBILE TRIGGER BAR (Visible only on mobile <768px) */}
      <div className="md:hidden flex items-center justify-between bg-white border border-[#E2E8F0] rounded-[24px] p-4 shadow-sm w-full mb-2">
        <div className="flex items-center gap-2.5 text-left">
          <div className="p-2 bg-[#0D9488]/10 text-[#0D9488] rounded-xl">
            {React.createElement(activeItem.icon, { size: 16 })}
          </div>
          <div>
            <h4 className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider">Navigasi Panel</h4>
            <span className="text-xs font-extrabold text-[#3A444D] uppercase font-display">{activeItem.name}</span>
          </div>
        </div>
        <button 
          onClick={() => setIsMobileOpen(true)}
          className="p-2 px-3.5 bg-[#0D9488] hover:bg-[#0F766E] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs transition"
        >
          <Menu size={14} />
          <span>Menu</span>
        </button>
      </div>

      {/* TABLET & DESKTOP SIDEBAR (Visible on md:block, collapsible) */}
      <aside 
        className={`hidden md:flex flex-col bg-white border border-[#E2E8F0] rounded-[24px] p-4 shrink-0 shadow-sm transition-all duration-300 h-fit ${
          isCollapsed ? 'w-20' : 'w-64'
        }`}
      >
        <div className={`flex items-center justify-between border-b border-[#F1F5F9] pb-3 mb-4 ${isCollapsed ? 'justify-center' : 'px-2'}`}>
          {!isCollapsed && (
            <h4 className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider font-sans">
              {isAnakOwner ? 'Panel Anak Owner' : 'Navigasi Panel'}
            </h4>
          )}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1.5 hover:bg-[#F8FAFC] text-[#64748B] hover:text-[#0D9488] rounded-lg transition-colors cursor-pointer flex items-center justify-center"
            title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          >
            {isCollapsed ? <PanelLeft size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>

        <nav className="flex flex-col gap-1.5 font-sans">
          {menuItems.map(item => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center rounded-xl text-xs font-semibold cursor-pointer transition-all whitespace-nowrap w-full relative group ${
                  isActive 
                    ? 'bg-[#0D9488] text-white shadow-sm font-bold' 
                    : 'text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#0D9488]'
                } ${
                  isCollapsed 
                    ? 'justify-center p-3' 
                    : 'gap-2.5 px-3.5 py-2.5'
                }`}
                title={isCollapsed ? item.name : undefined}
              >
                <Icon size={14} className="shrink-0" />
                {!isCollapsed && <span>{item.name}</span>}
                
                {/* Collapsed Tooltip helper */}
                {isCollapsed && (
                  <div className="absolute left-full ml-3 px-2 py-1 bg-[#3A444D] text-white text-[10px] font-bold rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 shadow-md">
                    {item.name}
                  </div>
                )}
              </button>
            );
          })}
        </nav>

        {/* Dedicated Staff Admin View Link */}
        <div className="pt-3 mt-2 border-t border-[#F1F5F9]">
          <a
            href="/staff"
            className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all w-full text-left bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200 group relative ${
              isCollapsed ? 'justify-center px-0' : ''
            }`}
            title="Buka Tampilan Khusus Staff Admin"
          >
            <DoorOpen size={16} className="text-teal-600 shrink-0" />
            {!isCollapsed && (
              <div className="flex flex-col text-left overflow-hidden leading-tight">
                <span className="font-extrabold text-[11px] text-teal-900">Portal Staff Admin</span>
                <span className="text-[9px] text-teal-600 font-normal">Operasional Harian Kos</span>
              </div>
            )}
            {isCollapsed && (
              <div className="absolute left-full ml-3 px-2 py-1 bg-teal-900 text-white text-[10px] font-bold rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 shadow-md whitespace-nowrap">
                Portal Staff Admin
              </div>
            )}
          </a>
        </div>
      </aside>

      {/* MOBILE DRAWER WITH BACKDROP OVERLAY (Visible only when isMobileOpen is true) */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          {/* Backdrop Overlay */}
          <div 
            className="fixed inset-0 bg-[#3A444D]/40 backdrop-blur-xs transition-opacity duration-300"
            onClick={() => setIsMobileOpen(false)}
          />

          {/* Drawer content sheet */}
          <aside className="relative flex flex-col w-72 max-w-[85vw] h-full bg-white p-5 shadow-2xl transition-transform duration-300 ease-out z-10">
            <div className="flex items-center justify-between border-b border-[#F1F5F9] pb-3.5 mb-4">
              <div>
                <h4 className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider">Samara Stay</h4>
                <span className="text-xs font-extrabold text-[#3A444D] uppercase font-display">
                  {isAnakOwner ? 'Panel Anak Owner' : 'Navigasi Admin'}
                </span>
              </div>
              <button
                onClick={() => setIsMobileOpen(false)}
                className="p-1.5 hover:bg-slate-100 text-[#64748B] rounded-lg transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto space-y-1 font-sans pr-1">
              {menuItems.map(item => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.id);
                      setIsMobileOpen(false);
                    }}
                    className={`flex items-center gap-3 px-3.5 py-3 rounded-xl text-xs font-bold cursor-pointer transition-all w-full text-left ${
                      isActive 
                        ? 'bg-[#0D9488] text-white shadow-sm font-bold' 
                        : 'text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#0D9488]'
                    }`}
                  >
                    <Icon size={14} className="shrink-0" />
                    <span>{item.name}</span>
                  </button>
                );
              })}
            </nav>

            <div className="pt-3 mt-2 border-t border-[#F1F5F9]">
              <a
                href="/staff"
                className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all w-full text-left bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200"
              >
                <DoorOpen size={16} className="text-teal-600 shrink-0" />
                <div className="flex flex-col text-left overflow-hidden leading-tight">
                  <span className="font-extrabold text-[11px] text-teal-900">Portal Staff Admin</span>
                  <span className="text-[9px] text-teal-600 font-normal">Operasional Harian Kos</span>
                </div>
              </a>
            </div>
          </aside>
        </div>
      )}
    </>
  );
};

export default Sidebar;
