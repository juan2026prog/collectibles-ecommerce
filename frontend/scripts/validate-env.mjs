/**
 * validate-env.mjs
 * Gate de validación estricta para ramas de desarrollo/staging (feat/argentina-deblex-block2).
 * Impide compilar o publicar si el entorno apunta por error a Supabase Producción (cobtsgkwcftvexaarwmo).
 */

const branch = process.env.VERCEL_GIT_COMMIT_REF || process.env.GIT_BRANCH || '';
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';

console.log('[build-gate] Verificando configuración de entorno para compilación...');
console.log(`[build-gate] Branch: "${branch}", Supabase URL configurada: "${supabaseUrl ? supabaseUrl.replace(/:\/\/.*@/, '://***@') : '(no provista en runtime local)'}"`);

// En ramas de feature/staging de Argentina Bloque 2, está PROHIBIDO compilar apuntando a producción
if (branch === 'feat/argentina-deblex-block2' || branch.includes('argentina') || branch.includes('deblex')) {
  if (supabaseUrl.includes('cobtsgkwcftvexaarwmo')) {
    console.error('========================================================================');
    console.error('[BUILD GATE CRÍTICO] ERROR FATAL: Esta rama NO PUEDE compilar apuntando');
    console.error('a la base de datos de producción (cobtsgkwcftvexaarwmo).');
    console.error('Debe conectarse exclusivamente a staging (csnudufkpfzveoonjumy).');
    console.error('========================================================================');
    process.exit(1);
  }
}

console.log('[build-gate] Validación de entorno superada exitosamente.');
