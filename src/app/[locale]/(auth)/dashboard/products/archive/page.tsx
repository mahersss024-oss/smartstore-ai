import { auth } from '@clerk/nextjs/server';
import { and, desc, eq } from 'drizzle-orm';
import { RotateCcw } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { restoreArchivedProduct } from '@/features/dashboard/ProductActions';
import { TitleBar } from '@/features/dashboard/TitleBar';
import { db } from '@/libs/DB';
import { Link } from '@/libs/I18nNavigation';
import { normalizeProductCatalogMetadata } from '@/libs/ProductCatalogMetadata';
import { productsTable } from '@/models/Schema';

export default async function ArchivedProductsPage(props: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    duplicateProductId?: string;
    productError?: string;
  }>;
}) {
  const { locale } = await props.params;
  const { duplicateProductId, productError } = await props.searchParams;
  setRequestLocale(locale);
  const t = await getTranslations({
    locale,
    namespace: 'ProductsPage',
  });
  const { orgId } = await auth();
  const products = orgId
    ? await db
        .select()
        .from(productsTable)
        .where(
          and(
            eq(productsTable.organizationId, orgId),
            eq(productsTable.isActive, false),
          ),
        )
        .orderBy(desc(productsTable.updatedAt))
    : [];

  return (
    <>
      <TitleBar
        title={t('product_archive_title_bar')}
        description={t('product_archive_title_bar_description')}
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

      <div className="mb-4">
        <Link
          href="/dashboard/products"
          className="
            text-sm font-medium text-primary underline-offset-4
            hover:underline
          "
        >
          {t('back_to_products')}
        </Link>
      </div>

      <div className="dashboard-panel rounded-xl border">
        <div className="
          p-4
          sm:p-6
        "
        >
          {products.length > 0
            ? (
                <div className="grid gap-4">
                  {products.map((product) => {
                    const catalogMetadata = normalizeProductCatalogMetadata(product.metadata);

                    return (
                      <div
                        key={product.id}
                        className="
                          flex dashboard-surface flex-col gap-4 rounded-xl
                          border p-4
                          sm:flex-row sm:items-start sm:justify-between
                        "
                      >
                        <div className="
                          flex w-full min-w-0 flex-col gap-3
                          sm:flex-row sm:items-start
                        "
                        >
                          {product.image && (
                            <div className="
                              relative size-20 shrink-0 overflow-hidden
                              rounded-xl border bg-muted
                            "
                            >
                              {/* eslint-disable-next-line next/no-img-element -- Product URLs can come from any merchant source. */}
                              <img
                                src={product.image}
                                alt={product.name}
                                className="size-full object-cover"
                              />
                            </div>
                          )}

                          <div className="min-w-0 flex-1">
                            <div className="font-semibold wrap-break-word">{product.name}</div>
                            {product.description && (
                              <div className="
                                mt-1 text-sm wrap-break-word
                                text-muted-foreground
                              "
                              >
                                {product.description}
                              </div>
                            )}
                            <div className="mt-2 text-sm font-medium">
                              {product.price}
                              {' '}
                              {t('currency')}
                            </div>
                            {product.category && (
                              <div className="
                                mt-1 text-xs text-muted-foreground
                              "
                              >
                                {product.category}
                              </div>
                            )}
                            <div className="mt-2 flex flex-wrap gap-2">
                              <span className="
                                rounded-full border px-2.5 py-1 text-xs
                              "
                              >
                                {t('archived_product_status')}
                              </span>
                              <span className="
                                rounded-full border px-2.5 py-1 text-xs
                              "
                              >
                                {t(`availability_${catalogMetadata.availability}`)}
                              </span>
                              <span className="
                                rounded-full border px-2.5 py-1 text-xs
                              "
                              >
                                {catalogMetadata.aiVisible
                                  ? t('ai_visible')
                                  : t('ai_hidden')}
                              </span>
                              {[...new Set(catalogMetadata.tags)].map(tag => (
                                <span
                                  key={`${product.id}-${tag}`}
                                  className="
                                    rounded-full border px-2.5 py-1 text-xs
                                    wrap-break-word text-muted-foreground
                                  "
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>

                        <form
                          className="
                            w-full
                            sm:w-auto
                          "
                          action={restoreArchivedProduct.bind(null, locale, product.id)}
                        >
                          <button
                            type="submit"
                            className="
                              inline-flex min-h-10 w-full items-center
                              justify-center gap-1.5 rounded-md border px-3 py-2
                              text-sm transition-colors
                              hover:bg-accent
                              sm:w-auto
                            "
                          >
                            <RotateCcw className="size-4" />
                            {t('restore_product_button')}
                          </button>
                        </form>
                      </div>
                    );
                  })}
                </div>
              )
            : (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <h3 className="mb-2 text-lg font-semibold">{t('no_archived_products_title')}</h3>
                    <p className="text-muted-foreground">{t('no_archived_products_description')}</p>
                  </div>
                </div>
              )}
        </div>
      </div>
    </>
  );
}
