import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import { AuthProvider } from "@/contexts/AuthContext";
import { TenantProvider } from "@/contexts/TenantContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { ScrollToTop } from "@/components/ScrollToTop";

import Index from "./pages/Index";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";

import PublicStoreLayout from "@/components/layouts/PublicStoreLayout";
import PublicStoreHome from "@/pages/public/PublicStoreHome";
import PublicProductDetail from "@/pages/public/PublicProductDetail";
import PublicCart from "@/pages/public/PublicCart";
import PublicCheckout from "@/pages/public/PublicCheckout";
import PublicOrderTracking from "@/pages/public/PublicOrderTracking";
import PublicPixPayment from "@/pages/public/PublicPixPayment";
import PublicCustomerAuth from "@/pages/public/PublicCustomerAuth";
import PublicMyAccount from "@/pages/public/PublicMyAccount";

import AdminLayout from "@/components/layouts/AdminLayout";
import AdminDashboard from "@/pages/admin/AdminDashboard";
import AdminOrders from "@/pages/admin/AdminOrders";
import AdminOrderDetail from "@/pages/admin/AdminOrderDetail";
import AdminProducts from "@/pages/admin/AdminProducts";
import AdminCategories from "@/pages/admin/AdminCategories";
import AdminShipping from "@/pages/admin/AdminShipping";
import AdminSettings from "@/pages/admin/AdminSettings";
import MercadoPagoCallback from "@/pages/admin/MercadoPagoCallback";
import { PlaceholderPage } from "@/components/PlaceholderPage";
import SuperAdminLayout from "@/components/layouts/SuperAdminLayout";
import SuperAdminDashboard from "@/pages/super-admin/SuperAdminDashboard";
import { resolveTenantSlug } from "@/lib/tenant";

const queryClient = new QueryClient();

const App = () => {
  const isSubdomainTenant = !!resolveTenantSlug();

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <ScrollToTop />
          <AuthProvider>
            <Routes>
              {isSubdomainTenant ? (
                <>
                  {/* Storefront directly on root when in a tenant subdomain */}
                  <Route
                    path="/"
                    element={
                      <TenantProvider>
                        <PublicStoreLayout />
                      </TenantProvider>
                    }
                  >
                    <Route index element={<PublicStoreHome />} />
                    <Route path="produto/:productId" element={<PublicProductDetail />} />
                    <Route path="carrinho" element={<PublicCart />} />
                    <Route path="checkout" element={<PublicCheckout />} />
                    <Route path="pedido/:orderId" element={<PublicOrderTracking />} />
                    <Route path="pagar/:orderId" element={<PublicPixPayment />} />
                    <Route path="conta" element={<PublicCustomerAuth />} />
                    <Route path="minha-conta" element={<PublicMyAccount />} />
                  </Route>

                  {/* Store admin accessible on subdomain */}
                  <Route
                    path="/admin"
                    element={
                      <ProtectedRoute>
                        <AdminLayout />
                      </ProtectedRoute>
                    }
                  >
                    <Route index element={<AdminDashboard />} />
                    <Route path="produtos" element={<AdminProducts />} />
                    <Route path="categorias" element={<AdminCategories />} />
                    <Route path="pedidos" element={<AdminOrders />} />
                    <Route path="pedidos/:orderId" element={<AdminOrderDetail />} />
                    <Route path="clientes" element={<PlaceholderPage title="Clientes" />} />
                    <Route path="entregas" element={<AdminShipping />} />
                    <Route path="configuracoes" element={<AdminSettings />} />
                    <Route path="oauth/mercadopago/callback" element={<MercadoPagoCallback />} />
                  </Route>
                </>
              ) : (
                <>
                  {/* Main domain: marketing website & onboarding */}
                  <Route path="/" element={<Index />} />
                  <Route path="/login" element={<Login />} />

                  {/* Fallback route-based storefront for easy testing/sharing */}
                  <Route
                    path="/loja/:slug"
                    element={
                      <TenantProvider fromRoute>
                        <PublicStoreLayout />
                      </TenantProvider>
                    }
                  >
                    <Route index element={<PublicStoreHome />} />
                    <Route path="produto/:productId" element={<PublicProductDetail />} />
                    <Route path="carrinho" element={<PublicCart />} />
                    <Route path="checkout" element={<PublicCheckout />} />
                    <Route path="pedido/:orderId" element={<PublicOrderTracking />} />
                    <Route path="pagar/:orderId" element={<PublicPixPayment />} />
                    <Route path="conta" element={<PublicCustomerAuth />} />
                    <Route path="minha-conta" element={<PublicMyAccount />} />
                  </Route>

                  {/* Store admin on main domain */}
                  <Route
                    path="/admin"
                    element={
                      <ProtectedRoute>
                        <AdminLayout />
                      </ProtectedRoute>
                    }
                  >
                    <Route index element={<AdminDashboard />} />
                    <Route path="produtos" element={<AdminProducts />} />
                    <Route path="categorias" element={<AdminCategories />} />
                    <Route path="pedidos" element={<AdminOrders />} />
                    <Route path="pedidos/:orderId" element={<AdminOrderDetail />} />
                    <Route path="clientes" element={<PlaceholderPage title="Clientes" />} />
                    <Route path="entregas" element={<AdminShipping />} />
                    <Route path="configuracoes" element={<AdminSettings />} />
                    <Route path="oauth/mercadopago/callback" element={<MercadoPagoCallback />} />
                  </Route>

                  {/* Platform super admin */}
                  <Route
                    path="/super-admin"
                    element={
                      <ProtectedRoute requireSuperAdmin>
                        <SuperAdminLayout />
                      </ProtectedRoute>
                    }
                  >
                    <Route index element={<SuperAdminDashboard />} />
                  </Route>
                </>
              )}

              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
