// =============================================================================
// SafeMate Email Verification Service
// =============================================================================
// 
// This Lambda function handles:
// - Sending verification codes to users (new and existing)
// - Verifying confirmation codes entered by users
// - Checking verification status for all users
// - Treating existing users the same as new users for email verification
//
// Environment: Development (dev)
// Last Updated: 2025-09-10
// 
// Key Features:
// - Universal email verification for ALL users (new and existing)
// - Status checking to determine if user needs verification
// - Secure code generation and verification
// - Comprehensive error handling and logging
// - CORS support for frontend integration
//
// Actions Supported:
// - send_verification_code: Send verification code to user's email
// - verify_code: Verify the confirmation code entered by user
// - check_verification_status: Check if user needs email verification
//
// =============================================================================

const { CognitoIdentityProviderClient, AdminGetUserCommand, AdminUpdateUserAttributesCommand, ResendConfirmationCodeCommand, ConfirmSignUpCommand } = require('@aws-sdk/client-cognito-identity-provider');

// Initialize Cognito client
const cognitoClient = new CognitoIdentityProviderClient({ region: 'ap-southeast-2' });

exports.handler = async (event) => {
  console.log('📧 Email verification service triggered:', JSON.stringify(event, null, 2));
  
  try {
    const { username, action } = JSON.parse(event.body);
    
    switch (action) {
      case 'send_verification_code':
        return await sendVerificationCode(username);
      case 'verify_code':
        const { confirmationCode } = JSON.parse(event.body);
        return await verifyCode(username, confirmationCode);
      case 'check_verification_status':
        return await checkVerificationStatus(username);
      default:
        throw new Error('Invalid action specified');
    }
  } catch (error) {
    console.error('❌ Email verification service error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
      },
      body: JSON.stringify({
        error: error.message || 'Internal server error'
      })
    };
  }
};

async function sendVerificationCode(username) {
  try {
    console.log('📧 Sending verification code to:', username);
    
    // First, check if user exists and their status
    const getUserCommand = new AdminGetUserCommand({
      UserPoolId: process.env.USER_POOL_ID,
      Username: username
    });
    
    let userResult;
    try {
      userResult = await cognitoClient.send(getUserCommand);
      console.log('📧 User found, status:', userResult.UserStatus);
    } catch (userError) {
      console.error('❌ User not found:', userError);
      throw new Error('User not found');
    }
    
    // For existing confirmed users, temporarily set email_verified to false
    // This allows us to use resendConfirmationCode (same process as new users)
    if (userResult.UserStatus === 'CONFIRMED') {
      console.log('📧 Confirmed user detected, temporarily unverifying email...');
      
      // Step 1: Set email_verified to false temporarily
      const updateCommand = new AdminUpdateUserAttributesCommand({
        UserPoolId: process.env.USER_POOL_ID,
        Username: username,
        UserAttributes: [
          {
            Name: 'email_verified',
            Value: 'false'
          }
        ]
      });
      
      await cognitoClient.send(updateCommand);
      console.log('📧 Temporarily set email_verified to false');
    }
    
    // Step 2: Use the same process for all users (new and existing)
    const resendCommand = new ResendConfirmationCodeCommand({
      ClientId: process.env.CLIENT_ID,
      Username: username
    });
    
    const result = await cognitoClient.send(resendCommand);
    console.log('✅ Verification code sent successfully (same process for all users)');
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
      },
      body: JSON.stringify({
        message: 'Verification code sent successfully',
        destination: result.CodeDeliveryDetails?.Destination || 'email'
      })
    };
  } catch (error) {
    console.error('❌ Error sending verification code:', error);
    throw error;
  }
}

async function verifyCode(username, confirmationCode) {
  try {
    console.log('🔍 Verifying code for user:', username);
    
    // Use the same process for both new and existing users
    const confirmCommand = new ConfirmSignUpCommand({
      ClientId: process.env.CLIENT_ID,
      Username: username,
      ConfirmationCode: confirmationCode
    });
    
    const result = await cognitoClient.send(confirmCommand);
    
    console.log('✅ Email verification successful (same process for all users)');
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
      },
      body: JSON.stringify({
        message: 'Email verification successful'
      })
    };
  } catch (error) {
    console.error('❌ Error verifying code:', error);
    throw error;
  }
}

async function checkVerificationStatus(username) {
  try {
    console.log('🔍 Checking verification status for user:', username);
    
    const getUserCommand = new AdminGetUserCommand({
      UserPoolId: process.env.USER_POOL_ID,
      Username: username
    });
    
    const result = await cognitoClient.send(getUserCommand);
    
    // Check if email is verified
    const emailVerified = result.UserAttributes?.find(attr => attr.Name === 'email_verified')?.Value === 'true';
    const userStatus = result.UserStatus;
    
    console.log('📧 User verification status:', { emailVerified, userStatus });
    
    // Use the same logic for both new and existing users
    // Require verification if email is not verified or user is unconfirmed
    const needsVerification = !emailVerified || userStatus === 'UNCONFIRMED';
    
    console.log('📧 User needs verification:', needsVerification);
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
      },
      body: JSON.stringify({
        needsVerification: needsVerification,
        emailVerified: emailVerified,
        userStatus: userStatus,
        message: needsVerification ? 'User needs email verification' : 'User email is verified'
      })
    };
  } catch (error) {
    console.error('❌ Error checking verification status:', error);
    
    // If we can't check the status, assume user needs verification to be safe
    console.log('⚠️ Could not check verification status, assuming user needs verification');
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
      },
      body: JSON.stringify({
        needsVerification: true,
        message: 'Could not verify status, requiring email verification for security'
      })
    };
  }
}
