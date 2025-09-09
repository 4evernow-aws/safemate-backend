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
    
    const params = {
      ClientId: process.env.COGNITO_CLIENT_ID,
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
    
    const params = {
      ClientId: process.env.COGNITO_CLIENT_ID,
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
