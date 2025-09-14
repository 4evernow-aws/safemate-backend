# SafeMate Backend Services Deployment Script
# This script deploys all SafeMate backend services to AWS Lambda

param(
    [Parameter(Mandatory=$false)]
    [string]$Environment = "dev",
    [Parameter(Mandatory=$false)]
    [string]$Region = "ap-southeast-2"
)

Write-Host "🚀 SafeMate Backend Services Deployment Script" -ForegroundColor Cyan
Write-Host "🌍 Environment: $Environment" -ForegroundColor Yellow
Write-Host "🌏 Region: $Region" -ForegroundColor Yellow

# Check if AWS CLI is available
Write-Host "🔍 Checking AWS CLI..." -ForegroundColor Yellow
try {
    $awsVersion = aws --version 2>$null
    if ($awsVersion) {
        Write-Host "✅ AWS CLI found: $awsVersion" -ForegroundColor Green
    } else {
        Write-Host "❌ AWS CLI not found. Please install AWS CLI v2 first." -ForegroundColor Red
        Write-Host "📥 Download from: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html" -ForegroundColor Yellow
        exit 1
    }
} catch {
    Write-Host "❌ AWS CLI not found. Please install AWS CLI v2 first." -ForegroundColor Red
    exit 1
}

# Check AWS credentials
Write-Host "🔍 Checking AWS credentials..." -ForegroundColor Yellow
try {
    $callerIdentity = aws sts get-caller-identity --region $Region 2>$null
    if ($callerIdentity) {
        Write-Host "✅ AWS credentials configured" -ForegroundColor Green
        $identity = $callerIdentity | ConvertFrom-Json
        Write-Host "   Account: $($identity.Account)" -ForegroundColor Gray
        Write-Host "   User: $($identity.Arn)" -ForegroundColor Gray
    } else {
        Write-Host "❌ AWS credentials not configured. Run 'aws configure' first." -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ AWS credentials not configured. Run 'aws configure' first." -ForegroundColor Red
    exit 1
}

# Environment-specific configurations
$envConfig = @{
    "dev" = @{
        UserOnboardingFunction = "dev-safemate-user-onboarding"
        HederaServiceFunction = "dev-safemate-hedera-service"
        EmailVerificationFunction = "dev-safemate-email-verification"
        WalletsTable = "dev-safemate-wallets"
        FoldersTable = "dev-safemate-hedera-folders"
        WalletKeysTable = "dev-safemate-wallet-keys"
        KmsKeyId = "alias/safemate-master-key-dev"
    }
    "preprod" = @{
        UserOnboardingFunction = "preprod-safemate-user-onboarding"
        HederaServiceFunction = "preprod-safemate-hedera-service"
        EmailVerificationFunction = "preprod-safemate-email-verification"
        WalletsTable = "preprod-safemate-wallets"
        FoldersTable = "preprod-safemate-hedera-folders"
        WalletKeysTable = "preprod-safemate-wallet-keys"
        KmsKeyId = "alias/safemate-master-key-preprod"
    }
    "production" = @{
        UserOnboardingFunction = "prod-safemate-user-onboarding"
        HederaServiceFunction = "prod-safemate-hedera-service"
        EmailVerificationFunction = "prod-safemate-email-verification"
        WalletsTable = "prod-safemate-wallets"
        FoldersTable = "prod-safemate-hedera-folders"
        WalletKeysTable = "prod-safemate-wallet-keys"
        KmsKeyId = "alias/safemate-master-key-prod"
    }
}

$config = $envConfig[$Environment]

Write-Host "📋 Environment Configuration:" -ForegroundColor Yellow
Write-Host "  User Onboarding Function: $($config.UserOnboardingFunction)" -ForegroundColor Gray
Write-Host "  Hedera Service Function: $($config.HederaServiceFunction)" -ForegroundColor Gray
Write-Host "  Email Verification Function: $($config.EmailVerificationFunction)" -ForegroundColor Gray

# Function to deploy a Lambda function
function Deploy-LambdaFunction {
    param(
        [string]$FunctionName,
        [string]$ZipFile,
        [string]$Handler = "index.handler",
        [string]$Runtime = "nodejs18.x",
        [hashtable]$EnvironmentVariables = @{}
    )
    
    Write-Host "🚀 Deploying $FunctionName..." -ForegroundColor Yellow
    
    # Check if function exists
    $functionExists = aws lambda get-function --function-name $FunctionName --region $Region 2>$null
    if ($functionExists) {
        Write-Host "  📦 Updating existing function..." -ForegroundColor Gray
        $result = aws lambda update-function-code --function-name $FunctionName --zip-file "fileb://$ZipFile" --region $Region
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  ✅ Function code updated successfully" -ForegroundColor Green
        } else {
            Write-Host "  ❌ Failed to update function code" -ForegroundColor Red
            return $false
        }
    } else {
        Write-Host "  🆕 Creating new function..." -ForegroundColor Gray
        Write-Host "  ⚠️  Note: You need to create the function with proper IAM role first" -ForegroundColor Yellow
        Write-Host "  💡 Use AWS Console or Terraform to create the function with IAM role" -ForegroundColor Yellow
        return $false
    }
    
    # Update environment variables if provided
    if ($EnvironmentVariables.Count -gt 0) {
        Write-Host "  🔧 Updating environment variables..." -ForegroundColor Gray
        $envJson = $EnvironmentVariables | ConvertTo-Json -Compress
        $result = aws lambda update-function-configuration --function-name $FunctionName --environment "Variables=$envJson" --region $Region
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  ✅ Environment variables updated successfully" -ForegroundColor Green
        } else {
            Write-Host "  ❌ Failed to update environment variables" -ForegroundColor Red
            return $false
        }
    }
    
    return $true
}

# Deploy User Onboarding Service
Write-Host "`n📦 Deploying User Onboarding Service..." -ForegroundColor Cyan
$userOnboardingEnv = @{
    "WALLETS_TABLE" = $config.WalletsTable
    "USER_KEYS_KMS_KEY_ID" = $config.KmsKeyId
    "COGNITO_USER_POOL_ID" = "YOUR_USER_POOL_ID"
    "CLIENT_ID" = "YOUR_CLIENT_ID"
    "HEDERA_OPERATOR_ID" = "0.0.1234567"
    "HEDERA_OPERATOR_KEY" = "YOUR_PRIVATE_KEY"
    "HEDERA_NETWORK" = "testnet"
}

$success = Deploy-LambdaFunction -FunctionName $config.UserOnboardingFunction -ZipFile "user-onboarding/user-onboarding-clean-final.zip" -EnvironmentVariables $userOnboardingEnv

if ($success) {
    Write-Host "✅ User Onboarding Service deployed successfully" -ForegroundColor Green
} else {
    Write-Host "❌ User Onboarding Service deployment failed" -ForegroundColor Red
}

# Deploy Hedera Service
Write-Host "`n📦 Deploying Hedera Service..." -ForegroundColor Cyan
$hederaServiceEnv = @{
    "FOLDERS_TABLE" = $config.FoldersTable
    "WALLET_KEYS_TABLE" = $config.WalletKeysTable
    "HEDERA_OPERATOR_ID" = "0.0.1234567"
    "HEDERA_OPERATOR_KEY" = "YOUR_PRIVATE_KEY"
    "HEDERA_NETWORK" = "testnet"
}

$success = Deploy-LambdaFunction -FunctionName $config.HederaServiceFunction -ZipFile "hedera-service/hedera-service.zip" -EnvironmentVariables $hederaServiceEnv

if ($success) {
    Write-Host "✅ Hedera Service deployed successfully" -ForegroundColor Green
} else {
    Write-Host "❌ Hedera Service deployment failed" -ForegroundColor Red
}

# Deploy Email Verification Service
Write-Host "`n📦 Deploying Email Verification Service..." -ForegroundColor Cyan

# Create deployment package for email verification
Write-Host "  📦 Creating deployment package..." -ForegroundColor Gray
Set-Location "email-verification-service"
if (Test-Path "node_modules") {
    Remove-Item -Recurse -Force "node_modules"
}
npm install --production
if (Test-Path "email-verification-service.zip") {
    Remove-Item "email-verification-service.zip"
}
Compress-Archive -Path "index.js", "package.json", "node_modules" -DestinationPath "email-verification-service.zip"
Set-Location ".."

$emailVerificationEnv = @{
    "COGNITO_USER_POOL_ID" = "YOUR_USER_POOL_ID"
    "CLIENT_ID" = "YOUR_CLIENT_ID"
}

$success = Deploy-LambdaFunction -FunctionName $config.EmailVerificationFunction -ZipFile "email-verification-service/email-verification-service.zip" -EnvironmentVariables $emailVerificationEnv

if ($success) {
    Write-Host "✅ Email Verification Service deployed successfully" -ForegroundColor Green
} else {
    Write-Host "❌ Email Verification Service deployment failed" -ForegroundColor Red
}

# Summary
Write-Host "`n📊 Deployment Summary:" -ForegroundColor Cyan
Write-Host "✅ All services deployment attempted" -ForegroundColor Green
Write-Host "`n⚠️  Important Notes:" -ForegroundColor Yellow
Write-Host "1. Replace 'YOUR_USER_POOL_ID', 'YOUR_CLIENT_ID', and 'YOUR_PRIVATE_KEY' with actual values" -ForegroundColor Gray
Write-Host "2. Ensure Lambda functions exist with proper IAM roles" -ForegroundColor Gray
Write-Host "3. Verify DynamoDB tables and KMS keys exist" -ForegroundColor Gray
Write-Host "4. Test all endpoints after deployment" -ForegroundColor Gray

Write-Host "`n🎯 Next Steps:" -ForegroundColor Cyan
Write-Host "1. Update environment variables with real values" -ForegroundColor Gray
Write-Host "2. Test deployed services" -ForegroundColor Gray
Write-Host "3. Configure API Gateway endpoints" -ForegroundColor Gray
Write-Host "4. Monitor logs and performance" -ForegroundColor Gray

Write-Host "`n🚀 SafeMate Backend Services Deployment Complete!" -ForegroundColor Green
