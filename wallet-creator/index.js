const { PrivateKey } = require('@hashgraph/sdk');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');

const dynamodb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'ap-southeast-2' }));

exports.handler = async (event) => {
    console.log('🚀 Wallet creation Lambda triggered');
    console.log('Event received:', JSON.stringify(event, null, 2));
    
    try {
        // Handle OPTIONS request for CORS
        if (event.httpMethod === 'OPTIONS') {
            return createResponse(200, { message: 'CORS preflight' });
        }
        
        // Parse request body
        let body;
        try {
            body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body || {};
        } catch (parseError) {
            console.error('❌ JSON parse error:', parseError);
            return createResponse(400, { error: 'Invalid JSON in request body' });
        }
        
        const { userId } = body;
        
        // Validate required fields
        if (!userId) {
            return createResponse(400, { error: 'userId is required' });
        }
        
        console.log(`Creating wallet for user: ${userId}`);
        
        // Create auto wallet (no network calls required)
        const result = await createAutoWallet(userId);
        
        return createResponse(200, {
            success: true,
            data: result
        });
        
    } catch (error) {
        console.error('❌ Lambda execution error:', error);
        return createResponse(500, {
            success: false,
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};

async function createAutoWallet(userId) {
    try {
        console.log('🔑 Generating Ed25519 key pair...');
        
        // Generate Ed25519 key pair (no network connection needed)
        const privateKey = PrivateKey.generateED25519();
        const publicKey = privateKey.getPublicKey();
        
        // Create account alias from public key
        const accountAlias = `alias-${publicKey.toStringRaw()}`;
        
        console.log('✅ Keys generated successfully');
        console.log('Account Alias:', accountAlias);
        
        // Store private key securely in DynamoDB
        await storeWalletSecurely(userId, {
            privateKey: privateKey.toString(),
            publicKey: publicKey.toString(),
            accountAlias: accountAlias
        });
        
        // Return wallet information (no private key)
        return {
            userId: userId,
            accountAlias: accountAlias,
            publicKey: publicKey.toString(),
            needsFunding: true,
            method: 'auto_creation',
            createdAt: new Date().toISOString(),
            fundingInstructions: {
                message: 'Send HBAR to this alias to activate your wallet',
                address: accountAlias,
                minimumAmount: '0.001 HBAR',
                recommendedAmount: '0.1 HBAR',
                instructions: [
                    'Copy the account alias above',
                    'Open HashPack or another Hedera wallet', 
                    'Send 0.1+ HBAR to the alias',
                    'Wait 1-3 minutes for activation'
                ]
            }
        };
        
    } catch (error) {
        console.error('❌ Error creating auto wallet:', error);
        throw error;
    }
}

async function storeWalletSecurely(userId, walletData) {
    try {
        console.log('💾 Storing wallet data securely...');
        
        await dynamodb.send(new PutCommand({
            TableName: process.env.USER_SECRETS_TABLE || 'safemate-user-secrets',
            Item: {
                userId: userId,
                privateKey: walletData.privateKey,
                publicKey: walletData.publicKey,
                accountAlias: walletData.accountAlias,
                walletType: 'hedera_auto',
                createdAt: new Date().toISOString()
            }
        }));
        
        console.log('✅ Wallet stored successfully in DynamoDB');
        
    } catch (error) {
        console.error('❌ Error storing wallet:', error);
        throw new Error(`Failed to store wallet: ${error.message}`);
    }
}

function createResponse(statusCode, body) {
    return {
        statusCode,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,Authorization',
            'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
        },
        body: JSON.stringify(body)
    };
}
