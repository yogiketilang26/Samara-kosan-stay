import React, { useState, useMemo, useEffect } from 'react';
import { 
  Building2, CreditCard, 
  Scale, ShieldAlert, Clock, 
  PenTool, Users, Box, BarChart3, FileSpreadsheet
} from 'lucide-react';
import { database } from '../lib/supabase';
import { useRealtimeTable } from '../hooks/useRealtimeTable';
import {
  LIST_COLUMNS_BOOKINGS,
  LIST_COLUMNS_TENANTS,
  LIST_COLUMNS_FINANCIAL_TRANSACTIONS,
  LIST_COLUMNS_PAYMENTS,
  LIST_COLUMNS_MIDTRANS_CLEARING
} from '../lib/queryBudget';
import { 
  buildUniformKosanFinancialReport,
  getSharedFinanceFilterState,
  setSharedFinanceFilterState,
  FinancialReportPeriod
} from '../lib/financialMetrics';
import { 
  Property, Room, Tenant, Booking, FinancialTransaction, 
  AccountCOA, MidtransClearingTransaction, Maintenance, 
  PettyCashRequest, PurchaseOrder, PaymentInvoice, ActivityLog, FixedAsset
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
import { MonthlyCashflowDashboard } from '../components/owner/MonthlyCashflowDashboard';
import { AssetManagementSection } from '../components/AssetManagementSection';
import { KosanFinancialReportSuite } from '../components/finance/KosanFinancialReportSuite';
import Loader from '../components/common/Loader';

export const Owner: React.FC = () => {
  const initialFilter = getSharedFinanceFilterState();
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>(initialFilter.propertyId);
  const [selectedPeriod, setSelectedPeriod] = useState<FinancialReportPeriod>(initialFilter.period);
  const [activeTab, setActiveTab] = useState<'overview' | 'laporan_keuangan' | 'cashflow' | 'midtrans' | 'pnl' | 'expenses' | 'leases' | 'signature' | 'staff_ops' | 'assets'>('overview');

  // Synchronize filter state across portals (Owner <-> Admin <-> Anak Owner)
  useEffect(() => {
    const onFilterSync = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (detail) {
        if (detail.propertyId && detail.propertyId !== selectedPropertyId) {
          setSelectedPropertyId(detail.propertyId);
        }
        if (detail.period && detail.period !== selectedPeriod) {
          setSelectedPeriod(detail.period);
        }
      }
    };
    window.addEventListener('samara-finance-filter-sync', onFilterSync);
    return () => window.removeEventListener('samara-finance-filter-sync', onFilterSync);
  }, [selectedPropertyId, selectedPeriod]);

  const handleSelectProperty = (propId: string) => {
    setSelectedPropertyId(propId);
    setSharedFinanceFilterState({ propertyId: propId });
  };

  const handleSelectPeriod = (period: FinancialReportPeriod) => {
    setSelectedPeriod(period);
    setSharedFinanceFilterState({ period });
  };

  // Realtime Data Subscriptions with G10 column projections for list views
  const { data: properties = [], loading: loadingProps, refetch: refetchProps } = useRealtimeTable<Property>('properties', () => database.fetchProperties());
  const { data: rooms = [], loading: loadingRooms, refetch: refetchRooms } = useRealtimeTable<Room>('rooms', () => database.fetchRooms());
  const { data: tenants = [], loading: loadingTenants, refetch: refetchTenants } = useRealtimeTable<Tenant>('tenants', () => database.fetchTenants({ columns: LIST_COLUMNS_TENANTS }));
  const { data: bookings = [], loading: loadingBookings, refetch: refetchBookings } = useRealtimeTable<Booking>('bookings', () => database.fetchBookings({ columns: LIST_COLUMNS_BOOKINGS }));
  const { data: transactions = [], loading: loadingTx, refetch: refetchTransactions } = useRealtimeTable<FinancialTransaction>('financial_transactions', () => database.fetchFinancialTransactions({ limit: 1000, columns: LIST_COLUMNS_FINANCIAL_TRANSACTIONS }));
  const { data: payments = [], loading: loadingPayments, refetch: refetchPayments } = useRealtimeTable<PaymentInvoice>('payments', () => database.fetchPayments({ limit: 1000, columns: LIST_COLUMNS_PAYMENTS }));
  const { data: accounts = [], refetch: refetchAccounts } = useRealtimeTable<AccountCOA>('accounts', () => database.fetchAccounts());
  const { data: clearingList = [], refetch: refetchClearing } = useRealtimeTable<MidtransClearingTransaction>('midtrans_clearing_transactions', () => database.fetchMidtransClearingTransactions({ limit: 1000, columns: LIST_COLUMNS_MIDTRANS_CLEARING }));
  const { data: maintenanceList = [], refetch: refetchMaintenance } = useRealtimeTable<Maintenance>('maintenance', () => database.fetchMaintenance({ limit: 500 }));
  const { data: pettyCashList = [], refetch: refetchPettyCash } = useRealtimeTable<PettyCashRequest>('petty_cash_requests', () => database.fetchPettyCashRequests({ limit: 500 }));
  const { data: purchaseOrders = [], refetch: refetchPO } = useRealtimeTable<PurchaseOrder>('purchase_orders', () => database.fetchPurchaseOrders({ limit: 500 }));
  const { data: activityLogs = [], refetch: refetchActivityLogs } = useRealtimeTable<ActivityLog>('activity_logs', () => database.fetchActivityLogs({ limit: 100 }));
  const { data: fixedAssets = [], refetch: refetchFixedAssets } = useRealtimeTable<FixedAsset>('fixed_assets', () => database.fetchFixedAssets());

  const handleRefreshPortfolio = async () => {
    await Promise.all([
      refetchProps(),
      refetchRooms(),
      refetchTenants(),
      refetchBookings(),
      refetchTransactions(),
      refetchPayments(),
      refetchAccounts(),
      refetchClearing(),
      refetchMaintenance(),
      refetchPettyCash(),
      refetchPO(),
      refetchActivityLogs(),
      refetchFixedAssets()
    ]);
  };

  const isLoading = loadingProps || loadingRooms || loadingTenants || loadingBookings || loadingTx || loadingPayments;

  // SINGLE SOURCE OF TRUTH (SSOT): 100% Identical Calculation Engine across Owner, Super Admin, Anak Owner, Admin & Finance
  const uniformReport = useMemo(() => {
    return buildUniformKosanFinancialReport({
      properties,
      rooms,
      tenants,
      bookings,
      payments,
      transactions,
      accounts,
      clearingList,
      maintenanceList,
      selectedPropertyId,
      selectedPeriod
    });
  }, [
    properties,
    rooms,
    tenants,
    bookings,
    payments,
    transactions,
    accounts,
    clearingList,
    maintenanceList,
    selectedPropertyId,
    selectedPeriod
  ]);

  const filteredRooms = uniformReport.filteredDatasets.rooms;
  const filteredTenants = uniformReport.filteredDatasets.tenants;
  const filteredBookings = uniformReport.filteredDatasets.bookings;
  const filteredTransactions = uniformReport.filteredDatasets.transactions;
  const filteredPayments = uniformReport.filteredDatasets.payments;
  const filteredClearing = uniformReport.filteredDatasets.clearing;

  const totalRooms = uniformReport.occupancy.totalRooms;
  const occupiedRooms = uniformReport.occupancy.occupiedRooms;
  const occupancyRate = uniformReport.occupancy.ratePercentage;

  const totalContractRevenue = uniformReport.revenue.contractPipeline;
  const grossRevenue = uniformReport.revenue.effectiveGrossRevenue;
  const totalExpenses = uniformReport.expenses.totalExpenses;
  const netOperatingIncome = uniformReport.profitability.netOperatingIncome;
  const distributableDividend = uniformReport.profitability.distributableDividend85;
  const avgRevenuePerRoom = uniformReport.profitability.revPar;

  const totalGrossSettled = uniformReport.treasuryAndClearing.midtransGrossSettled;
  const totalMdrFee = uniformReport.treasuryAndClearing.midtransMdrFee;
  const totalNetSettled = uniformReport.treasuryAndClearing.midtransNetSettled;
  const unreconciledEscrow = uniformReport.treasuryAndClearing.midtransUnreconciledEscrow;

  const revenueBreakdown = uniformReport.revenue.breakdown;
  const expenseBreakdown = uniformReport.expenses.breakdown;

  const branchMetrics = useMemo(() => {
    return uniformReport.branchBreakdown.map(b => {
      const propObj = properties.find(p => Number(p.id) === b.propertyId) || ({ id: b.propertyId, name: b.propertyName, type: b.propertyType.toLowerCase() } as any);
      return {
        property: propObj,
        totalRooms: b.totalRooms,
        occupiedRooms: b.occupiedRooms,
        occupancyRate: b.occupancyRate,
        totalRevenue: b.effectiveRevenue,
        totalExpenses: b.totalExpenses,
        netIncome: b.netOperatingIncome,
        revPar: b.revPar
      };
    });
  }, [uniformReport.branchBreakdown, properties]);

  const totalMaintenanceCost = uniformReport.expenses.maintenancePostedCost;

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
      
      {/* 1. Header with Synchronized Filters & Actions */}
      <OwnerHeader 
        properties={properties}
        selectedPropertyId={selectedPropertyId}
        onSelectProperty={handleSelectProperty}
        selectedPeriod={selectedPeriod}
        onSelectPeriod={handleSelectPeriod}
        onRefresh={handleRefreshPortfolio}
        isLoading={isLoading}
        onPrint={handlePrint}
        onOpenSignatureTab={() => setActiveTab('signature')}
        pendingSignatureCount={pendingSignatureCount}
      />

      <div className="max-w-7xl mx-auto px-4 md:px-8 mt-6 space-y-6">
        
        {/* 2. Executive KPI Cards (Powered by SSOT Uniform Financial Report) */}
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
        <div className="flex items-center gap-2 border-b border-slate-200 overflow-x-auto no-scrollbar pb-2">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 cursor-pointer transition-all whitespace-nowrap shrink-0 ${
              activeTab === 'overview'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Building2 size={14} className="shrink-0" />
            <span>Laporan Keuangan Kosan Terpadu (SSOT)</span>
          </button>

          <button
            onClick={() => setActiveTab('pnl')}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 cursor-pointer transition-all whitespace-nowrap shrink-0 ${
              activeTab === 'pnl'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Scale size={14} className="shrink-0" />
            <span>Laba Rugi & Dividen</span>
          </button>

          <button
            onClick={() => setActiveTab('cashflow')}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 cursor-pointer transition-all whitespace-nowrap shrink-0 ${
              activeTab === 'cashflow'
                ? 'bg-emerald-700 text-white shadow-sm'
                : 'text-emerald-700 hover:text-emerald-900 hover:bg-emerald-50 border border-emerald-200/70'
            }`}
          >
            <BarChart3 size={14} className={`shrink-0 ${activeTab === 'cashflow' ? 'text-emerald-200' : 'text-emerald-600'}`} />
            <span>Dashboard Arus Kas Bulanan</span>
          </button>

          <button
            onClick={() => setActiveTab('midtrans')}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 cursor-pointer transition-all whitespace-nowrap shrink-0 ${
              activeTab === 'midtrans'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <CreditCard size={14} className="shrink-0" />
            <span>Arus Kas Midtrans & Kliring</span>
          </button>

          <button
            onClick={() => setActiveTab('signature')}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 cursor-pointer transition-all whitespace-nowrap shrink-0 ${
              activeTab === 'signature'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <PenTool size={14} className={`shrink-0 ${activeTab === 'signature' ? 'text-emerald-400' : ''}`} />
            <span>Master TTD & Stempel Resmi</span>
          </button>

          <button
            onClick={() => setActiveTab('expenses')}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 cursor-pointer transition-all whitespace-nowrap shrink-0 ${
              activeTab === 'expenses'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <ShieldAlert size={14} className="shrink-0" />
            <span>Audit Pengeluaran</span>
          </button>

          <button
            onClick={() => setActiveTab('leases')}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 cursor-pointer transition-all whitespace-nowrap shrink-0 ${
              activeTab === 'leases'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Clock size={14} className="shrink-0" />
            <span>Monitoring Sewa</span>
          </button>

          <button
            onClick={() => setActiveTab('staff_ops')}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 cursor-pointer transition-all whitespace-nowrap shrink-0 ${
              activeTab === 'staff_ops'
                ? 'bg-teal-700 text-white shadow-sm'
                : 'text-teal-700 hover:text-teal-900 hover:bg-teal-50'
            }`}
          >
            <Users size={14} className={`shrink-0 ${activeTab === 'staff_ops' ? 'text-teal-200' : 'text-teal-600'}`} />
            <span>Operasional & Log Staf</span>
          </button>

          <button
            onClick={() => setActiveTab('assets')}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 cursor-pointer transition-all whitespace-nowrap shrink-0 ${
              activeTab === 'assets'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Box size={14} className={`shrink-0 ${activeTab === 'assets' ? 'text-teal-400' : 'text-teal-600'}`} />
            <span>Aset & Pemeliharaan</span>
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-slate-200 text-slate-800 font-black tabular-nums">
              {fixedAssets.length}
            </span>
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
            onSelectProperty={handleSelectProperty}
          />
        )}

        {activeTab === 'overview' && (
          <div className="space-y-6">
            <KosanFinancialReportSuite
              report={uniformReport}
              properties={properties}
              selectedPropertyId={selectedPropertyId}
              onSelectPropertyId={handleSelectProperty}
              selectedPeriod={selectedPeriod}
              onSelectPeriod={handleSelectPeriod}
              onRefresh={handleRefreshPortfolio}
              isLoading={isLoading}
              viewerRoleLabel="Owner / Executive Investor"
              defaultSubTab="ringkasan"
            />
            <BranchComparisonSection 
              branchMetrics={branchMetrics}
              onSelectBranch={handleSelectProperty}
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

        {activeTab === 'cashflow' && (
          <MonthlyCashflowDashboard
            transactions={filteredTransactions}
            payments={filteredPayments}
            bookings={filteredBookings}
            properties={properties}
            selectedPropertyId={selectedPropertyId}
            grossRevenue={grossRevenue}
            totalExpenses={totalExpenses}
            theme="light"
          />
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
          <div className="space-y-6">
            <KosanFinancialReportSuite
              report={uniformReport}
              properties={properties}
              selectedPropertyId={selectedPropertyId}
              onSelectPropertyId={handleSelectProperty}
              selectedPeriod={selectedPeriod}
              onSelectPeriod={handleSelectPeriod}
              onRefresh={handleRefreshPortfolio}
              isLoading={isLoading}
              viewerRoleLabel="Owner / Executive Investor"
              defaultSubTab="laba_rugi"
              compactMode={true}
            />
            <ProfitLossDividendCard 
              accounts={accounts}
              grossRevenue={grossRevenue}
              totalExpenses={totalExpenses}
              netOperatingIncome={netOperatingIncome}
              revenueBreakdown={revenueBreakdown}
              expenseBreakdown={expenseBreakdown}
            />
          </div>
        )}

        {activeTab === 'expenses' && (
          <ExpenseAuditSection 
            maintenanceList={ uniformReport.filteredDatasets.maintenance }
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
              refetchMaintenance();
              refetchPettyCash();
            }}
          />
        )}

        {activeTab === 'assets' && (
          <AssetManagementSection
            assets={fixedAssets}
            properties={properties}
            selectedPropertyId={selectedPropertyId}
            readOnly={false}
            userRole="owner"
            onRefresh={refetchFixedAssets}
          />
        )}

      </div>

    </div>
  );
};

export default Owner;
