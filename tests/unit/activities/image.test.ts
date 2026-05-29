import { describe, it, expect, vi, beforeAll } from 'vitest';
import sharp from 'sharp';

// Generate a test image buffer before mocking
let testImageBuffer: Buffer;

beforeAll(async () => {
  testImageBuffer = await sharp({
    create: { width: 100, height: 80, channels: 3, background: { r: 255, g: 0, b: 0 } },
  })
    .png()
    .toBuffer();
});

// Track writes so we can verify output and read back results
const writtenFiles = new Map<string, Buffer>();

vi.mock('@hotmeshio/long-tail', () => ({
  getStorageBackend: () => ({
    read: vi.fn().mockImplementation(async (key: string) => {
      const buf = writtenFiles.get(key) ?? testImageBuffer;
      return { data: buf, size: buf.length };
    }),
    write: vi.fn().mockImplementation(async (key: string, data: Buffer) => {
      writtenFiles.set(key, data);
      return { size: data.length };
    }),
  }),
}));

import {
  getImageInfo,
  resizeImage,
  cropImage,
  rotateImage,
  flipImage,
  grayscaleImage,
  blurImage,
  adjustImage,
  compressImage,
  convertFormat,
  addBorder,
  pixelateImage,
} from '../../../src/activities/image';

describe('image activities', () => {
  it('getImageInfo — returns metadata', async () => {
    const info = await getImageInfo({ path: 'test.png' });

    expect(info.width).toBe(100);
    expect(info.height).toBe(80);
    expect(info.format).toBe('png');
    expect(info.channels).toBe(3);
    expect(info.size).toBeGreaterThan(0);
    expect(info.megapixels).toBeCloseTo(0.01, 1);
  });

  it('resizeImage — scales down', async () => {
    const result = await resizeImage({
      path: 'test.png',
      width: 50,
      output_path: 'resized.png',
    });

    expect(result.width).toBe(50);
    expect(result.height).toBe(40);
    expect(writtenFiles.has('resized.png')).toBe(true);
  });

  it('cropImage — extracts region', async () => {
    const result = await cropImage({
      path: 'test.png',
      left: 10,
      top: 10,
      width: 30,
      height: 30,
      output_path: 'cropped.png',
    });

    expect(writtenFiles.has(result.output)).toBe(true);
    const meta = await sharp(writtenFiles.get(result.output)!).metadata();
    expect(meta.width).toBe(30);
    expect(meta.height).toBe(30);
  });

  it('rotateImage — rotates 90 degrees', async () => {
    const result = await rotateImage({
      path: 'test.png',
      angle: 90,
      output_path: 'rotated.png',
    });

    expect(writtenFiles.has(result.output)).toBe(true);
    const meta = await sharp(writtenFiles.get(result.output)!).metadata();
    expect(meta.width).toBe(80);
    expect(meta.height).toBe(100);
  });

  it('flipImage — flips horizontally', async () => {
    const result = await flipImage({
      path: 'test.png',
      direction: 'horizontal',
      output_path: 'flipped.png',
    });

    expect(writtenFiles.has(result.output)).toBe(true);
  });

  it('grayscaleImage — converts to grayscale', async () => {
    const result = await grayscaleImage({
      path: 'test.png',
      output_path: 'gray.png',
    });

    expect(writtenFiles.has(result.output)).toBe(true);
  });

  it('blurImage — applies blur', async () => {
    const result = await blurImage({
      path: 'test.png',
      sigma: 5,
      output_path: 'blurred.png',
    });

    expect(writtenFiles.has(result.output)).toBe(true);
  });

  it('adjustImage — modifies brightness', async () => {
    const result = await adjustImage({
      path: 'test.png',
      brightness: 1.5,
      output_path: 'adjusted.png',
    });

    expect(writtenFiles.has(result.output)).toBe(true);
  });

  it('compressImage — reduces file size', async () => {
    const result = await compressImage({
      path: 'test.png',
      quality: 60,
      format: 'jpeg',
      output_path: 'compressed.jpg',
    });

    expect(result.size).toBeGreaterThan(0);
    expect(writtenFiles.has(result.output)).toBe(true);
  });

  it('convertFormat — converts PNG to WebP', async () => {
    const result = await convertFormat({
      path: 'test.png',
      format: 'webp',
      output_path: 'converted.webp',
    });

    expect(writtenFiles.has(result.output)).toBe(true);
    const meta = await sharp(writtenFiles.get(result.output)!).metadata();
    expect(meta.format).toBe('webp');
  });

  it('addBorder — adds 5px border', async () => {
    const result = await addBorder({
      path: 'test.png',
      width: 5,
      color: '#0000ff',
      output_path: 'bordered.png',
    });

    expect(writtenFiles.has(result.output)).toBe(true);
    const meta = await sharp(writtenFiles.get(result.output)!).metadata();
    expect(meta.width).toBe(110);
    expect(meta.height).toBe(90);
  });

  it('pixelateImage — applies pixelation', async () => {
    const result = await pixelateImage({
      path: 'test.png',
      block_size: 10,
      output_path: 'pixelated.png',
    });

    expect(writtenFiles.has(result.output)).toBe(true);
  });
});
