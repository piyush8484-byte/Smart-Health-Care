const apiUrl = process.env.API_URL || 'http://localhost:5000/api/v1';
const email = process.env.SIMULATOR_EMAIL || 'patient@demo.com';
const password = process.env.DEMO_PASSWORD || 'DemoPass123!';
const intervalMs = Math.max(3000, Number(process.env.SIMULATOR_INTERVAL_MS) || 10000);

async function run(): Promise<void> {
  const loginResponse = await fetch(`${apiUrl}/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password })
  });
  if (!loginResponse.ok) throw new Error(`Login failed (${loginResponse.status}); seed the demo user and check DEMO_PASSWORD.`);
  const login = await loginResponse.json() as { data: { accessToken: string } };
  const readings = [
    { heartRate: 74, spo2: 98, systolic: 119, diastolic: 78, temperatureC: 36.7, glucoseMgDl: 102 },
    { heartRate: 82, spo2: 97, systolic: 124, diastolic: 81, temperatureC: 36.8, glucoseMgDl: 112 },
    { heartRate: 118, spo2: 93, systolic: 146, diastolic: 92, temperatureC: 37.2, glucoseMgDl: 176 },
    { heartRate: 79, spo2: 98, systolic: 121, diastolic: 79, temperatureC: 36.6, glucoseMgDl: 108 }
  ];
  let index = 0;
  console.log(`Posting simulated readings to ${apiUrl}/vitals/ingest every ${intervalMs}ms. Press Ctrl+C to stop.`);
  while (true) {
    const response = await fetch(`${apiUrl}/vitals/ingest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${login.data.accessToken}` },
      body: JSON.stringify({ deviceId: 'demo-watch', ...readings[index % readings.length], measuredAt: new Date().toISOString() })
    });
    const result = await response.json() as { data?: { risk?: { level?: string } }; message?: string };
    if (!response.ok) throw new Error(result.message || `Vitals request failed (${response.status})`);
    console.log(`${new Date().toISOString()} reading accepted; risk=${result.data?.risk?.level || 'unknown'}`);
    index += 1;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});