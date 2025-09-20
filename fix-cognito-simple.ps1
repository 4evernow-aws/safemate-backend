# =============================================================================
# SafeMate Preprod Cognito Configuration Fix - Simple Version
# =============================================================================
# 
# This script fixes the Cognito User Pool configuration for preprod
# by temporarily removing custom attributes from client permissions
#
# Environment: Preprod (preprod)
# Last Updated: 2025-09-15
# Status: Fixing Cognito configuration issues
#
# =============================================================================

Write-Host "🔧 SafeMate Preprod Cognito Configuration Fix" -ForegroundColor Cyan
Write-Host "=" * 60 -ForegroundColor Gray

$UserPoolId = "ap-southeast-2_pMo5BXFiM"
$ClientId = "1a0trpjfgv54odl9csqlcbkuii"

Write-Host "`n📋 Current Issue:" -ForegroundColor Yellow
Write-Host "User Pool Client is configured to write custom attributes but they don't exist in the User Pool schema" -ForegroundColor Red
Write-Host "Error: 'A client attempted to write unauthorized attribute'" -ForegroundColor Red

Write-Host "`n🔍 Current Client Configuration:" -ForegroundColor Yellow
$writeAttributes = aws cognito-idp describe-user-pool-client --user-pool-id $UserPoolId --client-id $ClientId --query "UserPoolClient.WriteAttributes" --output json
Write-Host "Write Attributes: $writeAttributes" -ForegroundColor Gray

Write-Host "`n🔧 Applying temporary fix - removing custom attributes from client..." -ForegroundColor Yellow

try {
    # Update the client to remove custom attributes temporarily
    aws cognito-idp update-user-pool-client `
        --user-pool-id $UserPoolId `
        --client-id $ClientId `
        --write-attributes email `
        --read-attributes email `
        --explicit-auth-flows ALLOW_USER_SRP_AUTH ALLOW_REFRESH_TOKEN_AUTH ALLOW_ADMIN_USER_PASSWORD_AUTH
    
    Write-Host "✅ Client configuration updated successfully" -ForegroundColor Green
    Write-Host "   - Removed custom attributes from write permissions" -ForegroundColor Green
    Write-Host "   - Kept only email attribute for basic functionality" -ForegroundColor Green
    
} catch {
    Write-Host "❌ Error updating client configuration: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n📊 Updated Client Configuration:" -ForegroundColor Cyan
$updatedWriteAttributes = aws cognito-idp describe-user-pool-client --user-pool-id $UserPoolId --client-id $ClientId --query "UserPoolClient.WriteAttributes" --output json
Write-Host "Write Attributes: $updatedWriteAttributes" -ForegroundColor Gray

$updatedReadAttributes = aws cognito-idp describe-user-pool-client --user-pool-id $UserPoolId --client-id $ClientId --query "UserPoolClient.ReadAttributes" --output json
Write-Host "Read Attributes: $updatedReadAttributes" -ForegroundColor Gray

Write-Host "`n🎯 Next Steps:" -ForegroundColor Yellow
Write-Host "1. Test user registration in the frontend" -ForegroundColor Gray
Write-Host "2. If successful, add custom attributes to User Pool manually in AWS Console" -ForegroundColor Gray
Write-Host "3. Then restore full client permissions" -ForegroundColor Gray

Write-Host "`n" + "=" * 60 -ForegroundColor Gray
Write-Host "🎉 Cognito Configuration Fix Complete!" -ForegroundColor Green
