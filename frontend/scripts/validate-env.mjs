/**
 * validate-env.mjs
 * Build gate de aislamiento de entornos.
 * Impide que cualquier rama distinta de `main` (previews, staging, features)
 * compile apuntando por error a Supabase Producción (cobtsgkwcftvexaarwmo).
 */

const branch = process.env.VERCEL_GIT_COMMIT_REF || process.env.GIT_BRANCH || '';
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';

console.log('[build-gate] Verificando aislamiento de entorno para compilación...');

if (branch && branch !== 'main') {
  if (supabaseUrl.includes('cobtsgkwcftvexaarwmo')) {
    console.error('========================================================================');
    console.error(`[BUILD GATE CRÍTICO] ERROR FATAL: La rama "${branch}" NO PUEDE compilar`);
    console.error('apuntando a Supabase Producción (cobtsgkwcftvexaarwmo).');
    console.error('Debe conectarse exclusivamente a Staging (csnudufkpfzveoonjumy).');
    console.error('========================================================================');
    process.exit(1);
  }
}

console.log('[build-gate] Validación de aislamiento superada.');
