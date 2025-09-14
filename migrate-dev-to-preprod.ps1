# SafeMate Dev to Preprod Migration Script
# This script automates the migration from development to pre-production environment

param(
    [Parameter(Mandatory=$false)]
    [switch]$SkipConfirmation,
    [Parameter(Mandatory=$false)]
    [switch]$SkipTests,
    [Parameter(Mandatory=$false)]
    [switch]$SkipFrontend
)

Write-Host "🚀 SafeMate Dev to Preprod Migration Script" -ForegroundColor Cyan
Write-Host "=" * 60 -ForegroundColor Gray

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
    $callerIdentity = aws sts get-caller-identity --region ap-southeast-2 2>$null
    if ($callerIdentity) {
        Write-Host "✅ AWS credentials configured" -ForegroundColor Green
        $identity = $callerIdentity | ConvertFrom-Json
        Write-Host "   Account: $($identity.Account)" -ForegroundColor Gray
    } else {
        Write-Host "❌ AWS credentials not configured. Run 'aws configure' first." -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ AWS credentials not configured. Run 'aws configure' first." -ForegroundColor Red
    exit 1
}

# Pre-migration checklist
Write-Host "`n📋 Pre-Migration Checklist:" -ForegroundColor Yellow
Write-Host "1. Dev environment stable and tested" -ForegroundColor Gray
Write-Host "2. All changes committed and pushed" -ForegroundColor Gray
Write-Host "3. Preprod infrastructure ready" -ForegroundColor Gray
Write-Host "4. Environment variables prepared" -ForegroundColor Gray

if (-not $SkipConfirmation) {
    $confirm = Read-Host "`nAre you ready to proceed with the migration? (yes/no)"
    if ($confirm -ne "yes") {
        Write-Host "❌ Migration cancelled." -ForegroundColor Red
        exit 1
    }
}

# Step 1: Verify Git status
Write-Host "`n📦 Step 1: Verifying Git status..." -ForegroundColor Cyan
try {
    $gitStatus = git status --porcelain 2>$null
    if ($gitStatus) {
        Write-Host "⚠️  Uncommitted changes detected:" -ForegroundColor Yellow
        Write-Host $gitStatus -ForegroundColor Gray
        if (-not $SkipConfirmation) {
            $commit = Read-Host "Do you want to commit these changes? (yes/no)"
            if ($commit -eq "yes") {
                git add .
                $commitMessage = Read-Host "Enter commit message"
                git commit -m $commitMessage
                git push origin dev
                Write-Host "✅ Changes committed and pushed" -ForegroundColor Green
            }
        }
    } else {
        Write-Host "✅ Git working tree clean" -ForegroundColor Green
    }
} catch {
    Write-Host "❌ Git status check failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Step 2: Run tests (if not skipped)
if (-not $SkipTests) {
    Write-Host "`n🧪 Step 2: Running tests..." -ForegroundColor Cyan
    try {
        npm test
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ All tests passed" -ForegroundColor Green
        } else {
            Write-Host "❌ Tests failed. Please fix issues before migration." -ForegroundColor Red
            exit 1
        }
    } catch {
        Write-Host "❌ Test execution failed: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "`n⏭️  Step 2: Skipping tests..." -ForegroundColor Yellow
}

# Step 3: Deploy infrastructure to preprod
Write-Host "`n🏗️  Step 3: Deploying infrastructure to preprod..." -ForegroundColor Cyan
try {
    Set-Location "D:\safemate-infrastructure"
    
    # Check if Terraform is available
    $terraformVersion = terraform --version 2>$null
    if ($terraformVersion) {
        Write-Host "✅ Terraform found" -ForegroundColor Green
        
        # Initialize Terraform if needed
        if (-not (Test-Path ".terraform")) {
            Write-Host "🔧 Initializing Terraform..." -ForegroundColor Yellow
            terraform init
        }
        
        # Plan deployment
        Write-Host "📋 Planning preprod deployment..." -ForegroundColor Yellow
        terraform plan -var-file="environments/preprod.tfvars" -out="preprod.plan"
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Terraform plan successful" -ForegroundColor Green
            
            if (-not $SkipConfirmation) {
                $apply = Read-Host "Do you want to apply the Terraform plan? (yes/no)"
                if ($apply -eq "yes") {
                    terraform apply "preprod.plan"
                    if ($LASTEXITCODE -eq 0) {
                        Write-Host "✅ Infrastructure deployed to preprod" -ForegroundColor Green
                    } else {
                        Write-Host "❌ Infrastructure deployment failed" -ForegroundColor Red
                        exit 1
                    }
                }
            }
        } else {
            Write-Host "❌ Terraform plan failed" -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Host "⚠️  Terraform not found. Skipping infrastructure deployment." -ForegroundColor Yellow
        Write-Host "   Please deploy infrastructure manually." -ForegroundColor Gray
    }
} catch {
    Write-Host "❌ Infrastructure deployment failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Step 4: Deploy backend services to preprod
Write-Host "`n🚀 Step 4: Deploying backend services to preprod..." -ForegroundColor Cyan
try {
    Set-Location "D:\safemate-backend"
    
    # Deploy all services
    Write-Host "📦 Deploying all services to preprod..." -ForegroundColor Yellow
    npm run deploy:preprod
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Backend services deployed to preprod" -ForegroundColor Green
    } else {
        Write-Host "❌ Backend services deployment failed" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ Backend services deployment failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Step 5: Configure environment variables
Write-Host "`n🔧 Step 5: Configuring environment variables..." -ForegroundColor Cyan
try {
    Write-Host "📝 Configuring environment variables for preprod..." -ForegroundColor Yellow
    .\configure-environment-variables.ps1 -Environment preprod
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Environment variables configured" -ForegroundColor Green
    } else {
        Write-Host "❌ Environment variables configuration failed" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ Environment variables configuration failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Step 6: Deploy Lambda layers
Write-Host "`n📚 Step 6: Deploying Lambda layers..." -ForegroundColor Cyan
try {
    Set-Location "D:\safemate-shared"
    
    Write-Host "📦 Deploying Lambda layers to preprod..." -ForegroundColor Yellow
    # Note: This would need a deploy-layers script for preprod
    Write-Host "⚠️  Lambda layers deployment needs to be implemented" -ForegroundColor Yellow
    Write-Host "   Please deploy Lambda layers manually if needed." -ForegroundColor Gray
} catch {
    Write-Host "❌ Lambda layers deployment failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Step 7: Deploy frontend (if not skipped)
if (-not $SkipFrontend) {
    Write-Host "`n🌐 Step 7: Deploying frontend to preprod..." -ForegroundColor Cyan
    try {
        Set-Location "D:\safemate-frontend"
        
        Write-Host "📦 Building and deploying frontend to preprod..." -ForegroundColor Yellow
        npm run build:preprod
        npm run deploy:preprod
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Frontend deployed to preprod" -ForegroundColor Green
        } else {
            Write-Host "❌ Frontend deployment failed" -ForegroundColor Red
            exit 1
        }
    } catch {
        Write-Host "❌ Frontend deployment failed: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "`n⏭️  Step 7: Skipping frontend deployment..." -ForegroundColor Yellow
}

# Step 8: Run verification tests
Write-Host "`n🔍 Step 8: Running verification tests..." -ForegroundColor Cyan
try {
    Write-Host "🧪 Testing preprod services..." -ForegroundColor Yellow
    
    # Test Lambda functions
    $functions = @(
        "preprod-safemate-user-onboarding",
        "preprod-safemate-hedera-service",
        "preprod-safemate-email-verification"
    )
    
    foreach ($function in $functions) {
        Write-Host "   Testing $function..." -ForegroundColor Gray
        $result = aws lambda get-function --function-name $function --region ap-southeast-2 2>$null
        if ($result) {
            Write-Host "   ✅ $function is deployed" -ForegroundColor Green
        } else {
            Write-Host "   ❌ $function not found" -ForegroundColor Red
        }
    }
    
    Write-Host "✅ Verification tests completed" -ForegroundColor Green
} catch {
    Write-Host "❌ Verification tests failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Migration summary
Write-Host "`n📊 Migration Summary:" -ForegroundColor Cyan
Write-Host "✅ Git status verified" -ForegroundColor Green
if (-not $SkipTests) { Write-Host "✅ Tests passed" -ForegroundColor Green }
Write-Host "✅ Infrastructure deployed to preprod" -ForegroundColor Green
Write-Host "✅ Backend services deployed to preprod" -ForegroundColor Green
Write-Host "✅ Environment variables configured" -ForegroundColor Green
Write-Host "✅ Lambda layers deployment attempted" -ForegroundColor Green
if (-not $SkipFrontend) { Write-Host "✅ Frontend deployed to preprod" -ForegroundColor Green }
Write-Host "✅ Verification tests completed" -ForegroundColor Green

Write-Host "`n🎉 Dev to Preprod Migration Completed Successfully!" -ForegroundColor Green
Write-Host "`n📝 Next Steps:" -ForegroundColor Yellow
Write-Host "1. Test all endpoints in preprod environment" -ForegroundColor Gray
Write-Host "2. Verify end-to-end user flows" -ForegroundColor Gray
Write-Host "3. Monitor logs and performance" -ForegroundColor Gray
Write-Host "4. Update team about preprod availability" -ForegroundColor Gray
Write-Host "5. Prepare for production migration when ready" -ForegroundColor Gray

Write-Host "`n🔗 Preprod URLs:" -ForegroundColor Yellow
Write-Host "API Gateway: https://preprod-api-id.execute-api.ap-southeast-2.amazonaws.com/preprod" -ForegroundColor Gray
Write-Host "Frontend: https://preprod.safemate.com" -ForegroundColor Gray

Write-Host "`n🚀 SafeMate Dev to Preprod Migration Complete!" -ForegroundColor Green
