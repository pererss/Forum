// Маршруты приложения.

import { useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router';
import { AppShell } from '@/client/components/layout/AppShell';
import { AdminPage } from '@/client/pages/AdminPage';
import { AuthPage, OnboardingPage } from '@/client/pages/AuthPages';
import { EditorPage } from '@/client/pages/EditorPage';
import { ExplorePage } from '@/client/pages/ExplorePage';
import { FeedPage } from '@/client/pages/FeedPage';
import { LandingPage } from '@/client/pages/LandingPage';
import { NotFoundPage } from '@/client/pages/NotFoundPage';
import { NotificationsPage } from '@/client/pages/NotificationsPage';
import { PostPage } from '@/client/pages/PostPage';
import { ProfilePage } from '@/client/pages/ProfilePage';
import { SettingsPage } from '@/client/pages/SettingsPage';

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
