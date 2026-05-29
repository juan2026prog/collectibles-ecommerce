-- 1. Seed existing admins into user_roles
INSERT INTO public.user_roles (id, user_id, role)
SELECT gen_random_uuid(), id, 'admin' FROM public.profiles
WHERE is_admin = true
ON CONFLICT (user_id) DO NOTHING;

-- 2. Create the trigger sync function
CREATE OR REPLACE FUNCTION public.sync_profile_to_user_roles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.is_admin = true THEN
    INSERT INTO public.user_roles (id, user_id, role)
    VALUES (gen_random_uuid(), NEW.id, 'admin')
    ON CONFLICT (user_id) 
    DO UPDATE SET role = 'admin' WHERE public.user_roles.role != 'god_admin';
  ELSIF NEW.is_admin = false THEN
    DELETE FROM public.user_roles 
    WHERE user_id = NEW.id AND role != 'god_admin';
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Bind trigger to profiles table
DROP TRIGGER IF EXISTS trigger_sync_profile_to_user_roles ON public.profiles;
CREATE TRIGGER trigger_sync_profile_to_user_roles
AFTER INSERT OR UPDATE OF is_admin ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.sync_profile_to_user_roles();
