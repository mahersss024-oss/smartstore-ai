import { auth } from '@clerk/nextjs/server';
import { and, eq } from 'drizzle-orm';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { updateProduct } from '@/features/dashboard/ProductActions';
import { TitleBar } from '@/features/dashboard/TitleBar';
import { db } from '@/libs/DB';
import { normalizeProductCatalogMetadata } from '@/libs/ProductCatalogMetadata';
import { productsTable } from '@/models/Schema';

export default async function EditProductPage(props: {
  params: Promise<{
    locale: string;
    productId: string;
  }>;
  searchParams: Promise<{
    duplicateProductId?: string;
    productError?: string;
  }>;
}) {
  const { locale, productId } = await props.params;
  const { duplicateProductId, productError } = await props.searchParams;
  const numericProductId = Number(productId);
  setRequestLocale(locale);
  const t = await getTranslations({
    locale,
    namespace: 'ProductsPage',
  });
  const { orgId } = await auth();

  if (!orgId || !Number.isInteger(numericProductId)) {
    notFound();
  }

  const [product] = await db
    .select()
    .from(productsTable)
    .where(
      and(
        eq(productsTable.id, numericProductId),
        eq(productsTable.organizationId, orgId),
      ),
    )
    .limit(1);

  if (!product || !product.isActive) {
    notFound();
  }

  const catalogMetadata = normalizeProductCatalogMetadata(product.metadata);

  return (
    <>
      <TitleBar
        title={t('edit_title_bar')}
        description={t('edit_title_bar_description')}
      />

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

      <form
        action={updateProduct.bind(null, locale, product.id)}
        className="
          max-w-3xl dashboard-panel space-y-6 rounded-xl border p-4
          sm:p-6
        "
      >
        <div>
          <h2 className="text-lg font-semibold">{t('edit_product_title')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('edit_product_description')}
          </p>
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
              defaultValue={catalogMetadata.productType ?? ''}
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
              defaultValue={catalogMetadata.brand ?? ''}
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
              defaultValue={catalogMetadata.unit ?? ''}
              placeholder={t('form_unit_placeholder')}
              className="dashboard-pill rounded-lg border px-3 py-2 text-sm"
            />
          </div>
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
            defaultValue={product.name}
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
            defaultValue={product.description ?? ''}
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
              defaultValue={product.price}
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
              defaultValue={product.category ?? ''}
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
            defaultValue={product.image?.startsWith('/uploads/')
              || product.image?.startsWith('data:image/')
              ? ''
              : product.image ?? ''}
            className="dashboard-pill rounded-lg border px-3 py-2 text-sm"
          />
          {product.image && (
            <label className="flex items-center gap-2 text-sm font-medium">
              <input name="removeImage" type="checkbox" />
              {t('remove_image_button')}
            </label>
          )}
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
              file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3
              file:py-1.5 file:text-sm file:font-medium
              file:text-primary-foreground
              rtl:file:mr-0 rtl:file:ml-3
            "
          />
          <p className="text-xs text-muted-foreground">
            {t('edit_image_file_hint')}
          </p>
        </div>

        <label className="flex items-center gap-2 text-sm font-medium">
          <input name="isActive" type="checkbox" defaultChecked={product.isActive} />
          {t('form_is_active')}
        </label>

        <label className="flex items-center gap-2 text-sm font-medium">
          <input name="aiVisible" type="checkbox" defaultChecked={catalogMetadata.aiVisible} />
          {t('form_ai_visible')}
        </label>

        <div className="grid gap-2">
          <label htmlFor="availability" className="text-sm font-medium">
            {t('form_availability')}
          </label>
          <select
            id="availability"
            name="availability"
            defaultValue={catalogMetadata.availability}
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
            defaultValue={catalogMetadata.tags.join(', ')}
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
          {t('update_product_button')}
        </button>
      </form>
    </>
  );
}
