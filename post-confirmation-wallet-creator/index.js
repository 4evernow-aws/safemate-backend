const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');

const lambda = new LambdaClient({ region: process.env.REGION || 'ap-southeast-2' });

// Validate required environment variables
const USER_ONBOARDING_FUNCTION = process.env.USER_ONBOARDING_FUNCTION;
if (!USER_ONBOARDING_FUNCTION) {
  console.error('❌ USER_ONBOARDING_FUNCTION environment variable is not set');
  console.error('Please set USER_ONBOARDING_FUNCTION to the name of the user onboarding Lambda function');
}

exports.handler = async (event) => {
  console.log('🔐 Post-Confirmation Wallet Creator Triggered');
  console.log('Event:', JSON.stringify(event, null, 2));

  try {
    // Check if environment variable is set
    if (!USER_ONBOARDING_FUNCTION) {
      throw new Error('USER_ONBOARDING_FUNCTION environment variable is not configured');
    }

    // Extract user information from the event
    const { userName, userAttributes } = event.request;
    const userId = event.request.userAttributes.sub;
    const email = event.request.userAttributes.email;

    console.log(`👤 Creating wallet for user: ${userId} (${email})`);

    // Prepare payload for the user onboarding function
    const payload = {
      action: 'start',
      userId: userId,
      email: email,
      userName: userName
    };

    // Invoke the user onboarding Lambda function
    const invokeCommand = new InvokeCommand({
      FunctionName: USER_ONBOARDING_FUNCTION,
      InvocationType: 'Event', // Asynchronous invocation
      Payload: JSON.stringify({
        httpMethod: 'POST',
        path: '/onboarding/start',
        body: JSON.stringify(payload),
        requestContext: {
          authorizer: {
            claims: {
              sub: userId,
              email: email,
              username: userName
            }
          }
        }
      })
    });

    const result = await lambda.send(invokeCommand);
    console.log('✅ Wallet creation initiated:', result);

    // Return success to Cognito (must return the event for post-confirmation)
    return event;

  } catch (error) {
    console.error('❌ Error in post-confirmation wallet creator:', error);
    
    // Don't fail the user confirmation, just log the error and return the event
    console.log('⚠️ Wallet creation failed, but user confirmation will proceed');
    return event;
  }
}; 