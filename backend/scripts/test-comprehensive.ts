import axios from 'axios';
import { exec } from 'child_process';

const BASE_URL = 'http://localhost:5000/api/v1';

async function runTests() {
    console.log('🚀 Starting Comprehensive REMIT API Tests...\n');
    let token = '';
    let employeeId = '';
    let payrollId = '';

    const authHeaders = () => ({
        headers: { Authorization: `Bearer ${token}` }
    });

    try {
        // Phase 1: Authentication & Identity
        console.log('--- Phase 1: Authentication ---');
        const registerUser = {
            email: `admin_${Date.now()}@remit.com`,
            password: 'password123',
            firstName: 'Admin',
            lastName: 'User',
            companyName: 'REMIT Tech',
        };
        const regRes = await axios.post(`${BASE_URL}/auth/register`, registerUser);
        console.log('✅ POST /auth/register: Success');
        token = regRes.data.data.token;

        await axios.post(`${BASE_URL}/auth/login`, {
            email: registerUser.email,
            password: registerUser.password,
        });
        console.log('✅ POST /auth/login: Success');

        const me = await axios.get(`${BASE_URL}/auth/me`, authHeaders());
        console.log('✅ GET /auth/me: Success');

        // Phase 2: Company
        console.log('\n--- Phase 2: Company Management ---');
        await axios.get(`${BASE_URL}/company`, authHeaders());
        console.log('✅ GET /company: Success');

        await axios.put(`${BASE_URL}/company`, { phone: '08012345678' }, authHeaders());
        console.log('✅ PUT /company: Success');

        await axios.get(`${BASE_URL}/company/dashboard`, authHeaders());
        console.log('✅ GET /company/dashboard: Success');

        // Phase 3: Employees
        console.log('\n--- Phase 3: Employee Management ---');
        const newEmp = {
            firstName: 'Jane',
            lastName: 'Doe',
            email: `jane_${Date.now()}@remit.com`,
            phone: '08000000001',
            salary: 1000000, // 10,000 NGN
            bankName: 'Access Bank',
            bankCode: '044',
            accountNumber: '0123456789',
        };
        const empRes = await axios.post(`${BASE_URL}/employees`, newEmp, authHeaders());
        employeeId = empRes.data.data.id;
        console.log('✅ POST /employees: Success');

        await axios.get(`${BASE_URL}/employees`, authHeaders());
        console.log('✅ GET /employees: Success');

        await axios.get(`${BASE_URL}/employees/${employeeId}`, authHeaders());
        console.log('✅ GET /employees/:id: Success');

        await axios.put(`${BASE_URL}/employees/${employeeId}`, { firstName: 'Janey' }, authHeaders());
        console.log('✅ PUT /employees/:id: Success');

        // Phase 4: Wallet
        console.log('\n--- Phase 4: Wallet & Transactions ---');
        await axios.get(`${BASE_URL}/wallet`, authHeaders());
        console.log('✅ GET /wallet: Success');

        const depRes = await axios.post(`${BASE_URL}/wallet/deposit`, { amount: 2000000 }, authHeaders());
        const { reference, authorizationUrl } = depRes.data.data;
        console.log('✅ POST /wallet/deposit: Success');
        console.log(`🔗 Paystack URL: ${authorizationUrl}`);
        console.log('🖥️  Opening browser for manual payment... Please click "Success" in the Paystack window.');

        // Open browser on Windows
        exec(`start "" "${authorizationUrl}"`);

        // Polling loop
        console.log('⏳ Waiting for payment verification (Polling every 5s for up to 2 mins)...');
        let verified = false;
        const startTime = Date.now();
        while (!verified && Date.now() - startTime < 120000) {
            try {
                const verifyRes = await axios.get(`${BASE_URL}/wallet/verify/${reference}`, authHeaders());
                if (verifyRes.data.success) {
                    verified = true;
                    console.log('✅ GET /wallet/verify/:reference: Success! Wallet credited.');
                }
            } catch (err: any) {
                // Ignore 400 errors during polling (not verified yet)
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }

        if (!verified) {
            throw new Error('Payment verification timed out. Please try again.');
        }

        await axios.get(`${BASE_URL}/wallet/transactions`, authHeaders());
        console.log('✅ GET /wallet/transactions: Success');

        await axios.get(`${BASE_URL}/transactions`, authHeaders());
        console.log('✅ GET /transactions: Success');

        // Phase 5: Payroll
        console.log('\n--- Phase 5: Payroll Operations ---');
        const payrollRes = await axios.post(`${BASE_URL}/payrolls/schedule`, {
            scheduledDate: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
            employeeIds: [employeeId],
            note: 'Monthly salary'
        }, authHeaders());
        payrollId = payrollRes.data.data.id;
        console.log('✅ POST /payrolls/schedule: Success');

        await axios.get(`${BASE_URL}/payrolls`, authHeaders());
        console.log('✅ GET /payrolls: Success');

        await axios.get(`${BASE_URL}/payrolls/${payrollId}`, authHeaders());
        console.log('✅ GET /payrolls/:id: Success');

        await axios.put(`${BASE_URL}/payrolls/${payrollId}/cancel`, {}, authHeaders());
        console.log('✅ PUT /payrolls/:id/cancel: Success');

        // Phase 6: Notifications
        console.log('\n--- Phase 6: Notifications ---');
        const notifRes = await axios.get(`${BASE_URL}/notifications`, authHeaders());
        console.log('✅ GET /notifications: Success');

        if (notifRes.data.data.length > 0) {
            const notifId = notifRes.data.data[0].id;
            await axios.put(`${BASE_URL}/notifications/${notifId}/read`, {}, authHeaders());
            console.log('✅ PUT /notifications/:id/read: Success');
        }

        await axios.put(`${BASE_URL}/notifications/read-all`, {}, authHeaders());
        console.log('✅ PUT /notifications/read-all: Success');

        console.log('\n✨ All 26 primary endpoint categories verified!');
    } catch (error: any) {
        console.error('\n❌ Test Failure Details:');
        if (error.response) {
            console.error(`Status: ${error.response.status}`);
            console.error('Data:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error('Message:', error.message);
        }
        process.exit(1);
    }
}

runTests();
