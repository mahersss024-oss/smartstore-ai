import { auth } from '@clerk/nextjs/server';
import { and, asc, eq } from 'drizzle-orm';
import { Archive, Eye, EyeOff, PackageCheck, PackageX, Pencil, Plus } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import {
  deleteProduct,
  updateProductAIVisibility,
  updateProductAvailability,
} from '@/features/dashboard/ProductActions';
import { TitleBar } from '@/features/dashboard/TitleBar';
import { db } from '@/libs/DB';
import { Link } from '@/libs/I18nNavigation';
import { normalizeProductCatalogMetadata } from '@/libs/ProductCatalogMetadata';
import { productsTable } from '@/models/Schema';

export default async function ProductsPage(props: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;
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
            eq(productsTable.isActive, true),
          ),
        )
        .orderBy(asc(productsTable.sortOrder), asc(productsTable.createdAt))
    : [];

  return (
    <>
      <TitleBar
        title={t('title_bar')}
        description={t('title_bar_description')}
      />
      <div className="mb-6 flex flex-wrap justify-end gap-2">
        <Link
          href="/dashboard/products/archive"
          className="
            inline-flex items-center rounded-lg border px-4 py-2 text-sm
            font-medium transition-colors
            hover:bg-accent
          "
        >
          <Archive className="
            mr-2 size-4
            rtl:mr-0 rtl:ml-2
          "
          />
          {t('view_product_archive')}
        </Link>
        <Link
          href="/dashboard/products/new"
          className="
            inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm
            font-medium text-primary-foreground transition-colors
            hover:bg-primary/90
          "
        >
          <Plus className="
            mr-2 size-4
            rtl:mr-0 rtl:ml-2
          "
          />
          {t('add_product_button')}
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
                            {product.image && (
                              <div className="
                                mt-2 text-xs break-all text-muted-foreground
                              "
                              >
                                {product.image}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="
                          grid w-full grid-cols-1 gap-2
                          sm:flex sm:w-auto sm:shrink-0 sm:flex-wrap
                          sm:justify-end
                        "
                        >
                          <Link
                            href={`/dashboard/products/${product.id}/edit`}
                            className="
                              inline-flex min-h-10 items-center justify-center
                              gap-1.5 rounded-md border px-3 py-2 text-sm
                            "
                          >
                            <Pencil className="size-4" />
                            {t('edit_product_button')}
                          </Link>

                          <form
                            className="
                              w-full
                              sm:w-auto
                            "
                            action={updateProductAIVisibility.bind(
                              null,
                              locale,
                              product.id,
                              !catalogMetadata.aiVisible,
                            )}
                          >
                            <button
                              type="submit"
                              className="
                                inline-flex min-h-10 w-full items-center
                                justify-center gap-1.5 rounded-md border px-3
                                py-2 text-sm
                                sm:w-auto
                              "
                            >
                              {catalogMetadata.aiVisible
                                ? <EyeOff className="size-4" />
                                : <Eye className="size-4" />}
                              {catalogMetadata.aiVisible
                                ? t('hide_from_ai_button')
                                : t('show_to_ai_button')}
                            </button>
                          </form>

                          <form
                            className="
                              w-full
                              sm:w-auto
                            "
                            action={updateProductAvailability.bind(
                              null,
                              locale,
                              product.id,
                              catalogMetadata.availability === 'unavailable'
                                ? 'available'
                                : 'unavailable',
                            )}
                          >
                            <button
                              type="submit"
                              className="
                                inline-flex min-h-10 w-full items-center
                                justify-center gap-1.5 rounded-md border px-3
                                py-2 text-sm
                                sm:w-auto
                              "
                            >
                              {catalogMetadata.availability === 'unavailable'
                                ? <PackageCheck className="size-4" />
                                : <PackageX className="size-4" />}
                              {catalogMetadata.availability === 'unavailable'
                                ? t('mark_available_button')
                                : t('mark_unavailable_button')}
                            </button>
                          </form>

                          <form
                            className="
                              w-full
                              sm:w-auto
                            "
                            action={deleteProduct.bind(null, locale, product.id)}
                          >
                            <button
                              type="submit"
                              className="
                                min-h-10 w-full rounded-md border px-3 py-2
                                text-sm text-destructive
                                sm:w-auto
                              "
                            >
                              {t('delete_product_button')}
                            </button>
                          </form>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            : (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="mx-auto mb-4 size-12 text-muted-foreground"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                    <h3 className="mb-2 text-lg font-semibold">{t('no_products_title')}</h3>
                    <p className="mb-4 text-muted-foreground">{t('no_products_description')}</p>
                    <Link
                      href="/dashboard/products/new"
                      className="
                        inline-flex items-center rounded-lg bg-primary px-4 py-2
                        text-sm font-medium text-primary-foreground
                        transition-colors
                        hover:bg-primary/90
                      "
                    >
                      {t('add_first_product_button')}
                    </Link>
                  </div>
                </div>
              )}
        </div>
      </div>
    </>
  );
};
