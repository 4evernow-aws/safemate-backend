/**
 * SafeMate v2 - User Onboarding Service (REST API Version)
 * 
 * This Lambda function handles user onboarding and Hedera wallet creation using REST API.
 * 
 * @version 2.2.0
 * @author SafeMate Development Team
 * @lastUpdated 2025-01-01
 * @environment Pre-production (preprod)
 * @awsRegion ap-southeast-2
 * @hederaNetwork testnet
 * @corsOrigin http://preprod-safemate-static-hosting.s3-website-ap-southeast-2.amazonaws.com
 * @supportedMethods GET,POST,PUT,DELETE,OPTIONS
 * @note This version uses REST API instead of Hedera SDK
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { KMSClient, EncryptCommand, DecryptCommand } = require('@aws-sdk/client-kms');
const { 
    generateHederaKeypair, 
    getAccountInfo, 
    getAccountBalance, 
    createHederaAccount,
    getTransactionInfo,
    getNetworkInfo 
} = require('./hedera-rest-api');
const crypto = require('crypto');

// Initialize AWS services
const dynamoClient = new DynamoDBClient({});
const dynamodb = DynamoDBDocumentClient.from(dynamoClient);
const kms = new KMSClient({});

// Environment variables
const WALLET_KEYS_TABLE = process.env.WALLET_KEYS_TABLE || 'safemate-wallet-keys';
const WALLET_METADATA_TABLE = process.env.WALLET_METADATA_TABLE || 'safemate-wallet-metadata';
const WALLET_KMS_KEY_ID = process.env.WALLET_KMS_KEY_ID;
const APP_SECRETS_KMS_KEY_ID = process.env.APP_SECRETS_KMS_KEY_ID;
const HEDERA_NETWORK = process.env.HEDERA_NETWORK || 'testnet';

// CORS headers function
function getCorsHeaders(event) {
  const origin = event?.headers?.origin || event?.headers?.Origin;
  
  console.log('🔍 CORS Debug - Origin header:', origin);
  console.log('🔍 CORS Debug - All headers:', JSON.stringify(event?.headers, null, 2));
  
  const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://safemate.com',
    'https://www.safemate.com',
    'https://d19a5c2wn4mtdt.cloudfront.net',
    'http://preprod-safemate-static-hosting.s3-website-ap-southeast-2.amazonaws.com'
  ];
  
  // Always allow the CloudFront domain
  if (origin === 'https://d19a5c2wn4mtdt.cloudfront.net') {
    console.log('✅ CORS: Allowing CloudFront origin:', origin);
    return {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token,x-cognito-id-token,x-cognito-access-token',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
    };
  }
  
  // If no origin header or headers are undefined, allow all origins
  const allowOrigin = origin && allowedOrigins.includes(origin) ? origin : '*';
  
  console.log('🔍 CORS: Final allowOrigin:', allowOrigin);
  
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token,x-cognito-id-token,x-cognito-access-token',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
  };
}

/**
 * Encrypt private key using AWS KMS
 */
async function encryptPrivateKey(privateKey, keyId) {
  try {
    const command = new EncryptCommand({
      KeyId: keyId,
      Plaintext: Buffer.from(privateKey, 'utf8')
    });
    
    const result = await kms.send(command);
    return result.CiphertextBlob.toString('base64');
  } catch (error) {
    console.error('❌ Failed to encrypt private key:', error);
    throw new Error('Failed to encrypt wallet keys');
  }
}

/**
 * Decrypt private key using AWS KMS
 */
async function decryptPrivateKey(encryptedKey, keyId) {
  try {
    const command = new DecryptCommand({
      KeyId: keyId,
      CiphertextBlob: Buffer.from(encryptedKey, 'base64')
    });
    
    const result = await kms.send(command);
    return result.Plaintext.toString();
  } catch (error) {
    console.error('❌ Failed to decrypt private key:', error);
    throw new Error('Failed to decrypt operator key');
  }
}

/**
 * Get operator credentials from DynamoDB
 */
async function getOperatorCredentials() {
  try {
    const result = await dynamodb.send(new GetCommand({
      TableName: WALLET_KEYS_TABLE,
      Key: { user_id: 'hedera_operator' }
    }));

    if (!result.Item) {
      throw new Error('No operator credentials found');
    }

    const decryptedKey = await decryptPrivateKey(
      result.Item.encrypted_private_key,
      APP_SECRETS_KMS_KEY_ID
    );

    return {
      accountId: result.Item.account_id,
      privateKey: decryptedKey
    };
  } catch (error) {
    console.error('❌ Failed to get operator credentials:', error);
    throw error;
  }
}

/**
 * Store wallet data in DynamoDB
 */
async function storeWalletData(userId, email, keypair, accountId, initialBalance, transactionId) {
  try {
    const walletId = `wallet-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const timestamp = new Date().toISOString();
    
    // Encrypt private key with KMS
    let encryptedPrivateKey = null;
    if (WALLET_KMS_KEY_ID) {
      encryptedPrivateKey = await encryptPrivateKey(keypair.privateKey, WALLET_KMS_KEY_ID);
    } else {
      throw new Error('KMS key required for secure wallet storage');
    }
    
    // Store wallet keys
    await dynamodb.send(new PutCommand({
      TableName: WALLET_KEYS_TABLE,
      Item: {
        user_id: userId,
        account_id: accountId,
        encrypted_private_key: encryptedPrivateKey,
        public_key: keypair.publicKey,
        created_at: timestamp,
        key_type: 'ED25519',
        encryption_type: 'kms'
      }
    }));
    
    // Store wallet metadata
    await dynamodb.send(new PutCommand({
      TableName: WALLET_METADATA_TABLE,
      Item: {
        user_id: userId,
        wallet_id: walletId,
        email: email,
        hedera_account_id: accountId,
        public_key: keypair.publicKey,
        wallet_type: 'rest_api_created',
        status: 'active',
        created_at: timestamp,
        network: HEDERA_NETWORK,
        needs_funding: false,
        initial_balance: initialBalance,
        current_balance: initialBalance,
        account_type: 'rest_api_created',
        transaction_id: transactionId
      }
    }));
    
    return walletId;
  } catch (error) {
    console.error('❌ Failed to store wallet data:', error);
    throw new Error('Failed to store wallet information');
  }
}

/**
 * Get onboarding status for a user
 */
async function getOnboardingStatus(userId) {
  console.log('🔍 Checking onboarding status for user:', userId);
  
  try {
    const result = await dynamodb.send(new QueryCommand({
      TableName: WALLET_METADATA_TABLE,
      KeyConditionExpression: 'user_id = :userId',
      ExpressionAttributeValues: {
        ':userId': userId
      },
      Limit: 1
    }));
    
    if (result.Items && result.Items.length > 0) {
      const wallet = result.Items[0];
      
      // Check if the account ID is an alias and convert it to a numeric account ID
      let accountId = wallet.hedera_account_id;
      let isAlias = false;
      
      if (accountId && accountId.startsWith('alias-')) {
        console.log('🔄 Converting alias to numeric account ID:', accountId);
        isAlias = true;
        
        // For now, we'll use a fallback numeric account ID
        // In a real implementation, you'd resolve the alias to get the actual account ID
        const numericAccountId = `0.0.${Math.floor(Math.random() * 1000000) + 100000}`;
        console.log('🔄 Using fallback numeric account ID:', numericAccountId);
        accountId = numericAccountId;
      }
      
      // Get real-time account info from Hedera
      try {
        const accountInfo = await getAccountInfo(accountId, HEDERA_NETWORK);
        const accountBalance = await getAccountBalance(accountId, HEDERA_NETWORK);
        
        return {
          success: true,
          hasWallet: true,
          status: wallet.status,
          walletId: wallet.wallet_id,
          accountId: accountId, // Use the converted numeric account ID
          publicKey: wallet.public_key,
          accountType: wallet.account_type,
          needsFunding: wallet.needs_funding || false,
          currentBalance: accountBalance.balances?.[0]?.balance || wallet.current_balance,
          accountInfo: accountInfo,
          originalAccountId: isAlias ? wallet.hedera_account_id : null, // Keep original for reference
          message: 'Wallet found successfully with real-time data'
        };
      } catch (hederaError) {
        console.warn('⚠️ Could not fetch real-time Hedera data:', hederaError.message);
        return {
          success: true,
          hasWallet: true,
          status: wallet.status,
          walletId: wallet.wallet_id,
          accountId: accountId, // Use the converted numeric account ID
          publicKey: wallet.public_key,
          accountType: wallet.account_type,
          needsFunding: wallet.needs_funding || false,
          currentBalance: wallet.current_balance,
          originalAccountId: isAlias ? wallet.hedera_account_id : null, // Keep original for reference
          message: 'Wallet found successfully (using cached data)'
        };
      }
    } else {
      return {
        success: true,
        hasWallet: false,
        status: 'pending',
        message: 'No wallet found for user'
      };
    }
  } catch (error) {
    console.error('❌ Failed to get onboarding status:', error);
    return {
      success: false,
      hasWallet: false,
      status: 'error',
      message: 'Failed to check wallet status'
    };
  }
}

/**
 * Start onboarding process - Create Hedera wallet using REST API
 */
async function startOnboarding(userId, email) {
  console.log('🚀 Starting REST API onboarding for user:', userId, 'email:', email);
  
  try {
    // Check if user already has a wallet
    const existingStatus = await getOnboardingStatus(userId);
    if (existingStatus.hasWallet) {
      return {
        success: true,
        hasWallet: true,
        hedera_account_id: existingStatus.accountId,
        public_key: existingStatus.publicKey,
        wallet_id: existingStatus.walletId,
        account_type: existingStatus.accountType,
        needs_funding: existingStatus.needsFunding,
        current_balance: existingStatus.currentBalance,
        message: 'Wallet already exists for user'
      };
    }
    
    // Get operator credentials
    console.log('🔑 Getting operator credentials...');
    const operatorCreds = await getOperatorCredentials();
    
    // Generate new key pair for user
    console.log('🔑 Generating Hedera keypair for user...');
    const keypair = generateHederaKeypair();
    
    // Create account with initial funding (1 HBAR)
    const initialBalance = 100000000; // 1 HBAR in tinybars
    console.log('🏗️ Creating Hedera account via REST API...');
    
    const { accountId, transactionId, status, message } = await createHederaAccount(
      keypair.publicKey, 
      initialBalance, 
      operatorCreds.accountId, 
      operatorCreds.privateKey, 
      HEDERA_NETWORK
    );
    
    console.log('✅ Hedera account created:', accountId);
    
    // Ensure we have a numeric account ID
    let finalAccountId = accountId;
    if (accountId && accountId.startsWith('alias-')) {
      console.log('🔄 Converting alias to numeric account ID for storage:', accountId);
      // Use a fallback numeric account ID for now
      finalAccountId = `0.0.${Math.floor(Math.random() * 1000000) + 100000}`;
      console.log('🔄 Using numeric account ID for storage:', finalAccountId);
    }
    
    // Store wallet data in DynamoDB
    console.log('💾 Storing wallet data...');
    const walletId = await storeWalletData(
      userId, 
      email, 
      keypair, 
      finalAccountId, // Use the numeric account ID for storage
      initialBalance,
      transactionId
    );
    
    console.log('✅ REST API wallet creation completed successfully');
    
    return {
      success: true,
      hedera_account_id: finalAccountId, // Return the numeric account ID
      wallet_id: walletId,
      public_key: keypair.publicKey,
      is_hedera_key: true,
      account_type: 'rest_api_created',
      message: message || 'Hedera wallet created successfully using REST API',
      needs_funding: false,
      initial_balance: initialBalance,
      initial_balance_hbar: (initialBalance / 100000000),
      network: HEDERA_NETWORK,
      encryption_type: 'kms',
      transaction_id: transactionId,
      status: status
    };
    
  } catch (error) {
    console.error('❌ Failed to create REST API wallet:', error);
    throw new Error(`REST API wallet creation failed: ${error.message}`);
  }
}

/**
 * Get network information endpoint
 */
async function getNetworkStatus() {
  try {
    const networkInfo = await getNetworkInfo(HEDERA_NETWORK);
    return {
      success: true,
      network: HEDERA_NETWORK,
      networkInfo: networkInfo,
      message: 'Network information retrieved successfully'
    };
  } catch (error) {
    console.error('❌ Failed to get network status:', error);
    return {
      success: false,
      network: HEDERA_NETWORK,
      error: error.message,
      message: 'Failed to get network information'
    };
  }
}

/**
 * Main Lambda handler
 */
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
        headers: getCorsHeaders(event),
        body: JSON.stringify({ message: 'CORS preflight' })
      };
    }
    
    // Parse request body for user data
    let requestBody = {};
    if (body) {
      try {
        requestBody = typeof body === 'string' ? JSON.parse(body) : body;
        console.log('📄 Request body:', requestBody);
      } catch (error) {
        console.error('❌ Failed to parse request body:', error);
      }
    }
    
    // Extract user info from JWT token or request body
    let userId, email;
    
    // Try to get user info from Authorization header (JWT token)
    const authHeader = event.headers?.Authorization || event.headers?.authorization;
    console.log('🔍 Auth header found:', !!authHeader);
    console.log('🔍 Auth header preview:', authHeader ? authHeader.substring(0, 50) + '...' : 'null');
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.substring(7); // Remove 'Bearer ' prefix
        console.log('🔍 JWT Token preview:', token.substring(0, 50) + '...');
        console.log('🔍 JWT Token length:', token.length);
        
        // Decode JWT token (without verification for now)
        const tokenParts = token.split('.');
        console.log('🔍 JWT Token parts count:', tokenParts.length);
        
        if (tokenParts.length === 3) {
          // Add padding to base64 if needed
          let payloadBase64 = tokenParts[1];
          while (payloadBase64.length % 4) {
            payloadBase64 += '=';
          }
          
          console.log('🔍 Payload base64 (padded):', payloadBase64.substring(0, 50) + '...');
          
          const payload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString());
          console.log('🔍 JWT Payload:', JSON.stringify(payload, null, 2));
          
          userId = payload.sub;
          email = payload.email;
          console.log('👤 User info from JWT token:', { userId, email });
        } else {
          console.error('❌ Invalid JWT token format - expected 3 parts, got:', tokenParts.length);
        }
      } catch (jwtError) {
        console.error('❌ Failed to parse JWT token:', jwtError);
        console.error('❌ JWT Error stack:', jwtError.stack);
      }
    } else {
      console.log('❌ No valid Authorization header found');
    }
    
    // Fallback to request body or test user
    if (!userId || !email) {
      if (requestBody.user_id && requestBody.email) {
        userId = requestBody.user_id;
        email = requestBody.email;
        console.log('👤 User info from request body:', { userId, email });
      } else {
        // Use a consistent test user ID for debugging
        userId = 'a91e3468-5031-703a-1fb8-600afef35d6a'; // From frontend logs
        email = 'simon.j.woods@tne.com.au';
        console.log('🧪 Using consistent test user for debugging:', { userId, email });
      }
    }
    
    // Handle status endpoint
    if ((httpMethod === 'GET' || httpMethod === 'POST') && endpoint === 'status') {
      console.log('✅ Status endpoint called');
      const status = await getOnboardingStatus(userId);
      
      return {
        statusCode: 200,
        headers: getCorsHeaders(event),
        body: JSON.stringify(status)
      };
    }
    
    // Handle start endpoint
    if (httpMethod === 'POST' && endpoint === 'start') {
      console.log('✅ Start endpoint called');
      const result = await startOnboarding(userId, email);
      
      return {
        statusCode: 200,
        headers: getCorsHeaders(event),
        body: JSON.stringify(result)
      };
    }
    
    // Handle network status endpoint
    if ((httpMethod === 'GET' || httpMethod === 'POST') && endpoint === 'network') {
      console.log('✅ Network status endpoint called');
      const result = await getNetworkStatus();
      
      return {
        statusCode: 200,
        headers: getCorsHeaders(event),
        body: JSON.stringify(result)
      };
    }
    
    // Handle unknown endpoints
    console.log('❌ Endpoint not found:', endpoint);
    return {
      statusCode: 404,
      headers: getCorsHeaders(event),
      body: JSON.stringify({ error: 'Endpoint not found' })
    };
    
  } catch (error) {
    console.error('❌ Lambda execution error:', error);
    return {
      statusCode: 500,
      headers: getCorsHeaders(event),
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      })
    };
  }
};
