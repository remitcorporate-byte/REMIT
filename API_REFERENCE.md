# API ENDPOINTS QUICK REFERENCE

## Base URL
```
Development: http://localhost:5000/api/v1
Production: https://your-backend.onrender.com/api/v1
```

---

## AUTHENTICATION ENDPOINTS

### Register New Employer
```http
POST /auth/register
Content-Type: application/json

{
  "email": "employer@company.com",
  "password": "SecurePass123!",
  "firstName": "John",
  "lastName": "Doe",
  "companyName": "Tech Corp Ltd"
}

Response: 201 Created
{
  "success": true,
  "data": {
    "user": { ... },
    "company": { ... },
    "token": "jwt_token_here"
  }
}
```

### Login
```http
POST /auth/login
Content-Type: application/json

{
  "email": "employer@company.com",
  "password": "SecurePass123!"
}

Response: 200 OK
{
  "success": true,
  "data": {
    "user": { ... },
    "token": "jwt_token_here"
  }
}
```

### Get Current User
```http
GET /auth/me
Authorization: Bearer <token>

Response: 200 OK
{
  "success": true,
  "data": {
    "user": { ... }
  }
}
```

---

## WALLET ENDPOINTS

### Get Wallet Balance
```http
GET /wallet
Authorization: Bearer <token>

Response: 200 OK
{
  "success": true,
  "data": {
    "balance": 500000000,
    "balanceFormatted": "₦5,000,000.00",
    "currency": "NGN"
  }
}
```

### Initialize Deposit
```http
POST /wallet/deposit
Authorization: Bearer <token>
Content-Type: application/json

{
  "amount": 1000000,  // 10,000 NGN in kobo
  "email": "employer@company.com"
}

Response: 200 OK
{
  "success": true,
  "data": {
    "authorizationUrl": "https://checkout.paystack.com/...",
    "reference": "PSK_12345abcde"
  }
}
```

### Verify Deposit
```http
GET /wallet/verify-deposit/:reference
Authorization: Bearer <token>

Response: 200 OK
{
  "success": true,
  "message": "Deposit verified successfully"
}
```

---

## EMPLOYEE ENDPOINTS

### Get All Employees
```http
GET /employees?page=1&limit=50&search=john
Authorization: Bearer <token>

Response: 200 OK
{
  "success": true,
  "data": {
    "employees": [...],
    "pagination": {
      "total": 45,
      "page": 1,
      "limit": 50,
      "pages": 1
    }
  }
}
```

### Create Employee
```http
POST /employees
Authorization: Bearer <token>
Content-Type: application/json

{
  "firstName": "Jane",
  "lastName": "Smith",
  "email": "jane@email.com",
  "bankAccountNumber": "0123456789",
  "bankCode": "058",
  "bankName": "GTBank",
  "salaryAmount": 15000000,  // 150,000 NGN in kobo
  "paymentFrequency": "monthly",
  "paymentDay": 28
}

Response: 201 Created
{
  "success": true,
  "data": {
    "employee": { ... }
  }
}
```

### Update Employee
```http
PUT /employees/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "salaryAmount": 20000000  // Update salary to 200,000 NGN
}

Response: 200 OK
```

### Delete Employee (Soft Delete)
```http
DELETE /employees/:id
Authorization: Bearer <token>

Response: 200 OK
{
  "success": true,
  "message": "Employee deactivated successfully"
}
```

---

## PAYROLL ENDPOINTS

### Get All Payrolls
```http
GET /payrolls?status=completed&page=1&limit=20
Authorization: Bearer <token>

Response: 200 OK
{
  "success": true,
  "data": {
    "payrolls": [...],
    "pagination": { ... }
  }
}
```

### Schedule Payroll
```http
POST /payrolls/schedule
Authorization: Bearer <token>
Content-Type: application/json

{
  "scheduledDate": "2026-02-28T09:00:00Z",
  "paymentFrequency": "monthly"
}

Response: 201 Created
{
  "success": true,
  "data": {
    "payroll": { ... }
  }
}
```

### Cancel Payroll
```http
POST /payrolls/:id/cancel
Authorization: Bearer <token>

Response: 200 OK
```

---

## TRANSACTION ENDPOINTS

### Get All Transactions
```http
GET /transactions?type=disbursement&startDate=2026-01-01&endDate=2026-02-14
Authorization: Bearer <token>

Response: 200 OK
{
  "success": true,
  "data": {
    "transactions": [...],
    "pagination": { ... }
  }
}
```

### Export Transactions
```http
GET /transactions/export?startDate=2026-01-01&endDate=2026-02-14
Authorization: Bearer <token>

Response: 200 OK (CSV file)
```

---

## REPORTS ENDPOINTS

### Dashboard Summary
```http
GET /reports/dashboard
Authorization: Bearer <token>

Response: 200 OK
{
  "success": true,
  "data": {
    "totalEmployees": 45,
    "activeEmployees": 43,
    "walletBalance": 500000000,
    "monthlyPayrollCost": 6750000000,
    "nextPayrollDate": "2026-02-28T09:00:00Z"
  }
}
```

---

## NOTIFICATION ENDPOINTS

### Get Notifications
```http
GET /notifications?isRead=false
Authorization: Bearer <token>

Response: 200 OK
{
  "success": true,
  "data": {
    "notifications": [...],
    "unreadCount": 5
  }
}
```

### Mark as Read
```http
PUT /notifications/:id/read
Authorization: Bearer <token>

Response: 200 OK
```

---

## ERROR RESPONSES

All endpoints follow consistent error format:

```json
{
  "success": false,
  "error": "Error message here"
}
```

Common HTTP Status Codes:
- 200: Success
- 201: Created
- 400: Bad Request (validation error)
- 401: Unauthorized (missing/invalid token)
- 403: Forbidden (insufficient permissions)
- 404: Not Found
- 500: Internal Server Error

---

## AUTHENTICATION

All protected endpoints require JWT token in header:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

Get token from:
- `/auth/register` response
- `/auth/login` response
- `/auth/google/callback` redirect

---

## RATE LIMITS

- General API: 100 requests per 15 minutes per IP
- Authentication: 5 requests per 15 minutes per IP
