-- ====================================================================
-- SAMARA STAY ERP — MIGRATION 042: TENANT NIK AUDIT TRIGGER
-- ====================================================================
-- P1-4: Audit log mutasi data NIK (Identitas Kependudukan) pada tabel tenants.
-- Mencatat otomatis ke tabel activity_logs setiap kali ada INSERT, UPDATE, atau DELETE
-- yang melibatkan nomor identitas sensitif (NIK atau spouse_nik).

CREATE OR REPLACE FUNCTION public.audit_tenant_nik_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor VARCHAR(255);
  v_action VARCHAR(100);
  v_detail TEXT;
BEGIN
  -- Identifikasi admin/pengguna yang mengeksekusi
  v_actor := COALESCE(auth.jwt()->>'email', current_user, 'SYSTEM');

  IF (TG_OP = 'INSERT') THEN
    IF (NEW.nik IS NOT NULL OR NEW.spouse_nik IS NOT NULL) THEN
      v_action := 'TENANT_NIK_INSERT';
      v_detail := format(
        'Pendaftaran NIK baru untuk penghuni ID %s (%s). NIK masked: %s%s',
        NEW.id,
        COALESCE(NEW.name, 'Tanpa Nama'),
        CASE WHEN NEW.nik IS NOT NULL THEN substring(NEW.nik from 1 for 4) || '************' ELSE '-' END,
        CASE WHEN NEW.spouse_nik IS NOT NULL THEN ' | Pasangan masked: ' || substring(NEW.spouse_nik from 1 for 4) || '************' ELSE '' END
      );

      INSERT INTO public.activity_logs (admin_name, action, detail, created_at)
      VALUES (v_actor, v_action, v_detail, NOW());
    END IF;
    RETURN NEW;

  ELSIF (TG_OP = 'UPDATE') THEN
    IF (NEW.nik IS DISTINCT FROM OLD.nik OR NEW.spouse_nik IS DISTINCT FROM OLD.spouse_nik) THEN
      v_action := 'TENANT_NIK_MUTATION';
      v_detail := format(
        'Mutasi NIK penghuni ID %s (%s). NIK diperbarui dari [%s] ke [%s]',
        NEW.id,
        COALESCE(NEW.name, 'Tanpa Nama'),
        CASE WHEN OLD.nik IS NOT NULL THEN substring(OLD.nik from 1 for 4) || '************' ELSE 'KOSONG' END,
        CASE WHEN NEW.nik IS NOT NULL THEN substring(NEW.nik from 1 for 4) || '************' ELSE 'KOSONG' END
      );

      INSERT INTO public.activity_logs (admin_name, action, detail, created_at)
      VALUES (v_actor, v_action, v_detail, NOW());
    END IF;
    RETURN NEW;

  ELSIF (TG_OP = 'DELETE') THEN
    IF (OLD.nik IS NOT NULL OR OLD.spouse_nik IS NOT NULL) THEN
      v_action := 'TENANT_NIK_DELETE';
      v_detail := format('Penghapusan berkas/data penghuni ID %s (%s) yang memiliki NIK terdaftar.', OLD.id, COALESCE(OLD.name, 'Tanpa Nama'));

      INSERT INTO public.activity_logs (admin_name, action, detail, created_at)
      VALUES (v_actor, v_action, v_detail, NOW());
    END IF;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_tenant_nik ON public.tenants;

CREATE TRIGGER trg_audit_tenant_nik
AFTER INSERT OR UPDATE OR DELETE ON public.tenants
FOR EACH ROW
EXECUTE FUNCTION public.audit_tenant_nik_changes();
