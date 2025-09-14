# SafeMate Backend Services Deployment Guide

## 🚀 **Complete Deployment Instructions**

This guide will help you deploy all SafeMate backend services to AWS Lambda and configure the necessary environment variables.

---

## 📋 **Prerequisites**

### 1. **AWS CLI Installation**
```bash
# Download and install AWS CLI v2
# https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html

# Verify installation
aws --version
```

### 2. **AWS Configuration**
```bash
# Configure AWS CLI with your credentials
aws configure

# Enter your:
# - AWS Access Key ID
# - AWS Secret Access Key  
# - Default region (ap-southeast-2)
# - Default output format (json)
```

### 3. **Verify AWS Access**
```bash
# Test AWS connection
aws sts get-caller-identity

# List existing Lambda functions
aws lambda list-functions --region ap-southeast-2
```

---

## 🔧 **Environment Variables Setup**

### **Required Environment Variables for All Services:**

```bash
# Hedera Configuration
HEDERA_OPERATOR_ID=0.0.1234567
HEDERA_OPERATOR_KEY=your-private-key-here
HEDERA_NETWORK=testnet

# AWS Configuration
WALLETS_TABLE=dev-safemate-wallets
USER_KEYS_KMS_KEY_ID=alias/safemate-master-key-dev
COGNITO_USER_POOL_ID=your-user-pool-id
CLIENT_ID=your-client-id

# DynamoDB Tables
FOLDERS_TABLE=dev-safemate-hedera-folders
WALLET_KEYS_TABLE=dev-safemate-wallet-keys
```

---

## 🚀 **Deployment Commands**

### **1. Deploy User Onboarding Service**

```bash
# Navigate to user onboarding directory
cd user-onboarding

# Deploy the service
aws lambda update-function-code \
  --function-name dev-safemate-user-onboarding \
  --zip-file fileb://user-onboarding-clean-final.zip \
  --region ap-southeast-2

# Configure environment variables
aws lambda update-function-configuration \
  --function-name dev-safemate-user-onboarding \
  --environment Variables='{
    "WALLETS_TABLE":"dev-safemate-wallets",
    "USER_KEYS_KMS_KEY_ID":"alias/safemate-master-key-dev",
    "COGNITO_USER_POOL_ID":"your-user-pool-id",
    "CLIENT_ID":"your-client-id",
    "HEDERA_OPERATOR_ID":"0.0.1234567",
    "HEDERA_OPERATOR_KEY":"your-private-key-here",
    "HEDERA_NETWORK":"testnet"
  }' \
  --region ap-southeast-2
```

### **2. Deploy Hedera Service**

```bash
# Navigate to hedera service directory
cd ../hedera-service

# Deploy the service
aws lambda update-function-code \
  --function-name dev-safemate-hedera-service \
  --zip-file fileb://hedera-service.zip \
  --region ap-southeast-2

# Configure environment variables
aws lambda update-function-configuration \
  --function-name dev-safemate-hedera-service \
  --environment Variables='{
    "FOLDERS_TABLE":"dev-safemate-hedera-folders",
    "WALLET_KEYS_TABLE":"dev-safemate-wallet-keys",
    "HEDERA_OPERATOR_ID":"0.0.1234567",
    "HEDERA_OPERATOR_KEY":"your-private-key-here",
    "HEDERA_NETWORK":"testnet"
  }' \
  --region ap-southeast-2
```

### **3. Deploy Email Verification Service**

```bash
# Navigate to email verification directory
cd ../email-verification-service

# Create deployment package
npm install
zip -r email-verification-service.zip index.js package.json node_modules/

# Deploy the service
aws lambda update-function-code \
  --function-name dev-safemate-email-verification \
  --zip-file fileb://email-verification-service.zip \
  --region ap-southeast-2

# Configure environment variables
aws lambda update-function-configuration \
  --function-name dev-safemate-email-verification \
  --environment Variables='{
    "COGNITO_USER_POOL_ID":"your-user-pool-id",
    "CLIENT_ID":"your-client-id"
  }' \
  --region ap-southeast-2
```

---

## 🧪 **Testing Deployed Services**

### **1. Test User Onboarding**
```bash
# Test the user onboarding endpoint
curl -X POST https://your-api-gateway-url/dev/onboarding \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-jwt-token" \
  -d '{"action":"startOnboarding"}'
```

### **2. Test Email Verification**
```bash
# Test email verification
curl -X POST https://your-api-gateway-url/dev/email-verification \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-jwt-token" \
  -d '{"action":"sendVerificationCode","email":"test@example.com"}'
```

### **3. Test Hedera Service**
```bash
# Test folder creation
curl -X POST https://your-api-gateway-url/dev/folders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-jwt-token" \
  -d '{"name":"Test Folder"}'
```

---

## 🔍 **Verification Commands**

### **Check Lambda Function Status**
```bash
# List all Lambda functions
aws lambda list-functions --region ap-southeast-2 --query 'Functions[?contains(FunctionName, `safemate`)].{Name:FunctionName,Runtime:Runtime,LastModified:LastModified,State:State}' --output table

# Check specific function
aws lambda get-function --function-name dev-safemate-user-onboarding --region ap-southeast-2

# Check function configuration
aws lambda get-function-configuration --function-name dev-safemate-user-onboarding --region ap-southeast-2
```

### **Check Environment Variables**
```bash
# View environment variables for each function
aws lambda get-function-configuration --function-name dev-safemate-user-onboarding --region ap-southeast-2 --query 'Environment.Variables'

aws lambda get-function-configuration --function-name dev-safemate-hedera-service --region ap-southeast-2 --query 'Environment.Variables'

aws lambda get-function-configuration --function-name dev-safemate-email-verification --region ap-southeast-2 --query 'Environment.Variables'
```

---

## 🚨 **Troubleshooting**

### **Common Issues:**

#### **1. Function Not Found**
```bash
# If function doesn't exist, create it first
aws lambda create-function \
  --function-name dev-safemate-user-onboarding \
  --runtime nodejs18.x \
  --role arn:aws:iam::your-account:role/lambda-execution-role \
  --handler index.handler \
  --zip-file fileb://user-onboarding-clean-final.zip \
  --region ap-southeast-2
```

#### **2. Permission Issues**
```bash
# Check IAM permissions
aws iam get-role --role-name lambda-execution-role
```

#### **3. Environment Variable Issues**
```bash
# Update environment variables
aws lambda update-function-configuration \
  --function-name dev-safemate-user-onboarding \
  --environment Variables='{"KEY":"VALUE"}' \
  --region ap-southeast-2
```

---

## 📊 **Deployment Status Checklist**

- [ ] AWS CLI installed and configured
- [ ] User onboarding service deployed
- [ ] Hedera service deployed  
- [ ] Email verification service deployed
- [ ] Environment variables configured
- [ ] Services tested and working
- [ ] API Gateway endpoints connected
- [ ] CORS configured properly

---

## 🎯 **Next Steps After Deployment**

1. **Test all endpoints** to ensure functionality
2. **Configure API Gateway** if not already done
3. **Set up monitoring** and logging
4. **Update frontend** to use deployed endpoints
5. **Monitor costs** and performance

---

**Ready to deploy SafeMate backend services!** 🚀

**Note**: Replace `your-user-pool-id`, `your-client-id`, and `your-private-key-here` with your actual values before running the deployment commands.
