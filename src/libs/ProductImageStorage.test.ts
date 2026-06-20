import { describe, expect, it } from 'vitest';
import {
  getImageStorageMb,
  isStoredImageDataUrl,
  isUploadedFile,
  saveProductImage,
  saveStoreLogo,
} from './ProductImageStorage';

const tinyPngBytes = Uint8Array.from([
  0x89,
  0x50,
  0x4E,
  0x47,
  0x0D,
  0x0A,
  0x1A,
  0x0A,
  0x00,
  0x00,
  0x00,
  0x00,
]);

const tinyJpegBytes = Uint8Array.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]);

const tinyGif87aBytes = new TextEncoder().encode('GIF87a');

const tinyWebpBytes = Uint8Array.from([
  0x52,
  0x49,
  0x46,
  0x46, // "RIFF"
  0x00,
  0x00,
  0x00,
  0x00, // size (arbitrary)
  0x57,
  0x45,
  0x42,
  0x50, // "WEBP"
]);

describe('ProductImageStorage', () => {
  it('calculates image storage usage in megabytes from file bytes', () => {
    const files = [
      new File(['a'.repeat(1024 * 1024)], 'first.png', { type: 'image/png' }),
      new File(['b'.repeat(512 * 1024)], 'second.png', { type: 'image/png' }),
    ];

    expect(getImageStorageMb(files)).toBe(1.5);
  });

  it('rejects files whose content does not match the declared image type', async () => {
    const file = new File(['not an actual png'], 'product.png', { type: 'image/png' });

    await expect(saveProductImage(file, 'org_1')).rejects.toThrow(
      'Image content does not match image type',
    );
  });

  it('stores uploaded images as durable data urls for cloud deployments', async () => {
    const file = new File([tinyPngBytes], 'product.png', { type: 'image/png' });

    const result = await saveProductImage(file, 'org_1');

    expect(result.url).toMatch(/^data:image\/png;base64,/);
    expect(isStoredImageDataUrl(result.url)).toBe(true);
    expect(result.sizeBytes).toBe(file.size);
  });

  it('accepts a JPEG file with a valid signature', async () => {
    const file = new File([tinyJpegBytes], 'photo.jpg', { type: 'image/jpeg' });

    const result = await saveProductImage(file, 'org_1');

    expect(result.url).toMatch(/^data:image\/jpeg;base64,/);
  });

  it('accepts a GIF87a file with a valid signature', async () => {
    const file = new File([tinyGif87aBytes], 'anim.gif', { type: 'image/gif' });

    const result = await saveProductImage(file, 'org_1');

    expect(result.url).toMatch(/^data:image\/gif;base64,/);
  });

  it('accepts a WebP file with a valid RIFF/WEBP signature', async () => {
    const file = new File([tinyWebpBytes], 'image.webp', { type: 'image/webp' });

    const result = await saveProductImage(file, 'org_1');

    expect(result.url).toMatch(/^data:image\/webp;base64,/);
  });

  it('rejects an unsupported image type', async () => {
    const file = new File(['bmp data'], 'image.bmp', { type: 'image/bmp' });

    await expect(saveProductImage(file, 'org_1')).rejects.toThrow('Unsupported image type');
  });

  it('rejects an oversized image', async () => {
    const largeContent = new Uint8Array(6 * 1024 * 1024);
    largeContent.set(tinyPngBytes);
    const file = new File([largeContent], 'big.png', { type: 'image/png' });

    await expect(saveProductImage(file, 'org_1')).rejects.toThrow('Image is too large');
  });

  it('saves store logos using the same validation pipeline', async () => {
    const file = new File([tinyPngBytes], 'logo.png', { type: 'image/png' });

    const result = await saveStoreLogo(file, 'org_1');

    expect(result.url).toMatch(/^data:image\/png;base64,/);
  });

  it('identifies uploaded files and rejects empty files', () => {
    const realFile = new File([tinyPngBytes], 'real.png', { type: 'image/png' });
    const emptyFile = new File([], 'empty.png', { type: 'image/png' });

    expect(isUploadedFile(realFile)).toBe(true);
    expect(isUploadedFile(emptyFile)).toBe(false);
    expect(isUploadedFile(null)).toBe(false);
    expect(isUploadedFile('text')).toBe(false);
  });

  it('returns false for isStoredImageDataUrl with non-data-URL strings', () => {
    expect(isStoredImageDataUrl('https://example.com/image.png')).toBe(false);
    expect(isStoredImageDataUrl('data:text/plain;base64,abc')).toBe(false);
  });
});
