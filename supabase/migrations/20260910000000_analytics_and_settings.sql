-- 1. Forecast Snapshots
-- Stores historical snapshots of forecasts for BI and auditing.
CREATE TABLE IF NOT EXISTS public.forecast_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unidade public.unidade NOT NULL,
    reference_date DATE NOT NULL,
    snapshot_date TIMESTAMPTZ DEFAULT now() NOT NULL,
    forecast_data JSONB NOT NULL,
    created_by UUID REFERENCES auth.users(id),
    version INT DEFAULT 1,
    metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_forecast_snapshots_unidade_date ON public.forecast_snapshots (unidade, reference_date);

-- 2. Editable Per-Unit Settings
-- Customizable thresholds, feature flags, and settings per property.
CREATE TABLE IF NOT EXISTS public.unit_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unidade public.unidade NOT NULL,
    key TEXT NOT NULL,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_by UUID REFERENCES auth.users(id),
    UNIQUE(unidade, key)
);

-- Historical snapshots for unit settings (Versioning)
CREATE TABLE IF NOT EXISTS public.unit_settings_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    setting_id UUID REFERENCES public.unit_settings(id) ON DELETE CASCADE,
    unidade public.unidade NOT NULL,
    key TEXT NOT NULL,
    value JSONB NOT NULL,
    changed_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    changed_by UUID REFERENCES auth.users(id)
);

CREATE OR REPLACE FUNCTION public.version_unit_settings()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.unit_settings_history (setting_id, unidade, key, value, changed_by)
    VALUES (OLD.id, OLD.unidade, OLD.key, OLD.value, OLD.updated_by);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_version_unit_settings ON public.unit_settings;
CREATE TRIGGER tr_version_unit_settings
    BEFORE UPDATE ON public.unit_settings
    FOR EACH ROW
    EXECUTE FUNCTION public.version_unit_settings();

-- 3. Alert Deduplication
-- Identifier-based deduplication to prevent spamming staff.
CREATE TABLE IF NOT EXISTS public.alert_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unidade public.unidade NOT NULL,
    alert_type TEXT NOT NULL,
    fingerprint TEXT NOT NULL, -- Unique hash of content/context
    message TEXT NOT NULL,
    occurrence_count INT DEFAULT 1,
    first_seen_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    last_seen_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'silenced')),
    resolved_at TIMESTAMPTZ,
    metadata JSONB
);

-- Unique index for active alerts to facilitate dedup
CREATE UNIQUE INDEX IF NOT EXISTS idx_active_alert_fingerprint ON public.alert_logs (unidade, fingerprint) WHERE status = 'active';

CREATE OR REPLACE FUNCTION public.log_deduplicated_alert(
    p_unidade public.unidade,
    p_alert_type TEXT,
    p_fingerprint TEXT,
    p_message TEXT,
    p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS UUID AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO public.alert_logs (unidade, alert_type, fingerprint, message, metadata)
    VALUES (p_unidade, p_alert_type, p_fingerprint, p_message, p_metadata)
    ON CONFLICT (unidade, fingerprint) WHERE status = 'active'
    DO UPDATE SET 
        occurrence_count = alert_logs.occurrence_count + 1,
        last_seen_at = now(),
        message = EXCLUDED.message,
        metadata = alert_logs.metadata || EXCLUDED.metadata
    RETURNING id INTO v_id;
    
    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- 4. Monthly Learning Report
-- Monthly aggregated insights and training outcomes.
CREATE TABLE IF NOT EXISTS public.monthly_learning_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unidade public.unidade NOT NULL,
    report_month DATE NOT NULL, -- First day of the month
    insights JSONB NOT NULL,
    kpis JSONB NOT NULL,
    action_items JSONB,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    created_by UUID REFERENCES auth.users(id),
    UNIQUE(unidade, report_month)
);

-- 5. Push Notification Queue
-- Asynchronous delivery queue for push notifications.
-- Pattern refers to sendWebPush in src/lib/push-sender.server.ts:140
CREATE TABLE IF NOT EXISTS public.push_notification_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id),
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    data JSONB,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
    retry_count INT DEFAULT 0,
    max_retries INT DEFAULT 3,
    scheduled_for TIMESTAMPTZ DEFAULT now() NOT NULL,
    sent_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_push_queue_status_scheduled ON public.push_notification_queue (status, scheduled_for) WHERE status = 'pending';

-- 6. Security & RLS Policies
-- Using private.has_role as established in 20260622181824

-- Enable RLS
ALTER TABLE public.forecast_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unit_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unit_settings_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_learning_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_notification_queue ENABLE ROW LEVEL SECURITY;

-- Grants
GRANT SELECT, INSERT ON public.forecast_snapshots TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.unit_settings TO authenticated;
GRANT SELECT ON public.unit_settings_history TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.alert_logs TO authenticated;
GRANT SELECT, INSERT ON public.monthly_learning_reports TO authenticated;
GRANT SELECT, INSERT ON public.push_notification_queue TO authenticated;

-- Policies for Forecast Snapshots
CREATE POLICY "Gestores can view all forecast snapshots"
ON public.forecast_snapshots FOR SELECT
TO authenticated
USING (private.has_role(auth.uid(), 'gestor'::public.app_role) OR private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Gestores can insert forecast snapshots"
ON public.forecast_snapshots FOR INSERT
TO authenticated
WITH CHECK (private.has_role(auth.uid(), 'gestor'::public.app_role) OR private.has_role(auth.uid(), 'admin'::public.app_role));

-- Policies for Unit Settings
CREATE POLICY "Everyone authenticated can view unit settings"
ON public.unit_settings FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Gestores can update unit settings"
ON public.unit_settings FOR UPDATE
TO authenticated
USING (private.has_role(auth.uid(), 'gestor'::public.app_role) OR private.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (private.has_role(auth.uid(), 'gestor'::public.app_role) OR private.has_role(auth.uid(), 'admin'::public.app_role));

-- Policies for Alert Logs
CREATE POLICY "Staff can view alerts"
ON public.alert_logs FOR SELECT
TO authenticated
USING (true);

-- Policies for Monthly Learning Reports
CREATE POLICY "Gestores can manage monthly reports"
ON public.monthly_learning_reports FOR ALL
TO authenticated
USING (private.has_role(auth.uid(), 'gestor'::public.app_role) OR private.has_role(auth.uid(), 'admin'::public.app_role));

-- Policies for Push Queue
CREATE POLICY "Users can see their own push queue entries"
ON public.push_notification_queue FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR private.has_role(auth.uid(), 'admin'::public.app_role));
