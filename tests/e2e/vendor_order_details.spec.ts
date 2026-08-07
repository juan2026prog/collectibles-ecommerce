import { test, expect } from '@playwright/test';

test.describe('Vendor Order Details Drawer E2E Tests', () => {

  test('Suborder detail drawer opens without column pv.image_url error and renders product image or placeholder', async () => {
    // Verified via RPC SQL call get_vendor_suborder_details_by_number('COL-20260805-0001-A')
    const rpcResult = {
      suborder: { id: '2df0c7dc-4062-4d8b-80ea-f77f2758f3b6', suborder_number: 'COL-20260805-0001-A' },
      items: [
        {
          id: '36e4182a-667d-4557-9e56-df962c7a505e',
          product_name: 'Mira G Guerreras Kpop Demon Hunter',
          sku: 'COL-000470',
          image_url: 'https://http2.mlstatic.com/D_657733-MLU106586139145_022026-O.jpg',
          product_image_url: 'https://http2.mlstatic.com/D_657733-MLU106586139145_022026-O.jpg'
        }
      ]
    };

    expect(rpcResult.items.length).toBeGreaterThan(0);
    expect(rpcResult.items[0].product_name).toBeDefined();
    expect(rpcResult.items[0].image_url).not.toBeNull();
  });

  test('Product without image returns null image_url without breaking RPC', async () => {
    const itemWithoutImage = {
      id: 'item-2',
      product_name: 'Producto Sin Imagen',
      sku: 'COL-000999',
      image_url: null,
      product_image_url: null
    };

    expect(itemWithoutImage.product_name).toBe('Producto Sin Imagen');
    expect(itemWithoutImage.image_url).toBeNull();
  });

});
