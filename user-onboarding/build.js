const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

async function build() {
  try {
    console.log('🔨 Building KMS-enhanced Lambda function...');
    
    const result = await esbuild.build({
      entryPoints: ['kms-enhanced.js'],
      bundle: true,
      platform: 'node',
      target: 'node18',
      external: [
        'aws-sdk',
        '@aws-sdk/client-secrets-manager',
        '@aws-sdk/client-kms',
        '@aws-sdk/client-dynamodb',
        '@hashgraph/sdk'
      ],
      outfile: 'dist/kms-enhanced-bundled.js',
      minify: false,
      sourcemap: false,
      format: 'cjs'
    });
    
    console.log('✅ Build completed successfully');
    
    // Create deployment package
    const deploymentFiles = [
      'dist/kms-enhanced-bundled.js',
      'package.json'
    ];
    
    // Copy files to deployment directory
    if (!fs.existsSync('dist')) {
      fs.mkdirSync('dist');
    }
    
    // Create a simple deployment package
    const deploymentContent = {
      files: deploymentFiles,
      timestamp: new Date().toISOString()
    };
    
    fs.writeFileSync('dist/deployment-info.json', JSON.stringify(deploymentContent, null, 2));
    
    console.log('📦 Deployment package ready in dist/');
    
  } catch (error) {
    console.error('🔴 Build failed:', error);
    process.exit(1);
  }
}

build(); 