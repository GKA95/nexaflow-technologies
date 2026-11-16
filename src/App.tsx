import { Layout } from './components/Layout';
import { AppProvider, useApp } from './context/AppContext';
import { AdminGatePage } from './pages/admin/AdminGatePage';
import { CoursePlayerPage } from './pages/learner/CoursePlayerPage';
import { LearnerDashboardPage } from './pages/learner/LearnerDashboardPage';
import { PaymentVerifyPage } from './pages/learner/PaymentVerifyPage';
import { AboutPage } from './pages/public/AboutPage';
import { ArticleDetailPage } from './pages/public/ArticleDetailPage';
import { AuthPage } from './pages/public/AuthPage';
import { ContactPage } from './pages/public/ContactPage';
import { CourseDetailPage } from './pages/public/CourseDetailPage';
import { HomePage } from './pages/public/HomePage';
import { InsightsPage } from './pages/public/InsightsPage';
import { LearnCataloguePage } from './pages/public/LearnCataloguePage';
import { LegalPage } from './pages/public/LegalPage';
import { ProductDetailPage } from './pages/public/ProductDetailPage';
import { ProductsPage } from './pages/public/ProductsPage';
import { ServiceDetailPage } from './pages/public/ServiceDetailPage';
import { SolutionsPage } from './pages/public/SolutionsPage';

function RouteView() {
  const { currentPath, navigate } = useApp();
  const path = currentPath === '/' ? '/' : currentPath.replace(/\/+$/, '');

  // Dedicated Protected Admin Portal (not wrapped in public header/footer)
  if (path === '/portal-admin' || path.startsWith('/portal-admin/')) {
    return <AdminGatePage />;
  }

  let pageContent: React.ReactNode;

  if (path === '/') {
    pageContent = <HomePage />;
  } else if (path === '/about') {
    pageContent = <AboutPage />;
  } else if (path === '/solutions') {
    pageContent = <SolutionsPage />;
  } else if (path.startsWith('/solutions/')) {
    const slug = path.slice('/solutions/'.length);
    pageContent = <ServiceDetailPage slug={slug} />;
  } else if (path === '/products') {
    pageContent = <ProductsPage />;
  } else if (path.startsWith('/products/')) {
    const slug = path.slice('/products/'.length);
    pageContent = <ProductDetailPage slug={slug} />;
  } else if (path === '/learn') {
    pageContent = <LearnCataloguePage />;
  } else if (path.startsWith('/learn/')) {
    const slug = path.slice('/learn/'.length);
    pageContent = <CourseDetailPage slug={slug} />;
  } else if (path === '/insights') {
    pageContent = <InsightsPage />;
  } else if (path.startsWith('/insights/')) {
    const slug = path.slice('/insights/'.length);
    pageContent = <ArticleDetailPage slug={slug} />;
  } else if (path === '/contact') {
    pageContent = <ContactPage />;
  } else if (path === '/legal/privacy') {
    pageContent = <LegalPage type="privacy" />;
  } else if (path === '/legal/terms') {
    pageContent = <LegalPage type="terms" />;
  } else if (path === '/legal/cookies') {
    pageContent = <LegalPage type="cookies" />;
  } else if (path === '/legal/refund') {
    pageContent = <LegalPage type="refund" />;
  } else if (path === '/auth' || path === '/login' || path === '/auth/login') {
    pageContent = <AuthPage mode="login" />;
  } else if (path === '/register' || path === '/auth/register') {
    pageContent = <AuthPage mode="register" />;
  } else if (path === '/auth/forgot-password') {
    pageContent = <AuthPage mode="forgot" />;
  } else if (path === '/auth/reset-password') {
    pageContent = <AuthPage mode="reset" />;
  } else if (path === '/learner') {
    pageContent = <LearnerDashboardPage />;
  } else if (path === '/learner/payment/verify') {
    pageContent = <PaymentVerifyPage />;
  } else if (path.startsWith('/learner/courses/')) {
    const slug = path.slice('/learner/courses/'.length);
    pageContent = <CoursePlayerPage slug={slug} />;
  } else {
    pageContent = (
      <div className="max-w-xl mx-auto px-4 py-24 text-center">
        <p className="text-xs font-mono text-[#00D4FF]">404</p>
        <h1 className="mt-2 text-2xl font-bold">Page Not Found</h1>
        <p className="mt-2 text-sm text-[#4A5578] dark:text-[#AEB8D4]">
          The page you requested does not exist or has moved.
        </p>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="mt-6 rounded-lg bg-[#176BFF] px-5 py-2.5 text-sm font-semibold text-white"
        >
          Return Home
        </button>
      </div>
    );
  }

  return <Layout>{pageContent}</Layout>;
}

export default function App() {
  return (
    <AppProvider>
      <RouteView />
    </AppProvider>
  );
}
