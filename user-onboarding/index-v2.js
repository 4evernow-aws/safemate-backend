const AWS = require('aws-sdk');
const { Client, PrivateKey, AccountId, AccountCreateTransaction, Hbar } = require('@hashgraph/sdk');
const crypto = require('crypto');

// Initialize AWS services with SDK v2
const dynamodb = new AWS.DynamoDB.DocumentClient();
const kms = new AWS.KMS();

// Environment variables
const WALLET_KEYS_TABLE = process.env.WALLET_KEYS_TABLE || 'safemate-wallet-keys';
const WALLET_METADATA_TABLE = process.env.WALLET_METADATA_TABLE || 'safemate-wallet-metadata';
const WALLET_KMS_KEY_ID = process.env.WALLET_KMS_KEY_ID;
const APP_SECRETS_KMS_KEY_ID = process.env.APP_SECRETS_KMS_KEY_ID;
const HEDERA_NETWORK = process.env.HEDERA_NETWORK || 'testnet';

// Hedera network configuration
const NETWORK_CONFIG = {
    testnet: {
        nodes: { '0.testnet.hedera.com:50211': new AccountId(3) },
        mirrorNodeUrl: 'https://testnet.mirrornode.hedera.com'
    },
    mainnet: {
        nodes: { '35.237.200.180:50211': new AccountId(3) },
        mirrorNodeUrl: 'https://mainnet-public.mirrornode.hedera.com'
    }
};

// CORS headers function
function getCorsHeaders(event) {
  const origin = event?.headers?.origin || event?.headers?.Origin || 'http://localhost:5173';
  
  // Define allowed origins
  const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://safemate.com',
    'https://www.safemate.com'
  ];
  
  // Check if origin is allowed
  const allowOrigin = allowedOrigins.includes(origin) ? origin : 'null';
  
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token,x-cognito-id-token,x-cognito-access-token',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
  };
}

/**
 * Generate Ed25519 keypair for Hedera wallet
 */
function generateHederaKeypair() {
  try {
    const privateKey = PrivateKey.generateED25519();
    const publicKey = privateKey.publicKey;
    
    return {
      privateKey: privateKey.toString(),
      publicKey: publicKey.toString(),
      publicKeyRaw: publicKey.toStringRaw()
    };
  } catch (error) {
    console.error('❌ Failed to generate Hedera keypair:', error);
    throw new Error('Failed to generate wallet keys');
  }
}

/**
 * Encrypt private key using AWS KMS (SDK v2)
 */
async function encryptPrivateKey(privateKey, keyId) {
  try {
    const params = {
      KeyId: keyId,
      Plaintext: Buffer.from(privateKey, 'utf8')
    };
    
    const result = await kms.encrypt(params).promise();
    return result.CiphertextBlob.toString('base64');
  } catch (error) {
    console.error('❌ Failed to encrypt private key:', error);
    throw new Error('Failed to encrypt wallet keys');
  }
}

/**
 * Decrypt private key using AWS KMS (SDK v2)
 */
async function decryptPrivateKey(encryptedKey, keyId) {
  try {
    const params = {
      KeyId: keyId,
      CiphertextBlob: Buffer.from(encryptedKey, 'base64')
    };
    
    const result = await kms.decrypt(params).promise();
    return result.Plaintext.toString('utf8');
  } catch (error) {
    console.error('❌ Failed to decrypt private key:', error);
    throw new Error('Failed to decrypt wallet keys');
  }
}

/**
 * Get operator credentials from DynamoDB (SDK v2)
 */
async function getOperatorCredentials() {
  try {
    const params = {
      TableName: WALLET_KEYS_TABLE,
      Key: { user_id: 'hedera_operator' }
    };

    const result = await dynamodb.get(params).promise();

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
 * Initialize Hedera client with operator
 */
async function initializeHederaClient() {
  try {
    const operatorCreds = await getOperatorCredentials();
    if (!operatorCreds) {
      throw new Error('No operator credentials found');
    }

    const config = NETWORK_CONFIG[HEDERA_NETWORK];
    const client = Client.forNetwork(config.nodes);
    
    const operatorAccountId = AccountId.fromString(operatorCreds.accountId);
    const operatorPrivateKey = PrivateKey.fromString(operatorCreds.privateKey);
    
    client.setOperator(operatorAccountId, operatorPrivateKey);
    
    console.log(`✅ Initialized Hedera client for ${HEDERA_NETWORK} with operator ${operatorCreds.accountId}`);
    return { client, operatorAccountId, operatorPrivateKey };
  } catch (error) {
    console.error('❌ Failed to initialize Hedera client:', error);
    throw error;
  }
}

/**
 * Store wallet data in DynamoDB (SDK v2)
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
    await dynamodb.put({
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
    }).promise();
    
    // Store wallet metadata
    await dynamodb.put({
      TableName: WALLET_METADATA_TABLE,
      Item: {
        user_id: userId,
        wallet_id: walletId,
        email: email,
        hedera_account_id: accountId,
        public_key: keypair.publicKey,
        wallet_type: 'operator_created',
        status: 'active',
        created_at: timestamp,
        network: HEDERA_NETWORK,
        needs_funding: false,
        initial_balance: initialBalance,
        transaction_id: transactionId
      }
    }).promise();
    
    console.log(`✅ Wallet data stored for user ${userId}`);
    return { walletId, accountId };
  } catch (error) {
    console.error('❌ Failed to store wallet data:', error);
    throw error;
  }
}

/**
 * Get onboarding status for a user
 */
async function getOnboardingStatus(userId) {
  try {
    const params = {
      TableName: WALLET_METADATA_TABLE,
      Key: { user_id: userId }
    };

    const result = await dynamodb.get(params).promise();
    
    if (result.Item) {
      return {
        success: true,
        hasWallet: true,
        walletId: result.Item.wallet_id,
        accountId: result.Item.hedera_account_id,
        status: result.Item.status,
        network: result.Item.network
      };
    } else {
      return {
        success: true,
        hasWallet: false
      };
    }
  } catch (error) {
    console.error('❌ Failed to get onboarding status:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Start onboarding process for a new user
 */
async function startOnboarding(userId, email) {
  try {
    console.log(`🚀 Starting onboarding for user ${userId}`);
    
    // Check if user already has a wallet
    const status = await getOnboardingStatus(userId);
    if (status.hasWallet) {
      return {
        success: true,
        message: 'User already has a wallet',
        walletId: status.walletId,
        accountId: status.accountId
      };
    }
    
    // Initialize Hedera client
    const { client } = await initializeHederaClient();
    
    // Generate keypair
    const keypair = generateHederaKeypair();
    console.log('✅ Generated Hedera keypair');
    
    // Create account alias for auto-account creation
    const accountAlias = keypair.publicKeyRaw;
    
    // Create Hedera account
    const transaction = new AccountCreateTransaction()
      .setKey(keypair.publicKey)
      .setInitialBalance(new Hbar(0.1)); // Fund with 0.1 HBAR
    
    const response = await transaction.execute(client);
    const receipt = await response.getReceipt(client);
    const accountId = receipt.accountId;
    
    console.log(`✅ Created Hedera account: ${accountId}`);
    
    // Store wallet data
    const { walletId } = await storeWalletData(
      userId, 
      email, 
      keypair, 
      accountId.toString(), 
      0.1, 
      response.transactionId.toString()
    );
    
    return {
      success: true,
      message: 'Wallet created successfully',
      walletId: walletId,
      accountId: accountId.toString(),
      transactionId: response.transactionId.toString()
    };
    
  } catch (error) {
    console.error('❌ Failed to start onboarding:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Main handler function
exports.handler = async (event) => {
  console.log('📥 Event received:', JSON.stringify(event, null, 2));
  
  const corsHeaders = getCorsHeaders(event);
  
  try {
    // Handle CORS preflight
    if (event.httpMethod === 'OPTIONS') {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'CORS preflight successful' })
      };
    }
    
    const { httpMethod, path, body } = event;
    
    // Parse request body
    let requestBody = {};
    if (body) {
      try {
        requestBody = JSON.parse(body);
      } catch (error) {
        console.error('❌ Failed to parse request body:', error);
      }
    }
    
    let response;
    
    if (httpMethod === 'POST' && path === '/onboarding/start') {
      const { userId, email } = requestBody;
      
      if (!userId || !email) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ 
            success: false, 
            error: 'userId and email are required' 
          })
        };
      }
      
      response = await startOnboarding(userId, email);
      
    } else if ((httpMethod === 'GET' || httpMethod === 'POST') && path === '/onboarding/status') {
      const { userId } = requestBody;
      
      if (!userId) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ 
            success: false, 
            error: 'userId is required' 
          })
        };
      }
      
      response = await getOnboardingStatus(userId);
      
    } else {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ 
          success: false, 
          error: 'Endpoint not found' 
        })
      };
    }
    
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(response)
    };
    
  } catch (error) {
    console.error('❌ Handler error:', error);
    
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ 
        success: false, 
        error: 'Internal server error',
        message: error.message 
      })
    };
  }
};
