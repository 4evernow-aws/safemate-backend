exports.handler = async (event, context) => {
  console.log('Simple test Lambda handler received:', JSON.stringify(event, null, 2));
  
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({
      message: 'Simple test Lambda function is working!',
      timestamp: new Date().toISOString()
    })
  };
};
