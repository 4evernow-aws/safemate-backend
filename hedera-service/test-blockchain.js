// Test script for SafeMate Blockchain Integration
// This script tests the Hedera blockchain operations

import {
  Client,
  FileCreateTransaction,
  Hbar,
  PrivateKey,
  TokenCreateTransaction,
  TokenType,
  TokenSupplyType,
  TokenMintTransaction,
  AccountId
} from '@hashgraph/sdk';

// Test configuration
const TEST_CONFIG = {
  network: 'testnet',
  operatorAccountId: process.env.HEDERA_OPERATOR_ACCOUNT_ID,
  operatorPrivateKey: process.env.HEDERA_OPERATOR_PRIVATE_KEY
};

// Initialize Hedera client
async function initializeHederaClient() {
  try {
    console.log('🔧 Initializing Hedera client for testing...');
    
    if (!TEST_CONFIG.operatorAccountId || !TEST_CONFIG.operatorPrivateKey) {
      throw new Error('Hedera operator credentials not found in environment variables');
    }

    const operatorAccountId = AccountId.fromString(TEST_CONFIG.operatorAccountId);
    const operatorPrivateKey = PrivateKey.fromString(TEST_CONFIG.operatorPrivateKey);

    const client = Client.forName(TEST_CONFIG.network);
    client.setOperator(operatorAccountId, operatorPrivateKey);

    console.log('✅ Hedera client initialized successfully');
    return { client, operatorAccountId, operatorPrivateKey };
  } catch (error) {
    console.error('❌ Failed to initialize Hedera client:', error);
    throw error;
  }
}

// Test folder NFT creation
async function testFolderCreation() {
  try {
    console.log('\n🏗️ Testing folder NFT creation...');
    
    const { client, operatorAccountId, operatorPrivateKey } = await initializeHederaClient();
    
    const folderName = `Test Folder ${Date.now()}`;
    const folderMetadata = {
      name: folderName,
      type: 'folder',
      userId: 'test-user-id',
      createdAt: new Date().toISOString(),
      version: '1.0'
    };

    // Create folder NFT
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

    // Mint the NFT
    const tokenMintTransaction = new TokenMintTransaction()
      .setTokenId(folderTokenId)
      .setMetadata([Buffer.from(JSON.stringify(folderMetadata))])
      .freezeWith(client);

    const tokenMintSigned = await tokenMintTransaction.sign(operatorPrivateKey);
    const tokenMintResponse = await tokenMintSigned.execute(client);
    const tokenMintReceipt = await tokenMintResponse.getReceipt(client);

    console.log(`✅ Folder NFT minted with serial number: ${tokenMintReceipt.serials[0]}`);

    return {
      success: true,
      folderTokenId: folderTokenId.toString(),
      serialNumber: tokenMintReceipt.serials[0].toString(),
      transactionId: tokenCreateResponse.transactionId.toString()
    };
  } catch (error) {
    console.error('❌ Folder creation test failed:', error);
    return { success: false, error: error.message };
  }
}

// Test file upload and NFT creation
async function testFileUpload() {
  try {
    console.log('\n📤 Testing file upload and NFT creation...');
    
    const { client, operatorAccountId, operatorPrivateKey } = await initializeHederaClient();
    
    const fileName = `test-file-${Date.now()}.txt`;
    const fileContent = 'This is a test file for SafeMate blockchain integration!';
    const fileData = Buffer.from(fileContent, 'utf8').toString('base64');
    
    const fileMetadata = {
      name: fileName,
      type: 'file',
      userId: 'test-user-id',
      folderId: null,
      createdAt: new Date().toISOString(),
      version: '1.0',
      size: fileContent.length
    };

    // Upload file to Hedera File Service
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

    // Create file NFT
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
      success: true,
      hederaFileId: hederaFileId.toString(),
      fileTokenId: fileTokenId.toString(),
      serialNumber: tokenMintReceipt.serials[0].toString(),
      transactionId: fileCreateResponse.transactionId.toString()
    };
  } catch (error) {
    console.error('❌ File upload test failed:', error);
    return { success: false, error: error.message };
  }
}

// Run all tests
async function runTests() {
  console.log('🧪 Starting SafeMate Blockchain Integration Tests');
  console.log('=' .repeat(60));
  
  // Test folder creation
  const folderResult = await testFolderCreation();
  
  // Test file upload
  const fileResult = await testFileUpload();
  
  // Summary
  console.log('\n📊 Test Results Summary');
  console.log('=' .repeat(60));
  console.log(`Folder Creation: ${folderResult.success ? '✅ PASS' : '❌ FAIL'}`);
  if (folderResult.success) {
    console.log(`  - Token ID: ${folderResult.folderTokenId}`);
    console.log(`  - Serial: ${folderResult.serialNumber}`);
    console.log(`  - Transaction: ${folderResult.transactionId}`);
  } else {
    console.log(`  - Error: ${folderResult.error}`);
  }
  
  console.log(`File Upload: ${fileResult.success ? '✅ PASS' : '❌ FAIL'}`);
  if (fileResult.success) {
    console.log(`  - File ID: ${fileResult.hederaFileId}`);
    console.log(`  - Token ID: ${fileResult.fileTokenId}`);
    console.log(`  - Serial: ${fileResult.serialNumber}`);
    console.log(`  - Transaction: ${fileResult.transactionId}`);
  } else {
    console.log(`  - Error: ${fileResult.error}`);
  }
  
  const allPassed = folderResult.success && fileResult.success;
  console.log(`\nOverall Result: ${allPassed ? '🎉 ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
  
  if (allPassed) {
    console.log('\n🔗 View transactions on HashScan:');
    console.log(`Testnet: https://hashscan.io/testnet/transaction/${folderResult.transactionId}`);
    console.log(`Testnet: https://hashscan.io/testnet/transaction/${fileResult.transactionId}`);
  }
  
  return allPassed;
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('❌ Test execution failed:', error);
      process.exit(1);
    });
}

export { runTests, testFolderCreation, testFileUpload };
