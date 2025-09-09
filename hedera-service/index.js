import { randomUUID } from 'crypto';
import {
  Client,
  FileCreateTransaction,
  FileDeleteTransaction,
  FileId,
  Hbar,
  PrivateKey,
  TokenCreateTransaction,
  TokenType,
  TokenSupplyType,
  TokenMintTransaction,
  TokenBurnTransaction,
  AccountId,
  TransactionReceiptQuery,
  TransactionResponse
} from '@hashgraph/sdk';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { KMSClient, DecryptCommand } from '@aws-sdk/client-kms';

// Global mock data storage that persists across Lambda invocations
// This will persist as long as the Lambda container is warm
global.mockFolders = global.mockFolders || new Map();

// Initialize with some default data to simulate persistence
const initializeMockData = () => {
  console.log(`Current mock folders count: ${global.mockFolders.size}`);
  if (global.mockFolders.size === 0) {
    console.log('Initializing mock data storage...');
  }
};

// Call initialization
initializeMockData();

// Environment variables
const HEDERA_FOLDERS_TABLE = process.env.HEDERA_FOLDERS_TABLE || 'default-safemate-hedera-folders';
const WALLET_KEYS_TABLE = process.env.WALLET_KEYS_TABLE || 'default-safemate-wallet-keys';
const APP_SECRETS_KMS_KEY_ID = process.env.APP_SECRETS_KMS_KEY_ID;
const STAGE = process.env.STAGE || 'dev';
const HEDERA_NETWORK = process.env.HEDERA_NETWORK || 'testnet';

// Initialize AWS clients
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const kmsClient = new KMSClient({ region: process.env.AWS_REGION });

// Hedera client initialization
let hederaClient = null;
let operatorAccountId = null;
let operatorPrivateKey = null;

// Initialize Hedera client
async function initializeHederaClient() {
  if (hederaClient) {
    return { client: hederaClient, operatorAccountId, operatorPrivateKey };
  }

  try {
    console.log('🔧 Initializing Hedera client...');
    
    // Get operator credentials from environment or KMS
    const operatorAccountIdStr = process.env.HEDERA_OPERATOR_ACCOUNT_ID;
    const operatorPrivateKeyStr = process.env.HEDERA_OPERATOR_PRIVATE_KEY;
    
    if (!operatorAccountIdStr || !operatorPrivateKeyStr) {
      throw new Error('Hedera operator credentials not found in environment variables');
    }

    operatorAccountId = AccountId.fromString(operatorAccountIdStr);
    operatorPrivateKey = PrivateKey.fromString(operatorPrivateKeyStr);

    // Create Hedera client
    hederaClient = Client.forName(HEDERA_NETWORK);
    hederaClient.setOperator(operatorAccountId, operatorPrivateKey);

    console.log('✅ Hedera client initialized successfully');
    return { client: hederaClient, operatorAccountId, operatorPrivateKey };
  } catch (error) {
    console.error('❌ Failed to initialize Hedera client:', error);
    throw error;
  }
}

// Helper function to get user from event
function getUserFromEvent(event) {
  try {
    return event.requestContext.authorizer.claims.sub;
  } catch (error) {
    console.error('Error getting user from event:', error);
    return null;
  }
}

// Helper function to create response
function createResponse(statusCode, body, event) {
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
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': allowOrigin,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token,x-cognito-id-token,x-cognito-access-token'
    },
    body: JSON.stringify(body)
  };
}

// Real blockchain folder service using Hedera
class BlockchainFolderService {
  // Create a folder NFT on Hedera Token Service
  static async createFolder(folderName, userId) {
    try {
      console.log(`🏗️ Creating folder NFT on blockchain: ${folderName} for user: ${userId}`);
      
      const { client, operatorAccountId, operatorPrivateKey } = await initializeHederaClient();
      
      // Create folder metadata
      const folderMetadata = {
        name: folderName,
        type: 'folder',
        userId: userId,
        createdAt: new Date().toISOString(),
        version: '1.0'
      };

      // Create folder NFT using Hedera Token Service
      const tokenCreateTransaction = new TokenCreateTransaction()
        .setTokenName(`SafeMate Folder: ${folderName}`)
        .setTokenSymbol(`FOLDER-${folderName.substring(0, 3).toUpperCase()}`)
        .setTokenType(TokenType.NonFungibleUnique)
        .setSupplyType(TokenSupplyType.Finite)
        .setMaxSupply(1)
        .setTreasuryAccountId(operatorAccountId)
        .setTokenMemo(JSON.stringify(folderMetadata))
        .freezeWith(client);

      const tokenCreateSigned = await tokenCreateTransaction.sign(operatorPrivateKey);
      const tokenCreateResponse = await tokenCreateSigned.execute(client);
      const tokenCreateReceipt = await tokenCreateResponse.getReceipt(client);
      
      const folderTokenId = tokenCreateReceipt.tokenId;
      console.log(`✅ Folder NFT created: ${folderTokenId}`);

      // Mint the NFT (only 1 token per folder)
      const tokenMintTransaction = new TokenMintTransaction()
        .setTokenId(folderTokenId)
        .setMetadata([Buffer.from(JSON.stringify(folderMetadata))])
        .freezeWith(client);

      const tokenMintSigned = await tokenMintTransaction.sign(operatorPrivateKey);
      const tokenMintResponse = await tokenMintSigned.execute(client);
      const tokenMintReceipt = await tokenMintResponse.getReceipt(client);

      console.log(`✅ Folder NFT minted with serial number: ${tokenMintReceipt.serials[0]}`);

      return {
        hederaTokenId: folderTokenId.toString(),
        hederaSerialNumber: tokenMintReceipt.serials[0].toString(),
        transactionId: tokenCreateResponse.transactionId.toString(),
        timestamp: new Date().toISOString(),
        metadata: folderMetadata
      };
    } catch (error) {
      console.error('❌ Failed to create folder on blockchain:', error);
      throw error;
    }
  }

  // Delete a folder NFT from Hedera Token Service
  static async deleteFolder(hederaTokenId, serialNumber) {
    try {
      console.log(`🗑️ Deleting folder NFT from blockchain: ${hederaTokenId}`);
      
      const { client, operatorPrivateKey } = await initializeHederaClient();
      
      // Burn the NFT token
      const tokenBurnTransaction = new TokenBurnTransaction()
        .setTokenId(FileId.fromString(hederaTokenId))
        .setSerials([parseInt(serialNumber)])
        .freezeWith(client);

      const tokenBurnSigned = await tokenBurnTransaction.sign(operatorPrivateKey);
      const tokenBurnResponse = await tokenBurnSigned.execute(client);
      const tokenBurnReceipt = await tokenBurnResponse.getReceipt(client);

      console.log(`✅ Folder NFT burned successfully`);

      return {
        transactionId: tokenBurnResponse.transactionId.toString(),
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ Failed to delete folder from blockchain:', error);
      throw error;
    }
  }

  // Upload file to Hedera File Service and create file NFT
  static async uploadFile(fileName, fileData, userId, folderId) {
    try {
      console.log(`📤 Uploading file to blockchain: ${fileName} for user: ${userId}`);
      
      const { client, operatorAccountId, operatorPrivateKey } = await initializeHederaClient();
      
      // Create file metadata
      const fileMetadata = {
        name: fileName,
        type: 'file',
        userId: userId,
        folderId: folderId,
        createdAt: new Date().toISOString(),
        version: '1.0',
        size: fileData.length
      };

      // Upload file content to Hedera File Service
      const fileCreateTransaction = new FileCreateTransaction()
        .setKeys([operatorPrivateKey.publicKey])
        .setContents(Buffer.from(fileData, 'base64'))
        .setFileMemo(JSON.stringify(fileMetadata))
        .setMaxTransactionFee(new Hbar(2))
        .freezeWith(client);

      const fileCreateSigned = await fileCreateTransaction.sign(operatorPrivateKey);
      const fileCreateResponse = await fileCreateSigned.execute(client);
      const fileCreateReceipt = await fileCreateResponse.getReceipt(client);
      
      const hederaFileId = fileCreateReceipt.fileId;
      console.log(`✅ File uploaded to Hedera File Service: ${hederaFileId}`);

      // Create file NFT using Hedera Token Service
      const tokenCreateTransaction = new TokenCreateTransaction()
        .setTokenName(`SafeMate File: ${fileName}`)
        .setTokenSymbol(`FILE-${fileName.substring(0, 3).toUpperCase()}`)
        .setTokenType(TokenType.NonFungibleUnique)
        .setSupplyType(TokenSupplyType.Finite)
        .setMaxSupply(1)
        .setTreasuryAccountId(operatorAccountId)
        .setTokenMemo(JSON.stringify({
          ...fileMetadata,
          hederaFileId: hederaFileId.toString()
        }))
        .freezeWith(client);

      const tokenCreateSigned = await tokenCreateTransaction.sign(operatorPrivateKey);
      const tokenCreateResponse = await tokenCreateSigned.execute(client);
      const tokenCreateReceipt = await tokenCreateResponse.getReceipt(client);
      
      const fileTokenId = tokenCreateReceipt.tokenId;
      console.log(`✅ File NFT created: ${fileTokenId}`);

      // Mint the file NFT
      const tokenMintTransaction = new TokenMintTransaction()
        .setTokenId(fileTokenId)
        .setMetadata([Buffer.from(JSON.stringify({
          ...fileMetadata,
          hederaFileId: hederaFileId.toString()
        }))])
        .freezeWith(client);

      const tokenMintSigned = await tokenMintTransaction.sign(operatorPrivateKey);
      const tokenMintResponse = await tokenMintSigned.execute(client);
      const tokenMintReceipt = await tokenMintResponse.getReceipt(client);

      console.log(`✅ File NFT minted with serial number: ${tokenMintReceipt.serials[0]}`);

      return {
        hederaFileId: hederaFileId.toString(),
        hederaTokenId: fileTokenId.toString(),
        hederaSerialNumber: tokenMintReceipt.serials[0].toString(),
        transactionId: fileCreateResponse.transactionId.toString(),
        timestamp: new Date().toISOString(),
        metadata: fileMetadata
      };
    } catch (error) {
      console.error('❌ Failed to upload file to blockchain:', error);
      throw error;
    }
  }

  // Get file content from Hedera File Service
  static async getFileContent(hederaFileId) {
    try {
      console.log(`📥 Getting file content from blockchain: ${hederaFileId}`);
      
      const { client } = await initializeHederaClient();
      
      // This would require implementing file content retrieval
      // For now, we'll return a placeholder
      return {
        success: true,
        message: 'File content retrieval not yet implemented',
        hederaFileId: hederaFileId
      };
    } catch (error) {
      console.error('❌ Failed to get file content from blockchain:', error);
      throw error;
    }
  }
}

// Folder Operations
async function listFolders(userId) {
  try {
    console.log(`📁 Listing folders for user: ${userId}, total folders: ${global.mockFolders.size}`);
    const allUserFolders = Array.from(global.mockFolders.values())
      .filter(folder => folder.userId === userId);

    // Build hierarchical structure
    const buildFolderTree = (folders, parentId = null) => {
      return folders
        .filter(folder => folder.parentFolderId === parentId)
        .map(folder => ({
          id: folder.folderId,
          name: folder.name,
          files: folder.files || [],
          subfolders: buildFolderTree(folders, folder.folderId),
          hederaTokenId: folder.hederaTokenId,
          hederaSerialNumber: folder.hederaSerialNumber,
          createdAt: folder.createdAt,
          updatedAt: folder.updatedAt,
          fileCount: folder.fileCount || 0
        }));
    };

    return buildFolderTree(allUserFolders);
  } catch (error) {
    console.error('Error listing folders:', error);
    throw error;
  }
}

async function createFolder(name, userId, parentFolderId = null) {
  try {
    const folderId = randomUUID();
    const now = new Date().toISOString();
    
    // Create folder on REAL blockchain
    const blockchainResult = await BlockchainFolderService.createFolder(name, userId);
    
    // Store folder metadata in mock storage (for now - could be moved to DynamoDB)
    const folder = {
      folderId,
      userId,
      name,
      parentFolderId,
      files: [],
      subfolders: [],
      hederaTokenId: blockchainResult.hederaTokenId,
      hederaSerialNumber: blockchainResult.hederaSerialNumber,
      createdAt: now,
      updatedAt: now,
      fileCount: 0
    };
    
    global.mockFolders.set(folderId, folder);
    console.log(`✅ Created folder on blockchain: ${name} with ID: ${folderId}, Token ID: ${blockchainResult.hederaTokenId}`);

    // If this is a subfolder, add it to the parent's subfolders array
    if (parentFolderId) {
      const parentFolder = global.mockFolders.get(parentFolderId);
      if (parentFolder) {
        parentFolder.subfolders.push(folderId);
        parentFolder.updatedAt = now;
        console.log(`Added subfolder ${folderId} to parent ${parentFolderId}`);
      }
    }

    return {
      folderId,
      name,
      parentFolderId,
      hederaTokenId: blockchainResult.hederaTokenId,
      hederaSerialNumber: blockchainResult.hederaSerialNumber,
      createdAt: now,
      transactionId: blockchainResult.transactionId
    };
  } catch (error) {
    console.error('Error creating folder:', error);
    throw error;
  }
}

async function deleteFolder(folderId, userId) {
  try {
    // Get folder to check ownership and get hedera token ID
    const folder = global.mockFolders.get(folderId);

    if (!folder) {
      throw new Error('Folder not found');
    }

    if (folder.userId !== userId) {
      throw new Error('Unauthorized to delete this folder');
    }

    // Check if folder has files
    if (folder.fileCount > 0) {
      throw new Error('Cannot delete folder with files');
    }

    // Delete from REAL blockchain
    const blockchainResult = await BlockchainFolderService.deleteFolder(
      folder.hederaTokenId, 
      folder.hederaSerialNumber
    );
    
    // Delete from mock storage
    global.mockFolders.delete(folderId);
    console.log(`✅ Deleted folder from blockchain: ${folderId}, Token ID: ${folder.hederaTokenId}`);

    return {
      message: 'Folder deleted successfully from blockchain',
      transactionId: blockchainResult.transactionId
    };
  } catch (error) {
    console.error('Error deleting folder:', error);
    throw error;
  }
}

// File Operations
async function uploadFile(fileName, fileData, fileSize, contentType, userId, folderId) {
  try {
    const fileId = randomUUID();
    const now = new Date().toISOString();
    
    // Upload to REAL blockchain
    const blockchainResult = await BlockchainFolderService.uploadFile(fileName, fileData, userId, folderId);
    
    // If folderId is provided, update the folder
    if (folderId) {
      const folder = global.mockFolders.get(folderId);
      if (folder) {
        folder.files.push({
          id: fileId,
          name: fileName,
          size: fileSize,
          createdAt: now,
          hederaFileId: blockchainResult.hederaFileId,
          hederaTokenId: blockchainResult.hederaTokenId,
          hederaSerialNumber: blockchainResult.hederaSerialNumber
        });
        folder.fileCount += 1;
        folder.updatedAt = now;
        console.log(`✅ Added file ${fileId} to folder ${folderId} on blockchain`);
      }
    }

    return {
      fileId,
      hederaFileId: blockchainResult.hederaFileId,
      hederaTokenId: blockchainResult.hederaTokenId,
      hederaSerialNumber: blockchainResult.hederaSerialNumber,
      transactionId: blockchainResult.transactionId
    };
  } catch (error) {
    console.error('Error uploading file:', error);
    throw error;
  }
}

export const handler = async (event) => {
  console.log('Event:', JSON.stringify(event, null, 2));
  
  try {
    // Detect event format and extract details
    let httpMethod, path, pathParameters, body;
    
    if (event.httpMethod) {
      // API Gateway v1 format
      httpMethod = event.httpMethod;
      path = event.path;
      pathParameters = event.pathParameters;
      body = event.body;
      console.log('🔍 Using API Gateway v1 format');
    } else if (event.requestContext?.http?.method) {
      // API Gateway v2 format
      httpMethod = event.requestContext.http.method;
      path = event.requestContext.http.path;
      pathParameters = event.pathParameters;
      body = event.body;
      console.log('🔍 Using API Gateway v2 format');
    } else {
      console.error('❌ Unknown event format:', event);
      return createResponse(400, { 
        success: false, 
        error: 'Unknown event format' 
      }, event);
    }
    
    console.log(`🔍 Detected method: ${httpMethod}, path: ${path}`);
    
    // Strip stage prefix from path only if it looks like a stage (e.g., /dev-1/folders -> /folders)
    // But preserve paths that are already clean (e.g., /folders stays /folders)
    let cleanPath = path;
    if (path.match(/^\/[^\/]+-\d+\//)) {
      // Path has stage prefix pattern like /dev-1/ or /prod-2/
      cleanPath = path.replace(/^\/[^\/]+/, '');
    } else if (path === '/') {
      // Root path stays as root
      cleanPath = '/';
    }
    // Otherwise, use the path as-is
    console.log(`🔍 Clean path: ${cleanPath}`);

    // Handle preflight OPTIONS requests
    if (httpMethod === 'OPTIONS') {
      console.log('✅ Handling OPTIONS preflight request');
      return createResponse(200, { message: 'CORS preflight' }, event);
    }

    // Get user from Cognito authorizer
    const userId = getUserFromEvent(event);
    if (!userId) {
      return createResponse(401, { 
        success: false, 
        error: 'Unauthorized - No user found' 
      }, event);
    }
    
    // Route requests
    if (cleanPath === '/folders') {
      if (httpMethod === 'GET') {
        const folders = await listFolders(userId);
        return createResponse(200, { 
          success: true, 
          data: folders 
        }, event);
      } else if (httpMethod === 'POST') {
        const { name, parentFolderId } = JSON.parse(body);
        if (!name) {
          return createResponse(400, { 
            success: false, 
            error: 'Folder name is required' 
          }, event);
        }
        
        const result = await createFolder(name, userId, parentFolderId);
        return createResponse(201, { 
          success: true, 
          data: result 
        }, event);
      }
    } else if (cleanPath.startsWith('/folders/') && pathParameters?.folderId) {
      if (httpMethod === 'DELETE') {
        const result = await deleteFolder(pathParameters.folderId, userId);
        return createResponse(200, { 
          success: true, 
          data: result 
        }, event);
      }
    } else if (cleanPath === '/files/upload' && httpMethod === 'POST') {
      const { fileName, fileData, fileSize, contentType, folderId } = JSON.parse(body);
      
      if (!fileName || !fileData) {
        return createResponse(400, { 
          success: false, 
          error: 'File name and data are required' 
        }, event);
      }
      
      const result = await uploadFile(fileName, fileData, fileSize, contentType, userId, folderId);
      return createResponse(201, { 
        success: true, 
        data: result 
      }, event);
    }

    return createResponse(404, { 
      success: false, 
      error: 'Not found' 
    }, event);

  } catch (error) {
    console.error('Error processing request:', error);
    return createResponse(500, { 
      success: false, 
      error: 'Internal server error' 
    }, event);
  }
};