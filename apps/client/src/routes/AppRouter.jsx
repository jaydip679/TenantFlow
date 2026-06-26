import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useSelector } from "react-redux";
import LoadingSpinner from "../components/common/LoadingSpinner.jsx";
import ProtectedRoute from "../components/common/ProtectedRoute.jsx";

// Lazy page imports
const LandingPage         = lazy(() => import("../pages/LandingPage.jsx"));
const LoginPage           = lazy(() => import("../pages/auth/LoginPage.jsx"));
const RegisterPage        = lazy(() => import("../pages/auth/RegisterPage.jsx"));
const ForgotPasswordPage  = lazy(() => import("../pages/auth/ForgotPasswordPage.jsx"));
const ResetPasswordPage   = lazy(() => import("../pages/auth/ResetPasswordPage.jsx"));
const UnauthorizedPage    = lazy(() => import("../pages/UnauthorizedPage.jsx"));

const DashboardPage       = lazy(() => import("../pages/dashboard/DashboardPage.jsx"));
const InvoicesPage        = lazy(() => import("../pages/billing/InvoicesPage.jsx"));
const PaymentsPage        = lazy(() => import("../pages/billing/PaymentHistoryPage.jsx"));
const SubscriptionPage    = lazy(() => import("../pages/settings/SubscriptionPage.jsx"));
const MembersPage         = lazy(() => import("../pages/settings/MembersPage.jsx"));

const AdminDashboardPage  = lazy(() => import("../pages/admin/AdminDashboardPage.jsx"));
const AdminTenantsPage    = lazy(() => import("../pages/admin/TenantsPage.jsx"));
const AdminInvoicesPage   = lazy(() => import("../pages/admin/AdminInvoicesPage.jsx"));
const AdminDunningPage    = lazy(() => import("../pages/admin/DunningPage.jsx"));
const AdminChurnRiskPage  = lazy(() => import("../pages/admin/ChurnRiskPage.jsx"));
const AdminQueuesPage     = lazy(() => import("../pages/admin/AdminQueuesPage.jsx"));
const TenantDetailPage    = lazy(() => import("../pages/admin/TenantDetailPage.jsx"));

function RootRedirect() {
  const { isAuthenticated, user } = useSelector((s) => s.auth);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  switch (user?.role) {
    case "super_admin":   return <Navigate to="/admin"     replace />;
    case "tenant_admin":
    case "tenant_member": return <Navigate to="/dashboard" replace />;
    default:              return <Navigate to="/login"     replace />;
  }
}

function PageLoader() {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "100vh",
      background: "linear-gradient(135deg,#0f0f1a 0%,#1a1a2e 50%,#16213e 100%)",
    }}>
      <LoadingSpinner size={56} />
    </div>
  );
}

const TENANT_ROLES = ["tenant_admin", "tenant_member"];
const ADMIN_ROLES  = ["super_admin"];

function TRoute({ element }) {
  return <ProtectedRoute allowedRoles={TENANT_ROLES}>{element}</ProtectedRoute>;
}
function ARoute({ element }) {
  return <ProtectedRoute allowedRoles={ADMIN_ROLES}>{element}</ProtectedRoute>;
}

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/"                      element={<LandingPage />} />

          {/* Public */}
          <Route path="/login"           element={<LoginPage />} />
          <Route path="/register"        element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password"  element={<ResetPasswordPage />} />
          <Route path="/unauthorized"    element={<UnauthorizedPage />} />

          {/* Tenant */}
          <Route path="/dashboard"              element={<TRoute element={<DashboardPage />} />} />
          <Route path="/dashboard/invoices"     element={<TRoute element={<InvoicesPage />} />} />
          <Route path="/dashboard/payments"     element={<TRoute element={<PaymentsPage />} />} />
          <Route path="/dashboard/subscription" element={<TRoute element={<SubscriptionPage />} />} />
          <Route path="/dashboard/members"      element={<TRoute element={<MembersPage />} />} />

          {/* Super Admin */}
          <Route path="/admin"                         element={<ARoute element={<AdminDashboardPage />} />} />
          <Route path="/admin/tenants"                 element={<ARoute element={<AdminTenantsPage />} />} />
          <Route path="/admin/tenants/:tenantId"       element={<ARoute element={<TenantDetailPage />} />} />
          <Route path="/admin/invoices"                element={<ARoute element={<AdminInvoicesPage />} />} />
          <Route path="/admin/dunning"                 element={<ARoute element={<AdminDunningPage />} />} />
          <Route path="/admin/churn-risk"              element={<ARoute element={<AdminChurnRiskPage />} />} />
          <Route path="/admin/queues"                  element={<ARoute element={<AdminQueuesPage />} />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
