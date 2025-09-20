const { Client } = require('@hashgraph/sdk');
const { KMSClient, DecryptCommand } = require('@aws-sdk/client-kms');

const kms = new KMSClient({});

/**
 * Initialize Hedera client with operator credentials
 * This is a shared utility function to eliminate duplication across services
 */
async function initializeHederaClient() {
  try {
    console.log('🔧 Initializing Hedera client...');
    
    // Get environment variables
    const HEDERA_NETWORK = process.env.HEDERA_NETWORK || 'testnet';
    const OPERATOR_ACCOUNT_ID = process.env.OPERATOR_ACCOUNT_ID;
    const OPERATOR_PRIVATE_KEY_KMS_KEY_ID = process.env.OPERATOR_PRIVATE_KEY_KMS_KEY_ID;
    
    if (!OPERATOR_ACCOUNT_ID || !OPERATOR_PRIVATE_KEY_KMS_KEY_ID) {
      throw new Error('Missing required environment variables: OPERATOR_ACCOUNT_ID or OPERATOR_PRIVATE_KEY_KMS_KEY_ID');
    }
    
    console.log(`🔧 Using Hedera network: ${HEDERA_NETWORK}`);
    console.log(`🔧 Operator account: ${OPERATOR_ACCOUNT_ID}`);
    
    // Decrypt private key from KMS
    const decryptCommand = new DecryptCommand({
      KeyId: OPERATOR_PRIVATE_KEY_KMS_KEY_ID,
      CiphertextBlob: Buffer.from(process.env.OPERATOR_PRIVATE_KEY_ENCRYPTED, 'base64')
    });
    
    const decryptResult = await kms.send(decryptCommand);
    const privateKeyString = decryptResult.Plaintext.toString();
    
    // Create Hedera client
    const client = Client.forName(HEDERA_NETWORK);
    client.setOperator(OPERATOR_ACCOUNT_ID, privateKeyString);
    
    console.log('✅ Hedera client initialized successfully');
    return client;
    
  } catch (error) {
    console.error('❌ Failed to initialize Hedera client:', error);
    throw error;
  }
}

module.exports = {
  initializeHederaClient
};
