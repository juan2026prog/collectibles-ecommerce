-- 20260721010000_emergency_security_patch.sql

-- 1. Enable RLS on vulnerable tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.algorithm_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_flag_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_plan_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dac_office_cost_tests ENABLE ROW LEVEL SECURITY;

-- 2. Create basic Read policies for public tables
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Public app_settings are viewable by everyone" ON public.app_settings;
CREATE POLICY "Public app_settings are viewable by everyone" ON public.app_settings FOR SELECT USING (true);
DROP POLICY IF EXISTS "Public locations are viewable by everyone" ON public.locations;
CREATE POLICY "Public locations are viewable by everyone" ON public.locations FOR SELECT USING (true);
DROP POLICY IF EXISTS "Public algorithm_config are viewable by everyone" ON public.algorithm_config;
CREATE POLICY "Public algorithm_config are viewable by everyone" ON public.algorithm_config FOR SELECT USING (true);
DROP POLICY IF EXISTS "Public feature_flags are viewable by everyone" ON public.feature_flags;
CREATE POLICY "Public feature_flags are viewable by everyone" ON public.feature_flags FOR SELECT USING (true);

-- 3. Create Admin-only management policies for sensitive tables
DROP POLICY IF EXISTS "Admins can manage user_roles" ON public.user_roles;
CREATE POLICY "Admins can manage user_roles" ON public.user_roles FOR ALL USING (public.is_admin());
DROP POLICY IF EXISTS "Users can read their own role" ON public.user_roles;
CREATE POLICY "Users can read their own role" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can manage profiles" ON public.profiles;
CREATE POLICY "Admins can manage profiles" ON public.profiles FOR ALL USING (public.is_admin());
DROP POLICY IF EXISTS "Admins can manage app_settings" ON public.app_settings;
CREATE POLICY "Admins can manage app_settings" ON public.app_settings FOR ALL USING (public.is_admin());
DROP POLICY IF EXISTS "Admins can manage locations" ON public.locations;
CREATE POLICY "Admins can manage locations" ON public.locations FOR ALL USING (public.is_admin());
DROP POLICY IF EXISTS "Admins can manage subscriptions" ON public.subscriptions;
CREATE POLICY "Admins can manage subscriptions" ON public.subscriptions FOR ALL USING (public.is_admin());
DROP POLICY IF EXISTS "Admins can manage business_subscriptions" ON public.business_subscriptions;
CREATE POLICY "Admins can manage business_subscriptions" ON public.business_subscriptions FOR ALL USING (public.is_admin());
DROP POLICY IF EXISTS "Admins can manage user_blocks" ON public.user_blocks;
CREATE POLICY "Admins can manage user_blocks" ON public.user_blocks FOR ALL USING (public.is_admin());
DROP POLICY IF EXISTS "Admins can manage admin_notes" ON public.admin_notes;
CREATE POLICY "Admins can manage admin_notes" ON public.admin_notes FOR ALL USING (public.is_admin());
DROP POLICY IF EXISTS "Admins can manage notification_campaigns" ON public.notification_campaigns;
CREATE POLICY "Admins can manage notification_campaigns" ON public.notification_campaigns FOR ALL USING (public.is_admin());
DROP POLICY IF EXISTS "Admins can manage analytics_events" ON public.analytics_events;
CREATE POLICY "Admins can manage analytics_events" ON public.analytics_events FOR ALL USING (public.is_admin());
DROP POLICY IF EXISTS "Admins can manage algorithm_config" ON public.algorithm_config;
CREATE POLICY "Admins can manage algorithm_config" ON public.algorithm_config FOR ALL USING (public.is_admin());
DROP POLICY IF EXISTS "Admins can manage role_permissions" ON public.role_permissions;
CREATE POLICY "Admins can manage role_permissions" ON public.role_permissions FOR ALL USING (public.is_admin());
DROP POLICY IF EXISTS "Admins can manage feature_flags" ON public.feature_flags;
CREATE POLICY "Admins can manage feature_flags" ON public.feature_flags FOR ALL USING (public.is_admin());
DROP POLICY IF EXISTS "Admins can manage feature_flag_audit" ON public.feature_flag_audit;
CREATE POLICY "Admins can manage feature_flag_audit" ON public.feature_flag_audit FOR ALL USING (public.is_admin());
DROP POLICY IF EXISTS "Admins can manage plan_rules" ON public.plan_rules;
CREATE POLICY "Admins can manage plan_rules" ON public.plan_rules FOR ALL USING (public.is_admin());
DROP POLICY IF EXISTS "Admins can manage business_plan_rules" ON public.business_plan_rules;
CREATE POLICY "Admins can manage business_plan_rules" ON public.business_plan_rules FOR ALL USING (public.is_admin());
DROP POLICY IF EXISTS "Admins can manage dac_office_cost_tests" ON public.dac_office_cost_tests;
CREATE POLICY "Admins can manage dac_office_cost_tests" ON public.dac_office_cost_tests FOR ALL USING (public.is_admin());

-- 4. Restore Trigger to prevent self admin promotion
CREATE OR REPLACE FUNCTION public.prevent_self_admin_promotion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF (TG_OP = 'UPDATE' AND NEW.is_admin = true AND OLD.is_admin = false) OR 
       (TG_OP = 'INSERT' AND NEW.is_admin = true) THEN
        -- Check if the user performing the action is already an admin
        IF NOT public.is_admin() THEN
            RAISE EXCEPTION 'Solo un administrador existente puede otorgar privilegios de administrador.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_prevent_self_admin ON public.profiles;
CREATE TRIGGER trigger_prevent_self_admin
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_self_admin_promotion();

-- 5. Fix Vendors Insertion
-- First drop the existing policy if it exists
DROP POLICY IF EXISTS "Vendors can insert their own profile" ON public.vendors;
DROP POLICY IF EXISTS "vendors_insert_own" ON public.vendors;
CREATE POLICY "Vendors can insert their own profile pending" ON public.vendors FOR INSERT 
WITH CHECK (auth.uid() = id AND status = 'pending');

-- 6. Add order_id to vendor_payouts
ALTER TABLE public.vendor_payouts
ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS order_item_id uuid REFERENCES public.order_items(id) ON DELETE SET NULL;
