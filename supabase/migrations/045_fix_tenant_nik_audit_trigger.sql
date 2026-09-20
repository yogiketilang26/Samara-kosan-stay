-- ====================================================================
-- SAMARA STAY ERP — MIGRATION 045: FIX TENANT NIK AUDIT TRIGGER
-- ====================================================================
-- Memperbaiki audit_tenant_nik_changes() dari migration 042:
-- 1. Menggunakan kolom full_name (dengan fallback name melalui to_jsonb), 
--    menghilangkan error 'record "new" has no field "name"'.
-- 2. Membungkus seluruh logika audit dalam blok EXCEPTION agar kegagalan logging
--    tidak menggagalkan operasi penulisan data tenant (resilient).
-- 3. Idempoten: aman dijalankan baik sebelum maupun sesudah migration 042.

CREATE OR REPLACE FUNCTION public.audit_tenant_nik_changes()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor  text := COALESCE(auth.jwt()->>'email', current_user, 'SYSTEM');
  v_name   text;
BEGIN
  -- Audit TIDAK BOLEH menggagalkan penulisan data: semua di dalam blok yang menelan error.
  BEGIN
    IF TG_OP = 'DELETE' THEN
      v_name := COALESCE(to_jsonb(OLD)->>'full_name', to_jsonb(OLD)->>'name', 'Tanpa Nama');
      IF OLD.nik IS NOT NULL OR OLD.spouse_nik IS NOT NULL THEN
        INSERT INTO public.activity_logs (admin_name, action, detail, created_at)
        VALUES (v_actor, 'TENANT_NIK_DELETE',
          format('Penghapusan data penghuni ID %s (%s) yang memiliki NIK terdaftar.', OLD.id, v_name), NOW());
      END IF;
      RETURN OLD;
    END IF;

    v_name := COALESCE(to_jsonb(NEW)->>'full_name', to_jsonb(NEW)->>'name', 'Tanpa Nama');
    IF TG_OP = 'INSERT' AND (NEW.nik IS NOT NULL OR NEW.spouse_nik IS NOT NULL) THEN
      INSERT INTO public.activity_logs (admin_name, action, detail, created_at)
      VALUES (v_actor, 'TENANT_NIK_INSERT',
        format('Pendaftaran NIK untuk penghuni ID %s (%s). NIK: %s%s', NEW.id, v_name,
          COALESCE(left(NEW.nik::text,4) || '************','-'),
          CASE WHEN NEW.spouse_nik IS NOT NULL THEN ' | Pasangan: ' || left(NEW.spouse_nik::text,4) || '************' ELSE '' END), NOW());
    ELSIF TG_OP = 'UPDATE' AND (NEW.nik IS DISTINCT FROM OLD.nik OR NEW.spouse_nik IS DISTINCT FROM OLD.spouse_nik) THEN
      INSERT INTO public.activity_logs (admin_name, action, detail, created_at)
      VALUES (v_actor, 'TENANT_NIK_MUTATION',
        format('Mutasi NIK penghuni ID %s (%s).', NEW.id, v_name), NOW());
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'audit_tenant_nik_changes gagal (diabaikan): %', SQLERRM;
  END;
  RETURN COALESCE(NEW, OLD);
END $$;

-- Pastikan trigger terpasang dengan benar pada tabel public.tenants
DROP TRIGGER IF EXISTS trg_audit_tenant_nik ON public.tenants;
CREATE TRIGGER trg_audit_tenant_nik
AFTER INSERT OR UPDATE OR DELETE ON public.tenants
FOR EACH ROW EXECUTE FUNCTION public.audit_tenant_nik_changes();
