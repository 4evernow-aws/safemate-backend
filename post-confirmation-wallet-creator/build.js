const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

async function build() {
  console.log('🔨 Building post-confirmation wallet creator...');

  try {
    // Create dist directory if it doesn't exist
    if (!fs.existsSync('dist')) {
      fs.mkdirSync('dist');
    }

    // Build the Lambda function
    const result = await esbuild.build({
      entryPoints: ['index.js'],
      bundle: true,
      outfile: 'dist/post-confirmation-bundled.js',
      platform: 'node',
      target: 'node18',
      external: [
        '@aws-sdk/client-lambda'
      ],
      minify: true,
      sourcemap: false,
      format: 'cjs'
    });

    console.log('✅ Build completed successfully');
    console.log('📦 Output file: dist/post-confirmation-bundled.js');

    // Check file size
    const stats = fs.statSync('dist/post-confirmation-bundled.js');
    const fileSizeInKB = stats.size / 1024;
    console.log(`📏 Bundle size: ${fileSizeInKB.toFixed(2)} KB`);

    if (fileSizeInKB > 50) {
      console.warn('⚠️  Warning: Bundle size is larger than 50KB Lambda limit');
    } else {
      console.log('✅ Bundle size is within Lambda limits');
    }

  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }
}

build(); 