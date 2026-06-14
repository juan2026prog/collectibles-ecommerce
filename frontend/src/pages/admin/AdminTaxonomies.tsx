import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Check, X, GitMerge, AlertTriangle, ArrowRight } from 'lucide-react';
import { useToast } from '../../components/admin/Toast';
import { useConfirmModal } from '../../components/admin/ConfirmModal';

export default function AdminTaxonomies() {
  const [brands, setBrands] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [approvedBrands, setApprovedBrands] = useState<any[]>([]);
  const [approvedCategories, setApprovedCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Merge modal state
  const [mergeModal, setMergeModal] = useState<{
    isOpen: boolean;
    type: 'brand' | 'category';
    item: any;
    targetId: string;
  }>({
    isOpen: false,
    type: 'brand',
    item: null,
    targetId: ''
  });

  const { toast } = useToast();
  const { confirm } = useConfirmModal();

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      // 1. Fetch pending brands
      const { data: pendingBrs } = await supabase
        .from('brands')
        .select('*, owner_vendor:vendors(id, store_name), products:products(id, title)')
        .eq('status', 'pending_review')
        .order('created_at', { ascending: false });

      // 2. Fetch pending categories
      const { data: pendingCats } = await supabase
        .from('categories')
        .select('*, parent:categories(id, name), owner_vendor:vendors(id, store_name), products:products(id, title), product_categories:product_categories(products(id, title))')
        .eq('status', 'pending_review')
        .order('created_at', { ascending: false });

      // 3. Fetch approved brands (for merge)
      const { data: appBrs } = await supabase
        .from('brands')
        .select('id, name')
        .eq('status', 'approved')
        .order('name');

      // 4. Fetch approved categories (for merge)
      const { data: appCats } = await supabase
        .from('categories')
        .select('id, name')
        .eq('status', 'approved')
        .order('name');

      setBrands(pendingBrs || []);
      setCategories(pendingCats || []);
      setApprovedBrands(appBrs || []);
      setApprovedCategories(appCats || []);
    } catch (err: any) {
      toast.error('Error al cargar taxonomías: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  // Check if a product has other pending taxonomies
  async function checkAndPublishProduct(productId: string) {
    try {
      const { data: product } = await supabase
        .from('products')
        .select('brand_id, category_id')
        .eq('id', productId)
        .single();

      if (!product) return;

      let isBrandPending = false;
      if (product.brand_id) {
        const { data: brand } = await supabase
          .from('brands')
          .select('status')
          .eq('id', product.brand_id)
          .single();
        isBrandPending = brand?.status === 'pending_review';
      }

      let isCategoryPending = false;
      if (product.category_id) {
        const { data: cat } = await supabase
          .from('categories')
          .select('status')
          .eq('id', product.category_id)
          .single();
        isCategoryPending = cat?.status === 'pending_review';
      }

      // If no taxonomy is pending anymore, publish the product
      if (!isBrandPending && !isCategoryPending) {
        await supabase
          .from('products')
          .update({ status: 'published', is_active: true })
          .eq('id', productId);
      }
    } catch (err) {
      console.error('Error checking product taxonomy:', err);
    }
  }

  async function handleApprove(type: 'brand' | 'category', item: any) {
    if (!(await confirm(`¿Aprobar esta propuesta de ${type === 'brand' ? 'marca' : 'categoría'} "${item.name}"?`))) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const table = type === 'brand' ? 'brands' : 'categories';

      const { error } = await supabase
        .from(table)
        .update({
          status: 'approved',
          approved_by: user?.id || null,
          approved_at: new Date().toISOString()
        })
        .eq('id', item.id);

      if (error) throw error;

      toast.success(`${type === 'brand' ? 'Marca' : 'Categoría'} aprobada`);
      
      // Update associated products if any
      const assocProducts = item.products || [];
      // Also check categories junction products
      if (type === 'category' && item.product_categories) {
        item.product_categories.forEach((pc: any) => {
          if (pc.products && !assocProducts.some((p: any) => p.id === pc.products.id)) {
            assocProducts.push(pc.products);
          }
        });
      }

      for (const p of assocProducts) {
        await checkAndPublishProduct(p.id);
      }

      fetchData();
    } catch (err: any) {
      toast.error('Error al aprobar: ' + err.message);
    }
  }

  async function handleReject(type: 'brand' | 'category', item: any) {
    if (!(await confirm(`¿Rechazar esta propuesta de ${type === 'brand' ? 'marca' : 'categoría'} "${item.name}"?`, { danger: true }))) return;

    try {
      const table = type === 'brand' ? 'brands' : 'categories';
      const { error } = await supabase
        .from(table)
        .update({ status: 'rejected' })
        .eq('id', item.id);

      if (error) throw error;

      toast.success(`${type === 'brand' ? 'Marca' : 'Categoría'} rechazada`);
      fetchData();
    } catch (err: any) {
      toast.error('Error al rechazar: ' + err.message);
    }
  }

  function openMerge(type: 'brand' | 'category', item: any) {
    setMergeModal({
      isOpen: true,
      type,
      item,
      targetId: ''
    });
  }

  async function handleMerge() {
    const { type, item, targetId } = mergeModal;
    if (!targetId) {
      toast.error('Selecciona una opción de destino para fusionar');
      return;
    }

    const targetName = type === 'brand' 
      ? approvedBrands.find(b => b.id === targetId)?.name 
      : approvedCategories.find(c => c.id === targetId)?.name;

    if (!(await confirm(`¿Fusionar "${item.name}" con "${targetName}"? Los productos asociados se actualizarán.`))) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (type === 'brand') {
        // 1. Update brand_id in products table
        const { error: updErr } = await supabase
          .from('products')
          .update({ brand_id: targetId })
          .eq('brand_id', item.id);
        if (updErr) throw updErr;

        // 2. Mark proposal as merged
        const { error: mrgErr } = await supabase
          .from('brands')
          .update({
            status: 'merged',
            merged_into_id: targetId,
            approved_by: user?.id || null,
            approved_at: new Date().toISOString()
          })
          .eq('id', item.id);
        if (mrgErr) throw mrgErr;

        // 3. Check and publish updated products
        const assocProducts = item.products || [];
        for (const p of assocProducts) {
          await checkAndPublishProduct(p.id);
        }

      } else {
        // Category merge
        // 1. Update category_id in products table
        const { error: updErr } = await supabase
          .from('products')
          .update({ category_id: targetId })
          .eq('category_id', item.id);
        if (updErr) throw updErr;

        // 2. Update category_id in product_categories junction table
        // Delete potential duplicates first to avoid primary key collisions
        const { data: assocJunctions } = await supabase
          .from('product_categories')
          .select('product_id')
          .eq('category_id', item.id);

        if (assocJunctions && assocJunctions.length > 0) {
          const productIds = assocJunctions.map(j => j.product_id);
          await supabase
            .from('product_categories')
            .delete()
            .in('product_id', productIds)
            .eq('category_id', targetId);
          
          const { error: juncErr } = await supabase
            .from('product_categories')
            .update({ category_id: targetId })
            .eq('category_id', item.id);
          if (juncErr) throw juncErr;
        }

        // 3. Mark category proposal as merged
        const { error: mrgErr } = await supabase
          .from('categories')
          .update({
            status: 'merged',
            merged_into_id: targetId,
            approved_by: user?.id || null,
            approved_at: new Date().toISOString()
          })
          .eq('id', item.id);
        if (mrgErr) throw mrgErr;

        // 4. Check and publish updated products
        const assocProducts = item.products || [];
        if (item.product_categories) {
          item.product_categories.forEach((pc: any) => {
            if (pc.products && !assocProducts.some((p: any) => p.id === pc.products.id)) {
              assocProducts.push(pc.products);
            }
          });
        }
        for (const p of assocProducts) {
          await checkAndPublishProduct(p.id);
        }
      }

      toast.success('Fusión completada con éxito');
      setMergeModal({ isOpen: false, type: 'brand', item: null, targetId: '' });
      fetchData();
    } catch (err: any) {
      toast.error('Error al fusionar: ' + err.message);
    }
  }

  function getProductTitle(item: any, type: 'brand' | 'category') {
    if (item.products && item.products.length > 0) {
      return item.products[0].title;
    }
    if (type === 'category' && item.product_categories && item.product_categories.length > 0) {
      return item.product_categories[0].products?.title;
    }
    return '-';
  }

  const pendingCategories = categories.filter(c => !c.parent_id);
  const pendingSubcategories = categories.filter(c => c.parent_id);

  return (
    <div className="space-y-12">
      {/* 1. SECCIÓN MARCAS */}
      <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 bg-gray-50/50 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-lg font-bold text-gray-900">Marcas Pendientes</h2>
          <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2 py-0.5 rounded-full">{brands.length}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50/30">
              <tr className="text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                <th className="px-6 py-3">Nombre propuesto</th>
                <th className="px-6 py-3">Tipo</th>
                <th className="px-6 py-3">Vendor</th>
                <th className="px-6 py-3">Producto asociado</th>
                <th className="px-6 py-3">Fecha</th>
                <th className="px-6 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white text-sm text-gray-700">
              {loading ? (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-400">Cargando propuestas...</td></tr>
              ) : brands.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-400">No hay marcas pendientes de revisión</td></tr>
              ) : brands.map(b => (
                <tr key={b.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-4 font-bold text-gray-900">{b.name}</td>
                  <td className="px-6 py-4"><span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700 uppercase">Marca</span></td>
                  <td className="px-6 py-4 font-medium">{b.owner_vendor?.store_name || 'Desconocido'}</td>
                  <td className="px-6 py-4 max-w-xs truncate">{getProductTitle(b, 'brand')}</td>
                  <td className="px-6 py-4 text-xs text-gray-500">{new Date(b.created_at).toLocaleDateString()}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => handleApprove('brand', b)} className="p-1.5 bg-green-50 text-green-700 hover:bg-green-100 rounded-lg transition-colors" title="Aprobar"><Check className="w-4 h-4" /></button>
                      <button onClick={() => handleReject('brand', b)} className="p-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-colors" title="Rechazar"><X className="w-4 h-4" /></button>
                      <button onClick={() => openMerge('brand', b)} className="p-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg transition-colors" title="Fusionar con existente"><GitMerge className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 2. SECCIÓN CATEGORÍAS */}
      <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 bg-gray-50/50 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-lg font-bold text-gray-900">Categorías Pendientes</h2>
          <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2 py-0.5 rounded-full">{pendingCategories.length}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50/30">
              <tr className="text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                <th className="px-6 py-3">Nombre propuesto</th>
                <th className="px-6 py-3">Tipo</th>
                <th className="px-6 py-3">Vendor</th>
                <th className="px-6 py-3">Producto asociado</th>
                <th className="px-6 py-3">Fecha</th>
                <th className="px-6 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white text-sm text-gray-700">
              {loading ? (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-400">Cargando propuestas...</td></tr>
              ) : pendingCategories.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-400">No hay categorías pendientes de revisión</td></tr>
              ) : pendingCategories.map(c => (
                <tr key={c.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-4 font-bold text-gray-900">{c.name}</td>
                  <td className="px-6 py-4"><span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 uppercase">Categoría</span></td>
                  <td className="px-6 py-4 font-medium">{c.owner_vendor?.store_name || 'Desconocido'}</td>
                  <td className="px-6 py-4 max-w-xs truncate">{getProductTitle(c, 'category')}</td>
                  <td className="px-6 py-4 text-xs text-gray-500">{new Date(c.created_at).toLocaleDateString()}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => handleApprove('category', c)} className="p-1.5 bg-green-50 text-green-700 hover:bg-green-100 rounded-lg transition-colors" title="Aprobar"><Check className="w-4 h-4" /></button>
                      <button onClick={() => handleReject('category', c)} className="p-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-colors" title="Rechazar"><X className="w-4 h-4" /></button>
                      <button onClick={() => openMerge('category', c)} className="p-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg transition-colors" title="Fusionar con existente"><GitMerge className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 3. SECCIÓN SUBCATEGORÍAS */}
      <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 bg-gray-50/50 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-lg font-bold text-gray-900">Subcategorías Pendientes</h2>
          <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2 py-0.5 rounded-full">{pendingSubcategories.length}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50/30">
              <tr className="text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                <th className="px-6 py-3">Nombre propuesto</th>
                <th className="px-6 py-3">Categoría padre propuesta</th>
                <th className="px-6 py-3">Vendor</th>
                <th className="px-6 py-3">Producto asociado</th>
                <th className="px-6 py-3">Fecha</th>
                <th className="px-6 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white text-sm text-gray-700">
              {loading ? (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-400">Cargando propuestas...</td></tr>
              ) : pendingSubcategories.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-400">No hay subcategorías pendientes de revisión</td></tr>
              ) : pendingSubcategories.map(c => (
                <tr key={c.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-4 font-bold text-gray-900">{c.name}</td>
                  <td className="px-6 py-4 font-semibold text-blue-600">{c.parent?.name || 'Ninguna'}</td>
                  <td className="px-6 py-4 font-medium">{c.owner_vendor?.store_name || 'Desconocido'}</td>
                  <td className="px-6 py-4 max-w-xs truncate">{getProductTitle(c, 'category')}</td>
                  <td className="px-6 py-4 text-xs text-gray-500">{new Date(c.created_at).toLocaleDateString()}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => handleApprove('category', c)} className="p-1.5 bg-green-50 text-green-700 hover:bg-green-100 rounded-lg transition-colors" title="Aprobar"><Check className="w-4 h-4" /></button>
                      <button onClick={() => handleReject('category', c)} className="p-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-colors" title="Rechazar"><X className="w-4 h-4" /></button>
                      <button onClick={() => openMerge('category', c)} className="p-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg transition-colors" title="Fusionar con existente"><GitMerge className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* MODAL DE FUSIÓN */}
      {mergeModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl border border-gray-100 max-w-md w-full p-6 space-y-6">
            <div className="flex items-center gap-3 text-yellow-600 border-b pb-3">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="text-lg font-bold text-gray-900">Fusionar Taxonomía</h3>
            </div>
            
            <div className="space-y-4">
              <p className="text-sm text-gray-500">
                Estás a punto de fusionar la propuesta <strong>"{mergeModal.item?.name}"</strong> con una taxonomía aprobada existente. Todos los productos asociados serán reasignados.
              </p>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                  Seleccionar {mergeModal.type === 'brand' ? 'Marca' : 'Categoría'} Destino Aprobada
                </label>
                <select 
                  className="w-full border border-gray-200 rounded-lg p-2.5 text-sm bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none"
                  value={mergeModal.targetId}
                  onChange={e => setMergeModal({ ...mergeModal, targetId: e.target.value })}
                >
                  <option value="">-- Seleccionar destino aprobado --</option>
                  {mergeModal.type === 'brand' 
                    ? approvedBrands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)
                    : approvedCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)
                  }
                </select>
              </div>

              {mergeModal.targetId && (
                <div className="flex items-center gap-2 text-xs bg-blue-50 border border-blue-100 text-blue-700 p-3 rounded-lg">
                  <span className="font-bold">{mergeModal.item?.name}</span>
                  <ArrowRight className="w-4 h-4 text-blue-500" />
                  <span className="font-bold">
                    {mergeModal.type === 'brand' 
                      ? approvedBrands.find(b => b.id === mergeModal.targetId)?.name
                      : approvedCategories.find(c => c.id === mergeModal.targetId)?.name
                    }
                  </span>
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-3 border-t">
              <button 
                onClick={() => setMergeModal({ isOpen: false, type: 'brand', item: null, targetId: '' })}
                className="flex-1 py-2 text-sm font-bold border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={handleMerge}
                className="flex-1 py-2 text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center justify-center gap-2 shadow-md shadow-blue-200"
              >
                <GitMerge className="w-4 h-4" /> Fusionar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
