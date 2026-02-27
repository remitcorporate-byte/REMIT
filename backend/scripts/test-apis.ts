import axios from 'axios';

const BASE_URL = 'http://localhost:5000/api/v1';

async function testApis() {
    console.log('🚀 Starting API Tests...\n');

    try {
        // 1. Health Check
        console.log('--- Step 1: Health Check ---');
        const health = await axios.get(`${BASE_URL}/health`);
        console.log('✅ Health Check:', health.data.message);

        // 2. Registration
        console.log('\n--- Step 2: User Registration ---');
        const testUser = {
            email: `test_${Date.now()}@example.com`,
            password: 'password123',
            firstName: 'Test',
            lastName: 'User',
            companyName: 'Test Company',
        };

        const registerRes = await axios.post(`${BASE_URL}/auth/register`, testUser);
        console.log('✅ Registration Successful:', registerRes.data.success);
        const token = registerRes.data.data.token;

        // Set auth header for subsequent requests
        const authHeaders = {
            headers: { Authorization: `Bearer ${token}` }
        };

        // 3. Get ME
        console.log('\n--- Step 3: Get Current User ---');
        const meRes = await axios.get(`${BASE_URL}/auth/me`, authHeaders);
        console.log('✅ Get Me Successful:', meRes.data.data.email);

        // 4. Get Company
        console.log('\n--- Step 4: Get Company ---');
        const companyRes = await axios.get(`${BASE_URL}/company`, authHeaders);
        console.log('✅ Get Company Successful:', companyRes.data.data.name);

        // 5. Get Dashboard
        console.log('\n--- Step 5: Get Dashboard ---');
        const dashboardRes = await axios.get(`${BASE_URL}/company/dashboard`, authHeaders);
        console.log('✅ Get Dashboard Successful:', dashboardRes.data.success);

        // 6. List Employees
        console.log('\n--- Step 6: List Employees ---');
        const employeesRes = await axios.get(`${BASE_URL}/employees`, authHeaders);
        console.log('✅ List Employees Successful: Found', employeesRes.data.data.length);

        // 7. Create Employee
        console.log('\n--- Step 7: Create Employee ---');
        const newEmployee = {
            firstName: 'John',
            lastName: 'Doe',
            email: `john_${Date.now()}@example.com`,
            phone: '1234567890',
            salary: 500000, // 5000 NGN in kobo
            bankName: 'Test Bank',
            bankCode: '058', // GTBank code for testing
            accountNumber: '0123456789',
        };
        const createEmployeeRes = await axios.post(`${BASE_URL}/employees`, newEmployee, authHeaders);
        console.log('✅ Create Employee Successful:', createEmployeeRes.data.data.firstName);

        // 8. List Payrolls
        console.log('\n--- Step 8: List Payrolls ---');
        const payrollsRes = await axios.get(`${BASE_URL}/payrolls`, authHeaders);
        console.log('✅ List Payrolls Successful: Found', payrollsRes.data.data.length);

        // 9. List Transactions
        console.log('\n--- Step 9: List Transactions ---');
        const transactionsRes = await axios.get(`${BASE_URL}/transactions`, authHeaders);
        console.log('✅ List Transactions Successful: Found', transactionsRes.data.data.length);

        console.log('\n✨ All tests completed successfully!');
    } catch (error: any) {
        console.error('\n❌ Test Failed:');
        if (error.response) {
            console.error('Response Error:', error.response.status, error.response.data);
        } else {
            console.error('Error Message:', error.message);
        }
        process.exit(1);
    }
}

testApis();
