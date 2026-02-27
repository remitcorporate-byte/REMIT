import axios from 'axios';

const BASE_URL = 'http://localhost:5000/api/v1';

async function runE2ETest() {
    console.log('🚀 Starting Automated E2E Payroll Flow Test...\n');
    let token = '';
    let employeeId = '';
    let payrollId = '';
    let companyId = '';

    const authHeaders = (extra = {}) => ({
        headers: {
            Authorization: `Bearer ${token}`,
            ...extra
        }
    });

    try {
        // 1. Setup Company & User
        console.log('--- Step 1: Authentication & Setup ---');
        const registerUser = {
            email: `e2e_admin_${Date.now()}@test.com`,
            password: 'password123',
            firstName: 'E2E',
            lastName: 'Admin',
            companyName: 'E2E Corp',
        };
        const regRes = await axios.post(`${BASE_URL}/auth/register`, registerUser);
        console.log('✅ Registered Admin');
        token = regRes.data.data.token;

        const me = await axios.get(`${BASE_URL}/auth/me`, authHeaders());
        companyId = me.data.data.companyId;
        console.log(`✅ Identified Company: ${companyId}`);

        // 2. Create Employee
        console.log('\n--- Step 2: Employee Creation ---');
        const newEmp = {
            firstName: 'Automated',
            lastName: 'Receiver',
            email: `receiver_${Date.now()}@test.com`,
            phone: '08012345678',
            salary: 500000, // 5,000 NGN
            bankName: 'Test Bank',
            bankCode: '058',
            accountNumber: '9988776655',
        };
        const empRes = await axios.post(`${BASE_URL}/employees`, newEmp, authHeaders());
        employeeId = empRes.data.data.id;
        console.log(`✅ Created Employee: ${employeeId}`);

        // 3. Deposit Funds (Simulated)
        console.log('\n--- Step 3: Deposit Funds (Automated Simulation) ---');
        const depositAmount = 2000000; // 20,000 NGN
        const depInitRes = await axios.post(`${BASE_URL}/wallet/deposit`, { amount: depositAmount }, authHeaders());
        const reference = depInitRes.data.data.reference;
        console.log(`✅ Deposit Initialized: ${reference}`);

        // Verify using simulation header to bypass manual UI
        const verifyRes = await axios.get(`${BASE_URL}/wallet/verify/${reference}`, authHeaders({ 'x-simulate-success': 'true' }));
        console.log(`✅ Deposit Verified (Simulated): New Balance = ${verifyRes.data.data.newBalance}`);

        // 4. Schedule Payroll
        console.log('\n--- Step 4: Schedule Payroll Disbursement ---');
        const payrollRes = await axios.post(`${BASE_URL}/payrolls/schedule`, {
            scheduledDate: new Date().toISOString(), // Immediate
            employeeIds: [employeeId],
            note: 'E2E Automated Test'
        }, authHeaders());
        payrollId = payrollRes.data.data.id;
        console.log(`✅ Payroll Scheduled: ${payrollId}`);

        // 5. Poll for Automated Disbursement (processed by QueueMock)
        console.log('⏳ Waiting for system to process disbursement...');
        let processed = false;
        for (let i = 0; i < 5; i++) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            const checkPayroll = await axios.get(`${BASE_URL}/payrolls/${payrollId}`, authHeaders());
            if (checkPayroll.data.data.status === 'COMPLETED') {
                processed = true;
                console.log('✅ System Disbursement Completed Automatically');
                break;
            }
            console.log(`... polling status: ${checkPayroll.data.data.status}`);
        }

        if (!processed) {
            throw new Error('Disbursement timed out or failed to complete.');
        }

        // 6. Final Validation
        console.log('\n--- Step 6: Final Validation ---');
        const finalWallet = await axios.get(`${BASE_URL}/wallet`, authHeaders());
        console.log(`✅ Final Wallet Balance: ${finalWallet.data.data.balance} (Expected: ${depositAmount - 500000})`);

        const transactions = await axios.get(`${BASE_URL}/transactions`, authHeaders());
        const debit = transactions.data.data.find((t: any) => t.type === 'PAYROLL_DEBIT');
        console.log(`✅ Payroll Debit Transaction Found: ${debit.amount} kobo`);

        console.log('\n✨ E2E Automated Payroll Flow Test PASSED!');
    } catch (error: any) {
        console.error('\n❌ E2E Test Failed:');
        if (error.response) {
            console.error(`Status: ${error.response.status}`);
            console.error('Data:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error('Message:', error.message);
        }
        process.exit(1);
    }
}

runE2ETest();
