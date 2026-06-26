import { useSelector } from 'react-redux';
import AppRouter from './routes/AppRouter.jsx';
import AIChatWidget from './components/ai/AIChatWidget.jsx';

/**
 * App root
 * - Renders the router for all pages
 * - Renders the floating AI chat widget for authenticated tenant users
 *   (super_admin has the widget embedded in AdminDashboard, so skip it here)
 */
export default function App() {
  const { isAuthenticated, user } = useSelector((s) => s.auth);

  // Show floating AI widget only for tenant roles that have ai_assistant feature
  const showAIWidget =
    isAuthenticated &&
    ['tenant_admin', 'tenant_member'].includes(user?.role) &&
    user?.plan?.features?.ai_assistant === true;

  return (
    <>
      <AppRouter />
      {showAIWidget && <AIChatWidget />}
    </>
  );
}
