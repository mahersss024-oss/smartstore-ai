import { expect, takeSnapshot, test } from '@chromatic-com/playwright';

test.describe('Visual testing', () => {
  test.describe('Static pages', () => {
    test('should take screenshot of the homepage', async ({ page }, testInfo) => {
      await page.goto('/ar');

      await expect(page.getByText('كل ما يحتاجه المتجر للتشغيل والبيع')).toBeVisible();

      await takeSnapshot(page, testInfo);
    });

    test('should take screenshot of the French homepage', async ({ page }, testInfo) => {
      await page.goto('/fr');

      await expect(page.getByText(/Une couche operationnelle pratique/)).toBeVisible();

      await takeSnapshot(page, testInfo);
    });
  });
});
