# SafeMate Hedera Service - Multi-Environment Deployment Script
# This script can deploy to all environments or a specific environment

param(
    [Parameter(Mandatory=$false)]
    [ValidateSet("dev", "preprod", "production", "all")]
    [string]$Environment = "dev",
    
    [Parameter(Mandatory=$false)]
    [switch]$SkipConfirmation
)

Write-Host "🚀 SafeMate Hedera Service - Multi-Environment Deployment" -ForegroundColor Cyan
Write-Host "=" * 70 -ForegroundColor Gray

# Environment configurations
$environments = @{
    "dev" = @{
        Name = "Development"
        FunctionName = "dev-safemate-hedera-service"
        HederaNetwork = "testnet"
        Description = "Development and testing environment"
        Color = "Green"
    }
    "preprod" = @{
        Name = "Pre-Production"
        FunctionName = "preprod-safemate-hedera-service"
        HederaNetwork = "testnet"
        Description = "Staging and pre-production testing"
        Color = "Yellow"
    }
    "production" = @{
        Name = "Production"
        FunctionName = "prod-safemate-hedera-service"
        HederaNetwork = "mainnet"
        Description = "Live production environment (REAL COSTS)"
        Color = "Red"
    }
}

# Function to display environment info
function Show-EnvironmentInfo {
    param([string]$envKey)
    
    $env = $environments[$envKey]
    Write-Host "`n📋 Environment: $($env.Name)" -ForegroundColor $env.Color
    Write-Host "   Function: $($env.FunctionName)" -ForegroundColor Gray
    Write-Host "   Network: $($env.HederaNetwork)" -ForegroundColor Gray
    Write-Host "   Description: $($env.Description)" -ForegroundColor Gray
}

# Function to deploy to specific environment
function Deploy-ToEnvironment {
    param([string]$envKey)
    
    $env = $environments[$envKey]
    Write-Host "`n🚀 Deploying to $($env.Name)..." -ForegroundColor $env.Color
    
    # Show warning for production
    if ($envKey -eq "production") {
        Write-Host "⚠️  WARNING: This will deploy to PRODUCTION with REAL HBAR costs!" -ForegroundColor Red
        Write-Host "   Make sure you have tested thoroughly in dev/preprod first." -ForegroundColor Yellow
        
        if (-not $SkipConfirmation) {
            $confirm = Read-Host "Are you sure you want to continue? (yes/no)"
            if ($confirm -ne "yes") {
                Write-Host "❌ Deployment cancelled." -ForegroundColor Red
                return $false
            }
        }
    }
    
    try {
        # Call the main deployment script
        & ".\deploy-with-blockchain.ps1" -Environment $envKey
        return $true
    }
    catch {
        Write-Host "❌ Failed to deploy to $($env.Name): $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

# Main deployment logic
if ($Environment -eq "all") {
    Write-Host "🌍 Deploying to ALL environments" -ForegroundColor Cyan
    
    # Show all environments
    foreach ($envKey in $environments.Keys) {
        Show-EnvironmentInfo $envKey
    }
    
    if (-not $SkipConfirmation) {
        Write-Host "`n⚠️  This will deploy to ALL environments:" -ForegroundColor Yellow
        Write-Host "   - Development (testnet)" -ForegroundColor Gray
        Write-Host "   - Pre-Production (testnet)" -ForegroundColor Gray
        Write-Host "   - Production (mainnet - REAL COSTS)" -ForegroundColor Red
        
        $confirm = Read-Host "Are you sure you want to continue? (yes/no)"
        if ($confirm -ne "yes") {
            Write-Host "❌ Deployment cancelled." -ForegroundColor Red
            exit 1
        }
    }
    
    # Deploy to each environment
    $successCount = 0
    foreach ($envKey in $environments.Keys) {
        if (Deploy-ToEnvironment $envKey) {
            $successCount++
        }
    }
    
    Write-Host "`n📊 Deployment Summary:" -ForegroundColor Cyan
    Write-Host "   Successful: $successCount / $($environments.Count)" -ForegroundColor Green
    
    if ($successCount -eq $environments.Count) {
        Write-Host "🎉 All environments deployed successfully!" -ForegroundColor Green
    } else {
        Write-Host "⚠️  Some deployments failed. Check the logs above." -ForegroundColor Yellow
        exit 1
    }
    
} else {
    # Deploy to specific environment
    Show-EnvironmentInfo $Environment
    Deploy-ToEnvironment $Environment
}

Write-Host "`n✅ Deployment script completed!" -ForegroundColor Green
Write-Host "📝 Check the logs above for detailed information." -ForegroundColor Gray
