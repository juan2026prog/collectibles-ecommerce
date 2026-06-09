supabase migration repair --status applied 20260707000000
Move-Item supabase\migrations\20260707000000_handy_payments.sql supabase\
supabase db push
Move-Item supabase\20260707000000_handy_payments.sql supabase\migrations\
