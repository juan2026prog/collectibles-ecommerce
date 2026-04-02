import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { CartProvider } from './contexts/CartContext';
import { FeatureToggleProvider } from './contexts/FeatureToggleContext';
import AnalyticsProvider from './contexts/AnalyticsContext';
import ProtectedRoute from './components/ProtectedRoute';
import { LocaleProvider } from './contexts/LocaleContext';

import StorefrontLayout from './layouts/StorefrontLayout';
import AdminLayout from './layouts/AdminLayout';
import PortalLayout from './layouts/PortalLayout';

import Home from './pages/Home';
import Shop from './pages/Shop';
import ProductDetail from './pages/ProductDetail';
import Cart from './pages/Cart';
import Checkout from './pages/Checkout';
import CheckoutSuccess from './pages/CheckoutSuccess';
import MLCallback from './pages/MLCallback';
import Callback from './pages/Callback';
import DynamicPage from './pages/DynamicPage';
import Login from './pages/Login';
import CustomerPortal from './pages/CustomerPortal';
import VendorDashboard from './pages/VendorDashboard';
import ArtistDashboard from './pages/ArtistDashboard';
import AffiliateDashboard from './pages/AffiliateDashboard';
import Star2FanDashboard from './pages/Star2FanDashboard';
import AdminDashboard from './pages/AdminDashboard';
import AdminProducts from './pages/admin/AdminProducts';
import AdminOrders from './pages/admin/AdminOrders';
import AdminPages from './pages/admin/AdminPages';
import AdminCategories from './pages/admin/AdminCategories';
import AdminCustomers from './pages/admin/AdminCustomers';
import AdminCoupons from './pages/admin/AdminCoupons';
import AdminBanners from './pages/admin/AdminBanners';
import AdminSettings from './pages/admin/AdminSettings';
import AdminMedia from './pages/admin/AdminMedia';
import AdminBrands from './pages/admin/AdminBrands';
import AdminGroups from './pages/admin/AdminGroups';
import AdminBadges from './pages/admin/AdminBadges';
import AdminPromotions from './pages/admin/AdminPromotions';
import AdminAffiliates from './pages/admin/AdminAffiliates';
import AdminMailing from './pages/admin/AdminMailing';
import AdminMercadoLibre from './pages/admin/AdminMercadoLibre';
import AdminReports from './pages/admin/AdminReports';
import AdminSeo from './pages/admin/AdminSeo';
import AdminUsers from './pages/admin/AdminUsers';
import AdminFinances from './pages/admin/AdminFinances';
import AdminLogistics from './pages/admin/AdminLogistics';
import AdminArtists from './pages/admin/AdminArtists';
import AdminTags from './pages/admin/AdminTags';
import GodMode from './pages/GodMode';
import { useReferralTracking } from './hooks/useReferralTracking';

function ReferralTracker() {
  useReferralTracking();
  return null;
}

function App() {
  return (
    <BrowserRouter>
      <ReferralTracker />
      <AuthProvider>
        <CartProvider>
          <FeatureToggleProvider>
            <AnalyticsProvider>
              <LocaleProvider>
              <Routes>
                {/* Public Storefront */}
                <Route element={<StorefrontLayout />}>
                  <Route path="/" element={<Home />} />
                  <Route path="/shop" element={<Shop />} />
                  <Route path="/p/:slug" element={<ProductDetail />} />
                  <Route path="/page/:slug" element={<DynamicPage />} />
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
              <Route path="/godmode" element={<GodMode />} />

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
              </LocaleProvider>
            </AnalyticsProvider>
          </FeatureToggleProvider>
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
