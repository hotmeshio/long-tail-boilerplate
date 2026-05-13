import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
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

// Storage backend uses LT_FILE_STORAGE_DIR (default: ./data/files)
const STORAGE_DIR = process.env.LT_FILE_STORAGE_DIR || './data/files';
const SRC_PATH = 'test.png'; // storage key

beforeAll(async () => {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });

  // Create a 100x80 red PNG test image in the storage directory
  await sharp({
    create: { width: 100, height: 80, channels: 3, background: { r: 255, g: 0, b: 0 } },
  })
    .png()
    .toFile(path.join(STORAGE_DIR, SRC_PATH));
});

afterAll(() => {
  // Clean up test files from storage directory
  const testFiles = fs.readdirSync(STORAGE_DIR).filter(f => f.startsWith('test') || f.endsWith('_resized.png') || f.endsWith('_cropped.png') || f.endsWith('_rotated.png') || f.endsWith('_flipped.png') || f.endsWith('_grayscale.png') || f.endsWith('_blurred.png') || f.endsWith('_adjusted.png') || f.endsWith('_bordered.png') || f.endsWith('_pixelated.png') || f === 'resized.png' || f === 'cropped.png' || f === 'gray.png' || f === 'blurred.png' || f === 'adjusted.png' || f === 'compressed.jpg' || f === 'converted.webp' || f === 'bordered.png' || f === 'pixelated.png' || f === 'rotated.png' || f === 'flipped.png');
  for (const f of testFiles) {
    try { fs.unlinkSync(path.join(STORAGE_DIR, f)); } catch {}
  }
});

function outPath(name: string): string {
  return name; // storage key, not filesystem path
}

describe('image activities', () => {
  it('getImageInfo — returns metadata', async () => {
    const info = await getImageInfo({ path: SRC_PATH });

    expect(info.width).toBe(100);
    expect(info.height).toBe(80);
    expect(info.format).toBe('png');
    expect(info.channels).toBe(3);
    expect(info.size).toBeGreaterThan(0);
    expect(info.megapixels).toBeCloseTo(0.01, 1);
  });

  it('resizeImage — scales down', async () => {
    const result = await resizeImage({
      path: SRC_PATH,
      width: 50,
      output_path: outPath('resized.png'),
    });

    expect(result.width).toBe(50);
    expect(result.height).toBe(40); // aspect ratio preserved
    expect(fs.existsSync(path.join(STORAGE_DIR, result.output))).toBe(true);
  });

  it('cropImage — extracts region', async () => {
    const result = await cropImage({
      path: SRC_PATH,
      left: 10,
      top: 10,
      width: 30,
      height: 30,
      output_path: outPath('cropped.png'),
    });

    expect(fs.existsSync(path.join(STORAGE_DIR, result.output))).toBe(true);
    const meta = await sharp(path.join(STORAGE_DIR, result.output)).metadata();
    expect(meta.width).toBe(30);
    expect(meta.height).toBe(30);
  });

  it('rotateImage — rotates 90 degrees', async () => {
    const result = await rotateImage({
      path: SRC_PATH,
      angle: 90,
      output_path: outPath('rotated.png'),
    });

    expect(fs.existsSync(path.join(STORAGE_DIR, result.output))).toBe(true);
    const meta = await sharp(path.join(STORAGE_DIR, result.output)).metadata();
    expect(meta.width).toBe(80);
    expect(meta.height).toBe(100);
  });

  it('flipImage — flips horizontally', async () => {
    const result = await flipImage({
      path: SRC_PATH,
      direction: 'horizontal',
      output_path: outPath('flipped.png'),
    });

    expect(fs.existsSync(path.join(STORAGE_DIR, result.output))).toBe(true);
  });

  it('grayscaleImage — converts to grayscale', async () => {
    const result = await grayscaleImage({
      path: SRC_PATH,
      output_path: outPath('gray.png'),
    });

    expect(fs.existsSync(path.join(STORAGE_DIR, result.output))).toBe(true);
  });

  it('blurImage — applies blur', async () => {
    const result = await blurImage({
      path: SRC_PATH,
      sigma: 5,
      output_path: outPath('blurred.png'),
    });

    expect(fs.existsSync(path.join(STORAGE_DIR, result.output))).toBe(true);
  });

  it('adjustImage — modifies brightness', async () => {
    const result = await adjustImage({
      path: SRC_PATH,
      brightness: 1.5,
      output_path: outPath('adjusted.png'),
    });

    expect(fs.existsSync(path.join(STORAGE_DIR, result.output))).toBe(true);
  });

  it('compressImage — reduces file size', async () => {
    const result = await compressImage({
      path: SRC_PATH,
      quality: 60,
      format: 'jpeg',
      output_path: outPath('compressed.jpg'),
    });

    expect(result.size).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(STORAGE_DIR, result.output))).toBe(true);
  });

  it('convertFormat — converts PNG to WebP', async () => {
    const result = await convertFormat({
      path: SRC_PATH,
      format: 'webp',
      output_path: outPath('converted.webp'),
    });

    expect(fs.existsSync(path.join(STORAGE_DIR, result.output))).toBe(true);
    const meta = await sharp(path.join(STORAGE_DIR, result.output)).metadata();
    expect(meta.format).toBe('webp');
  });

  it('addBorder — adds 5px border', async () => {
    const result = await addBorder({
      path: SRC_PATH,
      width: 5,
      color: '#0000ff',
      output_path: outPath('bordered.png'),
    });

    expect(fs.existsSync(path.join(STORAGE_DIR, result.output))).toBe(true);
    const meta = await sharp(path.join(STORAGE_DIR, result.output)).metadata();
    expect(meta.width).toBe(110); // 100 + 5*2
    expect(meta.height).toBe(90); // 80 + 5*2
  });

  it('pixelateImage — applies pixelation', async () => {
    const result = await pixelateImage({
      path: SRC_PATH,
      block_size: 10,
      output_path: outPath('pixelated.png'),
    });

    expect(fs.existsSync(path.join(STORAGE_DIR, result.output))).toBe(true);
  });
});
