# Admin Panel Architecture 

## 1. Overview
The Admin Panel is an internal tool built heavily with React and Tailwind CSS, prioritizing **speed, data density, and bulk operations** over aesthetic flourishing. The design must be strictly **Desktop-First**.

## 2. Core Routing Architecture
The routing tree uses an authenticated layout.

- `/admin/dashboard`: High-level KPIs, sales velocity, pending actionable alerts (e.g. pending payouts).
- `/admin/catalog`: Grid of all products (`products` and `product_variants`). Supports bulk price update and bulk status changes.
- `/admin/orders`: List of transactions. Includes tracking tools, refund triggers, and status updates.
- `/admin/users`: CRM interface displaying `profiles`.
- `/admin/growth`: Management of `coupons` and read-only views of `affiliates`. Inputs for global Meta Pixel IDs or API tokens.
- `/admin/modules`: The core "Feature Toggle" page. Here, the Admin can globally enable/disable `is_vendor_system_active`, `is_affiliate_system_active`, etc., which dynamically removes routes and UI elements from the Storefront.

## 3. Component System
To maintain speed, the UI must rely on robust shared components:
- `DataTable`: A high-performance table component supporting sorting, filtering, and bulk selection.
- `StatCard`: Standardized tile for displaying KPI metrics.
- `ModuleGuard`: A Higher-Order Component that wraps routes. If `/admin/vendors` is accessed but the Vendor system is toggled off, it correctly redirects the user.
