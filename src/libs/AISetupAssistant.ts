import { z } from 'zod';
import { normalizeProductCatalogMetadata, parseProductTags } from './ProductCatalogMetadata';
import { isStoredImageDataUrl } from './ProductImageStorage';

const aiProductDraftSchema = z.object({
  category: z.string().max(120).default(''),
  description: z.string().max(2000).default(''),
  image: z.union([
    z.url(),
    z.string().startsWith('/uploads/'),
    z.string().refine(isStoredImageDataUrl),
    z.literal(''),
  ]).default(''),
  name: z.string().min(1).max(200),
  price: z.coerce.number().min(0).max(99999999.99),
  tags: z.array(z.string().min(1).max(60)).max(20).default([]),
});

export type AIProductDraft = z.infer<typeof aiProductDraftSchema>;

const parseLine = (line: string) => {
  const usesPipeDelimiter = line.includes('|');
  const parts = line
    .split(usesPipeDelimiter ? '|' : ',')
    .map(value => value.trim());
  const [name = '', price = '', category = '', description = ''] = parts;
  const remainingParts = parts.slice(4);

  if (!name || !price) {
    throw new Error('Invalid product draft row.');
  }

  const lastPart = remainingParts.at(-1) ?? '';
  const image = !usesPipeDelimiter
    && (lastPart.startsWith('http://') || lastPart.startsWith('https://') || lastPart.startsWith('/uploads/'))
    ? lastPart
    : usesPipeDelimiter
      ? remainingParts[1] ?? ''
      : '';
  const tags = usesPipeDelimiter
    ? remainingParts[0] ?? ''
    : (
        image
          ? remainingParts.slice(0, -1)
          : remainingParts
      ).join(',');

  return aiProductDraftSchema.parse({
    category,
    description,
    image,
    name,
    price,
    tags: parseProductTags(tags),
  });
};

const lineLooksLikeProductDraft = (line: string) => {
  const usesPipeDelimiter = line.includes('|');
  const [, price = ''] = line
    .split(usesPipeDelimiter ? '|' : ',')
    .map(value => value.trim());
  const numericPrice = Number(price.replace(',', '.'));

  return Number.isFinite(numericPrice) && numericPrice >= 0;
};

export const parseAIProductDrafts = (input: string) => {
  return input
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .filter(lineLooksLikeProductDraft)
    .map(parseLine)
    .slice(0, 50);
};

export const productDraftToInsertMetadata = (draft: AIProductDraft) => {
  return normalizeProductCatalogMetadata({
    aiVisible: true,
    availability: 'available',
    tags: draft.tags,
  });
};
