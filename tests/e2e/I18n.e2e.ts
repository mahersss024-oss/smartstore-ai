import { expect, test } from '@playwright/test';

test.describe('I18n', () => {
  test.describe('Language Switching', () => {
    test('should switch language from Arabic to French using dropdown and verify text on the homepage', async ({ page }) => {
      await page.goto('/ar');

      await expect(page.getByText('كل ما يحتاجه المتجر للتشغيل والبيع')).toBeVisible();

      await page.getByRole('button', { name: 'تغيير اللغة' }).click();
      await page.getByRole('menuitemradio', { name: /Français/ }).click();

      await expect(page).toHaveURL(/\/fr$/);
      await expect(page.getByText(/Une couche operationnelle pratique/)).toBeVisible();
    });

    test('should render Arabic, French, and English sign-in routes', async ({ request }) => {
      test.slow();

      const arabicResponse = await request.get('/ar/sign-in');

      expect(arabicResponse.ok()).toBe(true);

      const frenchResponse = await request.get('/fr/sign-in');

      expect(frenchResponse.ok()).toBe(true);
      await expect(frenchResponse.text()).resolves.toContain('Se connecter');

      const englishResponse = await request.get('/en/sign-in');

      expect(englishResponse.ok()).toBe(true);
      await expect(englishResponse.text()).resolves.toContain('Sign in');
    });

    test('should keep the root route on Arabic even when a French locale cookie exists', async ({ request }) => {
      const response = await request.get('/', {
        headers: {
          Cookie: 'NEXT_LOCALE=fr',
        },
        maxRedirects: 0,
      });

      expect(response.ok()).toBe(true);
      expect(response.headers().location).toBeUndefined();
      await expect(response.text()).resolves.toContain('lang="ar"');
    });
  });
});
