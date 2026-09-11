import type { ResearchPack } from '../types/sourcing';

export const SAMPLE_MCFARLANE_RESEARCH_PACK: ResearchPack = {
  schema_version: '1.0',
  pack_id: 'mcfarlane-2026-09',
  title: 'McFarlane US · Septiembre 2026',
  generated_at: '2026-09-04T12:00:00Z',
  source: 'chatgpt-research',
  status: 'READY',
  items_count: 7,
  items: [
    // 1. Batman Detective Comics #1000 - Multiple Retailers (Deduplication Demo)
    {
      url: 'https://www.bestbuy.com/site/mcfarlane-toys-dc-multiverse-batman-detective-comics-1000-7-figure/6412345.p?skuId=6412345',
      retailer: 'bestbuy',
      brand: 'McFarlane Toys',
      license: 'DC Comics',
      character: 'Batman',
      line: 'DC Multiverse',
      scale: '7"',
      upc: '787926151405',
      reason: 'EVERGREEN',
      tags: ['evergreen', 'core-batman'],
      price: 24.99
    },
    {
      url: 'https://www.amazon.com/dp/B081VR7Y32',
      retailer: 'amazon',
      brand: 'McFarlane Toys',
      license: 'DC Comics',
      character: 'Batman',
      line: 'DC Multiverse',
      scale: '7"',
      upc: '787926151405',
      reason: 'EVERGREEN',
      tags: ['evergreen', 'core-batman'],
      price: 26.00
    },
    {
      url: 'https://www.ebay.com/itm/324123456789',
      retailer: 'ebay',
      brand: 'McFarlane Toys',
      license: 'DC Comics',
      character: 'Batman',
      line: 'DC Multiverse',
      scale: '7"',
      upc: '787926151405',
      reason: 'EVERGREEN',
      tags: ['evergreen', 'core-batman'],
      price: 20.00
    },

    // 2. Spawn Deluxe 7" (Amazon & eBay)
    {
      url: 'https://www.amazon.com/dp/B09HN2M789',
      retailer: 'amazon',
      brand: 'McFarlane Toys',
      license: 'Image Comics',
      character: 'Spawn',
      line: 'Spawn Deluxe',
      scale: '7"',
      upc: '787926901234',
      reason: 'CULT',
      tags: ['cult', 'todd-mcfarlane'],
      price: 49.99
    },
    {
      url: 'https://www.ebay.com/itm/194567890123',
      retailer: 'ebay',
      brand: 'McFarlane Toys',
      license: 'Image Comics',
      character: 'Spawn',
      line: 'Spawn Deluxe',
      scale: '7"',
      upc: '787926901234',
      reason: 'CULT',
      tags: ['cult', 'todd-mcfarlane'],
      price: 52.00
    },

    // 3. Superman Action Comics #1000 (Preorder on Best Buy & Amazon)
    {
      url: 'https://www.bestbuy.com/site/mcfarlane-dc-multiverse-superman-action-comics-1000/6599881.p?skuId=6599881',
      retailer: 'bestbuy',
      brand: 'McFarlane Toys',
      license: 'DC Comics',
      character: 'Superman',
      line: 'DC Multiverse',
      scale: '7"',
      upc: '787926151412',
      reason: 'PREORDER',
      tags: ['preorder', 'release-2026'],
      price: 34.99
    },

    // 4. Ghostbusters Plasma Series Winston Zeddemore (Catalog Gap Demo)
    {
      url: 'https://www.amazon.com/dp/B083TD4V99',
      retailer: 'amazon',
      brand: 'Hasbro',
      license: 'Ghostbusters',
      character: 'Winston Zeddemore',
      line: 'Plasma Series',
      scale: '6"',
      upc: '5010993685412',
      reason: 'CATALOG_GAP',
      tags: ['catalog-gap', 'retro'],
      price: 22.99
    }
  ]
};

export const SAMPLE_STREET_FIGHTER_RESEARCH_PACK: ResearchPack = {
  schema_version: '1.0',
  pack_id: 'street-fighter-jada-2026',
  title: 'Street Fighter Jada Toys · Sourcing Showcase',
  generated_at: '2026-09-10T15:00:00Z',
  source: 'jada-street-fighter-line',
  status: 'READY',
  items_count: 5,
  items: [
    {
      url: 'https://www.amazon.com/dp/B0C8StreetFighterRyu',
      retailer: 'amazon',
      brand: 'Jada Toys',
      license: 'Capcom',
      character: 'Ryu',
      line: 'Ultra Street Fighter II 1:12',
      scale: '6"',
      upc: '801310342244',
      reason: 'TRENDING',
      tags: ['street-fighter', 'jada-toys', 'capcom'],
      price: 24.99
    },
    {
      url: 'https://www.ebay.com/itm/394812345678',
      retailer: 'ebay',
      brand: 'Jada Toys',
      license: 'Capcom',
      character: 'Ryu',
      line: 'Ultra Street Fighter II 1:12',
      scale: '6"',
      upc: '801310342244',
      reason: 'TRENDING',
      tags: ['street-fighter', 'jada-toys', 'capcom'],
      price: 22.50
    },
    {
      url: 'https://www.bestbuy.com/site/jada-toys-street-fighter-chun-li-6-figure/6543210.p?skuId=6543210',
      retailer: 'bestbuy',
      brand: 'Jada Toys',
      license: 'Capcom',
      character: 'Chun-Li',
      line: 'Ultra Street Fighter II 1:12',
      scale: '6"',
      upc: '801310342251',
      reason: 'HIGH_DEMAND',
      tags: ['street-fighter', 'jada-toys', 'capcom'],
      price: 24.99
    },
    {
      url: 'https://www.amazon.com/dp/B0C8StreetFighterKen',
      retailer: 'amazon',
      brand: 'Jada Toys',
      license: 'Capcom',
      character: 'Ken Masters',
      line: 'Ultra Street Fighter II 1:12',
      scale: '6"',
      upc: '801310342268',
      reason: 'EVERGREEN',
      tags: ['street-fighter', 'jada-toys', 'capcom'],
      price: 26.99
    },
    {
      url: 'https://www.ebay.com/itm/394898765432',
      retailer: 'ebay',
      brand: 'Jada Toys',
      license: 'Capcom',
      character: 'Ken Masters',
      line: 'Ultra Street Fighter II 1:12',
      scale: '6"',
      upc: '801310342268',
      reason: 'EVERGREEN',
      tags: ['street-fighter', 'jada-toys', 'capcom'],
      price: 28.00
    }
  ]
};

