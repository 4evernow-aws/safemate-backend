# SafeMate Backend Services Environment Variables Configuration Script
# This script configures environment variables for all SafeMate Lambda functions

param(
    [Parameter(Mandatory=$false)]
    [string]$Environment = "dev",
    [Parameter(Mandatory=$false)]
    [string]$Region = "ap-southeast-2"
)

Write-Host "🔧 SafeMate Backend Services Environment Variables Configuration" -ForegroundColor Cyan
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

# Function to update environment variables
function Update-EnvironmentVariables {
    param(
        [string]$FunctionName,
        [hashtable]$EnvironmentVariables
    )
    
    Write-Host "🔧 Updating environment variables for $FunctionName..." -ForegroundColor Yellow
    
    # Check if function exists
    $functionExists = aws lambda get-function --function-name $FunctionName --region $Region 2>$null
    if (-not $functionExists) {
        Write-Host "  ❌ Function $FunctionName not found. Please deploy it first." -ForegroundColor Red
        return $false
    }
    
    # Update environment variables
    $envJson = $EnvironmentVariables | ConvertTo-Json -Compress
    $result = aws lambda update-function-configuration --function-name $FunctionName --environment "Variables=$envJson" --region $Region
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✅ Environment variables updated successfully" -ForegroundColor Green
        return $true
    } else {
        Write-Host "  ❌ Failed to update environment variables" -ForegroundColor Red
        return $false
    }
}

# Get user input for required values
Write-Host "`n📝 Please provide the following information:" -ForegroundColor Cyan

$cognitoUserPoolId = Read-Host "Enter Cognito User Pool ID"
$clientId = Read-Host "Enter Cognito Client ID"
$hederaOperatorId = Read-Host "Enter Hedera Operator ID (e.g., 0.0.1234567)"
$hederaOperatorKey = Read-Host "Enter Hedera Operator Private Key" -AsSecureString
$hederaOperatorKeyPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($hederaOperatorKey))

# Configure User Onboarding Service
Write-Host "`n🔧 Configuring User Onboarding Service..." -ForegroundColor Cyan
$userOnboardingEnv = @{
    "WALLETS_TABLE" = $config.WalletsTable
    "USER_KEYS_KMS_KEY_ID" = $config.KmsKeyId
    "COGNITO_USER_POOL_ID" = $cognitoUserPoolId
    "CLIENT_ID" = $clientId
    "HEDERA_OPERATOR_ID" = $hederaOperatorId
    "HEDERA_OPERATOR_KEY" = $hederaOperatorKeyPlain
    "HEDERA_NETWORK" = "testnet"
}

$success = Update-EnvironmentVariables -FunctionName $config.UserOnboardingFunction -EnvironmentVariables $userOnboardingEnv

# Configure Hedera Service
Write-Host "`n🔧 Configuring Hedera Service..." -ForegroundColor Cyan
$hederaServiceEnv = @{
    "FOLDERS_TABLE" = $config.FoldersTable
    "WALLET_KEYS_TABLE" = $config.WalletKeysTable
    "HEDERA_OPERATOR_ID" = $hederaOperatorId
    "HEDERA_OPERATOR_KEY" = $hederaOperatorKeyPlain
    "HEDERA_NETWORK" = "testnet"
}

$success = Update-EnvironmentVariables -FunctionName $config.HederaServiceFunction -EnvironmentVariables $hederaServiceEnv

# Configure Email Verification Service
Write-Host "`n🔧 Configuring Email Verification Service..." -ForegroundColor Cyan
$emailVerificationEnv = @{
    "COGNITO_USER_POOL_ID" = $cognitoUserPoolId
    "CLIENT_ID" = $clientId
}

$success = Update-EnvironmentVariables -FunctionName $config.EmailVerificationFunction -EnvironmentVariables $emailVerificationEnv

# Summary
Write-Host "`n📊 Environment Variables Configuration Summary:" -ForegroundColor Cyan
Write-Host "✅ All services environment variables configuration attempted" -ForegroundColor Green

Write-Host "`n🔍 Verification Commands:" -ForegroundColor Yellow
Write-Host "Check User Onboarding Service:" -ForegroundColor Gray
Write-Host "aws lambda get-function-configuration --function-name $($config.UserOnboardingFunction) --region $Region --query 'Environment.Variables'" -ForegroundColor Gray

Write-Host "`nCheck Hedera Service:" -ForegroundColor Gray
Write-Host "aws lambda get-function-configuration --function-name $($config.HederaServiceFunction) --region $Region --query 'Environment.Variables'" -ForegroundColor Gray

Write-Host "`nCheck Email Verification Service:" -ForegroundColor Gray
Write-Host "aws lambda get-function-configuration --function-name $($config.EmailVerificationFunction) --region $Region --query 'Environment.Variables'" -ForegroundColor Gray

Write-Host "`n🎯 Next Steps:" -ForegroundColor Cyan
Write-Host "1. Verify environment variables are set correctly" -ForegroundColor Gray
Write-Host "2. Test deployed services" -ForegroundColor Gray
Write-Host "3. Configure API Gateway endpoints" -ForegroundColor Gray
Write-Host "4. Monitor logs and performance" -ForegroundColor Gray

Write-Host "`n🔧 Environment Variables Configuration Complete!" -ForegroundColor Green
