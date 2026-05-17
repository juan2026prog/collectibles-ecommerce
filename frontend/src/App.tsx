import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { CartProvider } from './contexts/CartContext';
import { FeatureToggleProvider } from './contexts/FeatureToggleContext';
import AnalyticsProvider from './contexts/AnalyticsContext';
import ProtectedRoute from './components/ProtectedRoute';
import { LocaleProvider } from './contexts/LocaleContext';
import { CurrencyProvider } from './contexts/CurrencyContext';
import ErrorBoundary from './components/ErrorBoundary';
import { PageSkeleton } from './components/Skeletons';

import StorefrontLayout from './layouts/StorefrontLayout';
import AdminLayout from './layouts/AdminLayout';
import PortalLayout from './layouts/PortalLayout';

// Public Storefront (Lazy)
const Home = lazy(() => import('./pages/Home'));
const Shop = lazy(() => import('./pages/Shop'));
const ProductDetail = lazy(() => import('./pages/ProductDetail'));
const Cart = lazy(() => import('./pages/Cart'));
const Checkout = lazy(() => import('./pages/Checkout'));
const CheckoutSuccess = lazy(() => import('./pages/CheckoutSuccess'));
const MLCallback = lazy(() => import('./pages/MLCallback'));
const Callback = lazy(() => import('./pages/Callback'));
const DynamicPage = lazy(() => import('./pages/DynamicPage'));

// Auth (Lazy)
const Login = lazy(() => import('./pages/Login'));

// Portals (Lazy)
const CustomerPortal = lazy(() => import('./pages/CustomerPortal'));
const Wishlist = lazy(() => import('./pages/Wishlist'));
const VendorDashboard = lazy(() => import('./pages/VendorDashboard'));
const ArtistDashboard = lazy(() => import('./pages/ArtistDashboard'));
const AffiliateDashboard = lazy(() => import('./pages/AffiliateDashboard'));
const Star2FanDashboard = lazy(() => import('./pages/Star2FanDashboard'));

// Admin (Lazy)
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const AdminProducts = lazy(() => import('./pages/admin/AdminProducts'));
const AdminOrders = lazy(() => import('./pages/admin/AdminOrders'));
const AdminPages = lazy(() => import('./pages/admin/AdminPages'));
const AdminCategories = lazy(() => import('./pages/admin/AdminCategories'));
const AdminCustomers = lazy(() => import('./pages/admin/AdminCustomers'));
const AdminCoupons = lazy(() => import('./pages/admin/AdminCoupons'));
const AdminBanners = lazy(() => import('./pages/admin/AdminBanners'));
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings'));
const AdminMedia = lazy(() => import('./pages/admin/AdminMedia'));
const AdminBrands = lazy(() => import('./pages/admin/AdminBrands'));
const AdminGroups = lazy(() => import('./pages/admin/AdminGroups'));
const AdminBadges = lazy(() => import('./pages/admin/AdminBadges'));
const AdminPromotions = lazy(() => import('./pages/admin/AdminPromotions'));
const AdminAffiliates = lazy(() => import('./pages/admin/AdminAffiliates'));
const AdminMailing = lazy(() => import('./pages/admin/AdminMailing'));
const AdminMercadoLibre = lazy(() => import('./pages/admin/AdminMercadoLibre'));
const AdminReports = lazy(() => import('./pages/admin/AdminReports'));
const AdminSeo = lazy(() => import('./pages/admin/AdminSeo'));
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers'));
const AdminFinances = lazy(() => import('./pages/admin/AdminFinances'));
const AdminLogistics = lazy(() => import('./pages/admin/AdminLogistics'));
const AdminArtists = lazy(() => import('./pages/admin/AdminArtists'));
const AdminTags = lazy(() => import('./pages/admin/AdminTags'));

// GodMode removed from production — SEC-CRIT-01 (hardcoded credentials)
import { useReferralTracking } from './hooks/useReferralTracking';

function ReferralTracker() {
  useReferralTracking();
  return null;
}

function App() {
  return (
    <ErrorBoundary>
    <BrowserRouter>
      <AnalyticsProvider>
        <ReferralTracker />
        <AuthProvider>
          <CartProvider>
            <FeatureToggleProvider>
              <LocaleProvider>
                <CurrencyProvider>
                  <Suspense fallback={<PageSkeleton />}>
                  <Routes>
                  {/* Public Storefront */}
                  <Route element={<StorefrontLayout />}>
                    <Route path="/" element={<Home />} />
                    <Route path="/shop" element={<Shop />} />
                    <Route path="/p/:slug" element={<ProductDetail />} />
                    <Route path="/page/:slug" element={<DynamicPage />} />
                    <Route path="/about" element={<DynamicPage forcedSlug="about" />} />
                    <Route path="/contact" element={<DynamicPage forcedSlug="contact" />} />
                    <Route path="/blog" element={<DynamicPage forcedSlug="blog" />} />
                    <Route path="/terms" element={<Navigate to="/page/terminos" replace />} />
                    <Route path="/privacy" element={<Navigate to="/page/pol-ticas-de-privacidad" replace />} />
                    <Route path="/help" element={<Navigate to="/page/condiciones-de-compra" replace />} />
                    <Route path="/cart" element={<Cart />} />
                    <Route path="/checkout" element={<Checkout />} />
                    <Route path="/checkout/success" element={<CheckoutSuccess />} />
                    <Route path="/auth/callback" element={<MLCallback />} />
                    <Route path="/callback" element={<Callback />} />
                    
                    {/* User Portals */}
                    <Route path="/account" element={
                      <ProtectedRoute>
                        <CustomerPortal />
                      </ProtectedRoute>
                    } />
                    <Route path="/wishlist" element={
                      <ProtectedRoute>
                        <Wishlist />
                      </ProtectedRoute>
                    } />
                  </Route>

                {/* Isolated Portals with Lateral Navigation */}
                <Route path="/vendor" element={
                  <ProtectedRoute>
                    <PortalLayout type="vendor" />
                  </ProtectedRoute>
                }>
                  <Route index element={<VendorDashboard />} />
                </Route>
                
                <Route path="/artist" element={
                  <ProtectedRoute>
                    <PortalLayout type="artist" />
                  </ProtectedRoute>
                }>
                  <Route index element={<ArtistDashboard />} />
                </Route>
                
                <Route path="/affiliate" element={
                  <ProtectedRoute>
                    <PortalLayout type="affiliate" />
                  </ProtectedRoute>
                }>
                  <Route index element={<AffiliateDashboard />} />
                </Route>

                <Route path="/star2fan" element={
                  <ProtectedRoute>
                    <PortalLayout type="star2fan" />
                  </ProtectedRoute>
                }>
                  <Route index element={<Star2FanDashboard />} />
                </Route>

                {/* Auth */}
                <Route path="/login" element={<Login />} />
                {/* GodMode route removed — SEC-CRIT-01 */}

                {/* Admin */}
                <Route path="/admin" element={
                  <ProtectedRoute requireAdmin>
                    <AdminLayout />
                  </ProtectedRoute>
                }>
                  <Route index element={<AdminDashboard />} />
                  <Route path="products" element={<AdminProducts />} />
                  <Route path="pages" element={<AdminPages />} />
                  <Route path="orders" element={<AdminOrders />} />
                  <Route path="categories" element={<AdminCategories />} />
                  <Route path="customers" element={<AdminCustomers />} />
                  <Route path="coupons" element={<AdminCoupons />} />
                  <Route path="banners" element={<AdminBanners />} />
                  <Route path="brands" element={<AdminBrands />} />
                  <Route path="groups" element={<AdminGroups />} />
                  <Route path="badges" element={<AdminBadges />} />
                  <Route path="promotions" element={<AdminPromotions />} />
                  <Route path="affiliates" element={<AdminAffiliates />} />
                  <Route path="mailing" element={<AdminMailing />} />
                  <Route path="mercadolibre" element={<AdminMercadoLibre />} />
                  <Route path="reports" element={<AdminReports />} />
                  <Route path="seo" element={<AdminSeo />} />
                  <Route path="media" element={<AdminMedia />} />
                  <Route path="settings" element={<AdminSettings />} />
                  <Route path="users" element={<AdminUsers />} />
                  <Route path="finances" element={<AdminFinances />} />
                  <Route path="logistics" element={<AdminLogistics />} />
                  <Route path="artists" element={<AdminArtists />} />
                  <Route path="tags" element={<AdminTags />} />
                </Route>
                  </Routes>
                </Suspense>
                </CurrencyProvider>
              </LocaleProvider>
            </FeatureToggleProvider>
          </CartProvider>
        </AuthProvider>
      </AnalyticsProvider>
    </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
