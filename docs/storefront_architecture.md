# Storefront Frontend Architecture

## 1. Overview
The Storefront is a high-conversion, consumer-facing eCommerce experience. It must be built **Mobile-First**, with responsive upscaling to desktop. Load times and Core Web Vitals are paramount.

## 2. Core Routing Architecture
Routing is designed around SEO and discoverability.

- `/`: Home. Features dynamic hero banners, curated collections, and personalized recommendations.
- `/c/[categorySlug]`: Category pages with extensive filtering and sorting components.
- `/p/[productSlug]`: Product Detail Pages (PDP). Must cleanly display variants, inventory count, and strong Call-To-Action (CTA) buttons.
- `/cart`: Slide-out panel or dedicated page for reviewing order intents.
- `/checkout`: A streamlined, low-friction pipeline connecting to Stripe/payment gateways while validating against the `checkout-handler` Edge Function.

## 3. Dynamic Module Architecture
Because the system is modular, the UI must react to enabled/disabled features:
- **Affiliate Blocks:** A module checking `is_affiliate_system_active`. If true, the PDP might inject a "Review from Our Influencers" section.
- **Cameo Video Requests:** If the `artist` system is active, an artist's custom profile page (`/artist/[slug]`) injects a "Request Custom Video" checkout CTA.

## 4. Performance Rules
- Never bundle the Admin Panel code into the Storefront.
- Images must use `<picture>` elements linking to optimized Supabase Storage CDN outputs.
