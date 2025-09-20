# Simplified Dev to Preprod Migration Approach

## 🚨 **Current Issues Identified**

### **Terraform Configuration Problems:**
1. **Missing Lambda ZIP files** - Terraform expects deployment packages that don't exist
2. **Undeclared variables** - 15 variables in preprod.tfvars not declared in Terraform
3. **Path mismatches** - Terraform references wrong file paths
4. **Complex infrastructure** - Current Terraform setup is overly complex for migration

## 🎯 **Simplified Migration Strategy**

Instead of trying to fix the complex Terraform configuration, let's use a **direct AWS CLI approach** for the migration:

### **Step 1: Deploy Services Directly to AWS**

#### **User Onboarding Service**
```bash
# Already has deployment package
cd user-onboarding
aws lambda update-function-code \
  --function-name preprod-safemate-user-onboarding \
  --zip-file fileb://user-onboarding-clean-final.zip \
  --region ap-southeast-2
```

#### **Email Verification Service**
```bash
cd email-verification-service
npm install --production
Compress-Archive -Path "index.js", "package.json", "node_modules" -DestinationPath "email-verification-service.zip"
aws lambda update-function-code \
  --function-name preprod-safemate-email-verification \
  --zip-file fileb://email-verification-service.zip \
  --region ap-southeast-2
```

#### **Hedera Service**
```bash
cd hedera-service
# Use existing deployment script
.\deploy-with-blockchain.ps1 -Environment preprod
```

### **Step 2: Create Missing Lambda Functions**

For services that don't exist yet, create them first:

```bash
# Create token-vault function
aws lambda create-function \
  --function-name preprod-safemate-token-vault \
  --runtime nodejs18.x \
  --role arn:aws:iam::ACCOUNT:role/lambda-execution-role \
  --handler index.handler \
  --zip-file fileb://token-vault.zip \
  --region ap-southeast-2

# Create group-manager function
aws lambda create-function \
  --function-name preprod-safemate-group-manager \
  --runtime nodejs18.x \
  --role arn:aws:iam::ACCOUNT:role/lambda-execution-role \
  --handler index.handler \
  --zip-file fileb://group-manager.zip \
  --region ap-southeast-2
```

### **Step 3: Configure Environment Variables**

```bash
# Use the configuration script
.\configure-environment-variables.ps1 -Environment preprod
```

### **Step 4: Update API Gateway**

```bash
# Update API Gateway to point to preprod functions
aws apigateway update-integration \
  --rest-api-id API_ID \
  --resource-id RESOURCE_ID \
  --http-method POST \
  --patch-ops op=replace,path=/uri,value='arn:aws:apigateway:ap-southeast-2:lambda:path/2015-03-31/functions/arn:aws:lambda:ap-southeast-2:ACCOUNT:function:preprod-safemate-user-onboarding/invocations'
```

## 🔧 **Immediate Action Plan**

### **Option 1: Fix Terraform (Complex)**
- Fix all undeclared variables
- Create missing ZIP files
- Update path references
- Test Terraform configuration

### **Option 2: Direct AWS Deployment (Recommended)**
- Deploy services directly using AWS CLI
- Skip complex Terraform infrastructure
- Focus on core functionality
- Faster migration

### **Option 3: Hybrid Approach**
- Use existing working services (user-onboarding, email-verification, hedera-service)
- Deploy these directly to preprod
- Skip problematic services for now
- Add missing services later

## 🎯 **Recommended Next Steps**

1. **Deploy working services first:**
   - User Onboarding (has deployment package)
   - Email Verification (can create package)
   - Hedera Service (has deployment script)

2. **Test core functionality:**
   - User registration
   - Email verification
   - Wallet creation

3. **Add missing services later:**
   - Token Vault
   - Group Manager
   - Directory Creator

4. **Fix Terraform configuration:**
   - Add missing variables
   - Create proper deployment packages
   - Update path references

## 📋 **Migration Priority**

### **High Priority (Core Functionality)**
- ✅ User Onboarding Service
- ✅ Email Verification Service  
- ✅ Hedera Service

### **Medium Priority (Additional Features)**
- ⚠️ Token Vault Service
- ⚠️ Group Manager Service
- ⚠️ Directory Creator Service

### **Low Priority (Infrastructure)**
- ⚠️ Complex Terraform configuration
- ⚠️ All-in-one deployment

## 🚀 **Quick Migration Command**

```bash
# Deploy core services to preprod
cd user-onboarding
aws lambda update-function-code --function-name preprod-safemate-user-onboarding --zip-file fileb://user-onboarding-clean-final.zip --region ap-southeast-2

cd ../email-verification-service
npm install --production
Compress-Archive -Path "index.js", "package.json", "node_modules" -DestinationPath "email-verification-service.zip"
aws lambda update-function-code --function-name preprod-safemate-email-verification --zip-file fileb://email-verification-service.zip --region ap-southeast-2

cd ../hedera-service
.\deploy-with-blockchain.ps1 -Environment preprod

# Configure environment variables
cd ..
.\configure-environment-variables.ps1 -Environment preprod
```

This approach will get the core functionality migrated to preprod quickly, and we can add the missing services later.
