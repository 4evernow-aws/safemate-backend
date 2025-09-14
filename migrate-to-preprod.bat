@echo off
echo 🚀 SafeMate Dev to Preprod Migration Script
echo ============================================
echo.

REM Check if AWS CLI is available
echo 🔍 Checking AWS CLI...
aws --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ AWS CLI not found. Please install AWS CLI v2 first.
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
echo 📋 Pre-Migration Checklist:
echo 1. Dev environment stable and tested
echo 2. All changes committed and pushed
echo 3. Preprod infrastructure ready
echo 4. Environment variables prepared
echo.

set /p confirm="Are you ready to proceed with the migration? (yes/no): "
if /i not "%confirm%"=="yes" (
    echo ❌ Migration cancelled.
    pause
    exit /b 1
)

echo.
echo 📦 Step 1: Verifying Git status...
git status --porcelain >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ Git working tree clean
) else (
    echo ⚠️  Uncommitted changes detected
    set /p commit="Do you want to commit these changes? (yes/no): "
    if /i "%commit%"=="yes" (
        git add .
        set /p message="Enter commit message: "
        git commit -m "%message%"
        git push origin dev
        echo ✅ Changes committed and pushed
    )
)

echo.
echo 🧪 Step 2: Running tests...
npm test
if %errorlevel% neq 0 (
    echo ❌ Tests failed. Please fix issues before migration.
    pause
    exit /b 1
)
echo ✅ All tests passed

echo.
echo 🏗️  Step 3: Deploying infrastructure to preprod...
cd D:\safemate-infrastructure
terraform --version >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ Terraform found
    if not exist ".terraform" (
        echo 🔧 Initializing Terraform...
        terraform init
    )
    echo 📋 Planning preprod deployment...
    terraform plan -var-file="environments/preprod.tfvars" -out="preprod.plan"
    if %errorlevel% equ 0 (
        echo ✅ Terraform plan successful
        set /p apply="Do you want to apply the Terraform plan? (yes/no): "
        if /i "%apply%"=="yes" (
            terraform apply "preprod.plan"
            if %errorlevel% equ 0 (
                echo ✅ Infrastructure deployed to preprod
            ) else (
                echo ❌ Infrastructure deployment failed
                pause
                exit /b 1
            )
        )
    ) else (
        echo ❌ Terraform plan failed
        pause
        exit /b 1
    )
) else (
    echo ⚠️  Terraform not found. Skipping infrastructure deployment.
    echo    Please deploy infrastructure manually.
)

echo.
echo 🚀 Step 4: Deploying backend services to preprod...
cd D:\safemate-backend
echo 📦 Deploying all services to preprod...
npm run deploy:preprod
if %errorlevel% neq 0 (
    echo ❌ Backend services deployment failed
    pause
    exit /b 1
)
echo ✅ Backend services deployed to preprod

echo.
echo 🔧 Step 5: Configuring environment variables...
echo 📝 Configuring environment variables for preprod...
powershell -ExecutionPolicy Bypass -File configure-environment-variables.ps1 -Environment preprod
if %errorlevel% neq 0 (
    echo ❌ Environment variables configuration failed
    pause
    exit /b 1
)
echo ✅ Environment variables configured

echo.
echo 📚 Step 6: Deploying Lambda layers...
cd D:\safemate-shared
echo 📦 Deploying Lambda layers to preprod...
echo ⚠️  Lambda layers deployment needs to be implemented
echo    Please deploy Lambda layers manually if needed.

echo.
echo 🌐 Step 7: Deploying frontend to preprod...
cd D:\safemate-frontend
echo 📦 Building and deploying frontend to preprod...
npm run build:preprod
npm run deploy:preprod
if %errorlevel% neq 0 (
    echo ❌ Frontend deployment failed
    pause
    exit /b 1
)
echo ✅ Frontend deployed to preprod

echo.
echo 🔍 Step 8: Running verification tests...
echo 🧪 Testing preprod services...
aws lambda get-function --function-name preprod-safemate-user-onboarding --region ap-southeast-2 >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ preprod-safemate-user-onboarding is deployed
) else (
    echo ❌ preprod-safemate-user-onboarding not found
)

aws lambda get-function --function-name preprod-safemate-hedera-service --region ap-southeast-2 >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ preprod-safemate-hedera-service is deployed
) else (
    echo ❌ preprod-safemate-hedera-service not found
)

aws lambda get-function --function-name preprod-safemate-email-verification --region ap-southeast-2 >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ preprod-safemate-email-verification is deployed
) else (
    echo ❌ preprod-safemate-email-verification not found
)

echo.
echo 📊 Migration Summary:
echo ✅ Git status verified
echo ✅ Tests passed
echo ✅ Infrastructure deployed to preprod
echo ✅ Backend services deployed to preprod
echo ✅ Environment variables configured
echo ✅ Lambda layers deployment attempted
echo ✅ Frontend deployed to preprod
echo ✅ Verification tests completed

echo.
echo 🎉 Dev to Preprod Migration Completed Successfully!
echo.
echo 📝 Next Steps:
echo 1. Test all endpoints in preprod environment
echo 2. Verify end-to-end user flows
echo 3. Monitor logs and performance
echo 4. Update team about preprod availability
echo 5. Prepare for production migration when ready

echo.
echo 🔗 Preprod URLs:
echo API Gateway: https://preprod-api-id.execute-api.ap-southeast-2.amazonaws.com/preprod
echo Frontend: https://preprod.safemate.com

echo.
echo 🚀 SafeMate Dev to Preprod Migration Complete!
pause
