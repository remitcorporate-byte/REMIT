# REMIT Role and Permission Architecture

REMIT uses one shared application interface composed from effective
permissions. It does not maintain duplicated Owner, Admin, Finance, or Viewer
page trees.

## Folder structure

```text
backend/src/auth/
  permissions.ts          Authoritative role-to-permission policy

frontend/src/auth/
  AuthContext.tsx         Current server-refreshed user and can(permission)
  Can.tsx                 Declarative permission boundary

frontend/src/navigation/
  appNavigation.ts        Permission-tagged navigation registry
```

Pages remain in `frontend/src/pages/`. Role-specific behavior is supplied by
the authorization layer, so shared screens do not drift between copied role
folders.

## Operational roles

| Capability | Owner | Admin | Finance | Viewer | Employee |
| --- | --- | --- | --- | --- | --- |
| Dashboard | Yes | Yes | Yes | Yes | No |
| Read employee records | Yes | Yes | Yes | Yes | No |
| Manage employee records | Yes | Yes | No | No | No |
| Read and fund wallet | Yes | Yes | Yes | No | No |
| Read payroll | Yes | Yes | Yes | Yes | No |
| Create and operate payroll | Yes | Yes | Yes | No | No |
| Read and export transactions | Yes | Yes | Yes | Yes | No |
| Manage company profile | Yes | Yes | No | No | No |
| Read team directory | Yes | Yes | Yes | Yes | No |
| Manage team members | Yes | No | No | No | No |
| Read audit log | Yes | Yes | No | No | No |
| Read notifications | Yes | Yes | Yes | Yes | Yes |

`EMPLOYEE` is reserved for a future employee portal. It deliberately has no
company payroll, wallet, employee-directory, or team access.

## Enforcement

- The backend is authoritative and checks permissions on every protected route.
- Login, registration, and `/auth/me` return the user's effective permissions.
- The frontend refreshes the stored user from `/auth/me` when the application
  starts, preventing stale local role data from controlling the interface.
- Navigation is filtered once from `appNavigation`.
- Page actions use `<Can permission="...">` instead of checking role strings.
- Payroll-state conditions remain inside payroll components because they are
  workflow rules, not role rules.
- Separation of duties remains a backend business rule: permission to approve
  does not allow a creator to bypass independent approval requirements.

## Adding a capability

1. Add the permission to `backend/src/auth/permissions.ts`.
2. Assign it to the appropriate roles.
3. Protect the backend route with `authorizePermission(...)`.
4. Add the matching frontend `Permission` type.
5. Tag navigation or wrap the relevant control with `<Can>`.
6. Extend `backend/scripts/test-role-permissions.ts`.
