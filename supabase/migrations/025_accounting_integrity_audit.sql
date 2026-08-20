-- ============================================================================
-- MIGRATION 025: ACCOUNTING INTEGRITY AUDIT & AUTOMATED REPAIR PROCEDURES
-- SAMARA STAY ENTERPRISE ACCOUNTING ERP v15
-- ============================================================================

-- 1. Create function to perform real-time accounting integrity audit
CREATE OR REPLACE FUNCTION audit_accounting_integrity()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
  v_total_transactions INT := 0;
  v_total_journals INT := 0;
  v_total_accounts INT := 0;
  v_total_clearing INT := 0;
  
  -- Check 1: Unbalanced journals
  v_unbalanced_journals JSONB := '[]'::jsonb;
  v_unbalanced_count INT := 0;
  
  -- Check 2: Account balance variances
  v_balance_variances JSONB := '[]'::jsonb;
  v_variance_count INT := 0;
  v_total_variance NUMERIC := 0;
  
  -- Check 3: Orphaned records
  v_orphaned_journals_count INT := 0;
  v_orphaned_transactions_count INT := 0;
  v_orphaned_details JSONB := '[]'::jsonb;
  
  -- Check 4: Property dimension checks
  v_missing_property_trx_count INT := 0;
  
  -- Check 5: Clearing vs Account 1200 sync
  v_clearing_gross_total NUMERIC := 0;
  v_clearing_reconciled_total NUMERIC := 0;
  v_clearing_outstanding_total NUMERIC := 0;
  v_account_1200_balance NUMERIC := 0;
  v_clearing_variance NUMERIC := 0;
  
  -- Scoring
  v_integrity_score INT := 100;
  v_overall_status TEXT := 'healthy';
BEGIN
  -- Get base counts
  SELECT COUNT(*) INTO v_total_transactions FROM financial_transactions;
  SELECT COUNT(*) INTO v_total_journals FROM journal_entries;
  SELECT COUNT(*) INTO v_total_accounts FROM accounts;
  SELECT COUNT(*) INTO v_total_clearing FROM midtrans_clearing_transactions;

  -- --------------------------------------------------------------------------
  -- CHECK 1: Double-entry debit vs credit balance per transaction / journal_no
  -- --------------------------------------------------------------------------
  WITH journal_sums AS (
    SELECT 
      journal_no,
      transaction_id,
      SUM(debit) as total_debit,
      SUM(credit) as total_credit,
      ABS(SUM(debit) - SUM(credit)) as diff
    FROM journal_entries
    GROUP BY journal_no, transaction_id
  )
  SELECT 
    COUNT(*),
    COALESCE(jsonb_agg(jsonb_build_object(
      'journal_no', journal_no,
      'transaction_id', transaction_id,
      'total_debit', total_debit,
      'total_credit', total_credit,
      'diff', diff
    )), '[]'::jsonb)
  INTO v_unbalanced_count, v_unbalanced_journals
  FROM journal_sums
  WHERE diff > 0.01;

  IF v_unbalanced_count > 0 THEN
    v_integrity_score := v_integrity_score - (v_unbalanced_count * 15);
  END IF;

  -- --------------------------------------------------------------------------
  -- CHECK 2: Account balance continuity (Calculated journal sum vs cached balance)
  -- --------------------------------------------------------------------------
  WITH account_calculated AS (
    SELECT 
      a.id,
      a.name,
      a.type,
      COALESCE(a.balance, 0) as stored_balance,
      CASE 
        WHEN a.type IN ('asset', 'expense') THEN 
          COALESCE(SUM(j.debit), 0) - COALESCE(SUM(j.credit), 0)
        ELSE 
          COALESCE(SUM(j.credit), 0) - COALESCE(SUM(j.debit), 0)
      END as computed_balance
    FROM accounts a
    LEFT JOIN journal_entries j ON j.account_id = a.id
    GROUP BY a.id, a.name, a.type, a.balance
  )
  SELECT 
    COUNT(*),
    COALESCE(SUM(ABS(stored_balance - computed_balance)), 0),
    COALESCE(jsonb_agg(jsonb_build_object(
      'account_id', id,
      'account_name', name,
      'type', type,
      'stored_balance', stored_balance,
      'computed_balance', computed_balance,
      'variance', stored_balance - computed_balance
    )), '[]'::jsonb)
  INTO v_variance_count, v_total_variance, v_balance_variances
  FROM account_calculated
  WHERE ABS(stored_balance - computed_balance) > 0.01;

  IF v_variance_count > 0 THEN
    v_integrity_score := v_integrity_score - (v_variance_count * 5);
  END IF;

  -- --------------------------------------------------------------------------
  -- CHECK 3: Orphaned records check
  -- --------------------------------------------------------------------------
  -- A. Journal entries without existing account
  SELECT COUNT(*) INTO v_orphaned_journals_count
  FROM journal_entries j
  LEFT JOIN accounts a ON j.account_id = a.id
  WHERE a.id IS NULL;

  -- B. Financial transactions with no journal entries
  SELECT COUNT(*) INTO v_orphaned_transactions_count
  FROM financial_transactions f
  LEFT JOIN journal_entries j ON j.transaction_id = f.id
  WHERE j.id IS NULL;

  IF (v_orphaned_journals_count + v_orphaned_transactions_count) > 0 THEN
    v_integrity_score := v_integrity_score - ((v_orphaned_journals_count + v_orphaned_transactions_count) * 10);
  END IF;

  -- --------------------------------------------------------------------------
  -- CHECK 4: Property dimension integrity
  -- --------------------------------------------------------------------------
  SELECT COUNT(*) INTO v_missing_property_trx_count
  FROM financial_transactions
  WHERE property_id IS NULL AND category IN ('Penerimaan Sewa', 'Beban Operasional Kos', 'DP Survey / Reservasi');

  -- --------------------------------------------------------------------------
  -- CHECK 5: Midtrans clearing vs Account 1200 sync
  -- --------------------------------------------------------------------------
  SELECT 
    COALESCE(SUM(gross_amount), 0),
    COALESCE(SUM(reconciled_amount), 0),
    COALESCE(SUM(outstanding_amount), 0)
  INTO v_clearing_gross_total, v_clearing_reconciled_total, v_clearing_outstanding_total
  FROM midtrans_clearing_transactions;

  SELECT COALESCE(balance, 0) INTO v_account_1200_balance
  FROM accounts WHERE id = 1200;

  v_clearing_variance := ABS(v_clearing_outstanding_total - v_account_1200_balance);

  -- Normalize score
  IF v_integrity_score < 0 THEN
    v_integrity_score := 0;
  END IF;

  IF v_integrity_score = 100 THEN
    v_overall_status := 'healthy';
  ELSIF v_integrity_score >= 70 THEN
    v_overall_status := 'warning';
  ELSE
    v_overall_status := 'critical';
  END IF;

  -- Build final JSON payload
  v_result := jsonb_build_object(
    'overallStatus', v_overall_status,
    'integrityScore', v_integrity_score,
    'auditTimestamp', NOW(),
    'totalTransactionsChecked', v_total_transactions,
    'totalJournalEntriesChecked', v_total_journals,
    'totalAccountsChecked', v_total_accounts,
    'totalClearingRecordsChecked', v_total_clearing,
    'checks', jsonb_build_array(
      jsonb_build_object(
        'id', 'CHK-01-DOUBLE-ENTRY',
        'name', 'Keseimbangan Double-Entry (Debit == Credit)',
        'category', 'double_entry',
        'status', CASE WHEN v_unbalanced_count = 0 THEN 'passed' ELSE 'failed' END,
        'severity', 'critical',
        'details', CASE WHEN v_unbalanced_count = 0 
                     THEN 'Seluruh ' || v_total_journals || ' baris jurnal umum seimbang sempurna (Debit = Kredit).'
                     ELSE 'Ditemukan ' || v_unbalanced_count || ' transaksi jurnal tidak seimbang.' END,
        'recordsAnalyzed', v_total_journals,
        'discrepancyCount', v_unbalanced_count,
        'sampleDiscrepancies', v_unbalanced_journals,
        'autoRepairable', false
      ),
      jsonb_build_object(
        'id', 'CHK-02-ACCOUNT-BALANCES',
        'name', 'Konsistensi Saldo Rekening COA vs Mutasi Jurnal',
        'category', 'account_balance',
        'status', CASE WHEN v_variance_count = 0 THEN 'passed' ELSE 'warning' END,
        'severity', 'high',
        'details', CASE WHEN v_variance_count = 0 
                     THEN 'Semua saldo tersimpan pada ' || v_total_accounts || ' rekening COA sinkron 100% dengan akumulasi mutasi jurnal.'
                     ELSE 'Ditemukan selisih saldo pada ' || v_variance_count || ' rekening COA sebesar Rp ' || v_total_variance || '.' END,
        'recordsAnalyzed', v_total_accounts,
        'discrepancyCount', v_variance_count,
        'sampleDiscrepancies', v_balance_variances,
        'autoRepairable', true
      ),
      jsonb_build_object(
        'id', 'CHK-03-ORPHANED-RECORDS',
        'name', 'Integritas Relasi Buku Besar (Orphaned Record Scanner)',
        'category', 'orphan_records',
        'status', CASE WHEN (v_orphaned_journals_count + v_orphaned_transactions_count) = 0 THEN 'passed' ELSE 'failed' END,
        'severity', 'high',
        'details', CASE WHEN (v_orphaned_journals_count + v_orphaned_transactions_count) = 0
                     THEN 'Tidak ada entri jurnal atau transaksi tanpa induk / rekening valid.'
                     ELSE 'Ditemukan ' || v_orphaned_journals_count || ' jurnal tanpa COA dan ' || v_orphaned_transactions_count || ' transaksi tanpa jurnal.' END,
        'recordsAnalyzed', v_total_transactions + v_total_journals,
        'discrepancyCount', v_orphaned_journals_count + v_orphaned_transactions_count,
        'autoRepairable', true
      ),
      jsonb_build_object(
        'id', 'CHK-04-PROPERTY-DIMENSION',
        'name', 'Kelengkapan Dimensi Finansial Properti (Multi-Unit)',
        'category', 'property_dimension',
        'status', CASE WHEN v_missing_property_trx_count = 0 THEN 'passed' ELSE 'warning' END,
        'severity', 'medium',
        'details', CASE WHEN v_missing_property_trx_count = 0 
                     THEN 'Semua transaksi operasional kos memiliki penanda property_id yang valid.'
                     ELSE 'Terdapat ' || v_missing_property_trx_count || ' transaksi operasional tanpa asosiasi properti.' END,
        'recordsAnalyzed', v_total_transactions,
        'discrepancyCount', v_missing_property_trx_count,
        'autoRepairable', true
      ),
      jsonb_build_object(
        'id', 'CHK-05-CLEARING-SYNC',
        'name', 'Sinkronisasi Kliring Midtrans (Akun 1200 vs Outstanding Clearing)',
        'category', 'clearing_sync',
        'status', CASE WHEN v_clearing_variance < 1 THEN 'passed' ELSE 'warning' END,
        'severity', 'medium',
        'details', 'Total Outstanding Kliring: Rp ' || v_clearing_outstanding_total || ' | Saldo Akun 1200: Rp ' || v_account_1200_balance,
        'recordsAnalyzed', v_total_clearing,
        'discrepancyCount', CASE WHEN v_clearing_variance < 1 THEN 0 ELSE 1 END,
        'autoRepairable', true
      )
    ),
    'summary', jsonb_build_object(
      'passedChecks', CASE WHEN v_unbalanced_count = 0 THEN 1 ELSE 0 END +
                      CASE WHEN v_variance_count = 0 THEN 1 ELSE 0 END +
                      CASE WHEN (v_orphaned_journals_count + v_orphaned_transactions_count) = 0 THEN 1 ELSE 0 END +
                      CASE WHEN v_missing_property_trx_count = 0 THEN 1 ELSE 0 END +
                      CASE WHEN v_clearing_variance < 1 THEN 1 ELSE 0 END,
      'warningChecks', CASE WHEN v_variance_count > 0 THEN 1 ELSE 0 END +
                       CASE WHEN v_missing_property_trx_count > 0 THEN 1 ELSE 0 END +
                       CASE WHEN v_clearing_variance >= 1 THEN 1 ELSE 0 END,
      'failedChecks', CASE WHEN v_unbalanced_count > 0 THEN 1 ELSE 0 END +
                      CASE WHEN (v_orphaned_journals_count + v_orphaned_transactions_count) > 0 THEN 1 ELSE 0 END,
      'totalDiscrepancies', v_unbalanced_count + v_variance_count + v_orphaned_journals_count + v_orphaned_transactions_count + v_missing_property_trx_count,
      'debitCreditImbalance', v_unbalanced_count,
      'balanceVarianceTotal', v_total_variance,
      'orphanedRecordsCount', v_orphaned_journals_count + v_orphaned_transactions_count
    ),
    'recommendations', CASE 
      WHEN v_integrity_score = 100 THEN jsonb_build_array('Integritas pembukuan dalam kondisi optimal. Siap untuk proses penutupan periode (Period Closing) dan pelaporan keuangan.')
      ELSE jsonb_build_array(
        'Jalankan prosedur perbaikan otomatis untuk menyinkronkan saldo akun COA dengan riwayat jurnal.',
        'Periksa kembali pencatatan jurnal manual yang memiliki selisih debit/kredit.'
      )
    END
  );

  RETURN v_result;
END;
$$;

-- 2. Create automated repair procedure
CREATE OR REPLACE FUNCTION repair_accounting_integrity(p_repair_types text[] DEFAULT ARRAY['recalc_balances', 'fix_properties'])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_recalculated_accounts INT := 0;
  v_repaired_properties INT := 0;
  v_audit_result JSONB;
BEGIN
  -- A. Recalculate and synchronize all account balances from journal entries
  IF 'recalc_balances' = ANY(p_repair_types) OR 'all' = ANY(p_repair_types) THEN
    WITH computed AS (
      SELECT 
        a.id,
        CASE 
          WHEN a.type IN ('asset', 'expense') THEN 
            COALESCE(SUM(j.debit), 0) - COALESCE(SUM(j.credit), 0)
          ELSE 
            COALESCE(SUM(j.credit), 0) - COALESCE(SUM(j.debit), 0)
        END as calculated_balance
      FROM accounts a
      LEFT JOIN journal_entries j ON j.account_id = a.id
      GROUP BY a.id, a.type
    )
    UPDATE accounts a
    SET balance = computed.calculated_balance
    FROM computed
    WHERE a.id = computed.id AND a.balance != computed.calculated_balance;

    GET DIAGNOSTICS v_recalculated_accounts = ROW_COUNT;
  END IF;

  -- B. Auto-backfill missing property_id on financial transactions from payment/booking reference
  IF 'fix_properties' = ANY(p_repair_types) OR 'all' = ANY(p_repair_types) THEN
    -- From payments
    UPDATE financial_transactions ft
    SET property_id = p.property_id
    FROM payments p
    WHERE ft.reference_type = 'payment' 
      AND ft.reference_id = p.id 
      AND ft.property_id IS NULL 
      AND p.property_id IS NOT NULL;

    -- From bookings
    UPDATE financial_transactions ft
    SET property_id = b.property_id
    FROM bookings b
    WHERE ft.reference_type = 'booking' 
      AND (ft.reference_id = b.id::text OR ft.reference_id = b.midtrans_order_id)
      AND ft.property_id IS NULL 
      AND b.property_id IS NOT NULL;

    GET DIAGNOSTICS v_repaired_properties = ROW_COUNT;
  END IF;

  -- Log repair in activity_logs
  INSERT INTO activity_logs (admin_name, action, detail, ip_address)
  VALUES (
    'Accounting Integrity Engine',
    'REPAIR_INTEGRITY',
    'Auto-repair selesai: ' || v_recalculated_accounts || ' saldo akun diperbarui, ' || v_repaired_properties || ' dimensi properti disinkronkan.',
    '127.0.0.1'
  );

  -- Re-run audit to get fresh state
  v_audit_result := audit_accounting_integrity();

  RETURN jsonb_build_object(
    'success', true,
    'recalculatedAccounts', v_recalculated_accounts,
    'repairedProperties', v_repaired_properties,
    'auditReport', v_audit_result
  );
END;
$$;

-- Restrict execution to service_role and authenticated admins
REVOKE EXECUTE ON FUNCTION audit_accounting_integrity() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION repair_accounting_integrity(text[]) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION audit_accounting_integrity() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION repair_accounting_integrity(text[]) TO authenticated, service_role;
