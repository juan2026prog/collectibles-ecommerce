import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { CartProvider } from './contexts/CartContext';
import { WishlistProvider } from './contexts/WishlistContext';
import { FeatureToggleProvider } from './contexts/FeatureToggleContext';
import AnalyticsProvider from './contexts/AnalyticsContext';
import ProtectedRoute from './components/ProtectedRoute';
import { LocaleProvider } from './contexts/LocaleContext';
import { CurrencyProvider } from './contexts/CurrencyContext';
import ErrorBoundary from './components/ErrorBoundary';
import { PageSkeleton } from './components/Skeletons';
import ScrollToTop from './components/ScrollToTop';
import { AdminModeProvider } from './contexts/AdminModeContext';
import { InternationalCartProvider } from './contexts/InternationalCartContext';
import InternationalLaboratory from './pages/international/InternationalLaboratory';
import InternationalCart from './pages/international/InternationalCart';
import InternationalCourier from './pages/international/InternationalCourier';
import InternationalReview from './pages/international/InternationalReview';
import InternationalOrderPreview from './pages/international/InternationalOrderPreview';

import StorefrontLayout from './layouts/StorefrontLayout';

const AdminLayout = lazy(() => import('./layouts/AdminLayout'));
const PortalLayout = lazy(() => import('./layouts/PortalLayout'));
const VendorLayout = lazy(() => import('./layouts/VendorLayout'));

// Public Storefront (Lazy)
const Home = lazy(() => import('./pages/Home'));
const Shop = lazy(() => import('./pages/Shop'));
const ProductDetail = lazy(() => import('./pages/ProductDetail'));
const VendorStorefront = lazy(() => import('./pages/VendorStorefront'));
const Cart = lazy(() => import('./pages/Cart'));
const Checkout = lazy(() => import('./pages/Checkout'));
const CheckoutSuccess = lazy(() => import('./pages/CheckoutSuccess'));
const MLCallback = lazy(() => import('./pages/MLCallback'));
const VendorMLCallback = lazy(() => import('./pages/VendorMLCallback'));
const Callback = lazy(() => import('./pages/Callback'));
const DynamicPage = lazy(() => import('./pages/DynamicPage'));
const Contact = lazy(() => import('./pages/Contact'));

// Auth (Lazy)
const Login = lazy(() => import('./pages/Login'));
const LoginVendors = lazy(() => import('./pages/LoginVendors'));

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
const AdminLogisticsConnections = lazy(() => import('./pages/admin/AdminLogisticsConnections'));
const AdminArtists = lazy(() => import('./pages/admin/AdminArtists'));
const AdminTags = lazy(() => import('./pages/admin/AdminTags'));
const AdminAutomations = lazy(() => import('./pages/admin/AdminAutomations'));
const AdminVendors = lazy(() => import('./pages/admin/AdminVendors'));
const AdminVendorPayouts = lazy(() => import('./pages/admin/AdminVendorPayouts'));
const AdminVendorKyc = lazy(() => import('./pages/admin/AdminVendorKyc'));
const AdminBuyBox = lazy(() => import('./pages/admin/AdminBuyBox'));
const AdminMarketplace = lazy(() => import('./pages/admin/AdminMarketplace'));
const AdminInternationalAmazon = lazy(() => import('./pages/admin/AdminInternationalAmazon'));
const AdminInternationalProducts = lazy(() => import('./pages/admin/AdminInternationalProducts'));
const AdminInternationalSync = lazy(() => import('./pages/admin/AdminInternationalSync'));

// GodMode removed from production — SEC-CRIT-01 (hardcoded credentials)
import { useReferralTracking } from './hooks/useReferralTracking';
import MetaPixelTracker from './components/MetaPixelTracker';
import MarketplaceGuard from './components/MarketplaceGuard';

function ReferralTracker() {
  useReferralTracking();
  return null;
}

function App() {
  return (
    <ErrorBoundary>
    <BrowserRouter>
      <ScrollToTop />
      <AnalyticsProvider>
        <ReferralTracker />
        <AuthProvider>
          <AdminModeProvider>
          <MetaPixelTracker />
          <WishlistProvider>
            <CartProvider>
              <InternationalCartProvider>
              <FeatureToggleProvider>
              <LocaleProvider>
                <CurrencyProvider>
                  <Suspense fallback={null}>
                  <Routes>
                  {/* Public Storefront */}
                  <Route element={<StorefrontLayout />}>
                    <Route path="/" element={<Home />} />
                    <Route path="/shop" element={<Shop />} />
                    <Route path="/categoria/:categorySlug" element={<Shop />} />
                    <Route path="/marca/:brandSlug" element={<Shop />} />
                    <Route path="/p/:slug" element={<ProductDetail />} />
                    <Route path="/store/:slug" element={<MarketplaceGuard><VendorStorefront /></MarketplaceGuard>} />
                    <Route path="/page/:slug" element={<DynamicPage />} />
                    <Route path="/collection/:slug" element={<Shop />} />
                    <Route path="/internacional" element={<ProtectedRoute requireAdmin><InternationalLaboratory /></ProtectedRoute>} />
                    <Route path="/about" element={<Navigate to="/page/nosotros" replace />} />
                    <Route path="/contact" element={<Contact />} />
                    <Route path="/terms" element={<Navigate to="/page/terminos" replace />} />
                    <Route path="/privacy" element={<Navigate to="/page/pol-ticas-de-privacidad" replace />} />
                    <Route path="/help" element={<Navigate to="/page/condiciones-de-compra" replace />} />
                    <Route path="/cart" element={<Cart />} />
                    <Route path="/checkout" element={<Checkout />} />
                    <Route path="/checkout/success" element={<CheckoutSuccess />} />
                    <Route path="/auth/callback" element={<MLCallback />} />
                    <Route path="/vendor/ml/callback" element={<VendorMLCallback />} />
                    <Route path="/callback" element={<Callback />} />
                    
                    {/* User Portals */}
                    <Route path="/profile" element={<Navigate to="/account" replace />} />
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
                  <ProtectedRoute requireVendor>
                    <MarketplaceGuard>
                    <Suspense fallback={<PageSkeleton />}>
                      <VendorLayout />
                    </Suspense>
                    </MarketplaceGuard>
                  </ProtectedRoute>
                }>
                  <Route index element={<VendorDashboard />} />
                </Route>
                
                {/* International Checkout Simulation */}
                <Route path="/internacional/cart" element={
                  <StorefrontLayout />
                }>
                  <Route index element={<InternationalCart />} />
                </Route>
                <Route path="/internacional/checkout" element={
                  <ProtectedRoute>
                    <StorefrontLayout />
                  </ProtectedRoute>
                }>
                  <Route path="courier" element={<InternationalCourier />} />
                  <Route path="review" element={<InternationalReview />} />
                  <Route path="success" element={<InternationalOrderPreview />} />
                </Route>

                <Route path="/artist" element={
                  <ProtectedRoute>
                    <Suspense fallback={<PageSkeleton />}>
                      <PortalLayout type="artist" />
                    </Suspense>
                  </ProtectedRoute>
                }>
                  <Route index element={<ArtistDashboard />} />
                </Route>
                
                <Route path="/affiliate" element={
                  <ProtectedRoute>
                    <Suspense fallback={<PageSkeleton />}>
                      <PortalLayout type="affiliate" />
                    </Suspense>
                  </ProtectedRoute>
                }>
                  <Route index element={<AffiliateDashboard />} />
                </Route>

                <Route path="/star2fan" element={
                  <ProtectedRoute>
                    <Suspense fallback={<PageSkeleton />}>
                      <PortalLayout type="star2fan" />
                    </Suspense>
                  </ProtectedRoute>
                }>
                  <Route index element={<Star2FanDashboard />} />
                </Route>

                {/* Auth */}
                <Route path="/login" element={<Login />} />
                <Route path="/login_vendors" element={<LoginVendors />} />
                {/* GodMode route removed — SEC-CRIT-01 */}

                {/* Admin */}
                <Route path="/admin" element={
                  <ProtectedRoute requireAdmin>
                    <Suspense fallback={<PageSkeleton />}>
                      <AdminLayout />
                    </Suspense>
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
                  <Route path="mercadolibre" element={<Navigate to="/admin/marketplace?tab=conexiones" replace />} />
                  <Route path="reports" element={<AdminReports />} />
                  <Route path="seo" element={<AdminSeo />} />
                  <Route path="media" element={<AdminMedia />} />
                  <Route path="settings" element={<AdminSettings />} />
                  <Route path="users" element={<AdminUsers />} />
                  <Route path="finances" element={<AdminFinances />} />
                  <Route path="logistics" element={<AdminLogistics />} />
                  <Route path="logistics-connections" element={<Navigate to="/admin/marketplace?tab=conexiones" replace />} />
                  <Route path="artists" element={<AdminArtists />} />
                  <Route path="tags" element={<AdminTags />} />
                  <Route path="automations" element={<AdminAutomations />} />
                  <Route path="marketplace" element={<MarketplaceGuard><AdminMarketplace /></MarketplaceGuard>} />
                  <Route path="vendors" element={<Navigate to="/admin/marketplace?tab=vendors" replace />} />
                  <Route path="vendor-payouts" element={<Navigate to="/admin/marketplace?tab=liquidaciones" replace />} />
                  <Route path="vendor-kyc" element={<Navigate to="/admin/marketplace?tab=kyc" replace />} />
                  <Route path="buybox" element={<Navigate to="/admin/marketplace?tab=analytics" replace />} />
                  <Route path="internacional/amazon" element={<AdminInternationalAmazon />} />
                  <Route path="internacional/productos" element={<AdminInternationalProducts />} />
                  <Route path="internacional/sync" element={<AdminInternationalSync />} />
                </Route>
                  </Routes>
                </Suspense>
                </CurrencyProvider>
              </LocaleProvider>
              </FeatureToggleProvider>
              </InternationalCartProvider>
            </CartProvider>
          </WishlistProvider>
          </AdminModeProvider>
        </AuthProvider>
      </AnalyticsProvider>
    </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
