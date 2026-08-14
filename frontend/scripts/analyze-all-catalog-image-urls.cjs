const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabaseUrl = 'https://cobtsgkwcftvexaarwmo.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNvYnRzZ2t3Y2Z0dmV4YWFyd21vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NzIwNTMsImV4cCI6MjA5MDE0ODA1M30.vXyiMl093ojZ8OyEpRuGnX5O5lHsLXxljynrYtMmf50';

const supabase = createClient(supabaseUrl, supabaseKey);

async function analyze() {
  console.log('Analyzing image URL patterns across all published products...');

  let allProducts = [];
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('products')
      .select(`
        id,
        title,
        status,
        is_active,
        images:product_images(url, is_primary, sort_order)
      `)
      .eq('status', 'published')
      .eq('is_active', true)
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      console.error(error);
      process.exit(1);
    }

    if (data && data.length > 0) {
      allProducts = allProducts.concat(data);
      if (data.length < pageSize) hasMore = false;
      else page++;
    } else {
      hasMore = false;
    }
  }

  console.log(`Total published products: ${allProducts.length}`);

  const hostCounts = {};
  const emptyImageProducts = [];
  const sampleUrls = {};

  allProducts.forEach(p => {
    if (!Array.isArray(p.images) || p.images.length === 0) {
      emptyImageProducts.push({ id: p.id, title: p.title });
      return;
    }

    p.images.forEach(img => {
      const url = img.url || '';
      let host = 'UNKNOWN';
      try {
        if (url.startsWith('http://') || url.startsWith('https://')) {
          const u = new URL(url);
          host = u.hostname;
        } else {
          host = 'RELATIVE/UUID';
        }
      } catch (e) {
        host = 'INVALID_FORMAT';
      }

      hostCounts[host] = (hostCounts[host] || 0) + 1;
      if (!sampleUrls[host]) sampleUrls[host] = url;
    });
  });

  console.log('\n--- IMAGE HOST DISTRIBUTION ---');
  Object.keys(hostCounts).sort((a,b) => hostCounts[b] - hostCounts[a]).forEach(h => {
    console.log(`${h}: ${hostCounts[h]} images (Sample: ${sampleUrls[h]})`);
  });

  console.log(`\nProducts with 0 images in DB: ${emptyImageProducts.length}`);
  if (emptyImageProducts.length > 0) {
    console.log('Sample products without images:', emptyImageProducts.slice(0, 5));
  }
}

analyze();
