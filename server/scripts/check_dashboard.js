(async () => {
  try {
    const base = 'https://pos-backend-production-93a5.up.railway.app/api/v1';

    const loginRes = await fetch(base + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeCode: 'ADMIN001', password: 'password123' })
    });

    const login = await loginRes.json();
    console.log('LOGIN_RESPONSE:');
    console.log(JSON.stringify(login, null, 2));

    if (!login.accessToken) {
      console.error('No access token returned; cannot fetch dashboard');
      process.exit(1);
    }

    const dashRes = await fetch(base + '/reports/dashboard', {
      headers: { Authorization: `Bearer ${login.accessToken}` }
    });

    const dash = await dashRes.json();
    console.log('\nDASHBOARD_RESPONSE:');
    console.log(JSON.stringify(dash, null, 2));
  } catch (err) {
    console.error('ERROR:', err);
    process.exit(1);
  }
})();
