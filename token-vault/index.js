const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { KMSClient, EncryptCommand, DecryptCommand } = require('@aws-sdk/client-kms');

// Initialize AWS clients
const dynamoClient = new DynamoDBClient({ region: 'ap-southeast-2' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const kmsClient = new KMSClient({ region: 'ap-southeast-2' });

// Environment variables
const TOKENS_TABLE = process.env.TOKENS_TABLE || 'dev-safemate-tokens';
const KMS_KEY_ID = process.env.USER_KEYS_KMS_KEY_ID || 'alias/safemate-master-key-dev';

/**
 * Encrypt data using KMS
 */
async function encryptData(data) {
    try {
        const command = new EncryptCommand({
            KeyId: KMS_KEY_ID,
            Plaintext: Buffer.from(JSON.stringify(data))
        });
        
        const result = await kmsClient.send(command);
        return result.CiphertextBlob.toString('base64');
    } catch (error) {
        console.error('Encryption error:', error);
        throw new Error('Failed to encrypt data');
    }
}

/**
 * Decrypt data using KMS
 */
async function decryptData(encryptedData) {
    try {
        const command = new DecryptCommand({
            CiphertextBlob: Buffer.from(encryptedData, 'base64')
        });
        
        const result = await kmsClient.send(command);
        return JSON.parse(Buffer.from(result.Plaintext).toString());
    } catch (error) {
        console.error('Decryption error:', error);
        throw new Error('Failed to decrypt data');
    }
}

/**
 * Store encrypted token data
 */
async function storeToken(userId, tokenData) {
    try {
        const encryptedData = await encryptData(tokenData);
        
        const command = new PutCommand({
            TableName: TOKENS_TABLE,
            Item: {
                userId: userId,
                tokenData: encryptedData,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            }
        });
        
        await docClient.send(command);
        
        return {
            success: true,
            message: 'Token stored successfully'
        };
    } catch (error) {
        console.error('Store token error:', error);
        throw new Error('Failed to store token');
    }
}

/**
 * Retrieve and decrypt token data
 */
async function getToken(userId) {
    try {
        const command = new GetCommand({
            TableName: TOKENS_TABLE,
            Key: { userId: userId }
        });
        
        const result = await docClient.send(command);
        
        if (!result.Item) {
            return {
                success: false,
                message: 'Token not found'
            };
        }
        
        const decryptedData = await decryptData(result.Item.tokenData);
        
        return {
            success: true,
            data: decryptedData,
            createdAt: result.Item.createdAt,
            updatedAt: result.Item.updatedAt
        };
    } catch (error) {
        console.error('Get token error:', error);
        throw new Error('Failed to retrieve token');
    }
}

/**
 * Update token data
 */
async function updateToken(userId, tokenData) {
    try {
        const encryptedData = await encryptData(tokenData);
        
        const command = new UpdateCommand({
            TableName: TOKENS_TABLE,
            Key: { userId: userId },
            UpdateExpression: 'SET tokenData = :tokenData, updatedAt = :updatedAt',
            ExpressionAttributeValues: {
                ':tokenData': encryptedData,
                ':updatedAt': new Date().toISOString()
            }
        });
        
        await docClient.send(command);
        
        return {
            success: true,
            message: 'Token updated successfully'
        };
    } catch (error) {
        console.error('Update token error:', error);
        throw new Error('Failed to update token');
    }
}

/**
 * Main Lambda handler
 */
exports.handler = async (event) => {
    console.log('Token Vault Service - Event:', JSON.stringify(event, null, 2));
    
    // CORS headers
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'Content-Type': 'application/json'
    };
    
    try {
        // Handle preflight requests
        if (event.httpMethod === 'OPTIONS') {
            return {
                statusCode: 200,
                headers: headers,
                body: JSON.stringify({ message: 'CORS preflight' })
            };
        }
        
        const { action, userId, tokenData } = JSON.parse(event.body || '{}');
        
        if (!action || !userId) {
            return {
                statusCode: 400,
                headers: headers,
                body: JSON.stringify({
                    success: false,
                    error: 'Missing required parameters: action and userId'
                })
            };
        }
        
        let result;
        
        switch (action) {
            case 'store':
                if (!tokenData) {
                    return {
                        statusCode: 400,
                        headers: headers,
                        body: JSON.stringify({
                            success: false,
                            error: 'Missing tokenData for store action'
                        })
                    };
                }
                result = await storeToken(userId, tokenData);
                break;
                
            case 'get':
                result = await getToken(userId);
                break;
                
            case 'update':
                if (!tokenData) {
                    return {
                        statusCode: 400,
                        headers: headers,
                        body: JSON.stringify({
                            success: false,
                            error: 'Missing tokenData for update action'
                        })
                    };
                }
                result = await updateToken(userId, tokenData);
                break;
                
            default:
                return {
                    statusCode: 400,
                    headers: headers,
                    body: JSON.stringify({
                        success: false,
                        error: 'Invalid action. Supported actions: store, get, update'
                    })
                };
        }
        
        return {
            statusCode: 200,
            headers: headers,
            body: JSON.stringify(result)
        };
        
    } catch (error) {
        console.error('Token Vault Service Error:', error);
        
        return {
            statusCode: 500,
            headers: headers,
            body: JSON.stringify({
                success: false,
                error: 'Internal server error',
                message: error.message
            })
        };
    }
};
