const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { KMSClient, EncryptCommand, DecryptCommand, GenerateDataKeyCommand } = require('@aws-sdk/client-kms');
const { SecretsManagerClient, CreateSecretCommand, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { PrivateKey } = require('@hashgraph/sdk');

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

// Get onboarding status using secure approach
async function getOnboardingStatus(userId) {
  console.log('🔍 Getting secure onboarding status for user:', userId);
  
  try {
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

// Start secure onboarding process
async function startOnboarding(userId, email) {
  console.log('🚀 Starting secure onboarding for user:', userId, email);
  
  try {
    // Generate Hedera key pair
    console.log('🔑 Generating Hedera key pair...');
    const privateKey = PrivateKey.generateED25519();
    const publicKey = privateKey.getPublicKey();
    const accountAlias = `alias-${publicKey.toStringRaw()}`;
    
    console.log('✅ Hedera keys generated successfully');
    
    // Create wallet metadata record
    const walletId = `wallet-${userId}-${Date.now()}`;
    const walletRecord = {
      userId: userId,
      walletId: walletId,
      email: email,
      status: 'creating',
      createdAt: new Date().toISOString(),
      accountType: 'auto_created_secure',
      network: process.env.HEDERA_NETWORK || 'testnet',
      accountAlias: accountAlias,
      publicKey: publicKey.toString()
    };
    
    // Store metadata in DynamoDB
    await dynamodb.send(new PutCommand({
      TableName: process.env.WALLETS_TABLE,
      Item: walletRecord
    }));
    
    console.log('✅ Wallet metadata stored in DynamoDB');
    
    // Encrypt private key with KMS
    console.log('🔐 Encrypting private key with KMS...');
    const encryptResult = await kms.send(new EncryptCommand({
      KeyId: process.env.USER_KEYS_KMS_KEY_ID,
      Plaintext: Buffer.from(privateKey.toString(), 'utf-8')
    }));
    
    console.log('✅ Private key encrypted with KMS');
    
    // Store encrypted private key in Secrets Manager
    console.log('🗄️ Storing encrypted key in Secrets Manager...');
    const secretName = `safemate/wallet/${walletId}`;
    await secretsManager.send(new CreateSecretCommand({
      Name: secretName,
      SecretString: JSON.stringify({
        encryptedPrivateKey: Buffer.from(encryptResult.CiphertextBlob).toString('base64'),
        accountAlias: accountAlias,
        userId: userId,
        createdAt: new Date().toISOString()
      }),
      Description: `SafeMate wallet for user ${userId}`
    }));
    
    console.log('✅ Encrypted private key stored in Secrets Manager');
    
    // Update wallet status
    await dynamodb.send(new PutCommand({
      TableName: process.env.WALLETS_TABLE,
      Item: {
        ...walletRecord,
        status: 'completed',
        secretName: secretName
      }
    }));
    
    console.log('✅ Wallet creation completed successfully');
    
    return {
      success: true,
      message: 'Secure wallet created successfully',
      wallet: {
        walletId: walletId,
        accountAlias: accountAlias,
        publicKey: publicKey.toString(),
        status: 'completed',
        network: process.env.HEDERA_NETWORK || 'testnet'
      }
    };
  } catch (error) {
    console.error('❌ Error in secure onboarding:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Main handler function
exports.handler = async (event, context) => {
  console.log('📥 Secure Lambda handler received:', JSON.stringify(event, null, 2));
  
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
    console.error('❌ Secure Lambda execution error:', error);
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
