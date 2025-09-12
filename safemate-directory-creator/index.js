const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { KMSClient, EncryptCommand, DecryptCommand } = require('@aws-sdk/client-kms');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { 
  Client, 
  PrivateKey, 
  AccountId, 
  TokenCreateTransaction, 
  TokenMintTransaction,
  TokenUpdateTransaction,
  TokenAssociateTransaction,
  TransferTransaction,
  TokenId,
  TokenType,
  TokenSupplyType,
  Hbar,
  FileCreateTransaction,
  FileAppendTransaction,
  FileId
} = require('@hashgraph/sdk');

// Initialize AWS services
const dynamoClient = new DynamoDBClient({});
const dynamodb = DynamoDBDocumentClient.from(dynamoClient);
const kms = new KMSClient({});
const secretsManager = new SecretsManagerClient({});

// Environment variables
const ADMIN_ACCOUNT_ID = '0.0.6469313';
const ADMIN_PRIVATE_KEY = '0x99ed017334943fab1e0c04474c7e06e99a1bec93413df3aae89aabce3e369783';
const HEDERA_NETWORK = process.env.HEDERA_NETWORK || 'testnet';
const SAFEMATE_DIRECTORIES_TABLE = process.env.SAFEMATE_DIRECTORIES_TABLE || 'default-safemate-directories';

// SafeMate Directory NFT Configuration
const SAFEMATE_DIRECTORY_CONFIG = {
  name: 'SafeMate User Directory',
  symbol: 'SAFEMATE-DIR',
  decimals: 0,
  maxSupply: 1000000, // 1 million max directories
  metadataVersion: '1.0.0'
};

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

class SafeMateDirectoryCreator {
  constructor() {
    this.client = null;
    this.adminAccountId = AccountId.fromString(ADMIN_ACCOUNT_ID);
    this.adminPrivateKey = PrivateKey.fromString(ADMIN_PRIVATE_KEY);
    this.directoryTokenId = null;
    this.supplyKey = null;
    this.adminKey = null;
  }

  async initialize() {
    try {
      // Get secure credentials
      const credentials = await this.getSecureCredentials();
      
      // Initialize Hedera client with secure credentials
      this.client = Client.forNetwork(NETWORK_CONFIG[HEDERA_NETWORK].nodes);
      this.adminAccountId = AccountId.fromString(credentials.accountId);
      this.adminPrivateKey = PrivateKey.fromString(credentials.privateKey);
      this.client.setOperator(this.adminAccountId, this.adminPrivateKey);

      // Initialize or get existing directory token
      await this.initializeDirectoryToken();
      
      console.log('✅ SafeMate Directory Creator initialized successfully with secure credentials');
    } catch (error) {
      console.error('❌ Failed to initialize SafeMate Directory Creator:', error);
      throw error;
    }
  }

  async initializeDirectoryToken() {
    try {
      // Check if directory token already exists
      const storedToken = await this.getStoredDirectoryToken();
      if (storedToken) {
        this.directoryTokenId = TokenId.fromString(storedToken.token_id);
        this.supplyKey = PrivateKey.fromString(await this.decryptData(storedToken.encrypted_supply_key, process.env.DIRECTORY_KMS_KEY_ID || '0df54397-e4ad-4d29-a2b7-edc474aa01d4'));
        this.adminKey = this.adminPrivateKey;
        console.log(`✅ Using existing directory token: ${this.directoryTokenId.toString()}`);
        return this.directoryTokenId;
      }

      // Create new directory token
      console.log('🏗️ Creating new SafeMate Directory token...');
      
      const supplyKey = PrivateKey.generateED25519();
      const adminKey = this.adminPrivateKey;

      const transaction = new TokenCreateTransaction()
        .setTokenName(SAFEMATE_DIRECTORY_CONFIG.name)
        .setTokenSymbol(SAFEMATE_DIRECTORY_CONFIG.symbol)
        .setDecimals(SAFEMATE_DIRECTORY_CONFIG.decimals)
        .setTokenType(TokenType.NonFungibleUnique)
        .setSupplyType(TokenSupplyType.Finite)
        .setMaxSupply(SAFEMATE_DIRECTORY_CONFIG.maxSupply)
        .setTreasuryAccountId(this.adminAccountId)
        .setAdminKey(adminKey.publicKey)
        .setSupplyKey(supplyKey.publicKey)
        .setTokenMemo('SafeMate user directory NFT with updatable metadata')
        .freezeWith(this.client);

      const signedTransaction = await transaction.sign(adminKey);
      const response = await signedTransaction.execute(this.client);
      const receipt = await response.getReceipt(this.client);
      const tokenId = receipt.tokenId;

      // Store token info with encrypted keys
      const encryptedSupplyKey = await this.encryptData(
        supplyKey.toString(),
        process.env.DIRECTORY_KMS_KEY_ID || '0df54397-e4ad-4d29-a2b7-edc474aa01d4'
      );

      await dynamodb.send(new PutCommand({
        TableName: SAFEMATE_DIRECTORIES_TABLE,
        Item: {
          token_id: tokenId.toString(),
          encrypted_supply_key: encryptedSupplyKey,
          admin_account_id: this.adminAccountId.toString(),
          created_at: new Date().toISOString(),
          max_supply: SAFEMATE_DIRECTORY_CONFIG.maxSupply,
          current_supply: 0,
          metadata_version: SAFEMATE_DIRECTORY_CONFIG.metadataVersion
        }
      }));

      this.directoryTokenId = tokenId;
      this.supplyKey = supplyKey;
      this.adminKey = adminKey;

      console.log(`✅ Created SafeMate Directory token: ${tokenId.toString()}`);
      return tokenId;

    } catch (error) {
      console.error('❌ Failed to initialize directory token:', error);
      throw error;
    }
  }

  async getStoredDirectoryToken() {
    try {
      const result = await dynamodb.send(new ScanCommand({
        TableName: SAFEMATE_DIRECTORIES_TABLE,
        Limit: 1
      }));

      return result.Items?.[0] || null;
    } catch (error) {
      console.error('❌ Failed to get stored directory token:', error);
      return null;
    }
  }

  async getSecureCredentials() {
    try {
      // Get admin credentials from Secrets Manager
      const secretResult = await secretsManager.send(new GetSecretValueCommand({
        SecretId: 'safemate/admin-credentials'
      }));

      const credentials = JSON.parse(secretResult.SecretString);
      
      // Decrypt private key if it's encrypted
      if (credentials.encryptedPrivateKey) {
        const decryptedKey = await this.decryptData(
          credentials.encryptedPrivateKey,
          process.env.ADMIN_KMS_KEY_ID || '0df54397-e4ad-4d29-a2b7-edc474aa01d4'
        );
        credentials.privateKey = decryptedKey;
      }

      return credentials;
    } catch (error) {
      console.error('❌ Failed to get secure credentials:', error);
      // Fallback to environment variables for development
      return {
        accountId: ADMIN_ACCOUNT_ID,
        privateKey: ADMIN_PRIVATE_KEY
      };
    }
  }

  async encryptData(data, keyId) {
    try {
      const result = await kms.send(new EncryptCommand({
        KeyId: keyId,
        Plaintext: Buffer.from(data)
      }));

      return result.CiphertextBlob.toString('base64');
    } catch (error) {
      console.error('❌ Failed to encrypt data:', error);
      throw error;
    }
  }

  async decryptData(encryptedData, keyId) {
    try {
      const result = await kms.send(new DecryptCommand({
        CiphertextBlob: Buffer.from(encryptedData, 'base64')
      }));

      return result.Plaintext.toString();
    } catch (error) {
      console.error('❌ Failed to decrypt data:', error);
      throw error;
    }
  }

  async createUserDirectory(userId, userEmail, userAccountId) {
    try {
      console.log(`🏗️ Creating SafeMate directory for user: ${userId} (${userEmail})`);

      // Create user guide content
      const userGuideContent = this.generateUserGuide(userEmail, userAccountId);
      
      // Create metadata for the NFT
      const metadata = {
        name: `SafeMate Directory - ${userEmail}`,
        description: 'Your personal SafeMate directory with user guide and resources',
        image: 'https://safemate.io/assets/directory-icon.png',
        attributes: [
          { trait_type: 'User ID', value: userId },
          { trait_type: 'Email', value: userEmail },
          { trait_type: 'Hedera Account', value: userAccountId },
          { trait_type: 'Created Date', value: new Date().toISOString() },
          { trait_type: 'Version', value: SAFEMATE_DIRECTORY_CONFIG.metadataVersion },
          { trait_type: 'Type', value: 'User Directory' }
        ],
        properties: {
          files: [
            {
              name: 'user-guide.md',
              content: userGuideContent,
              type: 'text/markdown',
              size: userGuideContent.length
            },
            {
              name: 'welcome-message.txt',
              content: this.generateWelcomeMessage(userEmail),
              type: 'text/plain',
              size: this.generateWelcomeMessage(userEmail).length
            }
          ],
          directory: {
            name: 'safemate',
            structure: [
              'user-guide.md',
              'welcome-message.txt',
              'getting-started/',
              'resources/',
              'updates/'
            ]
          }
        }
      };

      // Mint NFT with metadata
      const serialNumber = await this.mintDirectoryNFT(userAccountId, metadata);
      
      // Store directory record
      await this.storeDirectoryRecord(userId, userEmail, userAccountId, serialNumber, metadata);

      console.log(`✅ SafeMate directory created successfully for user ${userId}`);
      
      return {
        success: true,
        directoryTokenId: this.directoryTokenId.toString(),
        serialNumber: serialNumber,
        metadata: metadata,
        message: 'SafeMate directory created successfully'
      };

    } catch (error) {
      console.error('❌ Failed to create user directory:', error);
      throw error;
    }
  }

  async mintDirectoryNFT(userAccountId, metadata) {
    try {
      console.log(`🎨 Minting directory NFT for account: ${userAccountId}`);

      // Create metadata file on Hedera
      const metadataFile = new FileCreateTransaction()
        .setKeys(this.adminKey.publicKey)
        .setContents(JSON.stringify(metadata, null, 2))
        .setFileMemo('SafeMate Directory Metadata')
        .freezeWith(this.client);

      const signedFileTx = await metadataFile.sign(this.adminKey);
      const fileResponse = await signedFileTx.execute(this.client);
      const fileReceipt = await fileResponse.getReceipt(this.client);
      const fileId = fileReceipt.fileId;

      // Mint NFT with file ID as metadata
      const mintTransaction = new TokenMintTransaction()
        .setTokenId(this.directoryTokenId)
        .setMetadata([Buffer.from(fileId.toString())])
        .freezeWith(this.client);

      const signedMintTx = await mintTransaction.sign(this.supplyKey);
      const mintResponse = await signedMintTx.execute(this.client);
      const mintReceipt = await mintResponse.getReceipt(this.client);
      const serialNumber = mintReceipt.serialNumbers[0];

      // Transfer NFT to user account
      const transferTransaction = new TransferTransaction()
        .addNftTransfer(this.directoryTokenId, serialNumber, this.adminAccountId, AccountId.fromString(userAccountId))
        .freezeWith(this.client);

      const signedTransferTx = await transferTransaction.sign(this.adminKey);
      await signedTransferTx.execute(this.client);

      console.log(`✅ Minted and transferred directory NFT (Serial: ${serialNumber}) to ${userAccountId}`);
      return serialNumber;

    } catch (error) {
      console.error('❌ Failed to mint directory NFT:', error);
      throw error;
    }
  }

  async storeDirectoryRecord(userId, userEmail, userAccountId, serialNumber, metadata) {
    try {
      await dynamodb.send(new PutCommand({
        TableName: SAFEMATE_DIRECTORIES_TABLE,
        Item: {
          user_id: userId,
          user_email: userEmail,
          hedera_account_id: userAccountId,
          directory_token_id: this.directoryTokenId.toString(),
          serial_number: serialNumber,
          metadata: metadata,
          created_at: new Date().toISOString(),
          status: 'active',
          version: SAFEMATE_DIRECTORY_CONFIG.metadataVersion
        }
      }));

      console.log(`✅ Stored directory record for user ${userId}`);
    } catch (error) {
      console.error('❌ Failed to store directory record:', error);
      throw error;
    }
  }

  generateUserGuide(userEmail, userAccountId) {
    return `# SafeMate User Guide

## Welcome to SafeMate! 🚀

**User**: ${userEmail}
**Hedera Account**: ${userAccountId}
**Created**: ${new Date().toLocaleDateString()}

## Getting Started

### 1. Your SafeMate Directory
This NFT represents your personal SafeMate directory. It contains:
- User guide and documentation
- Welcome resources
- Future updates and announcements

### 2. Key Features
- **Secure File Storage**: Store files on the Hedera network
- **Group Management**: Create and manage shared wallets
- **Secure Storage**: Store files securely on Hedera testnet
- **Decentralized**: Your data, your control

### 3. Next Steps
1. Explore your dashboard
2. Create your first folder
3. Upload files to the blockchain
4. Join or create groups
5. Start earning rewards

### 4. Support
- Email: support@forevernow.world
- Documentation: https://docs.safemate.io
- Community: https://community.safemate.io

---
*This directory NFT is updatable and will receive future enhancements and features.*
`;
  }

  generateWelcomeMessage(userEmail) {
    return `Welcome to SafeMate, ${userEmail}!

You're now part of the decentralized future of file storage and sharing.

Your SafeMate directory has been created and is represented by this NFT. 
This NFT will be updated with new features, guides, and resources as SafeMate evolves.

Key things to know:
- Your files are stored securely on the Hedera network
- You own your data and have full control
- Earn rewards for participating in the ecosystem
- Join communities and share resources safely

Start exploring your SafeMate dashboard and discover the power of decentralized storage!

Best regards,
The SafeMate Team
support@forevernow.world
`;
  }

  async updateDirectoryMetadata(userId, newMetadata) {
    try {
      console.log(`🔄 Updating directory metadata for user: ${userId}`);

      // Get current directory record
      const result = await dynamodb.send(new GetCommand({
        TableName: SAFEMATE_DIRECTORIES_TABLE,
        Key: { user_id: userId }
      }));

      if (!result.Item) {
        throw new Error('Directory not found for user');
      }

      const directory = result.Item;
      
      // Update metadata on Hedera
      const newFile = new FileCreateTransaction()
        .setKeys(this.adminKey.publicKey)
        .setContents(JSON.stringify(newMetadata, null, 2))
        .setFileMemo('Updated SafeMate Directory Metadata')
        .freezeWith(this.client);

      const signedFileTx = await newFile.sign(this.adminKey);
      const fileResponse = await signedFileTx.execute(this.client);
      const fileReceipt = await fileResponse.getReceipt(this.client);
      const newFileId = fileReceipt.fileId;

      // Update NFT metadata
      const updateTransaction = new TokenUpdateTransaction()
        .setTokenId(this.directoryTokenId)
        .setTokenMetadata([Buffer.from(newFileId.toString())])
        .freezeWith(this.client);

      const signedUpdateTx = await updateTransaction.sign(this.adminKey);
      await signedUpdateTx.execute(this.client);

      // Update stored record
      await dynamodb.send(new UpdateCommand({
        TableName: SAFEMATE_DIRECTORIES_TABLE,
        Key: { user_id: userId },
        UpdateExpression: 'SET metadata = :metadata, updated_at = :updated_at, version = :version',
        ExpressionAttributeValues: {
          ':metadata': newMetadata,
          ':updated_at': new Date().toISOString(),
          ':version': newMetadata.properties?.version || SAFEMATE_DIRECTORY_CONFIG.metadataVersion
        }
      }));

      console.log(`✅ Directory metadata updated for user ${userId}`);
      
      return {
        success: true,
        message: 'Directory metadata updated successfully',
        newFileId: newFileId.toString()
      };

    } catch (error) {
      console.error('❌ Failed to update directory metadata:', error);
      throw error;
    }
  }
}

// Lambda handler
exports.handler = async (event, context) => {
  console.log('📥 SafeMate Directory Creator received:', JSON.stringify(event, null, 2));
  
  try {
    const { httpMethod, path, body, requestContext } = event;
    const pathSegments = path.split('/');
    const endpoint = pathSegments[pathSegments.length - 1];
    
    console.log(`📨 Processing ${httpMethod} request to /directory/${endpoint}`);
    
    // Initialize directory creator
    const directoryCreator = new SafeMateDirectoryCreator();
    await directoryCreator.initialize();
    
    // Get user from Cognito authorizer
    const userId = event.requestContext?.authorizer?.claims?.sub;
    if (!userId) {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          success: false, 
          error: 'Unauthorized - No user found' 
        })
      };
    }
    
    // Route requests
    if (endpoint === 'create' && httpMethod === 'POST') {
      const { userEmail, userAccountId } = JSON.parse(body);
      
      if (!userEmail || !userAccountId) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            success: false, 
            error: 'User email and account ID are required' 
          })
        };
      }
      
      const result = await directoryCreator.createUserDirectory(userId, userEmail, userAccountId);
      
      return {
        statusCode: 201,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result)
      };
      
    } else if (endpoint === 'update' && httpMethod === 'PUT') {
      const { newMetadata } = JSON.parse(body);
      
      if (!newMetadata) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            success: false, 
            error: 'New metadata is required' 
          })
        };
      }
      
      const result = await directoryCreator.updateDirectoryMetadata(userId, newMetadata);
      
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result)
      };
      
    } else if (endpoint === 'status' && httpMethod === 'GET') {
      const result = await dynamodb.send(new GetCommand({
        TableName: SAFEMATE_DIRECTORIES_TABLE,
        Key: { user_id: userId }
      }));
      
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: true,
          hasDirectory: !!result.Item,
          directory: result.Item || null
        })
      };
    }

    return {
      statusCode: 404,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        success: false, 
        error: 'Not found' 
      })
    };

  } catch (error) {
    console.error('❌ Error processing directory request:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        success: false, 
        error: 'Internal server error' 
      })
    };
  }
}; 