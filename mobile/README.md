# REMIT Mobile

The React Native client for REMIT, built with Expo SDK 54 and Expo Router.

## Requirements

- Bun
- Expo Go on an Android or iOS device
- A running REMIT backend

## Configure the API

Copy `.env.example` to `.env` and set:

```env
EXPO_PUBLIC_API_URL=https://your-api.onrender.com/api/v1
```

For a backend running on this computer, use the computer's LAN IP instead of
`localhost` when testing on a physical phone:

```env
EXPO_PUBLIC_API_URL=http://192.168.1.100:5000/api/v1
```

The phone and computer must be on the same network, and Windows Firewall must
allow the backend port.

## Run with Expo Go

```powershell
cd C:\dev\remit\REMIT\mobile
bun install
bun start
```

Scan the QR code with Expo Go. If LAN discovery is blocked:

```powershell
bunx expo start --tunnel
```

## Validation

```powershell
bun run typecheck
bun run lint
bunx expo-doctor
```

## Architecture

- `app/` contains Expo Router routes and layouts.
- `src/api/` contains the typed backend client.
- `src/auth/` restores and persists the authentication token using SecureStore.
- Navigation and actions are driven by backend permissions, not hard-coded role
  conditionals.

Implemented mobile flows:

- Company registration and login
- Secure session restoration and logout
- Permission-aware tab navigation
- Company dashboard
- Employee directory and employee creation
- Payroll draft creation, submission, approval, cancellation and retry
- Wallet balance, funding and transaction activity
- Account permissions and backend system status
