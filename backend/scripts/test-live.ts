import axios from 'axios';

const API_URL = 'http://127.0.0.1:5000/api/v1';
let authToken: string;
let companyId: string;
let employeeId: string;
let payrollId: string;

async function runLiveTest() {
    console.log('🚀 Starting Real-World Verification (Paystack Test Mode)...\n');

    try {
        // 1. Authentication
        const adminEmail = `live_admin_${Date.now()}@test.com`;
        console.log('--- Step 1: Authentication & Setup ---');
        const registerRes = await axios.post(`${API_URL}/auth/register`, {
            email: adminEmail,
            password: 'Password123!',
            firstName: 'Live',
            lastName: 'Admin',
            companyName: 'Live Test Corp'
        });
        authToken = registerRes.data.data.token;
        console.log('✅ Registered Admin');

        const meRes = await axios.get(`${API_URL}/auth/me`, {
            headers: { Authorization: `Bearer ${authToken}` }
        });
        companyId = meRes.data.data.companyId;
        console.log(`✅ Identified Company: ${companyId}`);

        // 2. Employee Creation
        console.log('\n--- Step 2: Employee Creation ---');
        const employeeRes = await axios.post(`${API_URL}/employees`, {
            firstName: 'Real',
            lastName: 'Receiver',
            email: `receiver_${Date.now()}@test.com`,
            bankName: 'Guaranty Trust Bank',
            bankCode: '058',
            accountNumber: '0000000000', // Common Paystack Test account
            salary: 500000,
            paymentFrequency: 'MONTHLY',
            department: 'Engineering',
            position: 'Senior Engineer'
        }, {
            headers: { Authorization: `Bearer ${authToken}` }
        });
        employeeId = employeeRes.data.data.id;
        console.log(`✅ Created Employee: ${employeeId} (Dept: Engineering)`);

        // 3. Deposit Funds (uses USE_PAYSTACK_MOCK=true for local mock verification)
        console.log('\n--- Step 3: Deposit Funds ---');
        const depositRes = await axios.post(`${API_URL}/wallet/deposit`, {
            amount: 2000000 // 20,000.00 NGN
        }, {
            headers: { Authorization: `Bearer ${authToken}` }
        });
        const reference = depositRes.data.data.reference;
        console.log(`✅ Deposit Initialized: ${reference}`);

        await axios.get(`${API_URL}/wallet/verify/${reference}`, {
            headers: {
                Authorization: `Bearer ${authToken}`
            }
        });
        console.log('✅ Deposit Verified');

        // 4. Schedule Payroll
        console.log('\n--- Step 4: Schedule Payroll Disbursement ---');
        const payrollRes = await axios.post(`${API_URL}/payrolls/schedule`, {
            scheduledDate: new Date().toISOString(),
            employeeIds: [employeeId],
            note: 'Live Verification Run'
        }, {
            headers: { Authorization: `Bearer ${authToken}` }
        });
        payrollId = payrollRes.data.data.id;
        console.log(`✅ Payroll Scheduled: ${payrollId}`);

        // 5. Polling for completion
        console.log('⏳ Waiting for Paystack to process (up to 20s)...');
        let status = 'SCHEDULED';
        for (let i = 0; i < 10; i++) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            const pollRes = await axios.get(`${API_URL}/payrolls/${payrollId}`, {
                headers: { Authorization: `Bearer ${authToken}` }
            });
            status = pollRes.data.data.status;
            console.log(`... polling status: ${status}`);
            if (status === 'COMPLETED' || status === 'FAILED') break;
        }

        if (status === 'COMPLETED') {
            console.log('✅ System Disbursement Completed Successfully');
        } else {
            console.error(`❌ Disbursement ended with status: ${status}`);
        }

        // 6. Verify Advanced Stats
        console.log('\n--- Step 5: Verify Advanced Dashboard Stats ---');
        const statsRes = await axios.get(`${API_URL}/company/stats`, {
            headers: { Authorization: `Bearer ${authToken}` }
        });
        console.log('📊 Advanced Stats Results:');
        console.log(JSON.stringify(statsRes.data.data, null, 2));

        console.log('\n🎉 Real-World Verification Complete!');

    } catch (error: any) {
        console.error('\n❌ Live Test Failed:');
        console.error(`Message: ${error.response?.data?.message || error.message}`);
        process.exit(1);
    }
}

runLiveTest();
