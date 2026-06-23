import React from 'react';
import { 
  LayoutDashboard, Building2, BedDouble, GraduationCap, 
  Receipt, Ticket, History, Users, UserCog, Activity, Terminal
} from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
  const menuItems = [
    { id: 'dashboard', name: 'Dashboard', icon: LayoutDashboard },
    { id: 'properties', name: 'Properti Kos', icon: Building2 },
    { id: 'rooms', name: 'Kamar Hunian', icon: BedDouble },
    { id: 'surveys', name: 'Antrian Survey', icon: GraduationCap },
    { id: 'finance', name: 'Keuangan & PBJT', icon: Receipt },
    { id: 'coupons', name: 'Promo Diskon', icon: Ticket },
    { id: 'bookings_history', name: 'Riwayat Sewa', icon: History },
    { id: 'tenants', name: 'Daftar Penghuni', icon: Users },
    { id: 'user_roles', name: 'User & Akses', icon: UserCog },
    { id: 'midtrans_logs', name: 'Midtrans Logs', icon: Terminal },
    { id: 'activity_logs', name: 'Log Aktivitas', icon: Activity }
  ];

  return (
    <aside className="w-full lg:w-64 bg-slate-900 border border-slate-850 rounded-3xl p-4 space-y-4 shrink-0 shadow-lg h-fit">
      <div className="px-3 border-b border-slate-800 pb-3">
        <h4 className="text-xs font-bold text-slate-400 font-mono uppercase tracking-wider">Navigasi Panel</h4>
      </div>
      <nav className="flex flex-row lg:flex-col overflow-x-auto lg:overflow-visible gap-1 pb-2 lg:pb-0 font-sans">
        {menuItems.map(item => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap lg:w-full ${
                isActive 
                  ? 'bg-amber-500 text-black shadow-md' 
                  : 'text-slate-350 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Icon size={14} className="shrink-0" />
              <span>{item.name}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
};

export default Sidebar;
