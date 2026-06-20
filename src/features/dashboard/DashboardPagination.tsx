import { ChevronLeft, ChevronRight } from 'lucide-react';
import NextLink from 'next/link';
import { getI18nPath } from '@/utils/Helpers';

const buildPagePath = (
  basePath: string,
  locale: string,
  page: number,
  query: Record<string, string | undefined>,
) => {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value) {
      search.set(key, value);
    }
  }

  if (page > 1) {
    search.set('page', String(page));
  }

  const suffix = search.size > 0 ? `?${search.toString()}` : '';

  return getI18nPath(`${basePath}${suffix}`, locale);
};

export const DashboardPagination = (props: {
  basePath: string;
  currentPage: number;
  hasNextPage: boolean;
  locale: string;
  query?: Record<string, string | undefined>;
}) => {
  const query = props.query ?? {};

  if (props.currentPage === 1 && !props.hasNextPage) {
    return null;
  }

  return (
    <nav
      aria-label="Pagination"
      className="mt-6 flex items-center justify-center gap-3"
    >
      {props.currentPage > 1
        ? (
            <NextLink
              href={buildPagePath(
                props.basePath,
                props.locale,
                props.currentPage - 1,
                query,
              )}
              rel="prev"
              className="
                inline-flex size-9 items-center justify-center rounded-md border
                hover:bg-background
              "
            >
              <ChevronLeft
                className="
                  size-4
                  rtl:rotate-180
                "
                aria-hidden="true"
              />
            </NextLink>
          )
        : <span className="size-9" aria-hidden="true" />}

      <span
        aria-current="page"
        className="
          inline-flex min-w-9 items-center justify-center rounded-md border px-2
          py-1 text-sm font-medium
        "
      >
        {props.currentPage.toLocaleString(props.locale)}
      </span>

      {props.hasNextPage
        ? (
            <NextLink
              href={buildPagePath(
                props.basePath,
                props.locale,
                props.currentPage + 1,
                query,
              )}
              rel="next"
              className="
                inline-flex size-9 items-center justify-center rounded-md border
                hover:bg-background
              "
            >
              <ChevronRight
                className="
                  size-4
                  rtl:rotate-180
                "
                aria-hidden="true"
              />
            </NextLink>
          )
        : <span className="size-9" aria-hidden="true" />}
    </nav>
  );
};
