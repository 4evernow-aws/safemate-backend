exports.handler = async (event, context) => {
  console.log('📥 Minimal Lambda handler received:', JSON.stringify(event, null, 2));
  
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({
      message: 'Minimal Lambda function is working!',
      timestamp: new Date().toISOString()
    })
  };
};
