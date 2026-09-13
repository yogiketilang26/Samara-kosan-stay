import React, { useState, useMemo, useEffect } from 'react';
import { 
  Building2, TrendingUp, DollarSign, CreditCard, 
  Scale, ShieldAlert, Clock, RefreshCw, Printer, 
  BedDouble, CheckCircle2, AlertCircle, MapPin, PenTool, FileCheck, Users
} from 'lucide-react';
import { database, isSupabaseConfigured } from '../lib/supabase';
import { useRealtimeTable } from '../hooks/useRealtimeTable';
import { 
  calculateOccupancy, 
  calculateTotalInflow, 
  calculateTotalExpenses, 
  calculateNOI, 
  calculateGrossPipeline,
  calculateDetailedCOAExpenseBreakdown
} from '../lib/financialMetrics';
import { 
  Property, Room, Tenant, Booking, FinancialTransaction, 
  AccountCOA, MidtransClearingTransaction, Maintenance, 
  PettyCashRequest, PurchaseOrder, PaymentInvoice, ActivityLog
} from '../types';
import { OwnerHeader } from '../components/owner/OwnerHeader';
import { ExecutiveKpiCards } from '../components/owner/ExecutiveKpiCards';
import { MidtransCashflowCard } from '../components/owner/MidtransCashflowCard';
import { BranchComparisonSection } from '../components/owner/BranchComparisonSection';
import { ProfitLossDividendCard } from '../components/owner/ProfitLossDividendCard';
import { ExpenseAuditSection } from '../components/owner/ExpenseAuditSection';
import { LeaseExpiringMonitor } from '../components/owner/LeaseExpiringMonitor';
import { OwnerSignatureManager } from '../components/owner/OwnerSignatureManager';
import { StaffOperationsSection } from '../components/owner/StaffOperationsSection';
import Loader from '../components/common/Loader';
import { formatRupiah } from '../utils/formatCurrency';

export const Owner: React.FC = () => {
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>('all');
  const [selectedPeriod, setSelectedPeriod] = useState<'this_month' | 'last_month' | 'this_quarter' | 'ytd'>('this_month');
  const [activeTab, setActiveTab] = useState<'overview' | 'midtrans' | 'pnl' | 'expenses' | 'leases' | 'signature' | 'staff_ops'>('overview');

  // Background auto-release expired leases check (>24h grace period -> Available)
  useEffect(() => {
    const runCheck = async () => {
      try {
        await database.autoReleaseExpiredLeases();
      } catch (err) {
        console.warn('[Owner] Auto release check:', err);
      }
    };
    runCheck();
    const interval = setInterval(runCheck, 60000);
    return () => clearInterval(interval);
  }, []);

  // Realtime Data Subscriptions (eliminating static fetch lock-in)
  const { data: properties = [], loading: loadingProps } = useRealtimeTable<Property>('properties', () => database.fetchProperties());
  const { data: rooms = [], loading: loadingRooms } = useRealtimeTable<Room>('rooms', () => database.fetchRooms());
  const { data: tenants = [], loading: loadingTenants } = useRealtimeTable<Tenant>('tenants', () => database.fetchTenants());
  const { data: bookings = [], loading: loadingBookings } = useRealtimeTable<Booking>('bookings', () => database.fetchBookings());
  const { data: transactions = [], loading: loadingTx } = useRealtimeTable<FinancialTransaction>('financial_transactions', () => database.fetchFinancialTransactions({ limit: 1000 }));
  const { data: payments = [], loading: loadingPayments } = useRealtimeTable<PaymentInvoice>('payments', () => database.fetchPayments({ limit: 1000 }));
  const { data: accounts = [] } = useRealtimeTable<AccountCOA>('accounts', () => database.fetchAccounts());
  const { data: clearingList = [] } = useRealtimeTable<MidtransClearingTransaction>('midtrans_clearing_transactions', () => database.fetchMidtransClearingTransactions({ limit: 1000 }));
  const { data: maintenanceList = [] } = useRealtimeTable<Maintenance>('maintenance', () => database.fetchMaintenance({ limit: 500 }));
  const { data: pettyCashList = [] } = useRealtimeTable<PettyCashRequest>('petty_cash_requests', () => database.fetchPettyCashRequests({ limit: 500 }));
  const { data: purchaseOrders = [] } = useRealtimeTable<PurchaseOrder>('purchase_orders', () => database.fetchPurchaseOrders({ limit: 500 }));
  const { data: activityLogs = [], refetch: refetchActivityLogs } = useRealtimeTable<ActivityLog>('activity_logs', () => database.fetchActivityLogs({ limit: 100 }));

  const isLoading = loadingProps || loadingRooms || loadingTenants || loadingBookings || loadingTx || loadingPayments;

  // Filtered datasets based on selected property
  const filteredRooms = useMemo(() => {
    if (selectedPropertyId === 'all') return rooms;
    return rooms.filter(r => String(r.property_id) === String(selectedPropertyId));
  }, [rooms, selectedPropertyId]);

  const filteredTenants = useMemo(() => {
    if (selectedPropertyId === 'all') return tenants;
    return tenants.filter(t => String(t.property_id) === String(selectedPropertyId));
  }, [tenants, selectedPropertyId]);

  const filteredBookings = useMemo(() => {
    if (selectedPropertyId === 'all') return bookings;
    return bookings.filter(b => String(b.property_id) === String(selectedPropertyId));
  }, [bookings, selectedPropertyId]);

  const filteredTransactions = useMemo(() => {
    if (selectedPropertyId === 'all') return transactions;
    return transactions.filter(t => !t.property_id || String(t.property_id) === String(selectedPropertyId));
  }, [transactions, selectedPropertyId]);

  const filteredPayments = useMemo(() => {
    if (selectedPropertyId === 'all') return payments;
    return payments.filter(p => !p.property_id || String(p.property_id) === String(selectedPropertyId));
  }, [payments, selectedPropertyId]);

  const filteredClearing = useMemo(() => {
    if (selectedPropertyId === 'all') return clearingList;
    return clearingList.filter(c => !c.property_id || String(c.property_id) === String(selectedPropertyId));
  }, [clearingList, selectedPropertyId]);

  // Centralized Financial Engine Math
  const occupancyData = calculateOccupancy(filteredRooms);
  const totalRooms = occupancyData.totalRooms;
  const occupiedRooms = occupancyData.occupiedRooms;
  const occupancyRate = occupancyData.ratePercentage;

  // 1. Total Inflow (Arus Kas Masuk Transaksi Riil Supabase / Midtrans / Pelunasan)
  const totalInflow = calculateTotalInflow(filteredTransactions, filteredPayments);

  // 2. Estimasi Nilai Kontrak Sewa (Approved Bookings Pipeline)
  const totalContractRevenue = calculateGrossPipeline(filteredBookings.filter(b => b.status === 'approved'));

  // 3. Gross Revenue (Realized Inflow with fallback to Approved Pipeline)
  const grossRevenue = totalInflow > 0 ? totalInflow : totalContractRevenue;

  // 4. Biaya Operasional (Outflow Pengeluaran Riil Supabase)
  const totalExpenses = calculateTotalExpenses(filteredTransactions);

  // 5. Net Operating Income (NOI / Laba Bersih)
  const netOperatingIncome = calculateNOI(grossRevenue, totalExpenses);
  const distributableDividend = Math.max(0, netOperatingIncome * 0.85); // 85% payout pool
  const avgRevenuePerRoom = totalRooms > 0 ? grossRevenue / totalRooms : 0;

  // 6. Midtrans Clearing Metrics (Real-time COA 1200 / clearing transactions)
  const totalGrossSettled = useMemo(() => {
    const fromClearing = filteredClearing.reduce((sum, c) => sum + Number(c.gross_amount || 0), 0);
    return fromClearing > 0 ? fromClearing : grossRevenue;
  }, [filteredClearing, grossRevenue]);

  const totalMdrFee = useMemo(() => {
    const fromClearingFee = filteredClearing.reduce((sum, c) => sum + Number(c.fee_amount || 0), 0);
    return fromClearingFee;
  }, [filteredClearing]);

  const totalNetSettled = totalGrossSettled - totalMdrFee;
  
  const unreconciledEscrow = useMemo(() => {
    const pendingClearing = filteredClearing
      .filter(c => c.clearing_status === 'pending' || c.clearing_status === 'cleared')
      .reduce((sum, c) => sum + Number(c.outstanding_amount || c.net_amount || c.gross_amount || 0), 0);
    return pendingClearing;
  }, [filteredClearing]);

  // P&L Breakdown from Dynamic Ledger Data with explicit [Estimasi] tagging when synthetic
  const revenueBreakdown = useMemo(() => {
    const realRent = filteredTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);
    const realDp = filteredTransactions
      .filter(t => t.type === 'dp_booking')
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);

    const isSynthetic = realRent === 0 && realDp === 0 && grossRevenue > 0;

    return [
      { 
        code: '4000', 
        name: isSynthetic 
          ? 'Pendapatan Sewa Kamar Kos (Inflow Bulanan)' 
          : 'Pendapatan Sewa Kamar Kos (Inflow Bulanan)', 
        amount: realRent > 0 ? realRent : (grossRevenue * 0.92),
        isEstimated: isSynthetic
      },
      { 
        code: '4200', 
        name: isSynthetic 
          ? 'Pendapatan Jaminan DP Survey & Booking' 
          : 'Pendapatan Jaminan DP Survey & Booking', 
        amount: realDp > 0 ? realDp : (grossRevenue * 0.08),
        isEstimated: isSynthetic
      },
      { code: '4100', name: 'Pendapatan Denda & Keterlambatan Sewa', amount: 0, isEstimated: false },
      { code: '4300', name: 'Pendapatan Layanan Tambahan (Laundry/Parkir)', amount: 0, isEstimated: false },
    ];
  }, [filteredTransactions, grossRevenue]);

  const expenseBreakdown = useMemo(() => {
    const maintenanceCost = maintenanceList.reduce((sum, m) => sum + (Number(m.cost) || 0), 0);
    return calculateDetailedCOAExpenseBreakdown(
      filteredTransactions,
      totalExpenses,
      totalMdrFee,
      maintenanceCost
    );
  }, [totalExpenses, totalMdrFee, maintenanceList, filteredTransactions]);

  // Branch Performance Comparison Data (Calculated per Branch from Supabase)
  const branchMetrics = useMemo(() => {
    return properties.map((prop) => {
      const propRooms = rooms.filter(r => r.property_id === prop.id);
      const propOccupied = propRooms.filter(r => r.status === 'occupied').length;
      const propOccRate = propRooms.length > 0 ? (propOccupied / propRooms.length) * 100 : 0;
      
      // Calculate revenue per branch from transactions, payments, or bookings
      const propTxRevenue = transactions
        .filter(t => t.property_id === prop.id && (t.type === 'income' || t.type === 'dp_booking'))
        .reduce((sum, t) => sum + Number(t.amount || 0), 0);

      const propPaymentsRevenue = payments
        .filter(p => p.property_id === prop.id && p.status === 'paid')
        .reduce((sum, p) => sum + Number(p.amount || 0), 0);
      
      const propBookingRevenue = bookings
        .filter(b => b.property_id === prop.id && b.status === 'approved')
        .reduce((sum, b) => sum + Number(b.total_price || 0), 0);

      const propInflow = propTxRevenue > 0 ? propTxRevenue : propPaymentsRevenue;
      const propRev = propInflow > 0 ? propInflow : (propBookingRevenue > 0 ? propBookingRevenue : (grossRevenue * (propRooms.length / (rooms.length || 1))));
      const propExp = transactions
        .filter(t => t.property_id === prop.id && t.type === 'expense')
        .reduce((sum, t) => sum + Number(t.amount || 0), 0);

      return {
        property: prop,
        totalRooms: propRooms.length || prop.total_rooms || 10,
        occupiedRooms: propOccupied,
        occupancyRate: propOccRate,
        totalRevenue: propRev,
        totalExpenses: propExp,
        netIncome: propRev - propExp,
        revPar: propRooms.length > 0 ? propRev / propRooms.length : 0
      };
    });
  }, [properties, rooms, transactions, payments, bookings, grossRevenue]);

  const totalMaintenanceCost = maintenanceList.reduce((sum, m) => sum + (Number(m.cost) || 0), 0);

  const pendingSignatureCount = useMemo(() => {
    return bookings.filter(b => !b.owner_signed_at && b.status !== 'rejected').length;
  }, [bookings]);

  const handlePrint = () => {
    window.print();
  };

  if (isLoading && properties.length === 0) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center bg-slate-900 text-slate-200">
        <Loader label="Memuat Data Eksekutif Portofolio.." />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#3A444D] font-sans pb-16">
      
      {/* 1. Header with Filters & Actions */}
      <OwnerHeader 
        properties={properties}
        selectedPropertyId={selectedPropertyId}
        onSelectProperty={setSelectedPropertyId}
        selectedPeriod={selectedPeriod}
        onSelectPeriod={setSelectedPeriod}
        onRefresh={() => window.location.reload()}
        isLoading={isLoading}
        onPrint={handlePrint}
        onOpenSignatureTab={() => setActiveTab('signature')}
        pendingSignatureCount={pendingSignatureCount}
      />

      <div className="max-w-7xl mx-auto px-4 md:px-8 mt-6 space-y-6">
        
        {/* 2. Executive KPI Cards */}
        <ExecutiveKpiCards 
          grossRevenue={grossRevenue}
          totalContractRevenue={totalContractRevenue}
          totalExpenses={totalExpenses}
          netOperatingIncome={netOperatingIncome}
          distributableDividend={distributableDividend}
          totalRooms={totalRooms}
          occupiedRooms={occupiedRooms}
          occupancyRate={occupancyRate}
          avgRevenuePerRoom={avgRevenuePerRoom}
          pendingMidtransClearing={unreconciledEscrow}
        />

        {/* 3. Owner Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-200 overflow-x-auto pb-1">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 cursor-pointer transition-all ${
              activeTab === 'overview'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Building2 size={14} />
            Ringkasan & Komparasi Cabang
          </button>

          <button
            onClick={() => setActiveTab('signature')}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 cursor-pointer transition-all ${
              activeTab === 'signature'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <PenTool size={14} className={activeTab === 'signature' ? 'text-emerald-400' : ''} />
            <span>Master TTD & Stempel Resmi</span>
          </button>

          <button
            onClick={() => setActiveTab('midtrans')}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 cursor-pointer transition-all ${
              activeTab === 'midtrans'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <CreditCard size={14} />
            Arus Kas Midtrans & Kliring
          </button>

          <button
            onClick={() => setActiveTab('pnl')}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 cursor-pointer transition-all ${
              activeTab === 'pnl'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Scale size={14} />
            Laba Rugi & Dividen
          </button>

          <button
            onClick={() => setActiveTab('expenses')}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 cursor-pointer transition-all ${
              activeTab === 'expenses'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <ShieldAlert size={14} />
            Audit Pengeluaran
          </button>

          <button
            onClick={() => setActiveTab('leases')}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 cursor-pointer transition-all ${
              activeTab === 'leases'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Clock size={14} />
            Monitoring Sewa
          </button>

          <button
            onClick={() => setActiveTab('staff_ops')}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 cursor-pointer transition-all ${
              activeTab === 'staff_ops'
                ? 'bg-teal-700 text-white shadow-sm'
                : 'text-teal-700 hover:text-teal-900 hover:bg-teal-50'
            }`}
          >
            <Users size={14} className={activeTab === 'staff_ops' ? 'text-teal-200' : 'text-teal-600'} />
            <span>Operasional & Log Staf</span>
          </button>
        </div>

        {/* 4. Tab Contents */}
        {activeTab === 'signature' && (
          <OwnerSignatureManager 
            properties={properties}
            rooms={filteredRooms}
            tenants={filteredTenants}
            bookings={filteredBookings}
            selectedPropertyId={selectedPropertyId}
            onSelectProperty={setSelectedPropertyId}
          />
        )}

        {/* 4. Tab Contents */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <BranchComparisonSection 
              branchMetrics={branchMetrics}
              onSelectBranch={setSelectedPropertyId}
            />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <MidtransCashflowCard 
                transactions={filteredClearing}
                totalGrossSettled={totalGrossSettled}
                totalMdrFee={totalMdrFee}
                totalNetSettled={totalNetSettled}
                unreconciledEscrow={unreconciledEscrow}
              />
              <LeaseExpiringMonitor 
                tenants={filteredTenants}
                rooms={filteredRooms}
              />
            </div>
          </div>
        )}

        {activeTab === 'midtrans' && (
          <MidtransCashflowCard 
            transactions={filteredClearing}
            totalGrossSettled={totalGrossSettled}
            totalMdrFee={totalMdrFee}
            totalNetSettled={totalNetSettled}
            unreconciledEscrow={unreconciledEscrow}
          />
        )}

        {activeTab === 'pnl' && (
          <ProfitLossDividendCard 
            accounts={accounts}
            grossRevenue={grossRevenue}
            totalExpenses={totalExpenses}
            netOperatingIncome={netOperatingIncome}
            revenueBreakdown={revenueBreakdown}
            expenseBreakdown={expenseBreakdown}
          />
        )}

        {activeTab === 'expenses' && (
          <ExpenseAuditSection 
            maintenanceList={maintenanceList}
            pettyCashList={pettyCashList}
            purchaseOrders={purchaseOrders}
            totalMaintenanceCost={totalMaintenanceCost}
          />
        )}

        {activeTab === 'leases' && (
          <LeaseExpiringMonitor 
            tenants={filteredTenants}
            rooms={filteredRooms}
          />
        )}

        {activeTab === 'staff_ops' && (
          <StaffOperationsSection 
            properties={properties}
            rooms={filteredRooms}
            maintenanceList={maintenanceList}
            pettyCashList={pettyCashList}
            activityLogs={activityLogs}
            selectedPropertyId={selectedPropertyId}
            onRefresh={() => {
              refetchActivityLogs();
            }}
          />
        )}

      </div>

    </div>
  );
};

export default Owner;
