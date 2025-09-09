exports.handler = async (event, context) => {
  console.log('📥 New Lambda handler received:', JSON.stringify(event, null, 2));
  
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({
      message: 'New Lambda function is working!',
      event: event,
      timestamp: new Date().toISOString(),
      environment: {
        WALLETS_TABLE: process.env.WALLETS_TABLE,
        HEDERA_NETWORK: process.env.HEDERA_NETWORK,
        USER_KEYS_KMS_KEY_ID: process.env.USER_KEYS_KMS_KEY_ID
      }
    })
  };
};
