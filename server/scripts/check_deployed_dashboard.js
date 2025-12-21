const fetch = global.fetch || require('node-fetch');

const BASE = process.env.BASE_URL || 'https://pos-backend-production-93a5.up.railway.app/api/v1';

async function main(){
  try{
    // Login
    const loginRes = await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeCode: 'ADMIN001', password: 'admin123' })
    });
    const loginJson = await loginRes.json();
    console.log('Login status:', loginRes.status);
    console.log(JSON.stringify(loginJson, null, 2));
    if(!loginJson.accessToken){
      console.error('No access token from login');
      process.exit(1);
    }
    const token = loginJson.accessToken;

    // Fetch dashboard
    const dashRes = await fetch(`${BASE}/reports/dashboard?range=week`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const dashJson = await dashRes.json();
    console.log('Dashboard status:', dashRes.status);
    console.log(JSON.stringify(dashJson, null, 2));
  }catch(e){
    console.error('Error:', e);
    process.exit(2);
  }
}

main();
