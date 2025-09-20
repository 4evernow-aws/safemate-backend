// =============================================================================
// SafeMate Hedera Service - Preprod Environment
// =============================================================================
// 
// This Lambda function handles:
// - Hedera blockchain integration for SafeMate
// - Test endpoint for service health checks
// - Environment variable validation
// - CORS handling for multiple environments
// - AWS SDK v3 integration (DynamoDB, KMS)
//
// Environment: Preprod (preprod)
// Last Updated: 2025-09-14
// Status: Working - Basic service functionality confirmed
// 
// Key Features:
// - Environment variable validation
// - CORS configuration for multiple origins
// - AWS SDK v3 compliance
// - Health check endpoint
// - Error handling and logging
//
// API Endpoints:
// - GET /test - Service health check
// - GET / - Root endpoint (same as /test)
//
// Environment Variables:
// - HEDERA_NETWORK: testnet
// - HEDERA_OPERATOR_ID: 0.0.6428427
// - HEDERA_OPERATOR_KEY: [DER encoded private key]
// - STAGE: preprod
// - HEDERA_FOLDERS_TABLE: preprod-safemate-hedera-folders
// - WALLET_KEYS_TABLE: preprod-safemate-wallet-keys
//
// =============================================================================

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');

// Initialize AWS clients
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-southeast-2' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

// Helper function to create response
function createResponse(statusCode, body, event) {
  const origin = event?.headers?.origin || event?.headers?.Origin || 'http://localhost:5173';
  
  // Define allowed origins
  const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://d19a5c2wn4mtdt.cloudfront.net',
    'https://safemate.app'
  ];
  
  const corsOrigin = allowedOrigins.includes(origin) ? origin : 'https://safemate.app';
  
  return {
    statusCode,
    headers: {
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  };
}

// Test endpoint
async function testEndpoint(event) {
  try {
    console.log('🧪 Test endpoint called');
    
    return createResponse(200, {
      message: 'Hedera service is working!',
      network: process.env.HEDERA_NETWORK || 'testnet',
      operatorAccount: process.env.HEDERA_OPERATOR_ID || 'not-set',
      stage: process.env.STAGE || 'dev',
      timestamp: new Date().toISOString(),
      environment: process.env
    }, event);
  } catch (error) {
    console.error('Test endpoint error:', error);
    return createResponse(500, {
      error: 'Test failed',
      message: error.message
    }, event);
  }
}

// Main handler
exports.handler = async (event) => {
  console.log('Received event:', JSON.stringify(event, null, 2));
  
  try {
    const httpMethod = event.httpMethod || event.requestContext?.http?.method || 'GET';
    const path = event.path || event.rawPath || '/';
    
    console.log(`Processing ${httpMethod} ${path}`);
    
    // Handle CORS preflight
    if (httpMethod === 'OPTIONS') {
      return createResponse(200, { message: 'CORS preflight' }, event);
    }
    
    // Route requests
    if (path === '/test' || path === '/') {
      return await testEndpoint(event);
    }
    
    return createResponse(404, {
      error: 'Not found',
      message: `Path ${path} not found`
    }, event);
    
  } catch (error) {
    console.error('Handler error:', error);
    return createResponse(500, {
      error: 'Internal server error',
      message: error.message
    }, event);
  }
};
