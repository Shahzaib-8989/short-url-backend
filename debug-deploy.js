// Debug script to test your deployed Render app
const axios = require('axios');

const BASE_URL = 'https://short-url-backend-our8.onrender.com';

async function testDeployment() {
  console.log('🧪 Testing Render Deployment...\n');

  try {
    // Test 1: Health Check
    console.log('1️⃣ Testing Health Check...');
    const healthResponse = await axios.get(`${BASE_URL}/api/health`);
    console.log('✅ Health Check:', healthResponse.status);
    console.log('📊 Database Status:', healthResponse.data.database?.status);
    console.log('🔌 DB Ready State:', healthResponse.data.database?.readyState);
    
    // Test 2: CORS Preflight
    console.log('\n2️⃣ Testing CORS...');
    try {
      const corsResponse = await axios.options(`${BASE_URL}/api/auth/register`, {
        headers: {
          'Origin': 'https://short-url-frontend-ebon.vercel.app',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Content-Type'
        }
      });
      console.log('✅ CORS Preflight:', corsResponse.status);
    } catch (corsError) {
      console.log('❌ CORS Issue:', corsError.response?.status || corsError.message);
    }

    // Test 3: Registration Endpoint
    console.log('\n3️⃣ Testing Registration...');
    try {
      const registerResponse = await axios.post(`${BASE_URL}/api/auth/register`, {
        username: 'testuser123',
        email: 'test@example.com',
        password: 'password123'
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://short-url-frontend-ebon.vercel.app'
        }
      });
      console.log('✅ Registration Test:', registerResponse.status);
    } catch (regError) {
      console.log('❌ Registration Error:', regError.response?.status || regError.message);
      console.log('📝 Error Details:', regError.response?.data || regError.message);
    }

  } catch (error) {
    console.error('❌ Test Failed:', error.message);
  }
}

// Only run if axios is available
try {
  testDeployment();
} catch (error) {
  console.log('❌ axios not found. Install with: npm install axios');
  console.log('🔗 Or test manually: curl https://short-url-backend-our8.onrender.com/api/health');
}
