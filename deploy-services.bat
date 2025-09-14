@echo off
echo 🚀 SafeMate Backend Services Deployment Script
echo.

REM Check if AWS CLI is available
echo 🔍 Checking AWS CLI...
aws --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ AWS CLI not found. Please install AWS CLI v2 first.
    echo 📥 Download from: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html
    pause
    exit /b 1
)
echo ✅ AWS CLI found

REM Check AWS credentials
echo 🔍 Checking AWS credentials...
aws sts get-caller-identity --region ap-southeast-2 >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ AWS credentials not configured. Run 'aws configure' first.
    pause
    exit /b 1
)
echo ✅ AWS credentials configured

echo.
echo 📦 Deploying User Onboarding Service...
cd user-onboarding
aws lambda update-function-code --function-name dev-safemate-user-onboarding --zip-file fileb://user-onboarding-clean-final.zip --region ap-southeast-2
if %errorlevel% equ 0 (
    echo ✅ User Onboarding Service deployed successfully
) else (
    echo ❌ User Onboarding Service deployment failed
)
cd ..

echo.
echo 📦 Deploying Hedera Service...
cd hedera-service
aws lambda update-function-code --function-name dev-safemate-hedera-service --zip-file fileb://hedera-service.zip --region ap-southeast-2
if %errorlevel% equ 0 (
    echo ✅ Hedera Service deployed successfully
) else (
    echo ❌ Hedera Service deployment failed
)
cd ..

echo.
echo 📦 Deploying Email Verification Service...
cd email-verification-service
npm install --production
if exist email-verification-service.zip del email-verification-service.zip
powershell -Command "Compress-Archive -Path 'index.js','package.json','node_modules' -DestinationPath 'email-verification-service.zip'"
aws lambda update-function-code --function-name dev-safemate-email-verification --zip-file fileb://email-verification-service.zip --region ap-southeast-2
if %errorlevel% equ 0 (
    echo ✅ Email Verification Service deployed successfully
) else (
    echo ❌ Email Verification Service deployment failed
)
cd ..

echo.
echo 📊 Deployment Summary:
echo ✅ All services deployment attempted
echo.
echo ⚠️  Important Notes:
echo 1. Ensure Lambda functions exist with proper IAM roles
echo 2. Update environment variables with real values
echo 3. Verify DynamoDB tables and KMS keys exist
echo 4. Test all endpoints after deployment
echo.
echo 🎯 Next Steps:
echo 1. Configure environment variables
echo 2. Test deployed services
echo 3. Configure API Gateway endpoints
echo 4. Monitor logs and performance
echo.
echo 🚀 SafeMate Backend Services Deployment Complete!
pause
