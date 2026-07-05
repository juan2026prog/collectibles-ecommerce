# REPORT OF THE COMPLETE CONVERSION AND BEHAVIOR AUDIT V3 (REAL DATA) — COLLECTIBLES.UY

This report consolidates the technical, functional, and user behavior audit of **Collectibles.uy**. It utilizes real, aggregated data from the official Microsoft Clarity Live Insights API, transaction records from the Supabase production database, Edge Function logs, and static code analysis.

---

## 1. Executive Summary

*   **Clarity Integration Success:** The Microsoft Clarity Live Insights API was successfully integrated using the secure `CLARITY_API_TOKEN` environment variable. Real aggregated metrics for the last 3 days were extracted and cached as dated snapshots under `docs/analytics/data/clarity/`.
*   **API Data Limits & Window:** We confirmed that the Clarity Live Insights API restricts queries to the **last 3 days** (72 hours). Consequently, no historical `/checkout` or `/cart` pageviews were captured in the Clarity snapshot because no checkouts occurred during this short time frame. 
*   **Supabase Transactional Audit:** To bypass this limitation, we audited the database records. Of the 169 total orders, **160 remain in `pending` status**. However, **95.6% of these pending orders (153 out of 160) are developer test orders** created by internal emails (`juanmacastillo2008@gmail.com`, `test@example.com`), indicating that the checkout is not suffering from a massive customer failure rate.
*   **Handy Integration Bug:** We analyzed the logs and verified that the Handy gateway suffered from a formatting bug where hexadecimal invoice IDs (e.g., `"43E43992"`) were sent as strings, causing a 100% failure rate (HTTP 400). This bug was resolved in code by converting the invoice ID to a Unix timestamp integer, which enabled successful redirections on June 27, 2026.
*   **Checkout blocker (DAC):** We reproduced a critical UX blocker where the "Finalizar compra" button is disabled and displays `• Esperando cálculo de envío de DAC...` if the city dropdown is left unselected.

---

## 2. Real Sources Used

1.  **Clarity API Snapshots (Last 3 Days: July 1 - July 4, 2026):** Aggregated metrics by dimension (`Device`, `Browser`, `OS`, `URL`, `Referrer URL`, `Country/Region`) saved under `docs/analytics/data/clarity/`.
2.  **Supabase Database (All-Time):** Analytical queries on the `public.orders`, `public.order_items`, `public.payments`, and `public.abandoned_checkouts` tables.
3.  **Edge Function Logs:** Request/response payloads logged in `public.payments` (specifically for Handy checkout and webhooks).
4.  **Frontend Repositories:** Static code analysis of [Checkout.tsx](file:///c:/Projects/Collectibles2026/frontend/src/pages/Checkout.tsx), [create-order/index.ts](file:///c:/Projects/Collectibles2026/supabase/functions/create-order/index.ts), and [create-handy-payment/index.ts](file:///c:/Projects/Collectibles2026/supabase/functions/create-handy-payment/index.ts).

---

## 3. Data Limitations

*   **Clarity API Constraint:** The `project-live-insights` endpoint limits historical data to a maximum of 3 days (`numOfDays=3`). For a low-traffic e-commerce store, this makes it impossible to perform long-term funnel analysis or capture rare events (like purchases) using only the API.
*   **GA4 E-commerce Tracking:** The Google Analytics 4 tag (`G-JGVY58K11H`) is active but does not track e-commerce actions (`add_to_cart`, `begin_checkout`, `purchase`). It only logs standard page views.
*   **Funnel Status:** **THERE IS INSUFFICIENT DATA TO RECONSTRUCT THE HISTORICAL VISITOR FUNNEL WEB SESSIONS.** Any attempt to show step-by-step drop-offs from home to purchase using web sessions is unverified and has been discarded.

---

## 4. Traffic and Devices (Clarity Last 3 Days)

### HECHO MEDIDO:
Clarity registered a total of **79 sessions** (excluding bot traffic which accounted for an additional 103 sessions).
*   **PC (Desktop):** 50 sessions (14 human, 36 bot).
*   **Mobile:** 29 sessions (26 human, 3 bot).
*   **Other:** 0 human sessions (66 bot).

**Conclusion:** Human traffic is predominantly mobile (26 Mobile vs 14 PC), whereas bot traffic is concentrated on desktop (36 PC vs 3 Mobile).

---

## 5. Acquisition Sources (Clarity Last 3 Days)

### HECHO MEDIDO:
Referral traffic distribution for the 79 human sessions:
*   **Direct Traffic (null referrer):** 29 sessions (36.7%)
*   **Google Search (`https://www.google.com/`):** 23 sessions (29.1%)
*   **Instagram (`https://l.instagram.com/`):** 9 sessions (11.4%)
*   **Facebook (`https://l.facebook.com/` + `lm.facebook.com`):** 7 sessions (8.9%)
*   **Twitter/X (`https://t.co/`):** 1 session (1.3%)
*   **WhatsApp (`https://web.whatsapp.com/`):** 1 session (1.3%)
*   **Internal referrals (operational/vendor/admin):** 9 sessions (11.4%)

---

## 6. Behavior by Device (Clarity Last 3 Days)

### HECHO MEDIDO:
*   **Dead Clicks:** 13.79% of Mobile sessions (10 total clicks) vs 18.00% of PC sessions (26 total clicks).
*   **Rage Clicks:** 0% of sessions had rage clicks on both Mobile and PC.
*   **Quick Backs:** 37.93% of Mobile sessions vs 36.00% of PC sessions.
*   **Scroll Depth:** Average scroll depth is **69.3%** on Mobile vs **73.21%** on PC.
*   **Engagement Time:** Mobile users are highly active (avg active time: 118s out of 119s total). PC users show high idle time (avg active time: 201s out of 826s total).

---

## 7. Instagram WebView Behavior (Clarity Last 3 Days)

### HECHO MEDIDO:
*   Instagram App WebView (`Browser: InstagramApp`) represents **11 sessions** (13.9% of all human traffic).
*   **Dead Clicks:** Instagram WebView has a **27.27% dead click rate** (5 dead clicks across 11 sessions).
*   **Quick Backs:** 36.36% of Instagram WebView sessions had quick backs.

### INDICIO DE RELACIÓN:
The dead click rate in the Instagram WebView (27.27%) is significantly higher than in regular Chrome Mobile (6.67%) or PC Chrome (16.33%). This indicates that mobile WebView users experience higher friction, tapping elements that do not respond (such as unclickable product card elements or unresponsive menu drawers).

---

## 8. Most Visited Pages (Clarity Last 3 Days)

### HECHO MEDIDO:
Popular pages visited in Clarity:
1.  **Home Page (`Collectibles Store - Tu Tienda de Coleccionables Premium`):** 75 sessions.
2.  **Catalog (`Catálogo — Collectibles`):** 27 sessions.
3.  **Funko POP Category:** 8 sessions.
4.  **Peluches Category:** 4 sessions.
5.  **Figuras de Acción Category:** 4 sessions.

---

## 9. Pages with Interaction Issues (Clarity Last 3 Days)

### HECHO MEDIDO:
*   **Home Page (`https://collectibles.uy/`):** 35 sessions, 0 dead clicks.
*   **Search Page (`https://collectibles.uy/shop?q=ecto`):** 1 session, 2 dead clicks (100% of sessions on this page had dead clicks).
*   **Product Categories (`/categoria/peluches`):** 7 sessions, 0 dead clicks.

---

## 10. Dead Clicks

### HECHO MEDIDO:
The average dead click rate is **16.46%** across all human sessions (36 dead clicks total).
*   PC Chrome: 16.33% (19 dead clicks).
*   ChromeMobile: 6.67% (5 dead clicks).
*   InstagramApp WebView: 27.27% (5 dead clicks).
*   Edge: 100% (7 dead clicks in 1 session).

---

## 11. Rage Clicks

### HECHO MEDIDO:
Clarity registered **0 rage clicks** in the last 3 days across all human devices and browsers.

---

## 12. Quick Backs

### HECHO MEDIDO:
Average quick back rate is **36.71%** (71 quick back clicks total).
*   ChromeMobile: 46.67% of sessions (9 quick backs).
*   InstagramApp: 36.36% of sessions (4 quick backs).
*   PC Chrome: 34.69% of sessions (34 quick backs).
*   Edge: 100% (24 quick backs in 1 session).

---

## 13. JavaScript Errors

### HECHO MEDIDO:
Clarity registered JS errors in **1.27% of sessions** (2 script errors total). Both occurred on Mobile devices (3.45% of mobile sessions).

---

## 14. Real Commercial Data (Supabase All-Time)

### HECHO MEDIDO:
*   **Total Orders:** 169.
*   **Revenue (All States):** UYU 69,578.00.
*   **Paid Orders:** 6 orders (plus 1 delivered and 1 in preparation = 8 active/completed).
*   **Pending Orders:** 160 orders.
*   **Abandoned Checkouts Recovery (10 total):**
    *   6 abandoned checkouts remain `abandoned`.
    *   4 abandoned checkouts were `converted` (1 converted after receiving both email and WhatsApp, 1 after email only, 2 converted without active recovery messages sent).

---

## 15. Deployed Bug Confirmations

### A. Checkout DAC Blocker
*   **[BUG CONFIRMADO]:**
    *   *Mechanism:* The function `isPaymentBlocked()` in [Checkout.tsx](file:///c:/Projects/Collectibles2026/frontend/src/pages/Checkout.tsx#L1447) checks if `dacShippingCost === null` for delivery methods. When a user selects "Envío por DAC al interior" (Step 2) for a non-Montevideo department, the city is selected via a `<select>` dropdown. If the autocomplete input does not resolve the city to an exact match, the city dropdown defaults to empty. The useEffect hook `isDacCalculable` evaluates to false, which prevents `fetchDacCost` from firing. As a result, `dacShippingCost` remains `null`.
    *   *Result:* In Step 3, the submit button is disabled and displays `• Esperando cálculo de envío de DAC...`. The user is blocked and has no clear indication that they must select the city from the dropdown.
    *   *Reproduction Steps (Android Chrome, iPhone Safari, Desktop Chrome):*
        1.  Add a product to the cart and proceed to Checkout.
        2.  Fill in Step 1 (Billing) and click "Next".
        3.  In Step 2, select **Envío por DAC al interior**.
        4.  Select **Maldonado** as the Department.
        5.  Start typing a street in the autocomplete, but click outside (dismissing the keyboard) before selecting a city option from the city dropdown (leave it as "Selecciona una localidad...").
        6.  Click "Next" to reach Step 3.
        7.  Observe that the total sum displays `Esperando cálculo...`, and the payment button is disabled, displaying `• Esperando cálculo de envío de DAC...`.

---

## 16. Historical Bugs Already Resolved

### A. Handy InvoiceNumber Format Error
*   **[BUG HISTÓRICO / RESUELTO]:**
    *   *Error Log Evidence:* The payment attempts on `2026-05-19` logged the following raw response:
        `{"errors":{"Cart.InvoiceNumber":["Could not convert string to integer: 43E43992."]}}`
    *   *Attempts Affected:* 2 attempts (Facturas `43E43992` and `9762D834`).
    *   *Code Audit:* The current code in [create-handy-payment/index.ts](file:///c:/Projects/Collectibles2026/supabase/functions/create-handy-payment/index.ts#L179) calculates `invoiceNumber` using:
        `const invoiceNumber = Math.floor(orderTime / 1000);`
        This resolves the format to a 32-bit integer, and subsequent attempts (such as attempt `8884b0e4` on `2026-06-27`) successfully generated redirections.

### B. Handy Localhost redirects (500 Error)
*   **[BUG HISTÓRICO / RESUELTO]:**
    *   *Error Log Evidence:* 5 attempts on `2026-05-19` failed with code 500 (`Internal Server Error`).
    *   *Cause:* The payload sent `"SiteUrl": "http://localhost:5173"`. The Handy API rejects localhost URLs and causes a server-side crash.
    *   *Code Audit:* The current code in `create-handy-payment/index.ts` checks:
        `const siteUrl = handy.siteUrl && !handy.siteUrl.includes("localhost") ? handy.siteUrl.trim() : "https://collectibles-ecommerce.vercel.app";`
        This fallback mitigates the crash.

### C. 31 Orders without Items
*   **[BUG HISTÓRICO / RESUELTO]:**
    *   *Evidence:* 31 orders created between `2026-04-03` and `2026-04-29` (19 dLocal, 10 Mercado Pago, 2 PayPal) had no items in `order_items`.
    *   *Cause:* The old order flow was not atomic, inserting the order header first and then items in separate client-side requests.
    *   *Code Audit:* The current edge function [create-order/index.ts](file:///c:/Projects/Collectibles2026/supabase/functions/create-order/index.ts#L1113) calls the PL/pgSQL function `create_order_atomic`, which inserts both the order and items in a single atomic Postgres transaction block. This prevents empty orders.

---

## 17. Technical Risks

*   **[RIESGO TÉCNICO] Missing automatic refunds for Handy and dLocal Go:**
    *   The `refund-order` edge function does not call any external API for dLocal Go and Handy. If an administrator triggers a refund, the order changes status in the database, but the customer does not receive their money back unless the administrator manually processes the refund in the provider's dashboard.

---

## 18. Hypotheses Pending Validation

*   **[HIPÓTESIS] Instagram WebView Session loss:**
    *   The browser inside the Instagram App WebView might block cookies and local storage when redirecting to external payment pages (Mercado Pago / PayPal). Upon returning to `/checkout/success`, the app fails to restore the session, resulting in a blank cart page and causing the user to believe their order failed, leaving the order as pending in the database.

---

## 19. Top Opportunities by Impact/Effort

### 1. Refactor Checkout Blocker to Display Explicit Validation Messages
*   **IMPACTO:** Alto | **ESFUERZO:** Bajo
*   **EVIDENCIA REAL:** `isPaymentBlocked()` blocks submit silently when city select is empty.
*   **FUENTE DEL DATO:** [Checkout.tsx:L1447](file:///c:/Projects/Collectibles2026/frontend/src/pages/Checkout.tsx#L1447).
*   **ACCIÓN CONCRETA:** Keep the payment button enabled, but when clicked, validate fields and trigger a smooth scroll to the empty city dropdown, highlighting it in red with a clear validation message.
*   **MÉTRICA QUE DEBE MEJORAR:** Abandono del checkout (Checkout conversion rate).

### 2. Implement GA4 E-commerce Event Tracking
*   **IMPACTO:** Alto | **ESFUERZO:** Bajo
*   **EVIDENCIA REAL:** No custom `gtag` ecommerce events are defined in the context or pages.
*   **FUENTE DEL DATO:** Code audit of [AnalyticsContext.tsx](file:///c:/Projects/Collectibles2026/frontend/src/contexts/AnalyticsContext.tsx).
*   **ACCIÓN CONCRETA:** Inject `gtag('event', 'begin_checkout', ...)` and `gtag('event', 'purchase', ...)` in the checkout flow.
*   **MÉTRICA QUE DEBE MEJORAR:** Calidad de datos (Data Quality and visibility).

### 3. Decrease DAC shipping recalculation debounce to 250ms with loading indicator
*   **IMPACTO:** Medio | **ESFUERZO:** Bajo
*   **EVIDENCIA REAL:** 450ms debounce causes lag in shipping calculation.
*   **FUENTE DEL DATO:** [Checkout.tsx:L801](file:///c:/Projects/Collectibles2026/frontend/src/pages/Checkout.tsx#L801).
*   **ACCIÓN CONCRETA:** Reduce the debounce timer to 250ms and display a small loading spinner next to the shipping method instead of disabling the checkout button.
*   **MÉTRICA QUE DEBE MEJORAR:** Tiempo de interacción del checkout (Interactive Latency).

### 4. Implement Database Constraint for Order Items Length
*   **IMPACTO:** Medio | **ESFUERZO:** Bajo
*   **EVIDENCIA REAL:** 31 historical orders with zero items.
*   **FUENTE DEL DATO:** Supabase database query.
*   **ACCIÓN CONCRETA:** Add an SQL constraint in `create_order_atomic` function to raise an exception if `p_items` array length is 0.
*   **MÉTRICA QUE DEBE MEJORAR:** Integridad de datos (Database Consistency).

---

## 20. Action Plan

### 24 Hours
*   Modify [Checkout.tsx](file:///c:/Projects/Collectibles2026/frontend/src/pages/Checkout.tsx) to prevent disabling the submit button silently; show a validation warning and scroll to the missing field instead.
*   Reduce the debounce timer in [Checkout.tsx](file:///c:/Projects/Collectibles2026/frontend/src/pages/Checkout.tsx#L801) from 450ms to 250ms.

### 7 Days
*   Integrate standard e-commerce telemetries (`begin_checkout`, `purchase`) for Google Analytics 4 in [AnalyticsContext.tsx](file:///c:/Projects/Collectibles2026/frontend/src/contexts/AnalyticsContext.tsx).
*   Add database constraint checks to `create_order_atomic` to permanently prevent empty orders.

### 30 Days
*   Implement session recovery mechanisms to handle WebView browser redirect issues.
*   Integrate API refund handlers for Handy and dLocal Go in `refund-order`.
