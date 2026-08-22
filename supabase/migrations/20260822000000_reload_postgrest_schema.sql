-- Force PostgREST schema cache reload on Supabase Production
NOTIFY pgrst, 'reload schema';
