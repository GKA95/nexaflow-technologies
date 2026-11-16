import React, { Suspense, lazy } from 'react';
import { Layout } from './components/Layout';
import { AppProvider, useApp } from './context/AppContext';

const AdminGatePage = lazy(() =>
  import('./pages/admin/AdminGatePage').then((m) => ({ default: m.AdminGatePage }))
);
const CoursePlayerPage = lazy(() =>
  import('./pages/learner/CoursePlayerPage').then((m) => ({ default: m.CoursePlayerPage }))
);
const LearnerDashboardPage = lazy(() =>
  import('./pages/learner/LearnerDashboardPage').then((m) => ({ default: m.LearnerDashboardPage }))
);
const PaymentVerifyPage = lazy(() =>
  import('./pages/learner/PaymentVerifyPage').then((m) => ({ default: m.PaymentVerifyPage }))
);
const AboutPage = lazy(() =>
  import('./pages/public/AboutPage').then((m) => ({ default: m.AboutPage }))
);
const ArticleDetailPage = lazy(() =>
  import('./pages/public/ArticleDetailPage').then((m) => ({ default: m.ArticleDetailPage }))
);
const AuthPage = lazy(() =>
  import('./pages/public/AuthPage').then((m) => ({ default: m.AuthPage }))
);
const ContactPage = lazy(() =>
  import('./pages/public/ContactPage').then((m) => ({ default: m.ContactPage }))
);
const CourseDetailPage = lazy(() =>
  import('./pages/public/CourseDetailPage').then((m) => ({ default: m.CourseDetailPage }))
);
const HomePage = lazy(() =>
  import('./pages/public/HomePage').then((m) => ({ default: m.HomePage }))
);
const InsightsPage = lazy(() =>
  import('./pages/public/InsightsPage').then((m) => ({ default: m.InsightsPage }))
);
const LearnCataloguePage = lazy(() =>
  import('./pages/public/LearnCataloguePage').then((m) => ({ default: m.LearnCataloguePage }))
);
const LegalPage = lazy(() =>
  import('./pages/public/LegalPage').then((m) => ({ default: m.LegalPage }))
);
const ProductDetailPage = lazy(() =>
  import('./pages/public/ProductDetailPage').then((m) => ({ default: m.ProductDetailPage }))
);
const ProductsPage = lazy(() =>
  import('./pages/public/ProductsPage').then((m) => ({ default: m.ProductsPage }))
);
const ServiceDetailPage = lazy(() =>
  import('./pages/public/ServiceDetailPage').then((m) => ({ default: m.ServiceDetailPage }))
);
const SolutionsPage = lazy(() =>
  import('./pages/public/SolutionsPage').then((m) => ({ default: m.SolutionsPage }))
);

function PageLoadingFallback({ dark = false }: { dark?: boolean }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`min-h-[45vh] flex items-center justify-center px-4 py-16 text-sm ${
        dark ? 'bg-[#03051B] text-[#AEB8D4]' : 'text-[#4A5578] dark:text-[#AEB8D4]'
      }`}
    >
      <div className="flex items-center gap-3">
        <span className="h-4 w-4 rounded-full border-2 border-[#176BFF]/30 border-t-[#00D4FF] animate-spin" />
        <span>Loading view...</span>
      </div>
    </div>
  );
}

function RouteView() {
  const { currentPath, navigate } = useApp();
  const path = currentPath === '/' ? '/' : currentPath.replace(/\/+$/, '');

  // Dedicated Protected Admin Portal (not wrapped in public header/footer)
  if (path === '/portal-admin' || path.startsWith('/portal-admin/')) {
    return (
      <Suspense fallback={<PageLoadingFallback dark />}>
        <AdminGatePage />
      </Suspense>
    );
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
          className="mt-6 min-h-[44px] rounded-lg bg-[#176BFF] px-5 py-2.5 text-sm font-semibold text-white"
        >
          Return Home
        </button>
      </div>
    );
  }

  return (
    <Layout>
      <Suspense fallback={<PageLoadingFallback />}>{pageContent}</Suspense>
    </Layout>
  );
}

export default function App() {
  return (
    <AppProvider>
      <RouteView />
    </AppProvider>
  );
}
