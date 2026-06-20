import { getTranslations, setRequestLocale } from 'next-intl/server';
import { createProduct, createProductsBulk } from '@/features/dashboard/ProductActions';
import { TitleBar } from '@/features/dashboard/TitleBar';

export default async function NewProductPage(props: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    duplicateProductId?: string;
    limit?: string;
    productError?: string;
  }>;
}) {
  const { locale } = await props.params;
  const { duplicateProductId, limit, productError } = await props.searchParams;
  setRequestLocale(locale);
  const t = await getTranslations({
    locale,
    namespace: 'ProductsPage',
  });

  return (
    <>
      <TitleBar
        title={t('new_title_bar')}
        description={t('new_title_bar_description')}
      />

      {limit && (
        <div className="
          mb-5 rounded-xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm
        "
        >
          <div className="font-semibold text-amber-700">
            {t('subscription_limit_title')}
          </div>
          <p className="mt-1 text-muted-foreground">
            {limit === 'storageMb'
              ? t('subscription_limit_storage')
              : t('subscription_limit_products')}
          </p>
        </div>
      )}

      {productError === 'duplicate' && (
        <div className="
          mb-5 rounded-xl border border-destructive/25 bg-destructive/10 p-4
          text-sm
        "
        >
          <div className="font-semibold text-destructive">
            {t('duplicate_product_title')}
          </div>
          <p className="mt-1 text-muted-foreground">
            {duplicateProductId
              ? t('duplicate_product_description_with_id', { productId: duplicateProductId })
              : t('duplicate_product_description')}
          </p>
        </div>
      )}

      <div className="
        grid gap-6
        lg:grid-cols-[0.9fr_1.1fr]
      "
      >
        <form
          action={createProduct.bind(null, locale)}
          className="
            dashboard-panel space-y-6 rounded-xl border p-4
            sm:p-6
          "
        >
          <div>
            <h2 className="text-lg font-semibold">{t('single_product_title')}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('single_product_description')}
            </p>
          </div>

          <div className="grid gap-2">
            <label htmlFor="name" className="text-sm font-medium">
              {t('form_name')}
            </label>
            <input
              id="name"
              name="name"
              autoComplete="off"
              required
              className="dashboard-pill rounded-lg border px-3 py-2 text-sm"
            />
          </div>

          <div className="grid gap-2">
            <label htmlFor="description" className="text-sm font-medium">
              {t('form_description')}
            </label>
            <textarea
              id="description"
              name="description"
              autoComplete="off"
              rows={4}
              className="dashboard-pill rounded-lg border px-3 py-2 text-sm"
            />
          </div>

          <div className="
            grid gap-4
            md:grid-cols-2
          "
          >
            <div className="grid gap-2">
              <label htmlFor="price" className="text-sm font-medium">
                {t('form_price')}
              </label>
              <input
                id="price"
                name="price"
                type="number"
                min="0"
                step="0.01"
                required
                className="dashboard-pill rounded-lg border px-3 py-2 text-sm"
              />
            </div>

            <div className="grid gap-2">
              <label htmlFor="category" className="text-sm font-medium">
                {t('form_category')}
              </label>
              <input
                id="category"
                name="category"
                autoComplete="off"
                className="dashboard-pill rounded-lg border px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="
            grid gap-4
            md:grid-cols-3
          "
          >
            <div className="grid gap-2">
              <label htmlFor="productType" className="text-sm font-medium">
                {t('form_product_type')}
              </label>
              <input
                id="productType"
                name="productType"
                autoComplete="off"
                placeholder={t('form_product_type_placeholder')}
                className="dashboard-pill rounded-lg border px-3 py-2 text-sm"
              />
            </div>

            <div className="grid gap-2">
              <label htmlFor="brand" className="text-sm font-medium">
                {t('form_brand')}
              </label>
              <input
                id="brand"
                name="brand"
                autoComplete="off"
                placeholder={t('form_brand_placeholder')}
                className="dashboard-pill rounded-lg border px-3 py-2 text-sm"
              />
            </div>

            <div className="grid gap-2">
              <label htmlFor="unit" className="text-sm font-medium">
                {t('form_unit')}
              </label>
              <input
                id="unit"
                name="unit"
                autoComplete="off"
                placeholder={t('form_unit_placeholder')}
                className="dashboard-pill rounded-lg border px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <label htmlFor="image" className="text-sm font-medium">
              {t('form_image')}
            </label>
            <input
              id="image"
              name="image"
              type="url"
              autoComplete="url"
              className="dashboard-pill rounded-lg border px-3 py-2 text-sm"
            />
          </div>

          <div className="grid gap-2">
            <label htmlFor="imageFile" className="text-sm font-medium">
              {t('form_image_file')}
            </label>
            <input
              id="imageFile"
              name="imageFile"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="
                dashboard-pill rounded-lg border px-3 py-2 text-sm
                file:mr-3 file:rounded-md file:border-0 file:bg-primary
                file:px-3 file:py-1.5 file:text-sm file:font-medium
                file:text-primary-foreground
                rtl:file:mr-0 rtl:file:ml-3
              "
            />
            <p className="text-xs text-muted-foreground">
              {t('form_image_file_hint')}
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm font-medium">
            <input name="isActive" type="checkbox" defaultChecked />
            {t('form_is_active')}
          </label>

          <label className="flex items-center gap-2 text-sm font-medium">
            <input name="aiVisible" type="checkbox" defaultChecked />
            {t('form_ai_visible')}
          </label>

          <div className="grid gap-2">
            <label htmlFor="availability" className="text-sm font-medium">
              {t('form_availability')}
            </label>
            <select
              id="availability"
              name="availability"
              defaultValue="available"
              className="dashboard-pill rounded-lg border px-3 py-2 text-sm"
            >
              <option value="available">{t('availability_available')}</option>
              <option value="limited">{t('availability_limited')}</option>
              <option value="unavailable">{t('availability_unavailable')}</option>
            </select>
          </div>

          <div className="grid gap-2">
            <label htmlFor="tags" className="text-sm font-medium">
              {t('form_tags')}
            </label>
            <input
              id="tags"
              name="tags"
              autoComplete="off"
              placeholder={t('form_tags_placeholder')}
              className="dashboard-pill rounded-lg border px-3 py-2 text-sm"
            />
            <p className="text-xs text-muted-foreground">
              {t('form_tags_hint')}
            </p>
          </div>

          <button
            type="submit"
            className="
              rounded-lg bg-primary px-4 py-2 text-sm font-medium
              text-primary-foreground
            "
          >
            {t('save_product_button')}
          </button>
        </form>

        <form
          action={createProductsBulk.bind(null, locale)}
          className="
            dashboard-panel space-y-5 rounded-xl border p-4
            sm:p-6
          "
        >
          <div>
            <h2 className="text-lg font-semibold">{t('bulk_products_title')}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('bulk_products_description')}
            </p>
          </div>

          <div className="dashboard-surface rounded-lg border p-4">
            <div className="text-sm font-medium">{t('bulk_products_format_title')}</div>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('bulk_products_format_description')}
            </p>
            <pre className="
              mt-3 overflow-x-auto rounded-md bg-muted px-3 py-2 text-xs
              text-muted-foreground
            "
            >
              {t('bulk_products_example')}
            </pre>
          </div>

          <div className="grid gap-2">
            <label htmlFor="products" className="text-sm font-medium">
              {t('bulk_products_field')}
            </label>
            <textarea
              id="products"
              name="products"
              rows={14}
              placeholder={t('bulk_products_placeholder')}
              className="
                min-h-80 dashboard-pill rounded-lg border px-3 py-2 font-mono
                text-sm
              "
            />
          </div>

          <div className="grid gap-2">
            <label htmlFor="productsFile" className="text-sm font-medium">
              {t('bulk_products_file')}
            </label>
            <input
              id="productsFile"
              name="productsFile"
              type="file"
              accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
              className="
                dashboard-pill rounded-lg border px-3 py-2 text-sm
                file:mr-3 file:rounded-md file:border-0 file:bg-primary
                file:px-3 file:py-1.5 file:text-sm file:font-medium
                file:text-primary-foreground
                rtl:file:mr-0 rtl:file:ml-3
              "
            />
            <p className="text-xs text-muted-foreground">
              {t('bulk_products_file_hint')}
            </p>
          </div>

          <div className="grid gap-2">
            <label htmlFor="productImages" className="text-sm font-medium">
              {t('bulk_products_images')}
            </label>
            <input
              id="productImages"
              name="productImages"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              multiple
              className="
                dashboard-pill rounded-lg border px-3 py-2 text-sm
                file:mr-3 file:rounded-md file:border-0 file:bg-primary
                file:px-3 file:py-1.5 file:text-sm file:font-medium
                file:text-primary-foreground
                rtl:file:mr-0 rtl:file:ml-3
              "
            />
            <p className="text-xs text-muted-foreground">
              {t('bulk_products_images_hint')}
            </p>
          </div>

          <button
            type="submit"
            className="
              rounded-lg bg-primary px-4 py-2 text-sm font-medium
              text-primary-foreground
            "
          >
            {t('save_bulk_products_button')}
          </button>
        </form>
      </div>
    </>
  );
}
