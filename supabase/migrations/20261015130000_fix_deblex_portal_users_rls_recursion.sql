-- Migration: Fix infinite recursion on public.deblex_portal_users RLS
-- Problem: The policy on deblex_portal_users queried deblex_portal_users itself without SECURITY DEFINER,
-- causing Postgres 42P17 "infinite recursion detected in policy for relation deblex_portal_users"
-- whenever any policy (like argentina_packages) queried deblex_portal_users.

-- 1. Helper function SECURITY DEFINER to bypass RLS recursion when checking if a user is deblex_admin
CREATE OR REPLACE FUNCTION public.is_deblex_admin(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.deblex_portal_users
    WHERE user_id = p_user_id
      AND role = 'deblex_admin'
      AND is_active = true
      AND status = 'ACTIVE'
  ) OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_user_id
      AND is_admin = true
  );
$$;

-- 2. Helper function SECURITY DEFINER to check if user is any active deblex operator/admin
CREATE OR REPLACE FUNCTION public.is_deblex_user(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.deblex_portal_users
    WHERE user_id = p_user_id
      AND is_active = true
      AND status = 'ACTIVE'
  ) OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_user_id
      AND is_admin = true
  );
$$;

-- Grant execution to authenticated users
GRANT EXECUTE ON FUNCTION public.is_deblex_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_deblex_user(UUID) TO authenticated;

-- 3. Replace the recursive policies on public.deblex_portal_users
DROP POLICY IF EXISTS "Deblex users can read their own row" ON public.deblex_portal_users;
CREATE POLICY "Deblex users can read their own row"
ON public.deblex_portal_users FOR SELECT TO authenticated
USING (
  user_id = auth.uid() OR public.is_deblex_admin(auth.uid())
);

DROP POLICY IF EXISTS "Deblex admins manage portal users" ON public.deblex_portal_users;
CREATE POLICY "Deblex admins manage portal users"
ON public.deblex_portal_users FOR ALL TO authenticated
USING (
  public.is_deblex_admin(auth.uid())
)
WITH CHECK (
  public.is_deblex_admin(auth.uid())
);

-- 4. Update argentina_packages and argentina_consolidations to use the non-recursive helper
DROP POLICY IF EXISTS "Admins manage all packages" ON public.argentina_packages;
CREATE POLICY "Admins manage all packages" ON public.argentina_packages FOR ALL TO authenticated
USING (
  public.is_deblex_user(auth.uid())
)
WITH CHECK (
  public.is_deblex_user(auth.uid())
);

DROP POLICY IF EXISTS "Admins manage all consolidations" ON public.argentina_consolidations;
CREATE POLICY "Admins manage all consolidations" ON public.argentina_consolidations FOR ALL TO authenticated
USING (
  public.is_deblex_user(auth.uid())
)
WITH CHECK (
  public.is_deblex_user(auth.uid())
);
