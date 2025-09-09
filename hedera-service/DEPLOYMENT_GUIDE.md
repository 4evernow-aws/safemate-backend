# SafeMate Hedera Service Deployment Guide

## 🚀 **Multi-Environment Blockchain Deployment**

This guide covers deploying the SafeMate Hedera service with real blockchain integration across all environments.

---

## 🌍 **Environment Overview**

### **Development (dev)**
- **Function**: `dev-safemate-hedera-service`
- **Hedera Network**: `testnet`
- **API Stage**: `/dev`
- **Purpose**: Development and testing
- **Cost**: Very low (testnet)

### **Pre-Production (preprod)**
- **Function**: `preprod-safemate-hedera-service`
- **Hedera Network**: `testnet`
- **API Stage**: `/preprod`
- **Purpose**: Staging and pre-production testing
- **Cost**: Very low (testnet)

### **Production (production)**
- **Function**: `prod-safemate-hedera-service`
- **Hedera Network**: `mainnet`
- **API Stage**: `/prod`
- **Purpose**: Live production environment
- **Cost**: Real HBAR fees

---

## 🔧 **Prerequisites**

### **1. AWS CLI Configuration**
```bash
# Configure AWS CLI for your account
aws configure
```

### **2. Hedera Account Setup**
```bash
# For each environment, you need:
# - Hedera Account ID (e.g., 0.0.1234567)
# - Private Key (ED25519 format)
```

### **3. Environment-Specific Accounts**
- **Dev/Preprod**: Use testnet accounts (free HBAR from portal)
- **Production**: Use mainnet accounts (real HBAR required)

---

## 🚀 **Deployment Commands**

### **Deploy to Development**
```powershell
# Navigate to hedera service directory
cd services/hedera-service

# Deploy to dev environment
.\deploy-with-blockchain.ps1 -Environment dev
```

### **Deploy to Pre-Production**
```powershell
# Deploy to preprod environment
.\deploy-with-blockchain.ps1 -Environment preprod
```

### **Deploy to Production**
```powershell
# Deploy to production environment
.\deploy-with-blockchain.ps1 -Environment production
```

---

## 📋 **Environment-Specific Configurations**

### **Development Environment**
```json
{
  "FunctionName": "dev-safemate-hedera-service",
  "HederaNetwork": "testnet",
  "FoldersTable": "dev-safemate-hedera-folders",
  "WalletKeysTable": "dev-safemate-wallet-keys",
  "ApiStage": "/dev",
  "Description": "Development Environment"
}
```

### **Pre-Production Environment**
```json
{
  "FunctionName": "preprod-safemate-hedera-service",
  "HederaNetwork": "testnet",
  "FoldersTable": "preprod-safemate-hedera-folders",
  "WalletKeysTable": "preprod-safemate-wallet-keys",
  "ApiStage": "/preprod",
  "Description": "Pre-Production Environment"
}
```

### **Production Environment**
```json
{
  "FunctionName": "prod-safemate-hedera-service",
  "HederaNetwork": "mainnet",
  "FoldersTable": "prod-safemate-hedera-folders",
  "WalletKeysTable": "prod-safemate-wallet-keys",
  "ApiStage": "/prod",
  "Description": "Production Environment"
}
```

---

## 🔄 **Promotion Workflow**

### **1. Development → Pre-Production**
```powershell
# 1. Deploy to dev and test thoroughly
.\deploy-with-blockchain.ps1 -Environment dev

# 2. Test with real users in dev environment
# 3. Deploy to preprod when ready
.\deploy-with-blockchain.ps1 -Environment preprod

# 4. Test preprod environment
# 5. Update frontend to use preprod API endpoints
```

### **2. Pre-Production → Production**
```powershell
# 1. Ensure preprod is stable and tested
# 2. Deploy to production (MAINNET - REAL COSTS)
.\deploy-with-blockchain.ps1 -Environment production

# 3. Update frontend to use production API endpoints
# 4. Monitor production transactions
```

---

## 🧪 **Testing Each Environment**

### **Test Blockchain Integration**
```bash
# Test folder creation
npm run test:blockchain

# Test via API
curl -X POST https://your-api-gateway/dev/folders \
  -H "Authorization: Bearer your-token" \
  -d '{"name":"Test Blockchain Folder"}'
```

### **Verify Transactions**
- **Testnet**: https://hashscan.io/testnet
- **Mainnet**: https://hashscan.io/mainnet

---

## 🔐 **Security Considerations**

### **Environment-Specific Security**
- **Dev/Preprod**: Use testnet accounts (lower security requirements)
- **Production**: Use mainnet accounts with proper key management

### **Key Management**
```bash
# For production, consider using AWS KMS
# Store private keys in AWS Systems Manager Parameter Store
# Rotate keys regularly
```

---

## 💰 **Cost Management**

### **Testnet (Dev/Preprod)**
- **Free HBAR**: Available from Hedera Portal
- **No real costs**: All transactions are free
- **Unlimited testing**: Safe for development

### **Mainnet (Production)**
- **Real HBAR costs**: ~$0.001 per folder, ~$0.011 per file
- **Monitor costs**: Set up billing alerts
- **Optimize**: Batch operations when possible

---

## 📊 **Monitoring & Logging**

### **Lambda Logs**
```bash
# View logs for each environment
aws logs tail /aws/lambda/dev-safemate-hedera-service --follow
aws logs tail /aws/lambda/preprod-safemate-hedera-service --follow
aws logs tail /aws/lambda/prod-safemate-hedera-service --follow
```

### **Blockchain Monitoring**
- **Transaction Success Rate**: Monitor failed transactions
- **Cost Tracking**: Monitor HBAR usage
- **Performance**: Monitor transaction times

---

## 🚨 **Troubleshooting**

### **Common Issues**

#### **1. Lambda Function Not Found**
```bash
# Check if function exists
aws lambda get-function --function-name dev-safemate-hedera-service
```

#### **2. Hedera Network Issues**
```bash
# Verify network connectivity
# Check account balance
# Verify private key format
```

#### **3. Environment Variable Issues**
```bash
# Check Lambda environment variables
aws lambda get-function-configuration --function-name dev-safemate-hedera-service
```

---

## 📈 **Performance Optimization**

### **For Production**
- **Batch Operations**: Group multiple files/folders
- **Compression**: Compress large files before upload
- **Caching**: Cache frequently accessed data
- **CDN**: Use CloudFront for file delivery

---

## 🔄 **Rollback Procedures**

### **If Issues Occur**
```powershell
# 1. Identify the problematic deployment
# 2. Revert to previous Lambda version
aws lambda update-function-code --function-name dev-safemate-hedera-service --zip-file fileb://previous-version.zip

# 3. Update environment variables if needed
# 4. Test the rollback
```

---

## 📞 **Support & Maintenance**

### **Regular Maintenance**
- **Weekly**: Check Lambda logs for errors
- **Monthly**: Review transaction costs
- **Quarterly**: Update dependencies
- **Annually**: Rotate private keys

### **Emergency Contacts**
- **AWS Support**: For Lambda/API Gateway issues
- **Hedera Support**: For blockchain network issues
- **Development Team**: For application-specific issues

---

## 🎯 **Success Metrics**

### **Deployment Success**
- [ ] Lambda function deployed successfully
- [ ] Environment variables configured correctly
- [ ] Blockchain integration tested
- [ ] API endpoints responding
- [ ] Transactions visible on HashScan

### **Production Readiness**
- [ ] All environments tested
- [ ] Security measures implemented
- [ ] Monitoring configured
- [ ] Cost controls in place
- [ ] Rollback procedures documented

---

**SafeMate blockchain integration is now ready for multi-environment deployment!** 🚀
