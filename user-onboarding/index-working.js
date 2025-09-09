const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const dynamodb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'ap-southeast-2' }));

// CORS headers
const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
};

// Get onboarding status
async function getOnboardingStatus(userId) {
  console.log('🔍 Getting onboarding status for user:', userId);
  
  try {
    // Use scan with filter since we have a composite key but want to query by user_id only
    const result = await dynamodb.send(new ScanCommand({
      TableName: process.env.WALLETS_TABLE,
      FilterExpression: 'user_id = :userId',
      ExpressionAttributeValues: {
        ':userId': userId
      },
      Limit: 1
    }));
    
    if (result.Items && result.Items.length > 0) {
      const wallet = result.Items[0];
      console.log('✅ User has wallet:', wallet);
      return {
        hasWallet: true,
        wallet: wallet,
        status: 'completed'
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

// Start onboarding process
async function startOnboarding(userId, email) {
  console.log('🚀 Starting onboarding for user:', userId, email);
  
  try {
    // Create a basic wallet record with composite key structure
    const walletId = `wallet-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const walletRecord = {
      user_id: userId,
      wallet_id: walletId,
      email: email,
      status: 'creating',
      created_at: new Date().toISOString(),
      account_type: 'auto_created_secure',
      network: process.env.HEDERA_NETWORK || 'testnet'
    };
    
    await dynamodb.send(new PutCommand({
      TableName: process.env.WALLETS_TABLE,
      Item: walletRecord
    }));
    
    console.log('✅ Wallet record created');
    
    return {
      success: true,
      message: 'Onboarding started successfully',
      wallet: walletRecord
    };
  } catch (error) {
    console.error('❌ Error starting onboarding:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Main handler function
exports.handler = async (event, context) => {
  console.log('📥 Lambda handler received:', JSON.stringify(event, null, 2));
  
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
    
    // Extract user info from JWT token
    const userClaims = requestContext?.authorizer?.claims;
    if (!userClaims) {
      console.log('❌ No user claims found in request');
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Unauthorized - No user claims found' })
      };
    }
    
    const userId = userClaims.sub;
    const email = userClaims.email;
    
    console.log('👤 User info from JWT:', { userId, email });
    
    // Handle status endpoint
    if ((httpMethod === 'GET' || httpMethod === 'POST') && endpoint === 'status') {
      const status = await getOnboardingStatus(userId);
      
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify(status)
      };
    }
    
    // Handle start endpoint
    if (httpMethod === 'POST' && endpoint === 'start') {
      const result = await startOnboarding(userId, email);
      
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify(result)
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
    console.error('❌ Lambda execution error:', error);
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
