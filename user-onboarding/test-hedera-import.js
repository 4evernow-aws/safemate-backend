// Test Lambda function to verify Hedera SDK import
console.log('🧪 Starting Hedera SDK import test...');

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': 'http://localhost:5173',
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
};

exports.handler = async (event, context) => {
  console.log('📥 Test handler received:', JSON.stringify(event, null, 2));
  
  try {
    // Test basic Node.js functionality
    console.log('✅ Basic Node.js working');
    
    // Test Hedera SDK import
    console.log('🔍 Attempting to import @hashgraph/sdk...');
    const { Client, PrivateKey, AccountId } = require('@hashgraph/sdk');
    console.log('✅ Successfully imported @hashgraph/sdk');
    
    // Test basic Hedera functionality
    console.log('🔍 Testing Hedera functionality...');
    const testKey = PrivateKey.generateED25519();
    console.log('✅ Successfully generated ED25519 key');
    
    const testAccountId = AccountId.fromString('0.0.123');
    console.log('✅ Successfully created AccountId');
    
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        message: 'Hedera SDK import and basic functionality test passed',
        tests: {
          'node_js': 'passed',
          'hedera_import': 'passed',
          'key_generation': 'passed',
          'account_id_creation': 'passed'
        },
        timestamp: new Date().toISOString()
      })
    };
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        error: error.message,
        stack: error.stack,
        test_failed_at: 'hedera_sdk_import',
        timestamp: new Date().toISOString()
      })
    };
  }
};