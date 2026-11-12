-- READ ONLY: execute against production to identify incompatible migrations for
-- dashboard branch replay. Does not change permissions, data or migration history.
-- Supabase managed Storage tables are owned by supabase_storage_admin.
WITH managed AS (
  SELECT n.nspname,c.relname,pg_get_userbyid(c.relowner) owner_name,
         c.relrowsecurity AS rls_enabled
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='storage' AND c.relname IN ('objects','buckets')
),
suspect AS (
  SELECT m.version,m.name,u.ordinality AS statement_number,
         left(btrim(u.statement),400) AS statement_excerpt,
         CASE WHEN u.statement ~* 'alter[[:space:]]+table[[:space:]]+storage\.'
              THEN 'ALTER_MANAGED_STORAGE_TABLE'
              WHEN u.statement ~* '(create|alter|drop)[[:space:]]+policy'
                AND u.statement ~* 'storage\.'
              THEN 'POLICY_ON_MANAGED_STORAGE'
              ELSE 'OTHER_MANAGED_STORAGE_DDL' END AS risk_type
  FROM supabase_migrations.schema_migrations m
  CROSS JOIN LATERAL unnest(m.statements) WITH ORDINALITY AS u(statement,ordinality)
  WHERE u.statement ~* 'storage\.(objects|buckets)'
    AND u.statement ~* '(alter[[:space:]]+table|create[[:space:]]+policy|drop[[:space:]]+policy|alter[[:space:]]+policy|create[[:space:]]+trigger|drop[[:space:]]+trigger)'
)
SELECT 'managed_storage_owner' AS row_type, NULL::text AS version,
       NULL::text AS migration_name,NULL::bigint AS statement_number,
       'OWNER='||owner_name||' RLS='||rls_enabled AS detail
FROM managed
UNION ALL
SELECT 'migration_replay_risk',version,name,statement_number,
       risk_type||': '||statement_excerpt
FROM suspect
ORDER BY row_type, version, statement_number;
