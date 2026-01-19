#!/usr/bin/env node

/**
 * PWA Icon Generator Script
 *
 * Generates all required PWA icons from a single source SVG.
 * Requires: sharp (npm install sharp)
 *
 * Usage:
 *   node scripts/generate-pwa-icons.js
 *
 * This will:
 * 1. Read the source SVG from public/favicon.svg
 * 2. Generate PNG icons at all required sizes
 * 3. Generate maskable icons with safe zone padding
 * 4. Generate shortcut icons
 * 5. Generate apple-touch-icon.png
 */

const fs = require('fs');
const path = require('path');

// Check if sharp is available
let sharp;
try {
  sharp = require('sharp');
} catch (error) {
  console.log('Sharp not installed. Installing...');
  console.log('Run: npm install sharp --save-dev');
  console.log('\nAlternatively, use the manual SVG icons in public/icons/');
  process.exit(1);
}

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const ICONS_DIR = path.join(PUBLIC_DIR, 'icons');
const SOURCE_SVG = path.join(PUBLIC_DIR, 'favicon.svg');

// Icon sizes for PWA
const ICON_SIZES = [72, 96, 128, 144, 152, 192, 384, 512];
const MASKABLE_SIZES = [192, 512];
const SHORTCUT_SIZE = 96;
const APPLE_TOUCH_SIZE = 180;

// Zentoria brand colors
const BACKGROUND_COLOR = '#08080f';
const ACCENT_COLOR = '#f97316';

async function ensureIconsDir() {
  if (!fs.existsSync(ICONS_DIR)) {
    fs.mkdirSync(ICONS_DIR, { recursive: true });
    console.log('Created icons directory');
  }
}

async function generateIcon(size, filename, options = {}) {
  const { isMaskable = false, background = 'transparent' } = options;

  try {
    let pipeline = sharp(SOURCE_SVG)
      .resize(size, size, { fit: 'contain', background: 'transparent' });

    if (isMaskable) {
      // For maskable icons, add padding (safe zone is 10% from edges)
      const safeZone = Math.round(size * 0.1);
      const innerSize = size - (safeZone * 2);

      pipeline = sharp({
        create: {
          width: size,
          height: size,
          channels: 4,
          background: BACKGROUND_COLOR,
        }
      })
      .composite([{
        input: await sharp(SOURCE_SVG)
          .resize(innerSize, innerSize, { fit: 'contain', background: 'transparent' })
          .toBuffer(),
        gravity: 'center',
      }]);
    }

    await pipeline.png().toFile(path.join(ICONS_DIR, filename));
    console.log(`Generated: ${filename} (${size}x${size})`);
  } catch (error) {
    console.error(`Failed to generate ${filename}:`, error.message);
  }
}

async function generateAppleTouchIcon() {
  try {
    // Apple touch icon with background
    await sharp({
      create: {
        width: APPLE_TOUCH_SIZE,
        height: APPLE_TOUCH_SIZE,
        channels: 4,
        background: BACKGROUND_COLOR,
      }
    })
    .composite([{
      input: await sharp(SOURCE_SVG)
        .resize(140, 140, { fit: 'contain', background: 'transparent' })
        .toBuffer(),
      gravity: 'center',
    }])
    .png()
    .toFile(path.join(PUBLIC_DIR, 'apple-touch-icon.png'));

    console.log(`Generated: apple-touch-icon.png (${APPLE_TOUCH_SIZE}x${APPLE_TOUCH_SIZE})`);
  } catch (error) {
    console.error('Failed to generate apple-touch-icon:', error.message);
  }
}

async function generateShortcutIcons() {
  // Chat shortcut icon (message bubble)
  const chatSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
    <rect width="96" height="96" rx="20" fill="${BACKGROUND_COLOR}"/>
    <path d="M24 28h48c4 0 7 3 7 7v24c0 4-3 7-7 7H40l-12 10v-10h-4c-4 0-7-3-7-7V35c0-4 3-7 7-7z" fill="${ACCENT_COLOR}"/>
    <circle cx="36" cy="47" r="3" fill="${BACKGROUND_COLOR}"/>
    <circle cx="48" cy="47" r="3" fill="${BACKGROUND_COLOR}"/>
    <circle cx="60" cy="47" r="3" fill="${BACKGROUND_COLOR}"/>
  </svg>`;

  // Files shortcut icon (folder)
  const filesSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
    <rect width="96" height="96" rx="20" fill="${BACKGROUND_COLOR}"/>
    <path d="M20 32c0-4 3-7 7-7h14l8 8h20c4 0 7 3 7 7v24c0 4-3 7-7 7H27c-4 0-7-3-7-7V32z" fill="${ACCENT_COLOR}"/>
  </svg>`;

  // Settings shortcut icon (gear)
  const settingsSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
    <rect width="96" height="96" rx="20" fill="${BACKGROUND_COLOR}"/>
    <path d="M48 30c-2 0-3.5.3-5 .8l-2-4.8-6 2.4 2 4.8c-2.6 2-4.6 4.7-5.8 7.8H26v6h5.2c-.2 1-.2 2-.2 3s0 2 .2 3H26v6h5.2c1.2 3.1 3.2 5.8 5.8 7.8l-2 4.8 6 2.4 2-4.8c1.5.5 3 .8 5 .8s3.5-.3 5-.8l2 4.8 6-2.4-2-4.8c2.6-2 4.6-4.7 5.8-7.8H70v-6h-5.2c.2-1 .2-2 .2-3s0-2-.2-3H70v-6h-5.2c-1.2-3.1-3.2-5.8-5.8-7.8l2-4.8-6-2.4-2 4.8c-1.5-.5-3-.8-5-.8zm0 12c6.6 0 12 5.4 12 12s-5.4 12-12 12-12-5.4-12-12 5.4-12 12-12z" fill="${ACCENT_COLOR}"/>
  </svg>`;

  try {
    await sharp(Buffer.from(chatSvg)).resize(96, 96).png()
      .toFile(path.join(ICONS_DIR, 'shortcut-chat.png'));
    console.log('Generated: shortcut-chat.png');

    await sharp(Buffer.from(filesSvg)).resize(96, 96).png()
      .toFile(path.join(ICONS_DIR, 'shortcut-files.png'));
    console.log('Generated: shortcut-files.png');

    await sharp(Buffer.from(settingsSvg)).resize(96, 96).png()
      .toFile(path.join(ICONS_DIR, 'shortcut-settings.png'));
    console.log('Generated: shortcut-settings.png');
  } catch (error) {
    console.error('Failed to generate shortcut icons:', error.message);
  }
}

async function main() {
  console.log('PWA Icon Generator');
  console.log('==================\n');

  // Check if source SVG exists
  if (!fs.existsSync(SOURCE_SVG)) {
    console.error(`Source SVG not found: ${SOURCE_SVG}`);
    process.exit(1);
  }

  await ensureIconsDir();

  console.log('\nGenerating standard icons...');
  for (const size of ICON_SIZES) {
    await generateIcon(size, `icon-${size}x${size}.png`);
  }

  console.log('\nGenerating maskable icons...');
  for (const size of MASKABLE_SIZES) {
    await generateIcon(size, `maskable-icon-${size}x${size}.png`, { isMaskable: true });
  }

  console.log('\nGenerating Apple touch icon...');
  await generateAppleTouchIcon();

  console.log('\nGenerating shortcut icons...');
  await generateShortcutIcons();

  console.log('\n==================');
  console.log('Icon generation complete!');
  console.log(`Output directory: ${ICONS_DIR}`);
}

main().catch(console.error);
