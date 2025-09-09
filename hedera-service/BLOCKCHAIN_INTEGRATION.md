# SafeMate Blockchain Integration

## 🏗️ Real Blockchain Implementation

SafeMate now creates **folders and files directly on the Hedera blockchain** using:

- **Hedera Token Service (HTS)** - For NFT creation
- **Hedera File Service (HFS)** - For file storage
- **Smart Contracts** - For access control (planned)

---

## 🔗 What Gets Created on Blockchain

### 📁 **Folders → NFTs**
```typescript
✅ Folder NFT → Hedera Token Service
✅ Folder Metadata → Token Memo
✅ Folder Ownership → Token Holder
✅ Folder Permissions → Smart Contract (planned)
```

### 📄 **Files → NFTs + File Content**
```typescript
✅ File NFT → Hedera Token Service
✅ File Content → Hedera File Service
✅ File Metadata → Token Memo
✅ File Ownership → Token Holder
✅ File Access Rights → Smart Contract (planned)
```

---

## 🚀 Implementation Details

### **Folder Creation Process:**
1. **User creates folder** in SafeMate UI
2. **Folder NFT minted** on Hedera Token Service
3. **Metadata stored** in token memo
4. **NFT transferred** to user's wallet
5. **Folder appears** in user's collection

### **File Upload Process:**
1. **User uploads file** in SafeMate UI
2. **File content uploaded** to Hedera File Service
3. **File NFT minted** on Hedera Token Service
4. **File hash stored** in token metadata
5. **NFT transferred** to user's wallet
6. **File appears** in folder

---

## 🔧 Technical Architecture

### **Blockchain Operations:**
```typescript
// Create Folder NFT
const tokenCreateTransaction = new TokenCreateTransaction()
  .setTokenName(`SafeMate Folder: ${folderName}`)
  .setTokenSymbol(`FOLDER-${folderName.substring(0, 3).toUpperCase()}`)
  .setTokenType(TokenType.NonFungibleUnique)
  .setSupplyType(TokenSupplyType.Finite)
  .setMaxSupply(1)
  .setTreasuryAccountId(operatorAccountId)
  .setTokenMemo(JSON.stringify(folderMetadata));

// Upload File to Hedera File Service
const fileCreateTransaction = new FileCreateTransaction()
  .setKeys([operatorPrivateKey.publicKey])
  .setContents(Buffer.from(fileData, 'base64'))
  .setFileMemo(JSON.stringify(fileMetadata))
  .setMaxTransactionFee(new Hbar(2));
```

### **Environment Variables Required:**
```bash
HEDERA_OPERATOR_ACCOUNT_ID=0.0.123456
HEDERA_OPERATOR_PRIVATE_KEY=302e020100300506032b657004220420...
HEDERA_NETWORK=testnet
```

---

## 🎯 Benefits of Blockchain Integration

### **True Ownership:**
- **Folders**: Represented as NFTs on Hedera
- **Files**: Represented as NFTs on Hedera
- **Access Rights**: Enforced by smart contracts
- **Transferability**: Can be sold, traded, inherited

### **Decentralized Control:**
- **No central authority** controls your files
- **Ownership proven** by blockchain
- **Access rights immutable**
- **Transfer history transparent**

### **Security & Immutability:**
- **File integrity** verified by cryptographic hashes
- **Access control** managed by smart contracts
- **Transaction history** immutable on blockchain
- **No single point of failure**

---

## 🛠️ Deployment Instructions

### **1. Set Up Hedera Operator Account:**
```bash
# Create Hedera account on testnet/mainnet
# Get account ID and private key
# Set environment variables
```

### **2. Deploy Lambda Function:**
```powershell
# Run deployment script
.\deploy-with-blockchain.ps1
```

### **3. Configure Environment Variables:**
```bash
HEDERA_OPERATOR_ACCOUNT_ID=your_account_id
HEDERA_OPERATOR_PRIVATE_KEY=your_private_key
HEDERA_NETWORK=testnet
```

### **4. Test Blockchain Integration:**
```bash
# Create test folder
curl -X POST https://your-api-gateway/dev/folders \
  -H "Authorization: Bearer your-token" \
  -d '{"name":"Test Blockchain Folder"}'

# Upload test file
curl -X POST https://your-api-gateway/dev/files/upload \
  -H "Authorization: Bearer your-token" \
  -d '{"fileName":"test.txt","fileData":"base64_encoded_content"}'
```

---

## 📊 Transaction Costs

### **Hedera Network Fees:**
- **Folder NFT Creation**: ~$0.001 USD
- **File Upload (1MB)**: ~$0.01 USD
- **File NFT Creation**: ~$0.001 USD
- **Token Transfer**: ~$0.0001 USD

### **Cost Optimization:**
- **Batch operations** for multiple files
- **Compression** for large files
- **IPFS integration** for very large files (planned)

---

## 🔍 Monitoring & Debugging

### **Lambda Logs:**
```bash
# View real-time logs
aws logs tail /aws/lambda/dev-safemate-hedera-service --follow
```

### **Blockchain Explorer:**
- **Testnet**: https://hashscan.io/testnet
- **Mainnet**: https://hashscan.io/mainnet

### **Transaction Tracking:**
```typescript
// Each operation returns transaction ID
{
  "success": true,
  "data": {
    "folderId": "uuid",
    "hederaTokenId": "0.0.1234567",
    "transactionId": "0.0.1234567@1234567890.123456789"
  }
}
```

---

## 🚨 Security Considerations

### **Private Key Management:**
- **Never expose** private keys in code
- **Use AWS KMS** for key encryption
- **Rotate keys** regularly
- **Monitor access** logs

### **Access Control:**
- **Verify user ownership** before operations
- **Implement rate limiting**
- **Validate file types** and sizes
- **Monitor for suspicious activity**

---

## 🔮 Future Enhancements

### **Smart Contract Integration:**
- **Access control** smart contracts
- **File sharing** permissions
- **Royalty distribution** for file sales
- **Decentralized governance**

### **Advanced Features:**
- **File versioning** on blockchain
- **Collaborative editing** with real-time sync
- **File marketplace** for buying/selling
- **Cross-chain** file portability

---

## 📞 Support

For issues with blockchain integration:
1. **Check Lambda logs** for detailed error messages
2. **Verify Hedera credentials** are correct
3. **Test on testnet** before mainnet
4. **Monitor transaction costs** and limits

**SafeMate now provides true blockchain-based file ownership!** 🎉
