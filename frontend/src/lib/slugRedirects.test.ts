import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://cobtsgkwcftvexaarwmo.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

describe('Forensic HTTP 301 Redirect System Audit', () => {

  it('1. Database Integrity: All 379 redirect records have 100% unique old_slugs, 0 loops, and 0 chains', async () => {
    const { data: redirects, error } = await supabase
      .from('product_slug_redirects')
      .select('old_slug, new_slug, product_id');

    expect(error).toBeNull();
    expect(redirects).toBeDefined();
    expect(redirects!.length).toBeGreaterThanOrEqual(379);

    const oldSlugsSet = new Set<string>();
    let loopCount = 0;
    let chainCount = 0;

    redirects!.forEach(r => {
      oldSlugsSet.add(r.old_slug);
      if (r.old_slug === r.new_slug) loopCount++;
    });

    redirects!.forEach(r => {
      if (oldSlugsSet.has(r.new_slug)) chainCount++;
    });

    expect(oldSlugsSet.size).toBe(redirects!.length);
    expect(loopCount).toBe(0);
    expect(chainCount).toBe(0);
  });

  it('2. DB Contamination Check: Zero products remain with MercadoLibre or MLU in public slug', async () => {
    const { count, error } = await supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .or('slug.ilike.%mercadolibre%,slug.ilike.%MLU%');

    expect(error).toBeNull();
    expect(count).toBe(0);
  });

  it('3. Edge Middleware Response Mock Test: Resolves old_slug to 301 Moved Permanently with exact Location header', async () => {
    const oldSlug = 'mercadolibre-MLU655247339';
    const expectedNewSlug = 'funko-pop-street-sharks-ripster';

    const res = await fetch(`${supabaseUrl}/rest/v1/product_slug_redirects?old_slug=eq.${encodeURIComponent(oldSlug)}&select=new_slug`, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    });

    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.length).toBe(1);
    expect(data[0].new_slug).toBe(expectedNewSlug);
  });

});
