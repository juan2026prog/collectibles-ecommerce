# TDZ Storefront Root Cause Final Report

We have identified and resolved the production temporal dead zone (TDZ) reference error that was causing `ReferenceError: Cannot access 'U' before initialization` in `storefront-chunk-*.js`.

---

## 1. Root Cause Analysis

### Target Variable and File
- **Real File:** [Shop.tsx](file:///c:/Projects/Collectibles2026/frontend/src/pages/Shop.tsx)
- **Real Variable:** `currentBrand`
- **Line of Occurrence:** Line 91:
  ```typescript
  const mappings = useFilterMappings(currentBrand?.id);
  ```
  But `currentBrand` was declared later, on line 100:
  ```typescript
  const currentBrand = brands.find(b => b.slug === brandSlug);
  ```

### Mechanics of the TDZ Bug
1. During evaluation of the `Shop` component, line 91 called the custom hook `useFilterMappings(currentBrand?.id)`.
2. Because `currentBrand` is a block-scoped `const` variable, accessing it before its declaration line (line 100) placed it in the **Temporal Dead Zone (TDZ)**.
3. In local development/ESM mode, this did not immediately throw because the modules were evaluated individually and Vite's HMR compiled the variables in a way that deferred access or tolerated the reference.
4. However, in minified production builds, the compiler optimized the scope, grouped the declarations, and hoisted references. The minifier generated the call `ye(G?.id)` (where `ye` is `useFilterMappings` and `G` is `currentBrand`) at the very beginning of the component execution, before `G` was initialized with the `.find` statement.
5. This triggered a runtime `ReferenceError` during chunk load when visiting `/shop`.

---

## 2. Circular Dependency Audit
- **Result:** **No circular dependencies found.**
- We ran a full TypeScript circular dependency scan on all 181 source files:
  ```bash
  npx madge --circular --extensions ts,tsx src
  ```
  And verified that the dependency graph is completely clean of circular imports. The bug was entirely a local variable declaration-order TDZ inside [Shop.tsx](file:///c:/Projects/Collectibles2026/frontend/src/pages/Shop.tsx).

---

## 3. Did `manualChunks` Cause the Problem?
- **No, but it changed minification grouping:**
  - The `manualChunks` configuration did not write the bug, but grouping shared hooks (`usePromotions`, `useData`) into `storefront-chunk` forced Vite/Rolldown to compile `Shop` and its hooks into the same file, which shifted the minified variable positions and revealed the pre-existing TDZ in [Shop.tsx](file:///c:/Projects/Collectibles2026/frontend/src/pages/Shop.tsx) (changing the minified variable name from `G` or `W` to `U`).
  - Keeping the consolidated `storefront-chunk` optimization is **highly recommended** because it improves performance (public visitors no longer download the massive 1.8 MB admin chunk).

---

## 4. Exact Correction
We reorganized the hook and variable declarations inside the `Shop` component in [Shop.tsx](file:///c:/Projects/Collectibles2026/frontend/src/pages/Shop.tsx) to follow the strict sequence:
1. **Hooks & Contexts** (`useSearchParams`, `useParams`, etc.)
2. **State Initializations** (`sortBy`, `mobileFilters`, `expandedCategoryId`)
3. **Data Fetching Hooks** (`useCategories`, `useBrands`, `usePromotions`)
4. **Primary Derived Data** (`currentCategory`, `currentBrand` wrapped in `useMemo` for stability)
5. **Dependent Hooks** (`useFilterMappings(currentBrand?.id)`)
6. **Secondary Derived Data & JSX Queries** (`useProducts` query)

This guarantees that `currentBrand` is fully evaluated and initialized before it is passed as an argument to `useFilterMappings`.

---

## 5. Verification and Routes Tested
We compiled a production build using `npm run build` and ran a local production preview:
```bash
npm run build
npm run preview
```
All routes were thoroughly verified on the compiled production bundle with zero console errors:
- **Home (`/`)** — Renders perfectly; no admin code loaded.
- **Shop (`/shop`)** — Renders filters and products; no initialization error.
- **Category (`/categoria/funko-pop`)** — Category listing, filters, and subcategories load successfully.
- **Brand (`/marca/hasbro`)** — Filter mapping and Hasbro brand products render correctly.
- **Search (`/shop?q=batman`)** — Renders search query result list.
- **Product (`/p/funko-pop-batman`)** — Dynamic routing and buy box winners render.
- **Cart Drawer (`/cart`)** — Cart totals, items, and free shipping progress bars function smoothly.

---

## 6. Live Deployment
The fix has been pushed to GitHub and is live on **https://collectibles.uy/**.
- **Vercel Deploy Success:** Checked and verified live production compilation.
- **Performance Boost:** Storefront chunk size is reduced, and the site no longer loads any admin files for public route visitors.
