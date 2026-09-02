# INVENTARIO FUNCIONAL EXHAUSTIVO DE COLLECTIBLES2026

Derivado mediante auditoría estática y dinámica del código fuente real (`frontend/src/App.tsx`, `api/`, `supabase/`, `vercel.json`).

---

## 1. MÓDULOS DE STOREFRONT PÚBLICO

| MODULE | ROUTE | ROLE | BACKEND | DATABASE | EXTERNAL SERVICE | WRITE OPS | RISK | TEST REQUIRED |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Home** | `/` | Guest/User | React + Vite | `products`, `banners`, `brands` | Meta Pixel, GA4 | None | HIGH | Render header, hero, catalog grid, brand sliders, footer, 0 JS errors |
| **Shop** | `/shop` | Guest/User | React + Vite | `products`, `categories`, `brands` | Algolia/Supabase Search | None | HIGH | Filters, pagination, sorting, currency switch, search bar |
| **Categoría** | `/categoria/:categorySlug` | Guest/User | React + Vite | `products`, `categories` | Serverless Prerender | None | MEDIUM | Filtered product grid, canonical, breadcrumbs, 404 handling |
| **Marca** | `/marca/:brandSlug` | Guest/User | React + Vite | `products`, `brands` | Serverless Prerender | None | MEDIUM | Brand banner, products, canonical, breadcrumbs |
| **Licencias Index** | `/licencias` | Guest/User | React + Vite | `licenses`, `licenses_with_counts` | None | None | LOW | Grid of active licenses, total counts, direct link to detail |
| **Licencia Detail** | `/licencias/:slug` | Guest/User | React + Vite | `licenses`, `products` | Serverless Prerender | None | MEDIUM | Products linked to license, banner, meta tags |
| **Themes Index** | `/themes` | Guest/User | React + Vite | `themes`, `themes_with_counts` | None | None | LOW | Grid of active themes, active licenses count |
| **Theme Detail** | `/themes/:slug` | Guest/User | React + Vite | `themes`, `products`, `licenses` | Serverless Prerender | None | HIGH | Products by theme, `NavigateToThemeDetail` redirect test |
| **Temas Legacy** | `/temas`, `/temas/:slug` | Guest/User | React + Vite | N/A | React Router Navigate | None | HIGH | 301/replace redirect to `/themes` and `/themes/:slug` |
| **Product Detail** | `/producto/:slug`, `/p/:slug` | Guest/User | React + Vite | `products`, `product_images` | Supabase Storage | None | CRITICAL | Gallery, add to cart, stock badge, JSON-LD Product Schema |
| **Vendor Storefront** | `/store/:slug` | Guest/User | React + Vite | `vendors`, `products` | Marketplace Guard | None | MEDIUM | Vendor header, vendor catalog, active marketplace check |
| **Página Dinámica** | `/page/:slug` | Guest/User | React + Vite | `pages` | None | None | LOW | CMS page rendering (nosotros, terminos, privacidad) |
| **Página Colección** | `/collection/:slug` | Guest/User | React + Vite | `products`, `collections` | None | None | MEDIUM | Filtered collection view |
| **Contacto** | `/contact` | Guest/User | React + Vite | N/A | Form Submission / Resend | Contact Email | LOW | Form inputs, validation, submission feedback |
| **Prueba Vendor** | `/vendor_prueba` | Guest/User | React + Vite | N/A | Internal Test | None | LOW | Experimental vendor card sandbox |

---

## 2. MÓDULOS INTERNACIONALES (USA / AMAZON / ZINC / PREX)

| MODULE | ROUTE | ROLE | BACKEND | DATABASE | EXTERNAL SERVICE | WRITE OPS | RISK | TEST REQUIRED |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Intl Storefront** | `/intl` | Guest/User | React + Vite | `international_products` | Amazon PA-API | None | HIGH | International product grid, flag toggle |
| **Intl Laboratory** | `/internacional` | Admin | React + Vite | `international_sync_settings` | Zinc API / Prex API | Sync config | CRITICAL | Pricing simulation, margin protection, capital limits |
| **Intl Cart** | `/internacional/cart` | Guest/User | React + Vite | Local Storage / Supabase | None | Cart Sync | CRITICAL | USD pricing, weight calculator, Prex fee breakdown |
| **Intl Courier** | `/internacional/checkout/courier` | User | React + Vite | `user_addresses` | Urubox / MBE API | Shipping Address | CRITICAL | USA address assignment, courier validation |
| **Intl Review** | `/internacional/checkout/review` | User | React + Vite | `orders` | Zinc Reservation | Order Draft | CRITICAL | Profit protection check, final USD total |
| **Intl Success** | `/internacional/checkout/success` | User | React + Vite | `orders` | Email / Resend | Order Confirm | HIGH | Order summary, tracking code link |

---

## 3. MÓDULOS DE AUTENTICACIÓN Y PORTALES DE USUARIOS

| MODULE | ROUTE | ROLE | BACKEND | DATABASE | EXTERNAL SERVICE | WRITE OPS | RISK | TEST REQUIRED |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Customer Login** | `/login` | Guest | Supabase Auth | `profiles` | OAuth Google / Email | Auth Session | CRITICAL | Password login, magic link, redirect to target page |
| **Vendor Login** | `/login_vendors` | Vendor | Supabase Auth | `vendors`, `profiles` | Auth Session | Auth Session | CRITICAL | Vendor role check, redirect to `/vendor` |
| **Customer Portal** | `/account` | Customer | React + Vite | `orders`, `profiles` | Supabase Auth | Profile Update | HIGH | Order history, address book, personal info |
| **Wishlist** | `/wishlist` | Customer | React + Vite | `wishlists` | Supabase Auth | Add/Remove Item | MEDIUM | Saved items grid, move item to cart |
| **Cart** | `/cart` | Guest/User | React + Vite | Local Storage | Supabase Storage | Cart State | CRITICAL | Subtotal, stock check, quantity adjust, item removal |
| **Checkout** | `/checkout` | Guest/User | React + Vite | `orders`, `order_items` | Mercado Pago / Handy | Create Order | CRITICAL | Shipping selector, payment gateway redirect, totals |
| **Checkout Success** | `/checkout/success` | Customer | React + Vite | `orders` | Notification Email | Order Update | HIGH | Order ID summary, payment confirmation |
| **ML OAuth Callback** | `/auth/callback`, `/vendor/ml/callback`, `/callback` | Vendor/Admin | Node.js API | `integrations` | Mercado Libre OAuth | Token Save | CRITICAL | Authorization code exchange, token persistence |

---

## 4. PORTALES DE VENDOR Y COLABORADORES

| MODULE | ROUTE | ROLE | BACKEND | DATABASE | EXTERNAL SERVICE | WRITE OPS | RISK | TEST REQUIRED |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Vendor Dashboard** | `/vendor` | Vendor | React + Vite | `vendors`, `products`, `orders` | Marketplace Guard | Vendor Products | CRITICAL | RLS isolation, sales summary, product management |
| **Vendor Onboarding** | `/vendor/onboarding` | Vendor | React + Vite | `vendors` | KYC Engine | Terms Accept | HIGH | Commercial info form, logistics config |
| **Artist Dashboard** | `/artist` | Artist | React + Vite | `artists`, `artist_products` | Portal Layout | Portfolio | MEDIUM | Sales metrics, portfolio manager |
| **Affiliate Dashboard** | `/affiliate` | Affiliate | React + Vite | `affiliates`, `referrals` | Referral Tracking | Ref Link Gen | MEDIUM | Commission tracking, referral links |
| **Star2Fan Portal** | `/star2fan` | Star | React + Vite | `star2fan_requests` | Video Hosting | Request Accept | LOW | Shoutout request management |

---

## 5. PANEL ADMINISTRATIVO (`/admin/*`)

| MODULE | ROUTE | ROLE | BACKEND | DATABASE | EXTERNAL SERVICE | WRITE OPS | RISK | TEST REQUIRED |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Admin Dashboard** | `/admin` | Admin | React + Vite | All Tables | Analytics Engine | None | HIGH | Global GMV, order count, system alert widgets |
| **Admin Products** | `/admin/products` | Admin | React + Vite | `products` | Storage Bucket | CRUD Product | CRITICAL | Active/draft toggle, stock update, image upload |
| **Admin Orders** | `/admin/orders` | Admin | React + Vite | `orders` | Logistics APIs | Status Update | CRITICAL | Order state transition, shipping label print |
| **Admin Categories** | `/admin/categories` | Admin | React + Vite | `categories` | Prerender Cache | CRUD Category | HIGH | Hierarchy parent/child, slug generator |
| **Admin Brands** | `/admin/brands` | Admin | React + Vite | `brands` | Prerender Cache | CRUD Brand | HIGH | Brand logo, governance rules |
| **Admin Licenses** | `/admin/licenses` | Admin | React + Vite | `licenses` | License-Theme Map | CRUD License | MEDIUM | License to theme mapping |
| **Admin Themes** | `/admin/themes` | Admin | React + Vite | `themes` | License-Theme Map | CRUD Theme | MEDIUM | Theme metadata, sorting order |
| **Admin Coupons** | `/admin/coupons` | Admin | React + Vite | `coupons` | Checkout Engine | CRUD Coupon | HIGH | Expiry date, usage limit, discount calculation |
| **Admin Banners** | `/admin/banners` | Admin | React + Vite | `banners` | Storage Bucket | CRUD Banner | MEDIUM | Mobile vs desktop banners, visibility dates |
| **Admin Groups/Badges** | `/admin/groups`, `/admin/badges` | Admin | React + Vite | `product_badges` | None | CRUD Badge | LOW | Cocardas (Preventa, Exclusive, Sale) |
| **Admin Promotions** | `/admin/promotions` | Admin | React + Vite | `promotions` | Pricing Engine | CRUD Promo | HIGH | Promotional price calculations |
| **Admin Marketplace** | `/admin/marketplace` | Admin | React + Vite | `vendors`, `payouts` | KYC Engine | Payout Action | CRITICAL | Vendor approval, commission setup, payout releases |
| **Admin Int'l Amazon** | `/admin/internacional/amazon` | Admin | React + Vite | `amazon_catalog` | Amazon PA-API | Import Product | CRITICAL | ASIN search, price sync, profit rule test |
| **Admin Int'l Sync** | `/admin/internacional/sync` | Admin | React + Vite | `international_sync_settings` | Zinc / Prex | Financial Config | CRITICAL | Capital limit setting, exchange rate override |

---

## 6. SERVERLESS FUNCTIONS & APIS (`api/`)

| FUNCTION / ENDPOINT | METHOD | BACKEND FILE | PURPOSE | WRITE OPS | RISK | TEST REQUIRED |
| :--- | :---: | :--- | :--- | :--- | :--- | :--- |
| `/api/seo-prerender` | GET | `api/seo-prerender.js` | Generates HTML with dynamic title, canonical, JSON-LD for crawlers | None | CRITICAL | Correct HTML output for shop, marca, categoria, producto |
| `/sitemap.xml` | GET | `api/sitemap.js` | Generates sitemap XML feed of published products/categories | None | HIGH | Valid XML syntax, HTTP 200, published products only |
| `/merchant-feed.xml` | GET | `api/merchant-feed.js` | Generates RSS 2.0 Google Merchant Center feed | None | CRITICAL | Valid RSS XML syntax, GTIN, price format, image links |
| `/meta-catalog.csv` | GET | `api/meta-catalog.js` | Generates Meta Commerce Manager CSV catalog | None | HIGH | Valid CSV columns, header parity |
| `/api/catalog-image` | GET | `api/catalog-image.js` | Normalizes and proxies catalog images | None | MEDIUM | HTTP 200 image response, fallback image |

---

## 7. MATRIZ DE RIESGO Y COBERTURA EXIGIDA

| RANGOS DE RIESGO | MÓDULOS CRÍTICOS | COBERTURA AUTOMATIZADA EXIGIDA |
| :--- | :--- | :--- |
| **CRITICAL** | ProductDetail, Cart, Checkout, Auth, VendorDashboard, AdminProducts, AdminOrders, SEO Prerender, Zinc/Intl Pricing | 100% End-to-End & Unit Verification |
| **HIGH** | Home, Shop, Categoría, Marca, CustomerPortal, AdminMarketplace, Merchant Feed | 100% Static & Integration Testing |
| **MEDIUM** | Licencias, Themes, Wishlist, AdminCategories, AdminBrands, Banners, Promotions | Integration & Navigation Tests |
| **LOW** | Static Pages, Help, Contact, Badges, Tags, Star2Fan | Automated Navigation & HTTP 200 Check |
