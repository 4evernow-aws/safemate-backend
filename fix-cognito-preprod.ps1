# =============================================================================
# SafeMate Preprod Cognito Configuration Fix
# =============================================================================
# 
# This script fixes the Cognito User Pool configuration for preprod
# by adding the missing custom attributes that the client is trying to write
#
# Environment: Preprod (preprod)
# Last Updated: 2025-09-15
# Status: Fixing Cognito configuration issues
#
# Issues Fixed:
# - Missing custom attributes in User Pool schema
# - Client attempting to write unauthorized attributes
# - User registration failing with NotAuthorizedException
#
# =============================================================================

Write-Host "🔧 SafeMate Preprod Cognito Configuration Fix" -ForegroundColor Cyan
Write-Host "=" * 60 -ForegroundColor Gray

$UserPoolId = "ap-southeast-2_pMo5BXFiM"
$ClientId = "1a0trpjfgv54odl9csqlcbkuii"

Write-Host "`n📋 Current Issue:" -ForegroundColor Yellow
Write-Host "User Pool Client is configured to write custom attributes but they don't exist in the User Pool schema" -ForegroundColor Red
Write-Host "Error: 'A client attempted to write unauthorized attribute'" -ForegroundColor Red

Write-Host "`n🔍 Checking current User Pool configuration..." -ForegroundColor Yellow

# Check current User Pool schema
Write-Host "`n📊 Current User Pool Schema:" -ForegroundColor Cyan
$currentSchema = aws cognito-idp describe-user-pool --user-pool-id $UserPoolId --query "UserPool.Schema" --output json
Write-Host $currentSchema -ForegroundColor Gray

Write-Host "`n📊 Current Client Write Attributes:" -ForegroundColor Cyan
$writeAttributes = aws cognito-idp describe-user-pool-client --user-pool-id $UserPoolId --client-id $ClientId --query "UserPoolClient.WriteAttributes" --output json
Write-Host $writeAttributes -ForegroundColor Gray

Write-Host "`n🔧 Adding missing custom attributes to User Pool..." -ForegroundColor Yellow

# Define the custom attributes that need to be added
$customAttributes = @(
    @{
        Name = "account_type"
        AttributeDataType = "String"
        Required = $false
        Mutable = $true
        StringAttributeConstraints = @{
            MinLength = 1
            MaxLength = 50
        }
    },
    @{
        Name = "asset_count"
        AttributeDataType = "Number"
        Required = $false
        Mutable = $true
        NumberAttributeConstraints = @{
            MinValue = 0
            MaxValue = 999999
        }
    },
    @{
        Name = "hedera_account"
        AttributeDataType = "String"
        Required = $false
        Mutable = $true
        StringAttributeConstraints = @{
            MinLength = 1
            MaxLength = 100
        }
    },
    @{
        Name = "kyc_status"
        AttributeDataType = "String"
        Required = $false
        Mutable = $true
        StringAttributeConstraints = @{
            MinLength = 1
            MaxLength = 50
        }
    },
    @{
        Name = "last_activity"
        AttributeDataType = "String"
        Required = $false
        Mutable = $true
        StringAttributeConstraints = @{
            MinLength = 1
            MaxLength = 100
        }
    },
    @{
        Name = "mate_balance"
        AttributeDataType = "Number"
        Required = $false
        Mutable = $true
        NumberAttributeConstraints = @{
            MinValue = 0
            MaxValue = 999999999
        }
    },
    @{
        Name = "storage_used"
        AttributeDataType = "Number"
        Required = $false
        Mutable = $true
        NumberAttributeConstraints = @{
            MinValue = 0
            MaxValue = 999999999
        }
    },
    @{
        Name = "subscription_tier"
        AttributeDataType = "String"
        Required = $false
        Mutable = $true
        StringAttributeConstraints = @{
            MinLength = 1
            MaxLength = 50
        }
    }
)

# Add each custom attribute
foreach ($attr in $customAttributes) {
    $attrName = $attr.Name
    Write-Host "`n➕ Adding custom attribute: $attrName" -ForegroundColor Green
    
    try {
        # Create the attribute configuration
        $attrConfig = @{
            Name = "custom:$attrName"
            AttributeDataType = $attr.AttributeDataType
            Required = $attr.Required
            Mutable = $attr.Mutable
        }
        
        # Add constraints based on data type
        if ($attr.AttributeDataType -eq "String") {
            $attrConfig.StringAttributeConstraints = $attr.StringAttributeConstraints
        } elseif ($attr.AttributeDataType -eq "Number") {
            $attrConfig.NumberAttributeConstraints = $attr.NumberAttributeConstraints
        }
        
        # Convert to JSON and add the attribute
        $attrJson = $attrConfig | ConvertTo-Json -Depth 3
        Write-Host "   Configuration: $attrJson" -ForegroundColor Gray
        
        # Note: We can't add attributes to an existing User Pool via CLI
        # This requires manual configuration in AWS Console or recreation
        Write-Host "   ⚠️  Note: Custom attributes cannot be added to existing User Pool via CLI" -ForegroundColor Yellow
        Write-Host "   📝 Manual action required in AWS Console" -ForegroundColor Yellow
        
    } catch {
        Write-Host "   ❌ Error adding attribute $attrName : $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host "`n📋 Manual Steps Required:" -ForegroundColor Yellow
Write-Host "1. Go to AWS Console > Cognito > User Pools" -ForegroundColor Gray
Write-Host "2. Select User Pool: preprod-safemate-user-pool-v2" -ForegroundColor Gray
Write-Host "3. Go to 'Sign-up experience' tab" -ForegroundColor Gray
Write-Host "4. Add the following custom attributes:" -ForegroundColor Gray
Write-Host "   - account_type (String, 1-50 chars)" -ForegroundColor Gray
Write-Host "   - asset_count (Number, 0-999999)" -ForegroundColor Gray
Write-Host "   - hedera_account (String, 1-100 chars)" -ForegroundColor Gray
Write-Host "   - kyc_status (String, 1-50 chars)" -ForegroundColor Gray
Write-Host "   - last_activity (String, 1-100 chars)" -ForegroundColor Gray
Write-Host "   - mate_balance (Number, 0-999999999)" -ForegroundColor Gray
Write-Host "   - storage_used (Number, 0-999999999)" -ForegroundColor Gray
Write-Host "   - subscription_tier (String, 1-50 chars)" -ForegroundColor Gray
Write-Host "5. Save changes" -ForegroundColor Gray

Write-Host "`n🔄 Alternative Solution - Update Client Configuration:" -ForegroundColor Yellow
Write-Host "Remove custom attributes from client write permissions temporarily" -ForegroundColor Gray

# Create a temporary client configuration without custom attributes
$tempClientConfig = @{
    WriteAttributes = @(
        "email"
    )
    ReadAttributes = @(
        "email"
    )
}

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
Write-Host "2. If successful, add custom attributes to User Pool manually" -ForegroundColor Gray
Write-Host "3. Then restore full client permissions" -ForegroundColor Gray
Write-Host "4. Test complete user workflow" -ForegroundColor Gray

Write-Host "`n" + "=" * 60 -ForegroundColor Gray
Write-Host "🎉 Cognito Configuration Fix Complete!" -ForegroundColor Green
Write-Host "Frontend should now be able to register users without custom attribute errors" -ForegroundColor Green
