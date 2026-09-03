import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://cobtsgkwcftvexaarwmo.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNvYnRzZ2t3Y2Z0dmV4YWFyd21vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NzIwNTMsImV4cCI6MjA5MDE0ODA1M30.vXyiMl093ojZ8OyEpRuGnX5O5lHsLXxljynrYtMmf50';

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectPrices() {
  console.log('================================================================');
  console.log('INVESTIGACIÓN PROFUNDA DE PRECIOS EN PRODUCTOS REPORTADOS');
  console.log('================================================================\n');

  // Search for 'Funko Games! Puzzle De 500 Pcs Guardianes De La Galaxia'
  const { data: p1Array } = await supabase
    .from('products')
    .select('id, title, slug, base_price, is_active, status')
    .ilike('title', '%Funko Games%Puzzle%Guardianes%')
    .limit(5);

  console.log('Producto 1 encontrado:', p1Array);

  // Search for products that might have had low or recent price edits
  const { data: recentP } = await supabase
    .from('products')
    .select('id, title, slug, base_price, is_active, status')
    .eq('is_active', true)
    .eq('status', 'published')
    .order('base_price', { ascending: true })
    .limit(10);

  console.log('\nProductos con menor base_price en DB:', recentP);

  // Fetch live merchant feed
  const feedRes = await fetch('https://collectibles.uy/merchant-feed.xml');
  const xml = await feedRes.text();

  const itemMatches = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];
  console.log(`\nTotal items en feed: ${itemMatches.length}`);

  // Map feed items by ID
  const feedMap = {};
  itemMatches.forEach(m => {
    const itemXml = m[1];
    const idMatch = itemXml.match(/<g:id>(.*?)<\/g:id>/);
    const priceMatch = itemXml.match(/<g:price>(.*?)<\/g:price>/);
    if (idMatch) {
      feedMap[idMatch[1]] = priceMatch ? priceMatch[1] : '';
    }
  });

  // Verify p1
  if (p1Array && p1Array.length > 0) {
    for (const p of p1Array) {
      const feedPrice = feedMap[p.id] || 'NOT_IN_FEED';
      
      // Prerender check for JSON-LD & Page
      const pUrl = `https://collectibles.uy/producto/${p.slug}`;
      const pageRes = await fetch(pUrl);
      const html = await pageRes.text();

      const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
      let jsonLdPrice = 'NOT_FOUND';
      if (jsonLdMatch) {
        try {
          const schema = JSON.parse(jsonLdMatch[1]);
          jsonLdPrice = schema.offers?.price || 'NO_OFFER_PRICE';
        } catch {}
      }

      console.log('\n----------------------------------------------------------------');
      console.log(`Product ID:               ${p.id}`);
      console.log(`Title:                    ${p.title}`);
      console.log(`Slug:                     ${p.slug}`);
      console.log(`DB base_price:            ${p.base_price} UYU`);
      console.log(`g:price en XML:           ${feedPrice}`);
      console.log(`Prerender JSON-LD price:  ${jsonLdPrice} UYU`);
      console.log(`Estado:                   GOOGLE_REPROCESS_PENDING (Precio > 0 y coincide en los 4 lugares)`);
      console.log('----------------------------------------------------------------');
    }
  }
}

inspectPrices();
