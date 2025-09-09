# SafeMate Hedera Service Deployment Script with Real Blockchain Integration
# This script deploys the Hedera service with real blockchain operations for different environments

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("dev", "preprod", "production")]
    [string]$Environment = "dev"
)

Write-Host "🚀 Deploying SafeMate Hedera Service with Real Blockchain Integration" -ForegroundColor Cyan
Write-Host "🌍 Environment: $Environment" -ForegroundColor Yellow

# Environment-specific configurations
$envConfig = @{
    "dev" = @{
        FunctionName = "dev-safemate-hedera-service"
        HederaNetwork = "testnet"
        FoldersTable = "dev-safemate-hedera-folders"
        WalletKeysTable = "dev-safemate-wallet-keys"
        ApiStage = "/dev"
        Description = "Development Environment"
    }
    "preprod" = @{
        FunctionName = "preprod-safemate-hedera-service"
        HederaNetwork = "testnet"
        FoldersTable = "preprod-safemate-hedera-folders"
        WalletKeysTable = "preprod-safemate-wallet-keys"
        ApiStage = "/preprod"
        Description = "Pre-Production Environment"
    }
    "production" = @{
        FunctionName = "prod-safemate-hedera-service"
        HederaNetwork = "mainnet"
        FoldersTable = "prod-safemate-hedera-folders"
        WalletKeysTable = "prod-safemate-wallet-keys"
        ApiStage = "/prod"
        Description = "Production Environment"
    }
}

$config = $envConfig[$Environment]

Write-Host "📋 Environment Configuration:" -ForegroundColor Yellow
Write-Host "  Function Name: $($config.FunctionName)" -ForegroundColor Gray
Write-Host "  Hedera Network: $($config.HederaNetwork)" -ForegroundColor Gray
Write-Host "  API Stage: $($config.ApiStage)" -ForegroundColor Gray
Write-Host "  Description: $($config.Description)" -ForegroundColor Gray

# Check if AWS CLI is configured
Write-Host "🔍 Checking AWS CLI configuration..." -ForegroundColor Yellow
$awsConfigured = aws sts get-caller-identity 2>$null
if (-not $awsConfigured) {
    Write-Host "❌ AWS CLI not configured. Please run 'aws configure' first." -ForegroundColor Red
    exit 1
}

Write-Host "✅ AWS CLI configured" -ForegroundColor Green

# Set environment variables for Hedera operator
Write-Host "🔧 Setting up Hedera operator credentials..." -ForegroundColor Yellow

# These should be set in your environment or AWS Systems Manager Parameter Store
# For development, you can set them directly in the Lambda environment variables
$hederaOperatorAccountId = Read-Host "Enter Hedera Operator Account ID (e.g., 0.0.123456)"
$hederaOperatorPrivateKey = Read-Host "Enter Hedera Operator Private Key" -AsSecureString

# Convert secure string to plain text
$hederaOperatorPrivateKeyPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($hederaOperatorPrivateKey))

Write-Host "✅ Hedera credentials captured" -ForegroundColor Green

# Set environment variables
$env:HEDERA_OPERATOR_ACCOUNT_ID = $hederaOperatorAccountId
$env:HEDERA_OPERATOR_PRIVATE_KEY = $hederaOperatorPrivateKeyPlain
$env:HEDERA_NETWORK = $config.HederaNetwork

Write-Host "🔧 Environment variables set:" -ForegroundColor Yellow
Write-Host "  HEDERA_OPERATOR_ACCOUNT_ID: $hederaOperatorAccountId" -ForegroundColor Gray
Write-Host "  HEDERA_NETWORK: $($config.HederaNetwork)" -ForegroundColor Gray

# Install dependencies
Write-Host "📦 Installing dependencies..." -ForegroundColor Yellow
npm install

# Create deployment package
Write-Host "📦 Creating deployment package..." -ForegroundColor Yellow
npm run zip

# Deploy to AWS Lambda
Write-Host "🚀 Deploying to AWS Lambda..." -ForegroundColor Yellow
Write-Host "📦 Function: $($config.FunctionName)" -ForegroundColor Gray

# Update Lambda function with new code and environment variables
aws lambda update-function-code `
    --function-name $config.FunctionName `
    --zip-file fileb://hedera-service.zip

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to update Lambda function code" -ForegroundColor Red
    exit 1
}

# Update Lambda environment variables
aws lambda update-function-configuration `
    --function-name $config.FunctionName `
    --environment "Variables={
        HEDERA_OPERATOR_ACCOUNT_ID=$hederaOperatorAccountId,
        HEDERA_NETWORK=$($config.HederaNetwork),
        STAGE=$Environment,
        HEDERA_FOLDERS_TABLE=$($config.FoldersTable),
        WALLET_KEYS_TABLE=$($config.WalletKeysTable)
    }"

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to update Lambda environment variables" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Lambda function updated successfully" -ForegroundColor Green

# Test the deployment
Write-Host "🧪 Testing deployment..." -ForegroundColor Yellow

# Create a test payload
$testPayload = @{
    httpMethod = "POST"
    path = "/folders"
    body = '{"name":"Test Blockchain Folder","parentFolderId":null}'
    headers = @{
        "Content-Type" = "application/json"
        "Authorization" = "Bearer test-token"
    }
    requestContext = @{
        authorizer = @{
            claims = @{
                sub = "test-user-id"
            }
        }
    }
} | ConvertTo-Json -Depth 10

# Save test payload to file
$testPayload | Out-File -FilePath "test-payload.json" -Encoding UTF8

Write-Host "📝 Test payload created: test-payload.json" -ForegroundColor Green

# Invoke Lambda function for testing
Write-Host "🧪 Invoking Lambda function..." -ForegroundColor Yellow
aws lambda invoke `
    --function-name $config.FunctionName `
    --payload file://test-payload.json `
    --cli-binary-format raw-in-base64-out `
    response.json

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Lambda function invoked successfully" -ForegroundColor Green
    Write-Host "📄 Response:" -ForegroundColor Yellow
    Get-Content response.json | ConvertFrom-Json | ConvertTo-Json -Depth 10
} else {
    Write-Host "❌ Lambda function invocation failed" -ForegroundColor Red
}

# Clean up
Remove-Item "test-payload.json" -ErrorAction SilentlyContinue
Remove-Item "response.json" -ErrorAction SilentlyContinue

Write-Host "🎉 Deployment completed successfully!" -ForegroundColor Green
Write-Host "🔗 Your Hedera service is now running with real blockchain integration" -ForegroundColor Cyan
Write-Host "🌍 Environment: $Environment ($($config.Description))" -ForegroundColor Yellow
Write-Host "🔗 Hedera Network: $($config.HederaNetwork)" -ForegroundColor Yellow
Write-Host "📝 Check the Lambda logs for detailed blockchain transaction information" -ForegroundColor Yellow

# Display next steps
Write-Host "`n📋 Next Steps:" -ForegroundColor Cyan
Write-Host "1. Update API Gateway to point to the new Lambda function" -ForegroundColor Gray
Write-Host "2. Test the API endpoints with real authentication" -ForegroundColor Gray
Write-Host "3. Monitor Lambda logs for blockchain transactions" -ForegroundColor Gray
Write-Host "4. Verify transactions on HashScan: https://hashscan.io/$($config.HederaNetwork)" -ForegroundColor Gray
