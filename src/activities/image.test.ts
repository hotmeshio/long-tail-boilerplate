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
} from './image';

const TMP = path.join(__dirname, '../../.test-tmp');
const SRC_IMG = path.join(TMP, 'test.png');

beforeAll(async () => {
  fs.mkdirSync(TMP, { recursive: true });

  // Create a 100x80 red PNG test image
  await sharp({
    create: { width: 100, height: 80, channels: 3, background: { r: 255, g: 0, b: 0 } },
  })
    .png()
    .toFile(SRC_IMG);
});

afterAll(() => {
  fs.rmSync(TMP, { recursive: true, force: true });
});

function outPath(name: string): string {
  return path.join(TMP, name);
}

describe('image activities', () => {
  it('getImageInfo — returns metadata', async () => {
    const info = await getImageInfo({ path: SRC_IMG });

    expect(info.width).toBe(100);
    expect(info.height).toBe(80);
    expect(info.format).toBe('png');
    expect(info.channels).toBe(3);
    expect(info.size).toBeGreaterThan(0);
    expect(info.megapixels).toBeCloseTo(0.01, 1);
  });

  it('resizeImage — scales down', async () => {
    const result = await resizeImage({
      path: SRC_IMG,
      width: 50,
      output_path: outPath('resized.png'),
    });

    expect(result.width).toBe(50);
    expect(result.height).toBe(40); // aspect ratio preserved
    expect(fs.existsSync(result.output)).toBe(true);
  });

  it('cropImage — extracts region', async () => {
    const result = await cropImage({
      path: SRC_IMG,
      left: 10,
      top: 10,
      width: 30,
      height: 30,
      output_path: outPath('cropped.png'),
    });

    expect(fs.existsSync(result.output)).toBe(true);
    const meta = await sharp(result.output).metadata();
    expect(meta.width).toBe(30);
    expect(meta.height).toBe(30);
  });

  it('rotateImage — rotates 90 degrees', async () => {
    const result = await rotateImage({
      path: SRC_IMG,
      angle: 90,
      output_path: outPath('rotated.png'),
    });

    expect(fs.existsSync(result.output)).toBe(true);
    const meta = await sharp(result.output).metadata();
    expect(meta.width).toBe(80);
    expect(meta.height).toBe(100);
  });

  it('flipImage — flips horizontally', async () => {
    const result = await flipImage({
      path: SRC_IMG,
      direction: 'horizontal',
      output_path: outPath('flipped.png'),
    });

    expect(fs.existsSync(result.output)).toBe(true);
  });

  it('grayscaleImage — converts to grayscale', async () => {
    const result = await grayscaleImage({
      path: SRC_IMG,
      output_path: outPath('gray.png'),
    });

    expect(fs.existsSync(result.output)).toBe(true);
  });

  it('blurImage — applies blur', async () => {
    const result = await blurImage({
      path: SRC_IMG,
      sigma: 5,
      output_path: outPath('blurred.png'),
    });

    expect(fs.existsSync(result.output)).toBe(true);
  });

  it('adjustImage — modifies brightness', async () => {
    const result = await adjustImage({
      path: SRC_IMG,
      brightness: 1.5,
      output_path: outPath('adjusted.png'),
    });

    expect(fs.existsSync(result.output)).toBe(true);
  });

  it('compressImage — reduces file size', async () => {
    const result = await compressImage({
      path: SRC_IMG,
      quality: 60,
      format: 'jpeg',
      output_path: outPath('compressed.jpg'),
    });

    expect(result.size).toBeGreaterThan(0);
    expect(fs.existsSync(result.output)).toBe(true);
  });

  it('convertFormat — converts PNG to WebP', async () => {
    const result = await convertFormat({
      path: SRC_IMG,
      format: 'webp',
      output_path: outPath('converted.webp'),
    });

    expect(fs.existsSync(result.output)).toBe(true);
    const meta = await sharp(result.output).metadata();
    expect(meta.format).toBe('webp');
  });

  it('addBorder — adds 5px border', async () => {
    const result = await addBorder({
      path: SRC_IMG,
      width: 5,
      color: '#0000ff',
      output_path: outPath('bordered.png'),
    });

    expect(fs.existsSync(result.output)).toBe(true);
    const meta = await sharp(result.output).metadata();
    expect(meta.width).toBe(110); // 100 + 5*2
    expect(meta.height).toBe(90); // 80 + 5*2
  });

  it('pixelateImage — applies pixelation', async () => {
    const result = await pixelateImage({
      path: SRC_IMG,
      block_size: 10,
      output_path: outPath('pixelated.png'),
    });

    expect(fs.existsSync(result.output)).toBe(true);
  });
});
