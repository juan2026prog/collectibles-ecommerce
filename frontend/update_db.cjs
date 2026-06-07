const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data: products } = await supabase.from('products').select('id, title, metadata, brand:brands(name), category:categories(name)').limit(20);
  
  for (const p of products) {
    const brand = p.brand ? p.brand.name : 'Generico';
    const category = p.category ? p.category.name : 'Coleccionables';
    
    let seoTitle = `${p.title} | ${brand} | Comprar en Uruguay | Collectibles`;
    if (seoTitle.length > 60) seoTitle = seoTitle.substring(0, 57) + '...';
    
    const seoDesc = `Compra ${p.title} original en Uruguay. Envíos a todo el país. Encontralo en Collectibles.`.substring(0, 155);
    
    const kw = `${brand}, ${category}, Uruguay, comprar, original, coleccionable`;
    const newMeta = { ...(p.metadata || {}), keywords: kw };
    
    const extDesc = `${p.title}.\n\n**¿Por qué agregarlo a tu colección?**\nUna pieza fundamental para cualquier coleccionista de ${brand} y de la línea de ${category}.\n\n**Características destacadas:**\nProducto oficial, de excelente calidad, con la garantía de ${brand}.\n\n**FAQ**\n**¿Es original?** Sí, todos nuestros productos son 100% originales.\n**¿Hacen envíos en Uruguay?** Sí, enviamos a todo el país.\n**¿Se puede retirar en el local?** Sí, en Montevideo.\n**¿Es apto para coleccionistas?** ¡Por supuesto!`;
    
    // NO SERVICE KEY AVAILABLE: Will use anon key.
    // If RLS prevents it, this will return an error or silently fail if not authenticated.
    const { error } = await supabase
      .from('products')
      .update({
        seo_title: seoTitle,
        seo_description: seoDesc,
        metadata: newMeta,
        description: extDesc
      })
      .eq('id', p.id);
      
    if (error) {
      console.error(`Failed to update ${p.id}:`, error.message);
    } else {
      console.log(`Updated ${p.id}`);
    }
  }
}

run().catch(console.error);
