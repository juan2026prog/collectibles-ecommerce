import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
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
import InternationalStorefront from './pages/InternationalStorefront';
import InternationalCart from './pages/international/InternationalCart';
import InternationalCourier from './pages/international/InternationalCourier';
import InternationalReview from './pages/international/InternationalReview';
import InternationalOrderPreview from './pages/international/InternationalOrderPreview';

import StorefrontLayout from './layouts/StorefrontLayout';
import Home from './pages/Home';

const AdminLayout = lazy(() => import('./layouts/AdminLayout'));
const PortalLayout = lazy(() => import('./layouts/PortalLayout'));
const VendorLayout = lazy(() => import('./layouts/VendorLayout'));

// Public Storefront (Lazy)
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
const VendorPrueba = lazy(() => import('./pages/VendorPrueba'));
const LicensesIndex = lazy(() => import('./pages/LicensesIndex'));
const ThemesIndex = lazy(() => import('./pages/ThemesIndex'));

// Auth (Lazy)
const Login = lazy(() => import('./pages/Login'));
const LoginVendors = lazy(() => import('./pages/LoginVendors'));

// Portals (Lazy)
const CustomerPortal = lazy(() => import('./pages/CustomerPortal'));
const Wishlist = lazy(() => import('./pages/Wishlist'));
const VendorDashboard = lazy(() => import('./pages/VendorDashboard'));
const VendorOnboarding = lazy(() => import('./pages/VendorOnboarding'));
const ArtistDashboard = lazy(() => import('./pages/ArtistDashboard'));
const AffiliateDashboard = lazy(() => import('./pages/AffiliateDashboard'));
const Star2FanDashboard = lazy(() => import('./pages/Star2FanDashboard'));

// Admin (Lazy)
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const AdminProducts = lazy(() => import('./pages/admin/AdminProducts'));
const AdminOrders = lazy(() => import('./pages/admin/AdminOrders'));
const AdminPages = lazy(() => import('./pages/admin/AdminPages'));
const AdminCategories = lazy(() => import('./pages/admin/AdminCategories'));
const AdminLicenses = lazy(() => import('./pages/admin/AdminLicenses'));
const AdminThemes = lazy(() => import('./pages/admin/AdminThemes'));
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
const AdminSourcingImport = lazy(() => import('./pages/admin/AdminSourcingImport'));
const AdminInternationalAmazon = lazy(() => import('./pages/admin/AdminInternationalAmazon'));
const AdminInternationalProducts = lazy(() => import('./pages/admin/AdminInternationalProducts'));
const AdminInternationalSync = lazy(() => import('./pages/admin/AdminInternationalSync'));
const AdminRefunds = lazy(() => import('./pages/admin/AdminRefunds'));
const AdminZinc = lazy(() => import('./pages/admin/AdminZinc'));

// Collector Plugins (6 official modules)
// 01. AI Search
const AISearchPage = lazy(() => import('./pages/AISearchPage'));
const AdminAISearch = lazy(() => import('./pages/admin/AdminAISearch'));

// 02. Radar & Release Calendar
const RadarFeedPage = lazy(() => import('./pages/radar/RadarFeedPage'));
const ReleaseDetailPage = lazy(() => import('./pages/radar/ReleaseDetailPage'));
const ReleaseCalendarPage = lazy(() => import('./pages/radar/ReleaseCalendarPage'));
const AdminRadar = lazy(() => import('./pages/admin/AdminRadar'));

// 03. My Vault
const VaultDashboard = lazy(() => import('./pages/vault/VaultDashboard'));
const VaultItemDetail = lazy(() => import('./pages/vault/VaultItemDetail'));
const PublicCollectorProfile = lazy(() => import('./pages/vault/PublicCollectorProfile'));
const AdminVault = lazy(() => import('./pages/admin/AdminVault'));

// 04. Collector Compare
const ComparePage = lazy(() => import('./pages/compare/ComparePage'));
const AdminCompare = lazy(() => import('./pages/admin/AdminCompare'));
import { CompareProvider } from './contexts/CompareContext';

// 05. Collector Academy
const AcademyHome = lazy(() => import('./pages/academy/AcademyHome'));
const AcademyArticlePage = lazy(() => import('./pages/academy/AcademyArticlePage'));
const AdminAcademy = lazy(() => import('./pages/admin/AdminAcademy'));

// GodMode removed from production — SEC-CRIT-01 (hardcoded credentials)
import { useReferralTracking } from './hooks/useReferralTracking';
import MetaPixelTracker from './components/MetaPixelTracker';
import MarketplaceGuard from './components/MarketplaceGuard';
import VendorRouteGuard from './components/VendorRouteGuard';

function ReferralTracker() {
  useReferralTracking();
  return null;
}

function NavigateToThemeDetail() {
  const { slug } = useParams();
  return <Navigate to={`/themes/${slug || ''}`} replace />;
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
              <CompareProvider>
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
                    <Route path="/licencias" element={<LicensesIndex />} />
                    <Route path="/licencias/:licenseSlug" element={<Shop />} />
                    <Route path="/themes" element={<ThemesIndex />} />
                    <Route path="/themes/:themeSlug" element={<Shop />} />
                    <Route path="/temas" element={<Navigate to="/themes" replace />} />
                    <Route path="/temas/:slug" element={<NavigateToThemeDetail />} />
                    <Route path="/producto/:slug" element={<ProductDetail />} />
                    <Route path="/p/:slug" element={<ProductDetail />} />
                    <Route path="/store/:slug" element={<MarketplaceGuard><VendorStorefront /></MarketplaceGuard>} />
                    <Route path="/page/:slug" element={<DynamicPage />} />
                    <Route path="/collection/:slug" element={<Shop />} />
                    <Route path="/intl" element={<InternationalStorefront />} />
                    <Route path="/internacional" element={<ProtectedRoute requireAdmin><InternationalLaboratory /></ProtectedRoute>} />
                    <Route path="/about" element={<Navigate to="/page/nosotros" replace />} />
                    <Route path="/contact" element={<Contact />} />
                    <Route path="/vendor_prueba" element={<VendorPrueba />} />
                    <Route path="/terms" element={<Navigate to="/page/terminos" replace />} />
                    <Route path="/privacy" element={<Navigate to="/page/pol-ticas-de-privacidad" replace />} />
                    <Route path="/help" element={<Navigate to="/page/condiciones-de-compra" replace />} />
                    <Route path="/cart" element={<Cart />} />
                    <Route path="/checkout" element={<Checkout />} />
                    <Route path="/checkout/success" element={<CheckoutSuccess />} />
                    <Route path="/auth/callback" element={<MLCallback />} />
                    <Route path="/vendor/ml/callback" element={<VendorMLCallback />} />
                    <Route path="/vendor/settings/logistics" element={<Navigate to="/vendor?tab=settings&sub=shipping" replace />} />
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

                    {/* Collector Compare */}
                    <Route path="/compare" element={<ComparePage />} />

                    {/* 01. AI Search */}
                    <Route path="/ai-search" element={<AISearchPage />} />

                    {/* 02. Radar & Release Calendar */}
                    <Route path="/radar" element={<RadarFeedPage />} />
                    <Route path="/radar/:slug" element={<ReleaseDetailPage />} />
                    <Route path="/releases" element={<ReleaseCalendarPage />} />

                    {/* 03. My Vault */}
                    <Route path="/vault" element={<ProtectedRoute><VaultDashboard /></ProtectedRoute>} />
                    <Route path="/vault/item/:id" element={<ProtectedRoute><VaultItemDetail /></ProtectedRoute>} />
                    <Route path="/collector/:username" element={<PublicCollectorProfile />} />

                    {/* 05. Collector Academy */}
                    <Route path="/academy" element={<AcademyHome />} />
                    <Route path="/academy/:slug" element={<AcademyArticlePage />} />
                  </Route>

                {/* Isolated Portals with Lateral Navigation */}
                <Route path="/vendor" element={
                  <ProtectedRoute requireVendor>
                    <VendorRouteGuard>
                      <MarketplaceGuard>
                      <Suspense fallback={<PageSkeleton />}>
                        <VendorLayout />
                      </Suspense>
                      </MarketplaceGuard>
                    </VendorRouteGuard>
                  </ProtectedRoute>
                }>
                  <Route index element={<VendorDashboard />} />
                </Route>
                
                <Route path="/vendor/accept-terms" element={
                  <ProtectedRoute requireVendor>
                    <VendorRouteGuard>
                      <Navigate to="/vendor" replace />
                    </VendorRouteGuard>
                  </ProtectedRoute>
                } />

                <Route path="/vendor/onboarding" element={
                  <ProtectedRoute requireVendor>
                    <VendorRouteGuard>
                      <VendorOnboarding />
                    </VendorRouteGuard>
                  </ProtectedRoute>
                } />
                
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
                  <Route path="compare" element={<AdminCompare />} />
                  <Route path="ai-search" element={<AdminAISearch />} />
                  <Route path="radar" element={<AdminRadar />} />
                  <Route path="vault" element={<AdminVault />} />
                  <Route path="academy" element={<AdminAcademy />} />
                  <Route path="products" element={<AdminProducts />} />
                  <Route path="pages" element={<AdminPages />} />
                  <Route path="orders" element={<AdminOrders />} />
                  <Route path="categories" element={<AdminCategories />} />
                  <Route path="licenses" element={<AdminLicenses />} />
                  <Route path="themes" element={<AdminThemes />} />
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
                  <Route path="refunds" element={<AdminRefunds />} />
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
                  <Route path="internacional/sourcing" element={<AdminSourcingImport />} />
                  <Route path="internacional/amazon" element={<AdminInternationalAmazon />} />
                  <Route path="internacional/productos" element={<AdminInternationalProducts />} />
                  <Route path="internacional/sync" element={<AdminInternationalSync />} />
                  <Route path="internacional/zinc" element={<AdminZinc />} />
                </Route>
                  </Routes>
                </Suspense>
                </CurrencyProvider>
              </LocaleProvider>
              </FeatureToggleProvider>
              </InternationalCartProvider>
              </CompareProvider>
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
