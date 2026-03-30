# Collectibles2026 Product Architecture

## 1. Platform Overview
A modular, scalable ecommerce platform designed to support multiple business models (direct retail, vendor marketplace, artist commissions, affiliate marketing) with feature toggles.

## 2. Core Modules
- **Ecommerce Core (MVP):** Product catalog, categories, cart, checkout, basic admin.
- **Affiliate/Influencer System (MVP):** Promo codes, referral links, commission tracking.
- **Vendor Marketplace (Future):** Third-party sellers, vendor dashboard, platform fees.
- **Artist Marketplace & Cameo (Future):** Artist profiles, video requests, custom commissions.
- **Growth & Marketing (MVP):** Meta Pixel/CAPI, Mercado Libre sync, CRM base.

## 3. User Roles & Permissions
- **Customer:** Default role. Can browse, buy, request videos.
- **Admin:** Full access to admin panel, feature toggles, global settings.
- **Vendor (`is_vendor`):** Can manage own products, view own orders, request payouts.
- **Artist (`is_artist`):** Can manage profile, accept/fulfill video requests.
- **Affiliate (`is_affiliate`):** Can view commission dashboard, generate links.

## 4. System Interactions & Tech Stack
- **Frontend:** React + Tailwind CSS (Mobile-first storefront, Desktop-first admin).
- **Backend as a Service:** Supabase (Postgres Database, Auth, Storage).
- **Serverless Logic:** Supabase Edge Functions (Stripe/Payment webhooks, Meta CAPI, Mercado Libre sync, complex commission calculations).
- **Security:** Row Level Security (RLS) restricts data access at the DB level.
