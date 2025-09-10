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

const AWS = require('aws-sdk');
const cognitoIdentityServiceProvider = new AWS.CognitoIdentityServiceProvider();

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
    const userParams = {
      UserPoolId: process.env.USER_POOL_ID,
      Username: username
    };
    
    let userResult;
    try {
      userResult = await cognitoIdentityServiceProvider.adminGetUser(userParams).promise();
      console.log('📧 User found, status:', userResult.UserStatus);
    } catch (userError) {
      console.error('❌ User not found:', userError);
      throw new Error('User not found');
    }
    
    // For existing users, we need to use adminCreateUser with MessageAction = RESEND
    // This will send a verification code to existing users
    if (userResult.UserStatus === 'CONFIRMED' || userResult.UserStatus === 'FORCE_CHANGE_PASSWORD') {
      console.log('📧 Existing user detected, sending verification code via adminCreateUser...');
      
      const adminParams = {
        UserPoolId: process.env.USER_POOL_ID,
        Username: username,
        MessageAction: 'RESEND',
        TemporaryPassword: 'TempPass123!', // This will be ignored since MessageAction is RESEND
        UserAttributes: [
          {
            Name: 'email',
            Value: username
          }
        ]
      };
      
      const result = await cognitoIdentityServiceProvider.adminCreateUser(adminParams).promise();
      console.log('✅ Verification code sent to existing user successfully');
      
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type,Authorization',
          'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
        },
        body: JSON.stringify({
          message: 'Verification code sent successfully to existing user',
          destination: 'email',
          userStatus: userResult.UserStatus
        })
      };
    } else {
      // For unconfirmed users, use resendConfirmationCode
      console.log('📧 Unconfirmed user detected, using resendConfirmationCode...');
      
      const params = {
        ClientId: process.env.CLIENT_ID,
        Username: username
      };
      
      const result = await cognitoIdentityServiceProvider.resendConfirmationCode(params).promise();
      console.log('✅ Verification code sent successfully');
      
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
          destination: result.CodeDeliveryDetails?.Destination || 'email',
          userStatus: userResult.UserStatus
        })
      };
    }
  } catch (error) {
    console.error('❌ Error sending verification code:', error);
    throw error;
  }
}

async function verifyCode(username, confirmationCode) {
  try {
    console.log('🔍 Verifying code for user:', username);
    
    const params = {
      ClientId: process.env.CLIENT_ID,
      Username: username,
      ConfirmationCode: confirmationCode
    };
    
    await cognitoIdentityServiceProvider.confirmSignUp(params).promise();
    
    console.log('✅ Email verification successful');
    
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
    
    const params = {
      UserPoolId: process.env.USER_POOL_ID,
      Username: username
    };
    
    const result = await cognitoIdentityServiceProvider.adminGetUser(params).promise();
    
    // Check if email is verified
    const emailVerified = result.UserAttributes?.find(attr => attr.Name === 'email_verified')?.Value === 'true';
    const userStatus = result.UserStatus;
    
    console.log('📧 User verification status:', { emailVerified, userStatus });
    
    // For existing users, we want to treat them the same as new users
    // So we'll require verification if:
    // 1. Email is not verified, OR
    // 2. User status is UNCONFIRMED, OR
    // 3. User status is FORCE_CHANGE_PASSWORD (existing users who need to verify)
    const needsVerification = !emailVerified || 
                             userStatus === 'UNCONFIRMED' || 
                             userStatus === 'FORCE_CHANGE_PASSWORD';
    
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
    // This ensures existing users are treated the same as new users
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
