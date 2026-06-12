# API ENDPOINTS QUICK REFERENCE

## Base URL
```
Development: http://localhost:5000/api/v1
Production: https://your-backend.onrender.com/api/v1
```

---

## AUTHENTICATION ENDPOINTS

### Roles
New company registrations create an `OWNER` user. Supported roles are:

- `OWNER`: company owner, can manage team access and all operational actions.
- `ADMIN`: can manage company operations, employees, payroll, wallet, and audit log.
- `FINANCE`: can run payroll and wallet workflows, and can read employees for payroll setup.
- `VIEWER`: read-only access to employees, payrolls, transactions, and reports.
- `EMPLOYEE`: reserved for employee-facing access.

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
    "reservedBalance": 15000000,
    "availableBalance": 485000000,
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
GET /wallet/verify/:reference
Authorization: Bearer <token>

Response: 200 OK
{
  "success": true,
  "message": "Deposit verified successfully",
  "data": {
    "transaction": { ... },
    "newBalance": 501000000
  }
}
```

---

## EMPLOYEE ENDPOINTS

### Get All Employees
Roles: `OWNER`, `ADMIN`, `FINANCE`, `VIEWER`

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
Roles: `OWNER`, `ADMIN`

```http
POST /employees
Authorization: Bearer <token>
Content-Type: application/json

{
  "firstName": "Jane",
  "lastName": "Smith",
  "email": "jane@email.com",
  "bankName": "GTBank",
  "bankCode": "058",
  "accountNumber": "0123456789",
  "salary": 15000000,
  "paymentFrequency": "MONTHLY",
  "department": "Engineering",
  "position": "Backend Engineer"
}

Response: 201 Created
{
  "success": true,
  "data": {
    "employee": { ... }
  }
}
```

### List Banks
Roles: `OWNER`, `ADMIN`, `FINANCE`

```http
GET /employees/banks
Authorization: Bearer <token>

Response: 200 OK
{
  "success": true,
  "data": [
    { "name": "Access Bank", "code": "044" }
  ]
}
```

### Verify Bank Account
Roles: `OWNER`, `ADMIN`, `FINANCE`

```http
POST /employees/verify-bank
Authorization: Bearer <token>
Content-Type: application/json

{
  "bankCode": "058",
  "accountNumber": "0123456789"
}

Response: 200 OK
{
  "success": true,
  "data": {
    "account_name": "Jane Smith"
  }
}
```

### Update Employee
Roles: `OWNER`, `ADMIN`

```http
PUT /employees/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "salary": 20000000
}

Response: 200 OK
```

### Delete Employee (Soft Delete)
Roles: `OWNER`, `ADMIN`

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

## TEAM ENDPOINTS

### Get Team Members
Roles: `OWNER`, `ADMIN`, `FINANCE`, `VIEWER`

```http
GET /team
Authorization: Bearer <token>

Response: 200 OK
{
  "success": true,
  "data": [
    {
      "id": "user_id",
      "email": "finance@company.com",
      "firstName": "Ada",
      "lastName": "Okafor",
      "role": "FINANCE",
      "isActive": true,
      "createdAt": "2026-06-11T10:00:00.000Z"
    }
  ]
}
```

### Invite Team Member
Roles: `OWNER`

```http
POST /team/invite
Authorization: Bearer <token>
Content-Type: application/json

{
  "email": "finance@company.com",
  "firstName": "Ada",
  "lastName": "Okafor",
  "role": "FINANCE",
  "password": "OptionalPass123!"
}

Response: 201 Created
{
  "success": true,
  "data": {
    "id": "user_id",
    "email": "finance@company.com",
    "role": "FINANCE",
    "temporaryPassword": "Remit-generated!"
  }
}
```

If `password` is omitted, the API returns a generated `temporaryPassword` once.

### Update Team Member Role
Roles: `OWNER`

```http
PUT /team/:id/role
Authorization: Bearer <token>
Content-Type: application/json

{
  "role": "VIEWER"
}

Response: 200 OK
```

Assignable roles are `ADMIN`, `FINANCE`, and `VIEWER`. The owner role cannot be reassigned from this endpoint.

### Deactivate Team Member
Roles: `OWNER`

```http
PUT /team/:id/deactivate
Authorization: Bearer <token>

Response: 200 OK
```

---

## PAYROLL ENDPOINTS

### Get All Payrolls
Roles: `OWNER`, `ADMIN`, `FINANCE`, `VIEWER`

```http
GET /payrolls?status=COMPLETED&page=1&limit=20
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

### Create Payroll Draft
Roles: `OWNER`, `ADMIN`, `FINANCE`

```http
POST /payrolls/drafts
Authorization: Bearer <token>
Content-Type: application/json

{
  "scheduledDate": "2026-02-28T09:00:00Z",
  "employeeIds": [
    "9db280b7-833f-4d19-9e80-dfe45951287e"
  ],
  "note": "February payroll"
}

Response: 201 Created
{
  "success": true,
  "data": {
    "payroll": { ... }
  }
}
```

### Submit Payroll For Approval
Roles: `OWNER`, `ADMIN`, `FINANCE`

```http
PUT /payrolls/:id/submit
Authorization: Bearer <token>

Response: 200 OK
```

### Approve Payroll
Roles: `OWNER`, `ADMIN`, `FINANCE`

```http
PUT /payrolls/:id/approve
Authorization: Bearer <token>

Response: 200 OK
```

If another active `OWNER`, `ADMIN`, or `FINANCE` user exists in the company, the payroll creator cannot approve their own submitted payroll.

### Get Payroll Detail
Roles: `OWNER`, `ADMIN`, `FINANCE`, `VIEWER`

```http
GET /payrolls/:id
Authorization: Bearer <token>

Response: 200 OK
{
  "success": true,
  "data": {
    "status": "PROCESSING",
    "payrollEmployees": [
      {
        "status": "PENDING",
        "amount": 15000000,
        "employee": { ... },
        "transaction": { ... }
      }
    ]
  }
}
```

### Cancel Payroll
Roles: `OWNER`, `ADMIN`, `FINANCE`

```http
PUT /payrolls/:id/cancel
Authorization: Bearer <token>

Response: 200 OK
```

---

## TRANSACTION ENDPOINTS

### Get All Transactions
Roles: `OWNER`, `ADMIN`, `FINANCE`, `VIEWER`

```http
GET /transactions?type=PAYROLL_DEBIT&status=SUCCESS&page=1&limit=20
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
Roles: `OWNER`, `ADMIN`, `FINANCE`, `VIEWER`

```http
GET /transactions/export
Authorization: Bearer <token>

Response: 200 OK (CSV file)
```

### Export Payroll
Roles: `OWNER`, `ADMIN`, `FINANCE`, `VIEWER`

```http
GET /payrolls/:id/export
Authorization: Bearer <token>

Response: 200 OK (CSV file)
```

---

## REPORTS ENDPOINTS

### Dashboard Summary
```http
GET /company/dashboard
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

### System Status
```http
GET /company/system-status
Authorization: Bearer <token>

Response: 200 OK
{
  "success": true,
  "data": {
    "apiConnected": true,
    "databaseConnected": true,
    "schedulerMode": "in-process",
    "paystackMode": "mock"
  }
}
```

### Audit Log
Roles: `OWNER`, `ADMIN`

```http
GET /company/audit-log?limit=50
Authorization: Bearer <token>

Response: 200 OK
{
  "success": true,
  "data": [
    {
      "action": "PAYROLL_APPROVED",
      "entityType": "Payroll",
      "createdAt": "2026-06-11T10:00:00.000Z"
    }
  ]
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
