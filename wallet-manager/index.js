const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { KMSClient, EncryptCommand, DecryptCommand } = require('@aws-sdk/client-kms');
const { Client, PrivateKey, AccountId, AccountCreateTransaction, AccountBalanceQuery, Hbar } = require('@hashgraph/sdk');
const crypto = require('crypto');

// Initialize AWS services
const dynamoClient = new DynamoDBClient({});
const dynamodb = DynamoDBDocumentClient.from(dynamoClient);
const kms = new KMSClient({});

// Environment variables
const WALLET_KEYS_TABLE = process.env.WALLET_KEYS_TABLE;
const WALLET_METADATA_TABLE = process.env.WALLET_METADATA_TABLE;
const WALLET_AUDIT_TABLE = process.env.WALLET_AUDIT_TABLE;
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

class WalletManager {
    constructor() {
        this.client = null;
        this.operatorAccountId = null;
        this.operatorPrivateKey = null;
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
            
            console.log(`Initialized Hedera client for ${HEDERA_NETWORK}`);
            return this.client;
        } catch (error) {
            console.error('Failed to initialize Hedera client:', error);
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

    async createWallet(userId, initialBalance = 100000000) { // 1 HBAR in tinybars
        try {
            await this.initializeClient();

            // Check if user already has a wallet
            const existingWallet = await this.getUserWallet(userId);
            if (existingWallet) {
                throw new Error('User already has a wallet');
            }

            // Generate new key pair
            const privateKey = PrivateKey.generateED25519();
            const publicKey = privateKey.publicKey;

            // Create account transaction
            const transaction = new AccountCreateTransaction()
                .setKey(publicKey)
                .setInitialBalance(Hbar.fromTinybars(initialBalance))
                .setAccountMemo(`SafeMate wallet for user ${userId}`)
                .freezeWith(this.client);

            const signedTransaction = await transaction.sign(this.operatorPrivateKey);
            const response = await signedTransaction.execute(this.client);
            const receipt = await response.getReceipt(this.client);
            const accountId = receipt.accountId;

            // Encrypt and store private key
            const encryptedPrivateKey = await this.encryptData(
                privateKey.toString(),
                WALLET_KMS_KEY_ID
            );

            // Store wallet keys
            await dynamodb.send(new PutCommand({
                TableName: WALLET_KEYS_TABLE,
                Item: {
                    user_id: userId,
                    account_id: accountId.toString(),
                    encrypted_private_key: encryptedPrivateKey,
                    public_key: publicKey.toString(),
                    created_at: new Date().toISOString(),
                    key_type: 'ED25519'
                }
            }));

            // Store wallet metadata
            await dynamodb.send(new PutCommand({
                TableName: WALLET_METADATA_TABLE,
                Item: {
                    user_id: userId,
                    wallet_id: crypto.randomUUID(),
                    hedera_account_id: accountId.toString(),
                    wallet_type: 'custodial',
                    status: 'active',
                    created_at: new Date().toISOString(),
                    initial_balance: initialBalance,
                    current_balance: initialBalance,
                    network: HEDERA_NETWORK
                }
            }));

            // Log wallet creation
            await this.logWalletOperation(userId, 'WALLET_CREATED', {
                accountId: accountId.toString(),
                initialBalance: initialBalance,
                transactionId: response.transactionId.toString()
            });

            console.log(`Created wallet for user ${userId}: ${accountId}`);

            return {
                accountId: accountId.toString(),
                publicKey: publicKey.toString(),
                initialBalance: initialBalance,
                transactionId: response.transactionId.toString(),
                network: HEDERA_NETWORK
            };

        } catch (error) {
            console.error('Failed to create wallet:', error);
            throw error;
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

    async getWalletBalance(userId) {
        try {
            const wallet = await this.getUserWallet(userId);
            if (!wallet) {
                throw new Error('Wallet not found');
            }

            await this.initializeClient();

            const balance = await new AccountBalanceQuery()
                .setAccountId(AccountId.fromString(wallet.hedera_account_id))
                .execute(this.client);

            const balanceData = {
                accountId: wallet.hedera_account_id,
                hbar: balance.hbars.toTinybars(),
                tokens: balance.tokens ? Object.fromEntries(balance.tokens) : {}
            };

            // Update stored balance
            await dynamodb.send(new UpdateCommand({
                TableName: WALLET_METADATA_TABLE,
                Key: { user_id: userId },
                UpdateExpression: 'SET current_balance = :balance, last_updated = :timestamp',
                ExpressionAttributeValues: {
                    ':balance': balanceData.hbar,
                    ':timestamp': new Date().toISOString()
                }
            }));

            return balanceData;

        } catch (error) {
            console.error('Failed to get wallet balance:', error);
            throw error;
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

    async logWalletOperation(userId, operation, details) {
        try {
            await dynamodb.send(new PutCommand({
                TableName: WALLET_AUDIT_TABLE,
                Item: {
                    operation_id: crypto.randomUUID(),
                    timestamp: new Date().toISOString(),
                    user_id: userId,
                    operation_type: operation,
                    details,
                    expires_at: Math.floor(Date.now() / 1000) + (7 * 365 * 24 * 60 * 60) // 7 years
                }
            }));
        } catch (error) {
            console.error('Failed to log wallet operation:', error);
        }
    }
}

// Lambda handler
exports.handler = async (event) => {
    const response = {
        statusCode: 200,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': 'http://localhost:5173',
            'Access-Control-Allow-Credentials': 'true',
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

        const walletManager = new WalletManager();
        let requestBody = {};
        
        try {
            requestBody = body ? JSON.parse(body) : {};
        } catch (parseError) {
            response.statusCode = 400;
            response.body = JSON.stringify({ error: 'Invalid JSON in request body' });
            return response;
        }
        
        // Route handling
        if (path.includes('/wallet')) {
            if (httpMethod === 'POST' && path.includes('/create')) {
                // Create wallet
                const { initialBalance } = requestBody;
                const result = await walletManager.createWallet(userId, initialBalance);
                response.body = JSON.stringify({ success: true, wallet: result });
                
            } else if (httpMethod === 'GET' && path.includes('/balance')) {
                // Get wallet balance
                const balance = await walletManager.getWalletBalance(userId);
                response.body = JSON.stringify({ success: true, balance });
                
            } else if (httpMethod === 'GET') {
                // Get wallet info
                const wallet = await walletManager.getUserWallet(userId);
                if (!wallet) {
                    response.statusCode = 404;
                    response.body = JSON.stringify({ error: 'Wallet not found' });
                } else {
                    response.body = JSON.stringify({ success: true, wallet });
                }
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
