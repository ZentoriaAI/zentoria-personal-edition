/**
 * Build script using esbuild for transpile-only compilation
 * This bypasses TypeScript type checking for faster builds
 */

import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(__dirname, '..', 'src');
const distDir = path.join(__dirname, '..', 'dist');

// Get all TypeScript files in src (excluding tests)
function getSourceFiles(dir, files = []) {
  const items = fs.readdirSync(dir, { withFileTypes: true });

  for (const item of items) {
    const fullPath = path.join(dir, item.name);

    if (item.isDirectory()) {
      // Skip __tests__ directory
      if (item.name === '__tests__') continue;
      getSourceFiles(fullPath, files);
    } else if (item.name.endsWith('.ts') && !item.name.endsWith('.test.ts') && !item.name.endsWith('.d.ts')) {
      files.push(fullPath);
    }
  }

  return files;
}

async function build() {
  console.log('Building with esbuild (transpile-only)...');

  // Clean dist directory
  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true });
  }
  fs.mkdirSync(distDir, { recursive: true });

  const sourceFiles = getSourceFiles(srcDir);
  console.log(`Found ${sourceFiles.length} source files`);

  try {
    await esbuild.build({
      entryPoints: sourceFiles,
      outdir: distDir,
      platform: 'node',
      target: 'node20',
      format: 'esm',
      sourcemap: true,
      outExtension: { '.js': '.js' },
      // Keep the directory structure
      outbase: srcDir,
      // Don't bundle, just transpile
      bundle: false,
    });

    // Copy .d.ts files if any exist
    const dtsFiles = getDeclarationFiles(srcDir);
    for (const dts of dtsFiles) {
      const relativePath = path.relative(srcDir, dts);
      const destPath = path.join(distDir, relativePath);
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.copyFileSync(dts, destPath);
    }

    console.log('Build completed successfully!');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

function getDeclarationFiles(dir, files = []) {
  const items = fs.readdirSync(dir, { withFileTypes: true });

  for (const item of items) {
    const fullPath = path.join(dir, item.name);

    if (item.isDirectory()) {
      if (item.name === '__tests__') continue;
      getDeclarationFiles(fullPath, files);
    } else if (item.name.endsWith('.d.ts')) {
      files.push(fullPath);
    }
  }

  return files;
}

build();
