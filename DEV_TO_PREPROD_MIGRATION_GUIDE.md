# SafeMate Dev to Preprod Migration Guide

## 🚀 **Complete Migration Process from Development to Pre-Production**

This guide provides step-by-step instructions for migrating SafeMate services from the development environment to the pre-production environment.

---

## 📋 **Pre-Migration Checklist**

### ✅ **Development Environment Verification**
- [ ] All services tested and working in dev
- [ ] No critical bugs or issues
- [ ] All tests passing
- [ ] Code reviewed and approved
- [ ] Documentation updated
- [ ] Free Tier compliance maintained

### ✅ **Pre-Production Environment Setup**
- [ ] Preprod AWS account configured
- [ ] Preprod environment variables ready
- [ ] Preprod DynamoDB tables created
- [ ] Preprod KMS keys configured
- [ ] Preprod Cognito user pool ready
- [ ] Preprod API Gateway configured

---

## 🔧 **Migration Steps**

### **Step 1: Prepare Development Environment**

```bash
# Navigate to backend repository
cd D:\safemate-backend

# Ensure all changes are committed
git status
git add .
git commit -m "feat: Prepare for preprod migration - [describe changes]"
git push origin dev

# Verify all services are working
npm run test
```

### **Step 2: Update Environment Configuration**

```bash
# Update preprod environment configuration
# Edit environments/preprod.json if needed
cat environments/preprod.json
```

**Preprod Configuration:**
```json
{
  "environment": "preprod",
  "aws": {
    "region": "ap-southeast-2"
  },
  "lambda": {
    "timeout": 60,
    "memory": 512,
    "logRetention": 14
  },
  "dynamodb": {
    "billingMode": "PAY_PER_REQUEST"
  },
  "hedera": {
    "network": "testnet"
  }
}
```

### **Step 3: Deploy Infrastructure to Preprod**

```bash
# Navigate to infrastructure repository
cd D:\safemate-infrastructure

# Deploy infrastructure to preprod
terraform plan -var-file="environments/preprod.tfvars"
terraform apply -var-file="environments/preprod.tfvars"
```

### **Step 4: Deploy Backend Services to Preprod**

#### **Option A: Deploy All Services at Once**

```bash
# Navigate to backend repository
cd D:\safemate-backend

# Deploy all services to preprod
npm run deploy:preprod
```

#### **Option B: Deploy Services Individually**

```bash
# Deploy User Onboarding Service
cd user-onboarding
aws lambda update-function-code \
  --function-name preprod-safemate-user-onboarding \
  --zip-file fileb://user-onboarding-clean-final.zip \
  --region ap-southeast-2

# Deploy Hedera Service
cd ../hedera-service
.\deploy-with-blockchain.ps1 -Environment preprod

# Deploy Email Verification Service
cd ../email-verification-service
npm install --production
zip -r email-verification-service.zip index.js package.json node_modules/
aws lambda update-function-code \
  --function-name preprod-safemate-email-verification \
  --zip-file fileb://email-verification-service.zip \
  --region ap-southeast-2
```

### **Step 5: Configure Environment Variables**

```bash
# Use the configuration script
.\configure-environment-variables.ps1 -Environment preprod
```

**Or manually configure each service:**

```bash
# User Onboarding Service
aws lambda update-function-configuration \
  --function-name preprod-safemate-user-onboarding \
  --environment Variables='{
    "WALLETS_TABLE":"preprod-safemate-wallets",
    "USER_KEYS_KMS_KEY_ID":"alias/safemate-master-key-preprod",
    "COGNITO_USER_POOL_ID":"preprod-user-pool-id",
    "CLIENT_ID":"preprod-client-id",
    "HEDERA_OPERATOR_ID":"0.0.1234567",
    "HEDERA_OPERATOR_KEY":"preprod-private-key",
    "HEDERA_NETWORK":"testnet"
  }' \
  --region ap-southeast-2

# Hedera Service
aws lambda update-function-configuration \
  --function-name preprod-safemate-hedera-service \
  --environment Variables='{
    "FOLDERS_TABLE":"preprod-safemate-hedera-folders",
    "WALLET_KEYS_TABLE":"preprod-safemate-wallet-keys",
    "HEDERA_OPERATOR_ID":"0.0.1234567",
    "HEDERA_OPERATOR_KEY":"preprod-private-key",
    "HEDERA_NETWORK":"testnet"
  }' \
  --region ap-southeast-2

# Email Verification Service
aws lambda update-function-configuration \
  --function-name preprod-safemate-email-verification \
  --environment Variables='{
    "COGNITO_USER_POOL_ID":"preprod-user-pool-id",
    "CLIENT_ID":"preprod-client-id"
  }' \
  --region ap-southeast-2
```

### **Step 6: Deploy Lambda Layers to Preprod**

```bash
# Navigate to shared repository
cd D:\safemate-shared

# Deploy Lambda layers
cd lambda-layers
./deploy-layers.sh preprod
```

### **Step 7: Update API Gateway Configuration**

```bash
# Navigate to infrastructure repository
cd D:\safemate-infrastructure

# Update API Gateway for preprod
terraform apply -target=aws_api_gateway_rest_api.safemate_api \
  -var-file="environments/preprod.tfvars"
```

### **Step 8: Test Preprod Environment**

```bash
# Test User Onboarding
curl -X POST https://preprod-api-id.execute-api.ap-southeast-2.amazonaws.com/preprod/onboarding \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-token" \
  -d '{"action":"startOnboarding"}'

# Test Email Verification
curl -X POST https://preprod-api-id.execute-api.ap-southeast-2.amazonaws.com/preprod/email-verification \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-token" \
  -d '{"action":"sendVerificationCode","email":"test@example.com"}'

# Test Hedera Service
curl -X POST https://preprod-api-id.execute-api.ap-southeast-2.amazonaws.com/preprod/folders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-token" \
  -d '{"name":"Test Folder"}'
```

### **Step 9: Update Frontend Configuration**

```bash
# Navigate to frontend repository
cd D:\safemate-frontend

# Update API endpoints to point to preprod
# Edit src/config/environment.ts or similar
```

**Frontend Configuration Update:**
```typescript
// src/config/environment.ts
export const environment = {
  production: false,
  apiUrl: 'https://preprod-api-id.execute-api.ap-southeast-2.amazonaws.com/preprod',
  cognito: {
    userPoolId: 'preprod-user-pool-id',
    clientId: 'preprod-client-id',
    region: 'ap-southeast-2'
  }
};
```

### **Step 10: Deploy Frontend to Preprod**

```bash
# Build and deploy frontend
npm run build:preprod
npm run deploy:preprod
```

---

## 🔍 **Verification Steps**

### **1. Service Health Checks**

```bash
# Check Lambda function status
aws lambda list-functions --region ap-southeast-2 \
  --query 'Functions[?contains(FunctionName, `preprod`)].{Name:FunctionName,State:State,LastModified:LastModified}' \
  --output table

# Check DynamoDB tables
aws dynamodb list-tables --region ap-southeast-2 \
  --query 'TableNames[?contains(@, `preprod`)]' \
  --output table

# Check API Gateway
aws apigateway get-rest-apis --region ap-southeast-2 \
  --query 'items[?contains(name, `preprod`)].{Name:name,Id:id,Description:description}' \
  --output table
```

### **2. End-to-End Testing**

```bash
# Test complete user flow
# 1. User registration
# 2. Email verification
# 3. Wallet creation
# 4. File upload
# 5. Blockchain operations
```

### **3. Performance Testing**

```bash
# Test API response times
# Test Lambda cold starts
# Test database query performance
# Test blockchain transaction times
```

---

## 🚨 **Rollback Procedures**

### **If Issues Occur:**

```bash
# 1. Identify the problematic service
aws logs tail /aws/lambda/preprod-safemate-service-name --follow

# 2. Rollback to previous version
aws lambda update-function-code \
  --function-name preprod-safemate-service-name \
  --zip-file fileb://previous-version.zip \
  --region ap-southeast-2

# 3. Update environment variables if needed
aws lambda update-function-configuration \
  --function-name preprod-safemate-service-name \
  --environment Variables='{...}' \
  --region ap-southeast-2

# 4. Test the rollback
curl -X POST https://preprod-api-id.execute-api.ap-southeast-2.amazonaws.com/preprod/endpoint
```

---

## 📊 **Migration Checklist**

### **Pre-Migration**
- [ ] Dev environment stable and tested
- [ ] All changes committed and pushed
- [ ] Preprod infrastructure ready
- [ ] Environment variables prepared
- [ ] Migration plan reviewed

### **Migration Execution**
- [ ] Infrastructure deployed to preprod
- [ ] Backend services deployed
- [ ] Environment variables configured
- [ ] Lambda layers deployed
- [ ] API Gateway updated
- [ ] Frontend deployed

### **Post-Migration**
- [ ] All services tested
- [ ] End-to-end testing completed
- [ ] Performance verified
- [ ] Monitoring configured
- [ ] Documentation updated
- [ ] Team notified

---

## 🎯 **Success Criteria**

### **Technical Success**
- [ ] All Lambda functions deployed successfully
- [ ] All API endpoints responding correctly
- [ ] Database connections working
- [ ] Blockchain integration functional
- [ ] Email verification working
- [ ] File upload/download working

### **Performance Success**
- [ ] API response times < 200ms
- [ ] Lambda cold starts < 1 second
- [ ] Database queries < 50ms
- [ ] Blockchain transactions < 5 seconds

### **Business Success**
- [ ] User registration flow working
- [ ] Email verification functional
- [ ] Wallet creation successful
- [ ] File operations working
- [ ] Blockchain operations functional

---

## 📞 **Support and Troubleshooting**

### **Common Issues**

1. **Lambda Function Not Found**
   ```bash
   # Check if function exists
   aws lambda get-function --function-name preprod-safemate-service-name
   ```

2. **Environment Variables Not Set**
   ```bash
   # Check environment variables
   aws lambda get-function-configuration --function-name preprod-safemate-service-name --query 'Environment.Variables'
   ```

3. **API Gateway Issues**
   ```bash
   # Check API Gateway logs
   aws logs tail /aws/apigateway/preprod-api-name --follow
   ```

### **Emergency Contacts**
- **AWS Support**: For infrastructure issues
- **Development Team**: For application issues
- **Hedera Support**: For blockchain issues

---

**Migration Status**: ✅ **READY TO EXECUTE**  
**Estimated Time**: 2-4 hours  
**Risk Level**: Low (testnet environment)  
**Rollback Time**: 30 minutes  

**SafeMate Dev to Preprod Migration Guide** - Complete and ready for execution! 🚀
