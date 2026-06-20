import { Buffer } from 'node:buffer';

const allowedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const maxImageSize = 5 * 1024 * 1024;
const bytesPerMegabyte = 1024 * 1024;
const storedImageDataUrlPattern = /^data:image\/(?:jpeg|png|webp|gif);base64,[a-z0-9+/]+={0,2}$/i;

export const isUploadedFile = (value: FormDataEntryValue | null): value is File => {
  return value instanceof File && value.size > 0;
};

export const getImageStorageMb = (files: File[]) => {
  const totalBytes = files.reduce((total, file) => total + file.size, 0);

  return totalBytes / bytesPerMegabyte;
};

export const isStoredImageDataUrl = (value: string) => {
  return storedImageDataUrlPattern.test(value);
};

const startsWithBytes = (bytes: Buffer, signature: number[]) => {
  return signature.every((byte, index) => bytes[index] === byte);
};

const hasValidImageSignature = (file: File, bytes: Buffer) => {
  if (file.type === 'image/jpeg') {
    return startsWithBytes(bytes, [0xFF, 0xD8, 0xFF]);
  }

  if (file.type === 'image/png') {
    return startsWithBytes(bytes, [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  }

  if (file.type === 'image/gif') {
    return bytes.subarray(0, 6).toString('ascii') === 'GIF87a'
      || bytes.subarray(0, 6).toString('ascii') === 'GIF89a';
  }

  if (file.type === 'image/webp') {
    return bytes.subarray(0, 4).toString('ascii') === 'RIFF'
      && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
  }

  return false;
};

const assertValidImage = (file: File, bytes: Buffer) => {
  if (!allowedImageTypes.has(file.type)) {
    throw new Error('Unsupported image type');
  }

  if (file.size > maxImageSize) {
    throw new Error('Image is too large');
  }

  if (!hasValidImageSignature(file, bytes)) {
    throw new Error('Image content does not match image type');
  }
};

const getPersistentImageUrl = (file: File, bytes: Buffer) => {
  return `data:${file.type};base64,${bytes.toString('base64')}`;
};

const saveUploadedImage = async (
  file: File,
  _organizationId: string,
  _folder: 'products' | 'store-logos',
) => {
  const bytes = Buffer.from(await file.arrayBuffer());

  assertValidImage(file, bytes);

  return {
    sizeBytes: file.size,
    url: getPersistentImageUrl(file, bytes),
  };
};

export const saveProductImage = async (file: File, organizationId: string) => {
  return saveUploadedImage(file, organizationId, 'products');
};

export const saveStoreLogo = async (file: File, organizationId: string) => {
  return saveUploadedImage(file, organizationId, 'store-logos');
};
