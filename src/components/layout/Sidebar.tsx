import React from 'react';
import { 
  LayoutDashboard, Building2, BedDouble, GraduationCap, 
  Receipt, Ticket, History, Users, UserCog, Activity, Terminal, Mail, Sparkles
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
    { id: 'facilities', name: 'Master Fasilitas', icon: Sparkles },
    { id: 'surveys', name: 'Antrian Survey', icon: GraduationCap },
    { id: 'finance', name: 'Keuangan & PBJT', icon: Receipt },
    { id: 'coupons', name: 'Promo Diskon', icon: Ticket },
    { id: 'bookings_history', name: 'Riwayat Sewa', icon: History },
    { id: 'tenants', name: 'Daftar Penghuni', icon: Users },
    { id: 'user_roles', name: 'User & Akses', icon: UserCog },
    { id: 'email_integration', name: 'Integrasi Email', icon: Mail },
    { id: 'midtrans_logs', name: 'Midtrans Logs', icon: Terminal },
    { id: 'activity_logs', name: 'Log Aktivitas', icon: Activity }
  ];

  return (
    <aside className="w-full lg:w-64 bg-white border border-[#E2E8F0] rounded-[24px] p-4 space-y-4 shrink-0 shadow-sm h-fit">
      <div className="px-3 border-b border-[#F1F5F9] pb-3 text-left">
        <h4 className="text-xs font-bold text-[#3A444D] uppercase tracking-wider font-sans">Navigasi Panel</h4>
      </div>
      <nav className="flex flex-row lg:flex-col overflow-x-auto lg:overflow-visible gap-1 pb-2 lg:pb-0 font-sans">
        {menuItems.map(item => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold cursor-pointer transition-all whitespace-nowrap lg:w-full ${
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
    </aside>
  );
};

export default Sidebar;
