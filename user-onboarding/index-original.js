const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { KMSClient, EncryptCommand, DecryptCommand } = require('@aws-sdk/client-kms');
const { Client, PrivateKey, AccountId, AccountCreateTransaction, Hbar } = require('@hashgraph/sdk');
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

// CORS headers
const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': 'http://localhost:5173',
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
};

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
 * Store wallet data in DynamoDB (operator-funded approach)
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
        wallet_type: 'operator_created',
        status: 'active',
        created_at: timestamp,
        network: HEDERA_NETWORK,
        needs_funding: false,
        initial_balance: initialBalance,
        current_balance: initialBalance,
        account_type: 'operator_created',
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
    // Check if user has wallet metadata
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
      return {
        hasWallet: true,
        status: wallet.status,
        walletId: wallet.wallet_id,
        hederaAccountId: wallet.hedera_account_id || wallet.hedera_account_alias,
        publicKey: wallet.public_key,
        accountType: wallet.account_type,
        needsFunding: wallet.needs_funding || false,
        message: 'Wallet found successfully'
      };
    } else {
      return {
        hasWallet: false,
        status: 'pending',
        message: 'No wallet found for user'
      };
    }
  } catch (error) {
    console.error('❌ Failed to get onboarding status:', error);
    return {
      hasWallet: false,
      status: 'error',
      message: 'Failed to check wallet status'
    };
  }
}

/**
 * Start onboarding process - Create operator-funded Hedera wallet
 */
async function startOnboarding(userId, email) {
  console.log('🚀 Starting operator-funded onboarding for user:', userId, 'email:', email);
  
  try {
    // Check if user already has a wallet
    const existingStatus = await getOnboardingStatus(userId);
    if (existingStatus.hasWallet) {
      return {
        success: true,
        hasWallet: true,
        hedera_account_id: existingStatus.hederaAccountId,
        public_key: existingStatus.publicKey,
        wallet_id: existingStatus.walletId,
        account_type: existingStatus.accountType,
        needs_funding: existingStatus.needsFunding,
        message: 'Wallet already exists for user'
      };
    }
    
    // Initialize Hedera client with operator
    console.log('🔧 Initializing Hedera client with operator...');
    const { client, operatorPrivateKey } = await initializeHederaClient();
    
    // Generate new key pair for user
    console.log('🔑 Generating Hedera keypair for user...');
    const keypair = generateHederaKeypair();
    const userPrivateKey = PrivateKey.fromString(keypair.privateKey);
    const userPublicKey = userPrivateKey.publicKey;
    
    // Create account transaction with initial funding (1 HBAR)
    const initialBalance = 100000000; // 1 HBAR in tinybars
    console.log('🏗️ Creating Hedera account with operator funding...');
    
    const transaction = new AccountCreateTransaction()
      .setKey(userPublicKey)
      .setInitialBalance(Hbar.fromTinybars(initialBalance))
      .setAccountMemo(`SafeMate wallet for user ${userId}`)
      .freezeWith(client);

    const signedTransaction = await transaction.sign(operatorPrivateKey);
    const response = await signedTransaction.execute(client);
    const receipt = await response.getReceipt(client);
    const accountId = receipt.accountId;
    
    console.log('✅ Hedera account created:', accountId.toString());
    
    // Store wallet data in DynamoDB
    console.log('💾 Storing wallet data...');
    const walletId = await storeWalletData(
      userId, 
      email, 
      keypair, 
      accountId.toString(), 
      initialBalance,
      response.transactionId.toString()
    );
    
    console.log('✅ Operator-funded wallet creation completed successfully');
    
    return {
      success: true,
      hedera_account_id: accountId.toString(),
      wallet_id: walletId,
      public_key: keypair.publicKey,
      is_hedera_key: true,
      account_type: 'operator_created',
      message: 'Hedera wallet created successfully using operator funding',
      needs_funding: false,
      initial_balance: initialBalance,
      initial_balance_hbar: (initialBalance / 100000000),
      network: HEDERA_NETWORK,
      encryption_type: 'kms',
      transaction_id: response.transactionId.toString()
    };
    
  } catch (error) {
    console.error('❌ Failed to create operator-funded wallet:', error);
    throw new Error(`Operator-funded wallet creation failed: ${error.message}`);
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
    
    // Extract user info from JWT token (if authorization is enabled) or request body
    let userId, email;
    if (requestContext?.authorizer?.claims) {
      const userClaims = requestContext.authorizer.claims;
      userId = userClaims.sub;
      email = userClaims.email;
      console.log('👤 User info from JWT:', { userId, email });
    } else if (requestBody.user_id && requestBody.email) {
      // Use data from request body
      userId = requestBody.user_id;
      email = requestBody.email;
      console.log('👤 User info from request body:', { userId, email });
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
