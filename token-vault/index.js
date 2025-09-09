const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { KMSClient, EncryptCommand, DecryptCommand } = require('@aws-sdk/client-kms');
const { Client, PrivateKey, AccountId, TokenCreateTransaction, TokenMintTransaction, TokenBurnTransaction, 
        TokenAssociateTransaction, TransferTransaction, TokenId, TokenType, TokenSupplyType, Hbar } = require('@hashgraph/sdk');
const crypto = require('crypto');

// Initialize AWS services
const dynamoClient = new DynamoDBClient({});
const dynamodb = DynamoDBDocumentClient.from(dynamoClient);
const kms = new KMSClient({});

// Environment variables
const USER_SECRETS_TABLE = process.env.USER_SECRETS_TABLE;
const WALLET_KEYS_TABLE = process.env.WALLET_KEYS_TABLE;
const WALLET_METADATA_TABLE = process.env.WALLET_METADATA_TABLE;
const TOKEN_VAULT_KMS_KEY_ID = process.env.TOKEN_VAULT_KMS_KEY_ID;
const APP_SECRETS_KMS_KEY_ID = process.env.APP_SECRETS_KMS_KEY_ID;
const HEDERA_NETWORK = process.env.HEDERA_NETWORK || 'testnet';

// MATE Token Configuration
const MATE_TOKEN_CONFIG = {
    name: 'SafeMate Utility Token',
    symbol: 'MATE',
    decimals: 8,
    initialSupply: 1000000000, // 1 billion
    maxSupply: 10000000000,    // 10 billion
    rewardPerUpload: 100000000, // 1 MATE token per upload (in smallest units)
    rewardPerDownload: 10000000, // 0.1 MATE token per download
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

class TokenVault {
    constructor() {
        this.client = null;
        this.operatorAccountId = null;
        this.operatorPrivateKey = null;
        this.mateTokenId = null;
        this.supplyKey = null;
    }

    async initializeClient() {
        if (this.client) return this.client;

        try {
            const operatorCreds = await this.getOperatorCredentials();
            if (!operatorCreds) {
                throw new Error('No operator credentials found');
            }

            const config = NETWORK_CONFIG[HEDERA_NETWORK];
            this.client = Client.forNetwork(config.nodes);
            
            this.operatorAccountId = AccountId.fromString(operatorCreds.accountId);
            this.operatorPrivateKey = PrivateKey.fromString(operatorCreds.privateKey);
            
            this.client.setOperator(this.operatorAccountId, this.operatorPrivateKey);

            // Get MATE token info
            await this.initializeMateToken();
            
            console.log(`Initialized Token Vault for ${HEDERA_NETWORK}`);
            return this.client;
        } catch (error) {
            console.error('Failed to initialize Token Vault client:', error);
            throw error;
        }
    }

    async getOperatorCredentials() {
        try {
            const result = await dynamodb.send(new GetCommand({
                TableName: WALLET_KEYS_TABLE,
                Key: { user_id: 'hedera_operator' }
            }));

            if (!result.Item) {
                return null;
            }

            const decryptedKey = await this.decryptData(
                result.Item.encrypted_private_key,
                APP_SECRETS_KMS_KEY_ID
            );

            return {
                accountId: result.Item.account_id,
                privateKey: decryptedKey
            };
        } catch (error) {
            console.error('Failed to get operator credentials:', error);
            return null;
        }
    }

    async initializeMateToken() {
        try {
            // Check if MATE token already exists
            const storedToken = await this.getStoredMateToken();
            if (storedToken) {
                this.mateTokenId = TokenId.fromString(storedToken.token_id);
                this.supplyKey = PrivateKey.fromString(
                    await this.decryptData(storedToken.encrypted_supply_key, TOKEN_VAULT_KMS_KEY_ID)
                );
                return this.mateTokenId;
            }

            // Create new MATE token
            const supplyKey = PrivateKey.generateED25519();
            const adminKey = this.operatorPrivateKey;

            const transaction = new TokenCreateTransaction()
                .setTokenName(MATE_TOKEN_CONFIG.name)
                .setTokenSymbol(MATE_TOKEN_CONFIG.symbol)
                .setDecimals(MATE_TOKEN_CONFIG.decimals)
                .setInitialSupply(MATE_TOKEN_CONFIG.initialSupply)
                .setMaxSupply(MATE_TOKEN_CONFIG.maxSupply)
                .setTokenType(TokenType.FungibleCommon)
                .setSupplyType(TokenSupplyType.Finite)
                .setTreasuryAccountId(this.operatorAccountId)
                .setAdminKey(adminKey.publicKey)
                .setSupplyKey(supplyKey.publicKey)
                .setTokenMemo('SafeMate utility token for decentralized file storage rewards')
                .freezeWith(this.client);

            const signedTransaction = await transaction.sign(adminKey);
            const response = await signedTransaction.execute(this.client);
            const receipt = await response.getReceipt(this.client);
            const tokenId = receipt.tokenId;

            // Store token info
            await this.storeMateToken({
                token_id: tokenId.toString(),
                name: MATE_TOKEN_CONFIG.name,
                symbol: MATE_TOKEN_CONFIG.symbol,
                decimals: MATE_TOKEN_CONFIG.decimals,
                total_supply: MATE_TOKEN_CONFIG.initialSupply,
                max_supply: MATE_TOKEN_CONFIG.maxSupply,
                treasury_account: this.operatorAccountId.toString(),
                encrypted_supply_key: await this.encryptData(supplyKey.toString(), TOKEN_VAULT_KMS_KEY_ID),
                created_at: new Date().toISOString(),
                transaction_id: response.transactionId.toString()
            });

            this.mateTokenId = tokenId;
            this.supplyKey = supplyKey;

            console.log(`Created MATE token: ${tokenId}`);
            return tokenId;

        } catch (error) {
            console.error('Failed to initialize MATE token:', error);
            throw error;
        }
    }

    async rewardUser(userId, rewardType, amount, metadata = {}) {
        try {
            await this.initializeClient();

            // Get user's wallet
            const userWallet = await this.getUserWallet(userId);
            if (!userWallet) {
                throw new Error('User wallet not found');
            }

            const userAccountId = AccountId.fromString(userWallet.hedera_account_id);

            // Check if user has associated the MATE token
            await this.ensureTokenAssociation(userId, userAccountId);

            // Calculate reward amount
            const rewardAmount = this.calculateReward(rewardType, amount);

            // Transfer MATE tokens from treasury to user
            const transaction = new TransferTransaction()
                .addTokenTransfer(this.mateTokenId, this.operatorAccountId, -rewardAmount)
                .addTokenTransfer(this.mateTokenId, userAccountId, rewardAmount)
                .setTransactionMemo(`MATE reward for ${rewardType}`)
                .freezeWith(this.client);

            const signedTransaction = await transaction.sign(this.operatorPrivateKey);
            const response = await signedTransaction.execute(this.client);
            const receipt = await response.getReceipt(this.client);

            // Log reward
            await this.logReward(userId, {
                rewardType,
                amount: rewardAmount,
                accountId: userAccountId.toString(),
                transactionId: response.transactionId.toString(),
                metadata
            });

            console.log(`Rewarded user ${userId} with ${rewardAmount} MATE tokens for ${rewardType}`);

            return {
                rewardAmount,
                rewardType,
                transactionId: response.transactionId.toString(),
                recipientAccountId: userAccountId.toString()
            };

        } catch (error) {
            console.error('Failed to reward user:', error);
            throw error;
        }
    }

    async ensureTokenAssociation(userId, userAccountId) {
        try {
            // Check if already associated (this would require checking the user's token balance)
            // For now, we'll attempt association and handle errors gracefully
            
            const userPrivateKey = await this.getUserPrivateKey(userId);
            if (!userPrivateKey) {
                throw new Error('User private key not found');
            }

            const associateTransaction = new TokenAssociateTransaction()
                .setAccountId(userAccountId)
                .setTokenIds([this.mateTokenId])
                .freezeWith(this.client);

            const signedAssociation = await associateTransaction.sign(PrivateKey.fromString(userPrivateKey));
            await signedAssociation.execute(this.client);

            console.log(`Associated MATE token with account ${userAccountId}`);

        } catch (error) {
            // Token might already be associated, which is fine
            if (!error.message.includes('TOKEN_ALREADY_ASSOCIATED_TO_ACCOUNT')) {
                console.error('Failed to associate token:', error);
            }
        }
    }

    calculateReward(rewardType, amount = 1) {
        switch (rewardType) {
            case 'FILE_UPLOAD':
                return MATE_TOKEN_CONFIG.rewardPerUpload * amount;
            case 'FILE_DOWNLOAD':
                return MATE_TOKEN_CONFIG.rewardPerDownload * amount;
            case 'FILE_SHARE':
                return Math.floor(MATE_TOKEN_CONFIG.rewardPerUpload * 0.5) * amount; // 50% of upload reward
            case 'DAILY_LOGIN':
                return Math.floor(MATE_TOKEN_CONFIG.rewardPerUpload * 0.1) * amount; // 10% of upload reward
            case 'REFERRAL':
                return MATE_TOKEN_CONFIG.rewardPerUpload * 10 * amount; // 10x upload reward
            default:
                return MATE_TOKEN_CONFIG.rewardPerUpload * amount;
        }
    }

    async getUserWallet(userId) {
        try {
            const result = await dynamodb.send(new QueryCommand({
                TableName: WALLET_METADATA_TABLE,
                KeyConditionExpression: 'user_id = :userId',
                ExpressionAttributeValues: {
                    ':userId': userId
                },
                Limit: 1
            }));

            return result.Items?.[0] || null;
        } catch (error) {
            console.error('Failed to get user wallet:', error);
            return null;
        }
    }

    async getUserPrivateKey(userId) {
        try {
            const result = await dynamodb.send(new GetCommand({
                TableName: WALLET_KEYS_TABLE,
                Key: { user_id: userId }
            }));

            if (!result.Item) {
                return null;
            }

            return await this.decryptData(
                result.Item.encrypted_private_key,
                TOKEN_VAULT_KMS_KEY_ID
            );
        } catch (error) {
            console.error('Failed to get user private key:', error);
            return null;
        }
    }

    async getStoredMateToken() {
        try {
            const result = await dynamodb.send(new GetCommand({
                TableName: USER_SECRETS_TABLE,
                Key: { user_id: 'mate_token_info' }
            }));

            return result.Item || null;
        } catch (error) {
            console.error('Failed to get stored MATE token:', error);
            return null;
        }
    }

    async storeMateToken(tokenInfo) {
        try {
            await dynamodb.send(new PutCommand({
                TableName: USER_SECRETS_TABLE,
                Item: {
                    user_id: 'mate_token_info',
                    ...tokenInfo
                }
            }));
        } catch (error) {
            console.error('Failed to store MATE token info:', error);
            throw error;
        }
    }

    async logReward(userId, rewardDetails) {
        try {
            await dynamodb.send(new PutCommand({
                TableName: 'MATE_REWARDS_LOG', // This table would need to be created
                Item: {
                    reward_id: crypto.randomUUID(),
                    user_id: userId,
                    timestamp: new Date().toISOString(),
                    ...rewardDetails,
                    expires_at: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60) // 1 year
                }
            }));
        } catch (error) {
            console.error('Failed to log reward:', error);
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
            console.error('Failed to encrypt data:', error);
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
            console.error('Failed to decrypt data:', error);
            throw error;
        }
    }
}

// Lambda handler
exports.handler = async (event) => {
    const response = {
        statusCode: 200,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
            'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
        },
        body: ''
    };

    try {
        console.log('Event:', JSON.stringify(event, null, 2));
        
        const { httpMethod, path, body, requestContext } = event;
        
        // Extract user ID from JWT token
        const userId = requestContext?.authorizer?.claims?.sub || requestContext?.authorizer?.claims?.username;
        
        if (!userId && httpMethod !== 'OPTIONS') {
            response.statusCode = 401;
            response.body = JSON.stringify({ error: 'Unauthorized' });
            return response;
        }
        
        if (httpMethod === 'OPTIONS') {
            return response;
        }

        const tokenVault = new TokenVault();
        let requestBody = {};
        
        try {
            requestBody = body ? JSON.parse(body) : {};
        } catch (parseError) {
            response.statusCode = 400;
            response.body = JSON.stringify({ error: 'Invalid JSON in request body' });
            return response;
        }
        
        // Route handling
        if (path.includes('/rewards')) {
            if (httpMethod === 'POST') {
                // Grant reward
                const { rewardType, amount, metadata } = requestBody;
                const result = await tokenVault.rewardUser(userId, rewardType, amount, metadata);
                response.body = JSON.stringify({ success: true, reward: result });
                
            } else if (httpMethod === 'GET') {
                // Get reward information or token info
                const mateToken = await tokenVault.getStoredMateToken();
                response.body = JSON.stringify({ success: true, mateToken });
            }
            
        } else if (path.includes('/token')) {
            if (httpMethod === 'GET' && path.includes('/info')) {
                // Get MATE token information
                const mateToken = await tokenVault.getStoredMateToken();
                if (!mateToken) {
                    response.statusCode = 404;
                    response.body = JSON.stringify({ error: 'MATE token not found' });
                } else {
                    response.body = JSON.stringify({ success: true, token: mateToken });
                }
                
            } else if (httpMethod === 'POST' && path.includes('/initialize')) {
                // Initialize MATE token (admin only)
                await tokenVault.initializeClient();
                const tokenId = await tokenVault.initializeMateToken();
                response.body = JSON.stringify({ 
                    success: true, 
                    message: 'MATE token initialized',
                    tokenId: tokenId.toString()
                });
            }
            
        } else {
            response.statusCode = 404;
            response.body = JSON.stringify({ error: 'Endpoint not found' });
        }
        
    } catch (error) {
        console.error('Error:', error);
        response.statusCode = 500;
        response.body = JSON.stringify({ 
            error: 'Internal server error',
            message: error.message 
        });
    }

    return response;
};
