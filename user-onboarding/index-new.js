exports.handler = async (event, context) => {
  console.log('📥 New Lambda handler received:', JSON.stringify(event, null, 2));
  
  try {
    const { httpMethod, path, body, requestContext } = event;
    const pathSegments = path.split('/');
    const endpoint = pathSegments[pathSegments.length - 1];
    
    console.log(`📨 Processing ${httpMethod} request to /onboarding/${endpoint}`);
    
    // CORS headers
    const corsHeaders = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
    };
    
    // Handle OPTIONS requests for CORS
    if (httpMethod === 'OPTIONS') {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'CORS preflight' })
      };
    }
    
    // Extract user info from JWT token (if authorization is enabled)
    let userId, email;
    if (requestContext?.authorizer?.claims) {
      const userClaims = requestContext.authorizer.claims;
      userId = userClaims.sub;
      email = userClaims.email;
      console.log('👤 User info from JWT:', { userId, email });
    } else {
      // For testing without authorization
      userId = 'test-user-' + Date.now();
      email = 'test@example.com';
      console.log('🧪 Using test user:', { userId, email });
    }
    
    // Handle status endpoint
    if ((httpMethod === 'GET' || httpMethod === 'POST') && endpoint === 'status') {
      console.log('✅ Status endpoint called successfully');
      
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          hasWallet: false,
          status: 'pending',
          message: 'New Lambda function is working!',
          userId: userId,
          endpoint: endpoint,
          timestamp: new Date().toISOString(),
          environment: {
            WALLETS_TABLE: process.env.WALLETS_TABLE,
            HEDERA_NETWORK: process.env.HEDERA_NETWORK,
            USER_KEYS_KMS_KEY_ID: process.env.USER_KEYS_KMS_KEY_ID
          }
        })
      };
    }
    
    // Handle start endpoint
    if (httpMethod === 'POST' && endpoint === 'start') {
      console.log('✅ Start endpoint called successfully');
      
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          message: 'New Lambda function start endpoint working!',
          userId: userId,
          endpoint: endpoint,
          timestamp: new Date().toISOString()
        })
      };
    }
    
    // Handle unknown endpoints
    console.log('❌ Endpoint not found:', endpoint);
    return {
      statusCode: 404,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Endpoint not found' })
    };
    
  } catch (error) {
    console.error('❌ New Lambda execution error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      })
    };
  }
};
