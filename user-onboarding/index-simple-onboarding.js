// CORS headers
const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
};

/**
 * Get onboarding status for a user (simplified)
 */
async function getOnboardingStatus(userId) {
  console.log('🔍 Checking onboarding status for user:', userId);
  
  // For now, return a simple response
  // In production, this would query DynamoDB
  return {
    hasWallet: false,
    status: 'pending',
    message: 'Onboarding status checked successfully'
  };
}

/**
 * Start onboarding process (simulified)
 */
async function startOnboarding(userId, email) {
  console.log('🚀 Starting onboarding for user:', userId, 'email:', email);
  
  // For now, return a simple response
  // In production, this would create a wallet using KMS and Secrets Manager
  return {
    success: true,
    message: 'Onboarding started successfully (simulated)',
    hasWallet: true,
    status: 'created',
    walletId: `wallet-${userId}-${Date.now()}`,
    publicKey: 'simulated-public-key'
  };
}

/**
 * Main Lambda handler
 */
exports.handler = async (event, context) => {
  console.log('📥 Lambda handler received:', JSON.stringify(event, null, 2));
  
  try {
    const { httpMethod, path, body, requestContext } = event;
    const pathSegments = path.split('/');
    const endpoint = pathSegments[pathSegments.length - 1];
    
    console.log(`📨 Processing ${httpMethod} request to /onboarding/${endpoint}`);
    
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
      console.log('✅ Status endpoint called');
      const status = await getOnboardingStatus(userId);
      
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify(status)
      };
    }
    
    // Handle start endpoint
    if (httpMethod === 'POST' && endpoint === 'start') {
      console.log('✅ Start endpoint called');
      const result = await startOnboarding(userId, email);
      
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify(result)
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
    console.error('❌ Lambda execution error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      })
    };
  }
};
