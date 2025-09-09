// Test each dependency step by step
const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
};

// Test AWS SDK imports
let dynamodb, kms, secretsManager;
try {
  console.log('🔧 Testing AWS SDK imports...');
  const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
  const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
  const { KMSClient } = require('@aws-sdk/client-kms');
  const { SecretsManagerClient } = require('@aws-sdk/client-secrets-manager');
  
  dynamodb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'ap-southeast-2' }));
  kms = new KMSClient({ region: 'ap-southeast-2' });
  secretsManager = new SecretsManagerClient({ region: 'ap-southeast-2' });
  console.log('✅ AWS SDK imports successful');
} catch (error) {
  console.error('❌ AWS SDK import error:', error);
}

// Test Hedera SDK import
let PrivateKey;
try {
  console.log('🔧 Testing Hedera SDK import...');
  const { PrivateKey: HederaPrivateKey } = require('@hashgraph/sdk');
  PrivateKey = HederaPrivateKey;
  console.log('✅ Hedera SDK import successful');
} catch (error) {
  console.error('❌ Hedera SDK import error:', error);
}

// Get onboarding status using secure approach
async function getOnboardingStatus(userId) {
  console.log('🔍 Getting secure onboarding status for user:', userId);
  
  try {
    if (!dynamodb) {
      throw new Error('DynamoDB client not initialized');
    }
    
    const { GetCommand } = require('@aws-sdk/lib-dynamodb');
    
    // Check metadata table for wallet status
    const result = await dynamodb.send(new GetCommand({
      TableName: process.env.WALLETS_TABLE,
      Key: { userId: userId }
    }));
    
    if (result.Item) {
      console.log('✅ User has wallet metadata:', result.Item);
      
      // Don't return sensitive data, just status
      return {
        hasWallet: true,
        walletId: result.Item.walletId,
        status: result.Item.status,
        accountType: result.Item.accountType,
        network: result.Item.network,
        createdAt: result.Item.createdAt
      };
    } else {
      console.log('❌ No wallet found for user');
      return {
        hasWallet: false,
        status: 'pending'
      };
    }
  } catch (error) {
    console.error('❌ Error getting onboarding status:', error);
    return {
      hasWallet: false,
      status: 'error',
      error: error.message
    };
  }
}

// Main handler function
exports.handler = async (event, context) => {
  console.log('📥 Secure test Lambda handler received:', JSON.stringify(event, null, 2));
  
  try {
    const { httpMethod, path, body, requestContext } = event;
    const pathSegments = path.split('/');
    const endpoint = pathSegments[pathSegments.length - 1];
    
    console.log(`📨 Processing ${httpMethod} request to /onboarding/${endpoint}`);
    
    // Handle OPTIONS requests for CORS
    if (httpMethod === 'OPTIONS') {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'CORS preflight' })
      };
    }
    
    // Extract user info from JWT token (if authorization is enabled)
    let userId, email;
    if (requestContext?.authorizer?.claims) {
      const userClaims = requestContext.authorizer.claims;
      userId = userClaims.sub;
      email = userClaims.email;
      console.log('👤 User info from JWT:', { userId, email });
    } else {
      // For testing without authorization
      userId = 'test-user-' + Date.now();
      email = 'test@example.com';
      console.log('🧪 Using test user:', { userId, email });
    }
    
    // Handle status endpoint
    if ((httpMethod === 'GET' || httpMethod === 'POST') && endpoint === 'status') {
      const status = await getOnboardingStatus(userId);
      
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          ...status,
          testInfo: {
            awsSdkLoaded: !!dynamodb,
            hederaSdkLoaded: !!PrivateKey,
            environment: {
              WALLETS_TABLE: process.env.WALLETS_TABLE,
              HEDERA_NETWORK: process.env.HEDERA_NETWORK,
              USER_KEYS_KMS_KEY_ID: process.env.USER_KEYS_KMS_KEY_ID
            }
          }
        })
      };
    }
    
    // Handle unknown endpoints
    console.log('❌ Endpoint not found:', endpoint);
    return {
      statusCode: 404,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Endpoint not found' })
    };
    
  } catch (error) {
    console.error('❌ Secure test Lambda execution error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      })
    };
  }
};
