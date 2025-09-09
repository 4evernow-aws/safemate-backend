const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { KMSClient, EncryptCommand, DecryptCommand, GenerateDataKeyCommand } = require('@aws-sdk/client-kms');
const { SecretsManagerClient, CreateSecretCommand, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { PrivateKey } = require('@hashgraph/sdk');

// Initialize AWS clients
const dynamodb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'ap-southeast-2' }));
const kms = new KMSClient({ region: 'ap-southeast-2' });
const secretsManager = new SecretsManagerClient({ region: 'ap-southeast-2' });

// CORS headers
const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
};

/**
 * Get onboarding status for a user
 */
async function getOnboardingStatus(userId) {
  try {
    console.log('🔍 Checking onboarding status for user:', userId);
    
    const result = await dynamodb.send(new GetCommand({
      TableName: process.env.WALLETS_TABLE,
      Key: { userId: userId }
    }));
    
    if (result.Item) {
      console.log('✅ Found existing wallet metadata:', result.Item);
      return {
        hasWallet: true,
        status: result.Item.status || 'completed',
        walletId: result.Item.walletId,
        createdAt: result.Item.createdAt
      };
    } else {
      console.log('📝 No existing wallet found for user');
      return {
        hasWallet: false,
        status: 'pending'
      };
    }
  } catch (error) {
    console.error('❌ Error getting onboarding status:', error);
    throw error;
  }
}

/**
 * Start onboarding process and create secure wallet
 */
async function startOnboarding(userId, email) {
  try {
    console.log('🚀 Starting onboarding for user:', userId, 'email:', email);
    
    // Check if wallet already exists
    const existingStatus = await getOnboardingStatus(userId);
    if (existingStatus.hasWallet) {
      console.log('⚠️ Wallet already exists for user');
      return {
        success: true,
        message: 'Wallet already exists',
        hasWallet: true,
        status: existingStatus.status
      };
    }
    
    // Generate Hedera private key
    console.log('🔑 Generating Hedera private key...');
    const privateKey = PrivateKey.generateED25519();
    const publicKey = privateKey.publicKey;
    
    // Generate data key from KMS for encrypting the private key
    console.log('🔐 Generating KMS data key...');
    const dataKeyResponse = await kms.send(new GenerateDataKeyCommand({
      KeyId: process.env.USER_KEYS_KMS_KEY_ID,
      KeySpec: 'AES_256'
    }));
    
    // Encrypt the private key with the data key
    const privateKeyBytes = privateKey.toBytes();
    const encryptedPrivateKey = Buffer.concat([
      dataKeyResponse.CiphertextBlob,
      Buffer.from(privateKeyBytes)
    ]);
    
    // Store encrypted private key in Secrets Manager
    console.log('💾 Storing encrypted private key in Secrets Manager...');
    const secretName = `safemate-wallet-${userId}`;
    await secretsManager.send(new CreateSecretCommand({
      Name: secretName,
      SecretString: JSON.stringify({
        encryptedPrivateKey: encryptedPrivateKey.toString('base64'),
        publicKey: publicKey.toString(),
        dataKeyId: dataKeyResponse.KeyId,
        createdAt: new Date().toISOString()
      }),
      Description: `SafeMate wallet for user ${userId}`,
      Tags: [
        { Key: 'Application', Value: 'safemate' },
        { Key: 'UserId', Value: userId },
        { Key: 'Type', Value: 'wallet' }
      ]
    }));
    
    // Store wallet metadata in DynamoDB
    console.log('📊 Storing wallet metadata in DynamoDB...');
    const walletId = `wallet-${userId}-${Date.now()}`;
    await dynamodb.send(new PutCommand({
      TableName: process.env.WALLETS_TABLE,
      Item: {
        userId: userId,
        walletId: walletId,
        email: email,
        publicKey: publicKey.toString(),
        secretName: secretName,
        status: 'created',
        network: process.env.HEDERA_NETWORK || 'testnet',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    }));
    
    console.log('✅ Wallet creation completed successfully');
    return {
      success: true,
      message: 'Wallet created successfully',
      hasWallet: true,
      status: 'created',
      walletId: walletId,
      publicKey: publicKey.toString()
    };
    
  } catch (error) {
    console.error('❌ Error during wallet creation:', error);
    throw error;
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
      console.log('✅ Status endpoint called');
      const status = await getOnboardingStatus(userId);
      
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify(status)
      };
    }
    
    // Handle start endpoint
    if (httpMethod === 'POST' && endpoint === 'start') {
      console.log('✅ Start endpoint called');
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
