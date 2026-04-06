/**
 * Image Tools MCP Server — local image processing via sharp.
 *
 * Registers image activities as MCP tools so they can be
 * discovered and called by the Pipeline Designer.
 *
 * This is an example of how to build a custom MCP server
 * that wraps your own activities as tools.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as image from '../activities/image';

export function createImageToolsServer(): McpServer {
  const server = new McpServer({ name: 'image-tools', version: '1.0.0' });

  server.tool(
    'get_image_info',
    'Get image metadata: dimensions, format, file size, megapixels.',
    { path: z.string().describe('Path to the image file') },
    async ({ path }) => ({
      content: [{ type: 'text', text: JSON.stringify(await image.getImageInfo({ path })) }],
    }),
  );

  server.tool(
    'resize_image',
    'Resize an image. Preserves aspect ratio by default.',
    {
      path: z.string().describe('Path to the image file'),
      width: z.number().optional().describe('Target width in pixels'),
      height: z.number().optional().describe('Target height in pixels'),
      fit: z.enum(['cover', 'contain', 'fill', 'inside', 'outside']).optional().describe('How to fit the image'),
      output_path: z.string().optional().describe('Output path (defaults to input_resized.ext)'),
    },
    async (args) => ({
      content: [{ type: 'text', text: JSON.stringify(await image.resizeImage(args)) }],
    }),
  );

  server.tool(
    'crop_image',
    'Crop a rectangular region from an image.',
    {
      path: z.string().describe('Path to the image file'),
      left: z.number().describe('Left offset in pixels'),
      top: z.number().describe('Top offset in pixels'),
      width: z.number().describe('Crop width in pixels'),
      height: z.number().describe('Crop height in pixels'),
      output_path: z.string().optional().describe('Output path'),
    },
    async (args) => ({
      content: [{ type: 'text', text: JSON.stringify(await image.cropImage(args)) }],
    }),
  );

  server.tool(
    'rotate_image',
    'Rotate an image by a given angle (degrees, counter-clockwise).',
    {
      path: z.string().describe('Path to the image file'),
      angle: z.number().describe('Rotation angle in degrees'),
      background: z.string().optional().describe('Background color for exposed areas (hex, e.g. #ffffff)'),
      output_path: z.string().optional().describe('Output path'),
    },
    async (args) => ({
      content: [{ type: 'text', text: JSON.stringify(await image.rotateImage(args)) }],
    }),
  );

  server.tool(
    'flip_image',
    'Flip an image horizontally or vertically.',
    {
      path: z.string().describe('Path to the image file'),
      direction: z.enum(['horizontal', 'vertical']).describe('Flip direction'),
      output_path: z.string().optional().describe('Output path'),
    },
    async (args) => ({
      content: [{ type: 'text', text: JSON.stringify(await image.flipImage(args)) }],
    }),
  );

  server.tool(
    'grayscale_image',
    'Convert an image to grayscale.',
    {
      path: z.string().describe('Path to the image file'),
      output_path: z.string().optional().describe('Output path'),
    },
    async (args) => ({
      content: [{ type: 'text', text: JSON.stringify(await image.grayscaleImage(args)) }],
    }),
  );

  server.tool(
    'blur_image',
    'Apply Gaussian blur to an image.',
    {
      path: z.string().describe('Path to the image file'),
      sigma: z.number().optional().describe('Blur intensity (default: 3)'),
      output_path: z.string().optional().describe('Output path'),
    },
    async (args) => ({
      content: [{ type: 'text', text: JSON.stringify(await image.blurImage(args)) }],
    }),
  );

  server.tool(
    'adjust_image',
    'Adjust brightness and saturation. Values > 1 increase, < 1 decrease.',
    {
      path: z.string().describe('Path to the image file'),
      brightness: z.number().optional().describe('Brightness multiplier (default: 1.0)'),
      saturation: z.number().optional().describe('Saturation multiplier (default: 1.0)'),
      output_path: z.string().optional().describe('Output path'),
    },
    async (args) => ({
      content: [{ type: 'text', text: JSON.stringify(await image.adjustImage(args)) }],
    }),
  );

  server.tool(
    'compress_image',
    'Compress an image to reduce file size.',
    {
      path: z.string().describe('Path to the image file'),
      quality: z.number().optional().describe('Quality 1-100 (default: 80)'),
      format: z.enum(['jpeg', 'png', 'webp']).optional().describe('Output format (default: jpeg)'),
      output_path: z.string().optional().describe('Output path'),
    },
    async (args) => ({
      content: [{ type: 'text', text: JSON.stringify(await image.compressImage(args)) }],
    }),
  );

  server.tool(
    'convert_format',
    'Convert an image to a different format.',
    {
      path: z.string().describe('Path to the image file'),
      format: z.enum(['jpeg', 'png', 'webp', 'avif', 'tiff']).describe('Target format'),
      output_path: z.string().optional().describe('Output path'),
    },
    async (args) => ({
      content: [{ type: 'text', text: JSON.stringify(await image.convertFormat(args)) }],
    }),
  );

  server.tool(
    'add_border',
    'Add a solid-color border around an image.',
    {
      path: z.string().describe('Path to the image file'),
      width: z.number().describe('Border width in pixels'),
      color: z.string().optional().describe('Border color (hex, default: #000000)'),
      output_path: z.string().optional().describe('Output path'),
    },
    async (args) => ({
      content: [{ type: 'text', text: JSON.stringify(await image.addBorder(args)) }],
    }),
  );

  server.tool(
    'pixelate_image',
    'Apply a pixelation/mosaic effect to an image.',
    {
      path: z.string().describe('Path to the image file'),
      block_size: z.number().optional().describe('Pixel block size (default: 10)'),
      output_path: z.string().optional().describe('Output path'),
    },
    async (args) => ({
      content: [{ type: 'text', text: JSON.stringify(await image.pixelateImage(args)) }],
    }),
  );

  return server;
}
