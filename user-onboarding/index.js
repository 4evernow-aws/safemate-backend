/**
 * SafeMate v2 - User Onboarding Service
 * 
 * This Lambda function handles user onboarding and Hedera wallet creation.
 * 
 * @version 2.2.0
 * @author SafeMate Development Team
 * @lastUpdated 2025-01-01
 * @environment Pre-production (preprod)
 * @awsRegion ap-southeast-2
 * @hederaNetwork testnet
 * @corsOrigin http://preprod-safemate-static-hosting.s3-website-ap-southeast-2.amazonaws.com
 * @supportedMethods GET,POST,PUT,DELETE,OPTIONS
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const dynamodb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'ap-southeast-2' }));

// CORS headers
const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': 'http://preprod-safemate-static-hosting.s3-website-ap-southeast-2.amazonaws.com',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token,x-cognito-id-token,x-cognito-access-token,Accept',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Credentials': 'true'
};

// Get onboarding status
async function getOnboardingStatus(userId) {
  console.log('🔍 Getting onboarding status for user:', userId);
  
  try {
    // Query by userId (primary key)
    const result = await dynamodb.send(new GetCommand({
      TableName: process.env.WALLETS_TABLE,
      Key: {
        userId: userId
      }
    }));
    
    if (result.Item) {
      const wallet = result.Item;
      console.log('✅ User has wallet:', wallet);
      return {
        success: true,
        hasWallet: true,
        wallet: wallet,
        status: 'completed'
      };
    } else {
      console.log('❌ No wallet found for user');
      return {
        success: true,
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
    // Create a basic wallet record with userId as primary key
    const walletRecord = {
      userId: userId,
      email: email,
      status: 'creating',
      createdAt: new Date().toISOString(),
      accountType: 'auto_created_secure',
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
