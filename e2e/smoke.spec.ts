// Базовые e2e-сценарии: первый экран, честное состояние OAuth, лента после входа.
// Требует запущенного `npm run dev` и скачанного браузера Playwright.

import { expect, test } from '@playwright/test';

test('первый экран и состояние Google OAuth', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  await expect(page.getByText('Nuffy').first()).toBeVisible();

  await page.goto('/auth');
  await expect(page.getByText(/Авторизация ещё не настроена/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Продолжить с Google/i })).toBeVisible();
});

test('тестовый вход открывает ленту с реальными данными', async ({ page }) => {
  await page.goto('/auth');
  const input = page.locator('#dev-username');
  if (!(await input.isVisible().catch(() => false))) {
    test.skip(true, 'ENABLE_DEV_LOGIN выключен — сценарий входа недоступен');
  }
  await input.fill(`e2e_${Date.now().toString(36)}`);
  await page.getByRole('button', { name: 'Продолжить' }).click();
  await page.waitForURL(/\/feed/);

  await expect(page.getByRole('link', { name: 'Лента' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Фильтры/ })).toBeVisible();
  await expect(page.locator('main')).not.toContainText('Внутренняя ошибка');
});

test('страница 404 не тупик', async ({ page }) => {
  await page.goto('/this-route-does-not-exist');
  await expect(page.getByText('Здесь ничего нет')).toBeVisible();
  await expect(page.getByRole('link', { name: /В ленту/ })).toBeVisible();
});
