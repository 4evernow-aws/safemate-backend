# Manual Preprod Deployment Guide

## 🚀 **All Services Ready for Deployment!**

I've created all the missing service files and deployment packages. Here's how to deploy them to preprod:

## 📦 **Deployment Packages Created:**

### ✅ **Ready for Deployment:**
1. **User Onboarding** - `user-onboarding/user-onboarding-clean-final.zip`
2. **Email Verification** - `email-verification-service/email-verification-service.zip`
3. **Hedera Service** - Use `hedera-service/deploy-with-blockchain.ps1`
4. **Token Vault** - `token-vault/token-vault.zip` (newly created)
5. **Group Manager** - `group-manager/group-manager.zip`
6. **Directory Creator** - `safemate-directory-creator/safemate-directory-creator.zip`

## 🔧 **Deployment Methods:**

### **Method 1: AWS CLI (If connectivity works)**
```bash
# Deploy User Onboarding
cd user-onboarding
aws lambda update-function-code \
  --function-name preprod-safemate-user-onboarding \
  --zip-file fileb://user-onboarding-clean-final.zip \
  --region ap-southeast-2

# Deploy Email Verification
cd ../email-verification-service
aws lambda update-function-code \
  --function-name preprod-safemate-email-verification \
  --zip-file fileb://email-verification-service.zip \
  --region ap-southeast-2

# Deploy Token Vault
cd ../token-vault
aws lambda update-function-code \
  --function-name preprod-safemate-token-vault \
  --zip-file fileb://token-vault.zip \
  --region ap-southeast-2

# Deploy Group Manager
cd ../group-manager
aws lambda update-function-code \
  --function-name preprod-safemate-group-manager \
  --zip-file fileb://group-manager.zip \
  --region ap-southeast-2

# Deploy Directory Creator
cd ../safemate-directory-creator
aws lambda update-function-code \
  --function-name preprod-safemate-directory-creator \
  --zip-file fileb://safemate-directory-creator.zip \
  --region ap-southeast-2

# Deploy Hedera Service
cd ../hedera-service
.\deploy-with-blockchain.ps1 -Environment preprod
```

### **Method 2: AWS Console (Recommended if CLI issues persist)**

#### **Step 1: Go to AWS Lambda Console**
1. Open AWS Console
2. Navigate to Lambda service
3. Select region: `ap-southeast-2`

#### **Step 2: Deploy Each Service**

**User Onboarding Service:**
1. Find function: `preprod-safemate-user-onboarding`
2. Click "Upload from" → ".zip file"
3. Upload: `D:\safemate-backend\user-onboarding\user-onboarding-clean-final.zip`
4. Click "Save"

**Email Verification Service:**
1. Find function: `preprod-safemate-email-verification`
2. Click "Upload from" → ".zip file"
3. Upload: `D:\safemate-backend\email-verification-service\email-verification-service.zip`
4. Click "Save"

**Token Vault Service:**
1. Find function: `preprod-safemate-token-vault`
2. Click "Upload from" → ".zip file"
3. Upload: `D:\safemate-backend\token-vault\token-vault.zip`
4. Click "Save"

**Group Manager Service:**
1. Find function: `preprod-safemate-group-manager`
2. Click "Upload from" → ".zip file"
3. Upload: `D:\safemate-backend\group-manager\group-manager.zip`
4. Click "Save"

**Directory Creator Service:**
1. Find function: `preprod-safemate-directory-creator`
2. Click "Upload from" → ".zip file"
3. Upload: `D:\safemate-backend\safemate-directory-creator\safemate-directory-creator.zip`
4. Click "Save"

**Hedera Service:**
1. Find function: `preprod-safemate-hedera-service`
2. Use the PowerShell script: `hedera-service\deploy-with-blockchain.ps1 -Environment preprod`

## 🔧 **Configure Environment Variables:**

After deploying, configure environment variables for each service:

### **User Onboarding Service:**
```json
{
  "WALLETS_TABLE": "preprod-safemate-wallets",
  "USER_KEYS_KMS_KEY_ID": "alias/safemate-master-key-preprod",
  "COGNITO_USER_POOL_ID": "your-preprod-user-pool-id",
  "CLIENT_ID": "your-preprod-client-id",
  "HEDERA_OPERATOR_ID": "0.0.1234567",
  "HEDERA_OPERATOR_KEY": "your-preprod-private-key",
  "HEDERA_NETWORK": "testnet"
}
```

### **Email Verification Service:**
```json
{
  "COGNITO_USER_POOL_ID": "your-preprod-user-pool-id",
  "CLIENT_ID": "your-preprod-client-id"
}
```

### **Token Vault Service:**
```json
{
  "TOKENS_TABLE": "preprod-safemate-tokens",
  "USER_KEYS_KMS_KEY_ID": "alias/safemate-master-key-preprod"
}
```

### **Group Manager Service:**
```json
{
  "GROUPS_TABLE": "preprod-safemate-groups",
  "USER_KEYS_KMS_KEY_ID": "alias/safemate-master-key-preprod"
}
```

### **Directory Creator Service:**
```json
{
  "DIRECTORIES_TABLE": "preprod-safemate-directories",
  "USER_KEYS_KMS_KEY_ID": "alias/safemate-master-key-preprod"
}
```

### **Hedera Service:**
```json
{
  "FOLDERS_TABLE": "preprod-safemate-hedera-folders",
  "WALLET_KEYS_TABLE": "preprod-safemate-wallet-keys",
  "HEDERA_OPERATOR_ID": "0.0.1234567",
  "HEDERA_OPERATOR_KEY": "your-preprod-private-key",
  "HEDERA_NETWORK": "testnet"
}
```

## 🧪 **Test Deployment:**

After deploying and configuring, test each service:

### **Test User Onboarding:**
```bash
curl -X POST https://preprod-api-id.execute-api.ap-southeast-2.amazonaws.com/preprod/onboarding \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-token" \
  -d '{"action":"startOnboarding"}'
```

### **Test Email Verification:**
```bash
curl -X POST https://preprod-api-id.execute-api.ap-southeast-2.amazonaws.com/preprod/email-verification \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-token" \
  -d '{"action":"sendVerificationCode","email":"test@example.com"}'
```

### **Test Token Vault:**
```bash
curl -X POST https://preprod-api-id.execute-api.ap-southeast-2.amazonaws.com/preprod/token-vault \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-token" \
  -d '{"action":"store","userId":"test-user","tokenData":{"token":"test-token"}}'
```

## 📋 **Deployment Checklist:**

- [ ] User Onboarding Service deployed
- [ ] Email Verification Service deployed
- [ ] Token Vault Service deployed
- [ ] Group Manager Service deployed
- [ ] Directory Creator Service deployed
- [ ] Hedera Service deployed
- [ ] Environment variables configured for all services
- [ ] All services tested
- [ ] API Gateway endpoints updated
- [ ] Frontend configured for preprod

## 🎯 **Success Criteria:**

- [ ] All Lambda functions deployed successfully
- [ ] All API endpoints responding correctly
- [ ] Environment variables configured
- [ ] End-to-end testing completed
- [ ] Performance verified

## 🚨 **Troubleshooting:**

### **If AWS CLI doesn't work:**
- Use AWS Console method
- Check AWS credentials
- Verify network connectivity
- Try different region

### **If deployment fails:**
- Check Lambda function exists
- Verify ZIP file is valid
- Check IAM permissions
- Review CloudWatch logs

### **If environment variables fail:**
- Verify variable names match code
- Check KMS key exists
- Verify DynamoDB tables exist
- Check Cognito configuration

---

**All services are now ready for preprod deployment!** 🚀

Choose your preferred deployment method and follow the steps above.
