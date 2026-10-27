// Маршруты приложения. Тяжёлые страницы подгружаются отдельными чанками.

import { lazy, useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router';
import { AppShell } from '@/client/components/layout/AppShell';
import { LandingPage } from '@/client/pages/LandingPage';

const AdminPage = lazy(() =>
  import('@/client/pages/AdminPage').then((module) => ({ default: module.AdminPage })),
);
const AuthPage = lazy(() =>
  import('@/client/pages/AuthPages').then((module) => ({ default: module.AuthPage })),
);
const OnboardingPage = lazy(() =>
  import('@/client/pages/AuthPages').then((module) => ({ default: module.OnboardingPage })),
);
const EditorPage = lazy(() =>
  import('@/client/pages/EditorPage').then((module) => ({ default: module.EditorPage })),
);
const ExplorePage = lazy(() =>
  import('@/client/pages/ExplorePage').then((module) => ({ default: module.ExplorePage })),
);
const FeedPage = lazy(() =>
  import('@/client/pages/FeedPage').then((module) => ({ default: module.FeedPage })),
);
const NotFoundPage = lazy(() =>
  import('@/client/pages/NotFoundPage').then((module) => ({ default: module.NotFoundPage })),
);
const NotificationsPage = lazy(() =>
  import('@/client/pages/NotificationsPage').then((module) => ({ default: module.NotificationsPage })),
);
const PostPage = lazy(() =>
  import('@/client/pages/PostPage').then((module) => ({ default: module.PostPage })),
);
const ProfilePage = lazy(() =>
  import('@/client/pages/ProfilePage').then((module) => ({ default: module.ProfilePage })),
);
const SettingsPage = lazy(() =>
  import('@/client/pages/SettingsPage').then((module) => ({ default: module.SettingsPage })),
);

/** Прокрутка вверх при смене страницы, но не при смене фильтров в той же ленте. */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname]);
  return null;
}

export function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<LandingPage />} />
          <Route path="feed" element={<FeedPage />} />
          <Route path="favorites" element={<FeedPage view="favorites" />} />
          <Route path="drafts" element={<FeedPage view="drafts" />} />
          <Route path="explore" element={<ExplorePage />} />
          <Route path="explore/:type" element={<ExplorePage />} />
          <Route path="post/:id" element={<PostPage />} />
          <Route path="new" element={<EditorPage />} />
          <Route path="u/:username" element={<ProfilePage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="admin" element={<AdminPage />} />
          <Route path="auth" element={<AuthPage />} />
          <Route path="onboarding" element={<OnboardingPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </>
  );
}
