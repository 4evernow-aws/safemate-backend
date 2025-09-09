const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand } = require('@aws-sdk/lib-dynamodb');

const dynamodb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'ap-southeast-2' }));

// CORS headers
const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
};

// Simple test function
async function testFunction() {
  console.log('✅ Test function executed successfully');
  return { message: 'Test successful' };
}

// Main handler function
exports.handler = async (event, context) => {
  console.log('📥 Test Lambda handler received:', JSON.stringify(event, null, 2));
  
  try {
    // Test basic functionality
    const testResult = await testFunction();
    console.log('✅ Test result:', testResult);
    
    // Test DynamoDB connection
    console.log('🔍 Testing DynamoDB connection...');
    console.log('🔍 Environment variables:', {
      USERS_TABLE: process.env.USERS_TABLE,
      WALLETS_TABLE: process.env.WALLETS_TABLE,
      REGION: process.env.REGION
    });
    
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        message: 'Lambda function is working!',
        testResult,
        environment: {
          USERS_TABLE: process.env.USERS_TABLE,
          WALLETS_TABLE: process.env.WALLETS_TABLE,
          REGION: process.env.REGION
        }
      })
    };
    
  } catch (error) {
    console.error('❌ Test Lambda error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: 'Test Lambda failed',
        message: error.message,
        stack: error.stack
      })
    };
  }
};
