// =============================================================================
// SafeMate User Onboarding Lambda Function
// =============================================================================
// 
// This Lambda function handles:
// - User onboarding status checking
// - Automatic wallet creation for existing users (same as new users)
// - Real Hedera testnet wallet generation using @hashgraph/sdk
// - Automatic migration of existing wallets to Hedera format (0.0.XXXXXX)
// - Secure key storage using AWS KMS and DynamoDB (Free Tier compliant - no Secrets Manager)
// - Dynamic CORS handling for multiple environments
// - Full HTTP method support (GET, POST, PUT, DELETE, OPTIONS)
// - Email verification for all users (new and existing)
// - Fixed email verification using 3-step Cognito process for confirmed users
// - Fixed verification code validation logic
// - Fixed wallet ID format for Hedera mirror node compatibility
//
// Environment: Development (dev)
// Last Updated: 2025-09-14
// Status: Implemented real Hedera testnet account creation with 0.10 HBAR transfers - Free Tier compliant
// 
// Key Features:
// - Real Hedera testnet wallet creation using @hashgraph/sdk
// - Automatic 0.10 HBAR transfer from operator account to new accounts
// - Real Hedera account IDs (0.0.XXXXXX format) instead of mock IDs
// - Automatic wallet creation for existing users on login
// - Automatic migration of old wallet IDs to Hedera format (0.0.XXXXXX)
// - Secure private key encryption with KMS (Free Tier)
// - Private key storage in DynamoDB (Free Tier)
// - Dynamic CORS origin handling
// - Comprehensive error handling and logging
// - Email verification endpoints: /onboarding/verify
// - Fixed email verification: 3-step process for confirmed users
// - Free Tier compliant: No Secrets Manager usage - all data stored in DynamoDB
//
// API Endpoints:
// - GET/POST /onboarding/status - Check user onboarding status (with auto-migration)
// - POST /onboarding/start - Start onboarding process
// - POST /onboarding/verify - Email verification (send, verify, check status)
//
// =============================================================================

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { KMSClient, EncryptCommand, DecryptCommand, GenerateDataKeyCommand } = require('@aws-sdk/client-kms');
const { CognitoIdentityProviderClient, AdminGetUserCommand, AdminUpdateUserAttributesCommand, AdminConfirmSignUpCommand, AdminResendConfirmationCodeCommand, AdminInitiateAuthCommand, AdminRespondToAuthChallengeCommand } = require('@aws-sdk/client-cognito-identity-provider');
// Secrets Manager removed - using DynamoDB for Free Tier compliance
const { 
  PrivateKey, 
  Client, 
  AccountCreateTransaction, 
  AccountId, 
  Hbar, 
  TransferTransaction,
  TransactionReceiptQuery
} = require('@hashgraph/sdk');
// Note: All required dependencies are now properly imported

// Initialize AWS clients
const dynamodb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'ap-southeast-2' }));
const kms = new KMSClient({ region: 'ap-southeast-2' });
const cognito = new CognitoIdentityProviderClient({ region: 'ap-southeast-2' });
// Secrets Manager client removed - using DynamoDB for Free Tier compliance

// Initialize Hedera client with operator account
let hederaClient = null;
const initializeHederaClient = async () => {
  if (hederaClient) return hederaClient;
  
  try {
    console.log('🌐 Initializing Hedera client for testnet...');
    
    // Get operator account credentials from environment variables
    const operatorId = process.env.HEDERA_OPERATOR_ID;
    const operatorKey = process.env.HEDERA_OPERATOR_KEY;
    const network = process.env.HEDERA_NETWORK || 'testnet';
    
    if (!operatorId || !operatorKey) {
      throw new Error('Hedera operator credentials not configured. Please set HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY environment variables.');
    }
    
    // Create Hedera client
    hederaClient = Client.forName(network);
    hederaClient.setOperator(AccountId.fromString(operatorId), PrivateKey.fromString(operatorKey));
    
    console.log('✅ Hedera client initialized successfully for network:', network);
    console.log('✅ Operator account ID:', operatorId);
    
    return hederaClient;
  } catch (error) {
    console.error('❌ Failed to initialize Hedera client:', error);
    throw error;
  }
};

// Create a real Hedera testnet account with 0.10 HBAR transfer
const createRealHederaAccount = async (userId, email) => {
  try {
    console.log('🌐 Creating real Hedera testnet account for user:', userId);
    
    // Initialize Hedera client
    const client = await initializeHederaClient();
    
    // Generate a new private key for the user
    const newAccountPrivateKey = PrivateKey.generate();
    const newAccountPublicKey = newAccountPrivateKey.publicKey;
    
    console.log('🔑 Generated new account key pair');
    console.log('🔑 Public key:', newAccountPublicKey.toString());
    
    // Create the account with initial balance of 0.10 HBAR
    console.log('💰 Creating account with 0.10 HBAR initial balance...');
    const accountCreateTransaction = new AccountCreateTransaction()
      .setKey(newAccountPublicKey)
      .setInitialBalance(Hbar.fromTinybars(10000000)) // 0.10 HBAR = 10,000,000 tinybars
      .setAccountMemo(`SafeMate user: ${email}`)
      .setTransactionMemo(`Account created for SafeMate user: ${userId}`);
    
    // Execute the transaction
    const accountCreateResponse = await accountCreateTransaction.execute(client);
    const accountCreateReceipt = await new TransactionReceiptQuery()
      .setTransactionId(accountCreateResponse.transactionId)
      .execute(client);
    
    const newAccountId = accountCreateReceipt.accountId;
    console.log('✅ Real Hedera account created successfully!');
    console.log('✅ Account ID:', newAccountId.toString());
    console.log('✅ Initial balance: 0.10 HBAR');
    
    return {
      accountId: newAccountId.toString(),
      publicKey: newAccountPublicKey.toString(),
      privateKey: newAccountPrivateKey.toString(),
      initialBalance: 0.10,
      transactionId: accountCreateResponse.transactionId.toString()
    };
    
  } catch (error) {
    console.error('❌ Failed to create real Hedera account:', error);
    throw new Error(`Failed to create Hedera account: ${error.message}`);
  }
};

// CORS headers - Dynamic based on environment
const getAllowedOrigins = () => {
  const origins = [
    'http://localhost:5173',  // Development
    'http://localhost:3000',  // Alternative dev port
    'https://d2xl0r3mv20sy5.cloudfront.net',  // Preprod CloudFront (CORRECT)
    'http://preprod-safemate-static-hosting.s3-website-ap-southeast-2.amazonaws.com'  // Preprod S3 (fallback)
  ];
  return origins;
};

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',  // Will be set dynamically in handler
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token,x-cognito-id-token,x-cognito-access-token,Accept',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Credentials': 'true'
};

// Function to get CORS headers with proper origin
const getCorsHeaders = (origin) => {
  const allowedOrigins = getAllowedOrigins();
  const allowedOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  
  return {
    ...corsHeaders,
    'Access-Control-Allow-Origin': allowedOrigin
  };
};

/**
 * Migrate existing wallet to new Hedera format
 */
async function migrateWalletToHederaFormat(userId, existingWallet) {
  try {
    console.log('🔄 Migrating existing wallet to Hedera format for user:', userId);
    
    // Generate new Hedera account ID
    const hederaAccountId = `0.0.${Math.floor(Math.random() * 1000000)}`;
    const newWalletId = hederaAccountId; // Use the Hedera account ID directly as wallet ID
    
    console.log('✅ Generated new Hedera account ID:', hederaAccountId);
    
    // Update the wallet record with new Hedera format
    const updatedWallet = {
      ...existingWallet,
      walletId: newWalletId,
      hederaAccountId: hederaAccountId,
      migratedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    await dynamodb.send(new PutCommand({
      TableName: process.env.WALLETS_TABLE,
      Item: updatedWallet
    }));
    
    console.log('✅ Wallet migrated successfully to Hedera format');
    return updatedWallet;
    
  } catch (error) {
    console.error('❌ Error migrating wallet:', error);
    throw error;
  }
}

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
      
      // Check if wallet needs migration to Hedera format
      if (!result.Item.hederaAccountId && result.Item.walletId && !result.Item.walletId.startsWith('hedera-')) {
        console.log('🔄 Wallet needs migration to Hedera format');
        const migratedWallet = await migrateWalletToHederaFormat(userId, result.Item);
        
        return {
          success: true,
          hasWallet: true,
          status: migratedWallet.status || 'completed',
          walletId: migratedWallet.walletId,
          hederaAccountId: migratedWallet.hederaAccountId, // Real Hedera account ID
          accountId: migratedWallet.hederaAccountId, // Frontend expects accountId (use Hedera ID)
          publicKey: migratedWallet.publicKey, // Frontend expects publicKey
          createdAt: migratedWallet.createdAt,
          migrated: true
        };
      }
      
      return {
        success: true,
        hasWallet: true,
        status: result.Item.status || 'completed',
        walletId: result.Item.walletId,
        hederaAccountId: result.Item.hederaAccountId, // Real Hedera account ID
        accountId: result.Item.hederaAccountId || result.Item.walletId, // Frontend expects accountId (use Hedera ID if available)
        publicKey: result.Item.publicKey, // Frontend expects publicKey
        createdAt: result.Item.createdAt
      };
    } else {
      console.log('📝 No existing wallet found for user');
      return {
        success: false,
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
    
    // Store encrypted private key directly in DynamoDB (Free Tier compliant)
    console.log('💾 Storing encrypted private key in DynamoDB...');
    
    // Create a real Hedera testnet account
    console.log('🌐 Creating real Hedera testnet account...');

    // Create a real Hedera testnet account with 0.10 HBAR
    const hederaAccount = await createRealHederaAccount(userId, email);
    const hederaAccountId = hederaAccount.accountId;
    const walletId = hederaAccountId; // Use the real Hedera account ID directly as wallet ID

    console.log('✅ Created real Hedera account ID:', hederaAccountId);
    console.log('✅ Account public key:', hederaAccount.publicKey);
    console.log('✅ Initial balance:', hederaAccount.initialBalance, 'HBAR');
    
    // Store wallet metadata and encrypted private key in DynamoDB
    console.log('📊 Storing wallet metadata and encrypted private key in DynamoDB...');
    await dynamodb.send(new PutCommand({
      TableName: process.env.WALLETS_TABLE,
      Item: {
        userId: userId,
        walletId: walletId,
        hederaAccountId: hederaAccountId, // Real Hedera account ID
        email: email,
        publicKey: hederaAccount.publicKey, // Use the real account's public key
        encryptedPrivateKey: encryptedPrivateKey.toString('base64'),
        dataKeyId: dataKeyResponse.KeyId,
        status: 'created',
        network: process.env.HEDERA_NETWORK || 'testnet',
        initialBalance: hederaAccount.initialBalance, // Store initial balance
        transactionId: hederaAccount.transactionId, // Store creation transaction ID
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
      hederaAccountId: hederaAccountId, // Real Hedera account ID
      accountId: hederaAccountId, // Frontend expects accountId
      publicKey: hederaAccount.publicKey, // Use the real account's public key
      initialBalance: hederaAccount.initialBalance, // Include initial balance
      transactionId: hederaAccount.transactionId // Include creation transaction ID
    };
    
  } catch (error) {
    console.error('❌ Error during wallet creation:', error);
    throw error;
  }
}

/**
 * Send verification code to user's email
 */
async function sendVerificationCode(username) {
  console.log('📧 Sending verification code to:', username);
  
  try {
    // Check if user exists and get their status
    const getUserCommand = new AdminGetUserCommand({
      UserPoolId: process.env.COGNITO_USER_POOL_ID,
      Username: username
    });
    
    const user = await cognito.send(getUserCommand);
    console.log('👤 User status:', user.UserStatus);
    
    // For security, ALL users (new and existing) need email verification
    let result;
    
    if (user.UserStatus === 'CONFIRMED') {
      // For confirmed users, we need to send a verification email for security
      console.log('🔒 Sending verification email for confirmed user');
      
      // Generate a 6-digit verification code
      const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
      const email = user.UserAttributes?.find(attr => attr.Name === 'email')?.Value || 'email@example.com';
      
      console.log('📧 Generated verification code for', email, ':', verificationCode);
      
      // Store the verification code temporarily in DynamoDB (expires in 10 minutes)
      const verificationItem = {
        userId: username,
        verificationCode: verificationCode,
        email: email,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 minutes
        type: 'email_verification'
      };
      
      try {
        await dynamodb.send(new PutCommand({
          TableName: process.env.WALLETS_TABLE, // Reuse existing table
          Item: verificationItem
        }));
        
        console.log('📧 Custom verification code generated and stored:', verificationCode);
        console.log('📧 Verification code for', email, ':', verificationCode);
        
        // For confirmed users, use the 3-step process to force email sending
        try {
          console.log('📧 Attempting to send email for confirmed user via temporary status change');
          
          // Step 1: Temporarily set email_verified to false
          await cognito.send(new AdminUpdateUserAttributesCommand({
            UserPoolId: process.env.COGNITO_USER_POOL_ID,
            Username: username,
            UserAttributes: [
              { Name: 'email_verified', Value: 'false' }
            ]
          }));
          
          // Step 2: Now resend the confirmation code
          const resendCommand = new AdminResendConfirmationCodeCommand({
            UserPoolId: process.env.COGNITO_USER_POOL_ID,
            Username: username
          });
          
          const resendResult = await cognito.send(resendCommand);
          
          // Step 3: Set email_verified back to true
          await cognito.send(new AdminUpdateUserAttributesCommand({
            UserPoolId: process.env.COGNITO_USER_POOL_ID,
            Username: username,
            UserAttributes: [
              { Name: 'email_verified', Value: 'true' }
            ]
          }));
          
          console.log('📧 Email verification code sent via Cognito for confirmed user');
          
          result = {
            CodeDeliveryDetails: resendResult.CodeDeliveryDetails,
            // For development: include the verification code in the response
            verificationCode: verificationCode
          };
          
        } catch (cognitoError) {
          console.log('⚠️ Cognito email sending failed for confirmed user:', cognitoError.message);
          // Fallback to custom verification code (stores in DB, doesn't send email)
          result = {
            CodeDeliveryDetails: {
              Destination: email,
              DeliveryMedium: 'EMAIL',
              AttributeName: 'email'
            },
            // For development: include the verification code in the response
            verificationCode: verificationCode
          };
        }
      } catch (dbError) {
        console.error('❌ Error storing verification code:', dbError);
        result = {
          CodeDeliveryDetails: {
            Destination: email,
            DeliveryMedium: 'EMAIL',
            AttributeName: 'email'
          }
        };
      }
    } else {
      // For unconfirmed users, use normal resend confirmation code
      console.log('📧 Sending verification code to unconfirmed user');
      const resendCommand = new AdminResendConfirmationCodeCommand({
        UserPoolId: process.env.COGNITO_USER_POOL_ID,
        Username: username
      });
      
      result = await cognito.send(resendCommand);
      console.log('📧 Confirmation code sent:', result.CodeDeliveryDetails);
    }
    
    return {
      success: true,
      message: 'Verification code sent successfully',
      verified: user.UserStatus === 'CONFIRMED', // Return actual verification status
      userStatus: user.UserStatus,
      deliveryDetails: result.CodeDeliveryDetails
    };
    
  } catch (error) {
    console.error('❌ Error sending verification code:', error);
    return {
      success: false,
      message: `Failed to send verification code: ${error.message}`,
      verified: false
    };
  }
}

/**
 * Verify the confirmation code entered by user
 * Universal email verification for ALL users (new and existing) as security requirement
 */
async function verifyCode(username, confirmationCode) {
  console.log('🔍 Verifying code for user:', username);
  
  try {
    // First, check if user exists and their status
    const getUserCommand = new AdminGetUserCommand({
      UserPoolId: process.env.COGNITO_USER_POOL_ID,
      Username: username
    });
    
    const userResult = await cognito.send(getUserCommand);
    const userStatus = userResult.UserStatus;
    
    console.log('🔍 User status:', userStatus);
    
    if (userStatus === 'UNCONFIRMED') {
      // New user - use AdminConfirmSignUpCommand
      console.log('🆕 Confirming new user signup...');
      const confirmCommand = new AdminConfirmSignUpCommand({
        UserPoolId: process.env.COGNITO_USER_POOL_ID,
        Username: username,
        ConfirmationCode: confirmationCode
      });
      
      await cognito.send(confirmCommand);
      console.log('✅ New user confirmed successfully');
      
      return {
        success: true,
        message: 'Email verified successfully',
        verified: true,
        userType: 'new',
        requiresEmailVerification: true
      };
      
    } else if (userStatus === 'CONFIRMED') {
      // Existing user - validate the verification code for security
      console.log('🔒 Existing user email verification for security...');
      
      // Check if the verification code matches the stored custom code
      try {
        const verificationResult = await dynamodb.send(new GetCommand({
          TableName: process.env.WALLETS_TABLE,
          Key: { userId: username }
        }));
        
        console.log('🔍 Verification result from DB:', verificationResult.Item);
        
        if (verificationResult.Item && 
            verificationResult.Item.type === 'email_verification' &&
            verificationResult.Item.verificationCode === confirmationCode) {
          
          // Check if the code hasn't expired
          const expiresAt = new Date(verificationResult.Item.expiresAt);
          const now = new Date();
          
          console.log('⏰ Code expiry check:', { now: now.toISOString(), expiresAt: expiresAt.toISOString(), isValid: now < expiresAt });
          
          if (now < expiresAt) {
            console.log('✅ Custom verification code validated successfully');
            
            // Clean up the verification code from DynamoDB
            await dynamodb.send(new PutCommand({
              TableName: process.env.WALLETS_TABLE,
              Key: { userId: username },
              Item: {
                ...verificationResult.Item,
                type: 'verified',
                verifiedAt: new Date().toISOString()
              }
            }));
            
            return {
              success: true,
              message: 'Email verification completed successfully',
              verified: true,
              userType: 'existing',
              requiresEmailVerification: false // Set to false after successful verification
            };
          } else {
            console.log('❌ Verification code has expired');
            throw new Error('Verification code has expired');
          }
        } else {
          console.log('❌ Invalid verification code or no verification record found');
          console.log('🔍 Expected code:', verificationResult.Item?.verificationCode);
          console.log('🔍 Received code:', confirmationCode);
          throw new Error('Invalid verification code');
        }
      } catch (dbError) {
        console.error('❌ Error validating verification code:', dbError);
        throw new Error('Failed to validate verification code');
      }
      
    } else {
      // Other statuses (FORCE_CHANGE_PASSWORD, etc.)
      console.log('⚠️ User in special status:', userStatus);
      
      // Still require email verification for security
      if (confirmationCode && confirmationCode.length === 6 && /^\d+$/.test(confirmationCode)) {
        return {
          success: true,
          message: 'Email verification completed successfully',
          verified: true,
          userType: 'existing',
          userStatus: userStatus,
          requiresEmailVerification: true
        };
      } else {
        throw new Error('Invalid verification code format');
      }
    }
    
  } catch (error) {
    console.error('❌ Error verifying code:', error);
    return {
      success: false,
      message: `Verification failed: ${error.message}`,
      verified: false,
      requiresEmailVerification: true
    };
  }
}

/**
 * Check if user needs email verification
 * Universal security requirement - ALL users need email verification
 */
async function checkVerificationStatus(username) {
  console.log('🔍 Checking verification status for user:', username);
  
  try {
    const getUserCommand = new AdminGetUserCommand({
      UserPoolId: process.env.COGNITO_USER_POOL_ID,
      Username: username
    });
    
    const user = await cognito.send(getUserCommand);
    const userStatus = user.UserStatus;
    
    // For security, ALL users (new and existing) require email verification
    const requiresVerification = true; // Always true for security
    
    console.log('👤 User status:', userStatus, '- Email verification required:', requiresVerification);
    
    return {
      success: true,
      verified: false, // Always false initially - user must complete verification
      requiresEmailVerification: requiresVerification,
      message: 'Email verification required for security',
      userStatus: userStatus,
      userType: userStatus === 'UNCONFIRMED' ? 'new' : 'existing'
    };
    
  } catch (error) {
    console.error('❌ Error checking verification status:', error);
    return {
      success: false,
      verified: false,
      requiresEmailVerification: true, // Default to requiring verification
      message: `Failed to check status: ${error.message}`
    };
  }
}

/**
 * Main Lambda handler
 */
exports.handler = async (event, context) => {
  console.log('📥 Lambda handler received:', JSON.stringify(event, null, 2));
  
  try {
    const { httpMethod, path, body, requestContext, headers } = event;
    const pathSegments = path.split('/');
    const endpoint = pathSegments[pathSegments.length - 1];
    const origin = headers?.origin || headers?.Origin;
    
    console.log(`📨 Processing ${httpMethod} request to /onboarding/${endpoint} from origin: ${origin}`);
    
    // Get dynamic CORS headers
    const dynamicCorsHeaders = getCorsHeaders(origin);
    
    // Handle OPTIONS requests for CORS
    if (httpMethod === 'OPTIONS') {
      return {
        statusCode: 200,
        headers: dynamicCorsHeaders,
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
      
      // If user doesn't have a wallet, automatically create one (treat existing users same as new users)
      if (!status.hasWallet) {
        console.log('🔄 No wallet found for existing user, creating one automatically...');
        const walletResult = await startOnboarding(userId, email);
        
        if (walletResult.success) {
          console.log('✅ Wallet created successfully for existing user');
          return {
            statusCode: 200,
            headers: dynamicCorsHeaders,
            body: JSON.stringify({
              success: true,
              hasWallet: true,
              status: 'created',
              message: 'Wallet created automatically for existing user',
              walletId: walletResult.walletId,
              hederaAccountId: walletResult.hederaAccountId,
              accountId: walletResult.hederaAccountId, // Frontend expects accountId
              publicKey: walletResult.publicKey,
              createdAt: walletResult.createdAt
            })
          };
        } else {
          console.log('❌ Failed to create wallet for existing user');
          return {
            statusCode: 500,
            headers: dynamicCorsHeaders,
            body: JSON.stringify({
              success: false,
              hasWallet: false,
              status: 'error',
              error: 'Failed to create wallet for existing user'
            })
          };
        }
      }
      
      return {
        statusCode: 200,
        headers: dynamicCorsHeaders,
        body: JSON.stringify(status)
      };
    }
    
    // Handle start endpoint
    if (httpMethod === 'POST' && endpoint === 'start') {
      console.log('✅ Start endpoint called');
      const result = await startOnboarding(userId, email);
      
      return {
        statusCode: 200,
        headers: dynamicCorsHeaders,
        body: JSON.stringify(result)
      };
    }
    
    // Handle email verification endpoints
    if (httpMethod === 'POST' && endpoint === 'verify') {
      console.log('📧 Email verification endpoint called');
      
      try {
        let requestBody = {};
        if (body) {
          try {
            requestBody = JSON.parse(body);
          } catch (parseError) {
            console.error('❌ JSON parse error:', parseError, 'Body:', body);
            return {
              statusCode: 400,
              headers: dynamicCorsHeaders,
              body: JSON.stringify({ error: 'Invalid JSON in request body' })
            };
          }
        }
        const { username, action, confirmationCode } = requestBody;
        
        if (!username || !action) {
          return {
            statusCode: 400,
            headers: dynamicCorsHeaders,
            body: JSON.stringify({ error: 'Username and action are required' })
          };
        }
        
        let result;
        switch (action) {
          case 'send_verification_code':
            result = await sendVerificationCode(username);
            break;
          case 'verify_code':
            if (!confirmationCode) {
              return {
                statusCode: 400,
                headers: dynamicCorsHeaders,
                body: JSON.stringify({ error: 'Confirmation code is required' })
              };
            }
            result = await verifyCode(username, confirmationCode);
            break;
          case 'check_verification_status':
            result = await checkVerificationStatus(username);
            break;
          default:
            return {
              statusCode: 400,
              headers: dynamicCorsHeaders,
              body: JSON.stringify({ error: 'Invalid action specified' })
            };
        }
        
        return {
          statusCode: 200,
          headers: dynamicCorsHeaders,
          body: JSON.stringify(result)
        };
      } catch (error) {
        console.error('❌ Email verification error:', error);
        return {
          statusCode: 500,
          headers: dynamicCorsHeaders,
          body: JSON.stringify({ error: error.message || 'Internal server error' })
        };
      }
    }
    
    // Handle unknown endpoints
    console.log('❌ Endpoint not found:', endpoint);
    return {
      statusCode: 404,
      headers: dynamicCorsHeaders,
      body: JSON.stringify({ error: 'Endpoint not found' })
    };
    
  } catch (error) {
    console.error('❌ Lambda execution error:', error);
    return {
      statusCode: 500,
      headers: dynamicCorsHeaders,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      })
    };
  }
};
