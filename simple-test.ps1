# =============================================================================
# SafeMate Preprod Simple Test Script
# =============================================================================
# 
# Quick test of deployed services
# Environment: Preprod (preprod)
# Last Updated: 2025-09-15
# Status: Simple verification tests
#
# =============================================================================

Write-Host "🧪 SafeMate Preprod Simple Tests" -ForegroundColor Cyan
Write-Host "=" * 50 -ForegroundColor Gray

# Test 1: Hedera Service
Write-Host "`n1. Testing Hedera Service..." -ForegroundColor Yellow
try {
    $hederaResponse = Invoke-RestMethod -Uri "https://ogxunodkn1.execute-api.ap-southeast-2.amazonaws.com/preprod/test" -Method GET -ContentType "application/json" -TimeoutSec 10
    Write-Host "✅ Hedera Service: $($hederaResponse.message)" -ForegroundColor Green
} catch {
    Write-Host "❌ Hedera Service: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 2: User Onboarding Service
Write-Host "`n2. Testing User Onboarding Service..." -ForegroundColor Yellow
try {
    $onboardingResponse = Invoke-RestMethod -Uri "https://ogxunodkn1.execute-api.ap-southeast-2.amazonaws.com/preprod/onboarding/status" -Method GET -ContentType "application/json" -TimeoutSec 10
    Write-Host "✅ User Onboarding: $($onboardingResponse.message)" -ForegroundColor Green
} catch {
    Write-Host "❌ User Onboarding: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 3: Token Vault Service
Write-Host "`n3. Testing Token Vault Service..." -ForegroundColor Yellow
try {
    $vaultResponse = Invoke-RestMethod -Uri "https://ogxunodkn1.execute-api.ap-southeast-2.amazonaws.com/preprod/vault/status" -Method GET -ContentType "application/json" -TimeoutSec 10
    Write-Host "✅ Token Vault: $($vaultResponse.message)" -ForegroundColor Green
} catch {
    Write-Host "❌ Token Vault: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n" + "=" * 50 -ForegroundColor Gray
Write-Host "🎯 Simple Tests Complete" -ForegroundColor Cyan
