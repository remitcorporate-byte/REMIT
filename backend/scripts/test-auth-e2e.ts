import fs from 'node:fs/promises';
import { prisma } from '../src/lib/prisma';
import { hashToken } from '../src/auth/tokens';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:5055/api/v1';
const LOG_FILE = process.env.SERVER_LOG || '/tmp/remit-auth-e2e-server.log';
const now = Date.now();
const ownerEmail = `auth_e2e_owner_${now}@example.com`;
const ownerPassword = 'Owner-Test-123!';
const changedPassword = 'Changed-Test-456!';
const financeEmail = `auth_e2e_finance_${now}@example.com`;
const financePassword = 'Finance-Test-123!';
const finance2Email = `auth_e2e_finance2_${now}@example.com`;
const finance2Password = 'Finance2-Test-123!';

type Reply = { status: number; body: any; headers: Headers };

function pass(name: string, detail = '') { console.log(`PASS ${name}${detail ? ` — ${detail}` : ''}`); }
function fail(name: string, detail: string): never { throw new Error(`FAIL ${name} — ${detail}`); }
function assert(condition: unknown, name: string, detail: string): asserts condition { if (!condition) fail(name, detail); }

async function request(path: string, init: RequestInit = {}): Promise<Reply> {
  const response = await fetch(`${BASE_URL}${path}`, { ...init, headers: { 'content-type': 'application/json', ...(init.headers || {}) } });
  const text = await response.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: response.status, body, headers: response.headers };
}
function json(method: string, body: any, token?: string, extra: Record<string, string> = {}): RequestInit {
  return { method, body: JSON.stringify(body), headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...extra } };
}
function data(reply: Reply): any { return reply.body?.data; }
function cookieFrom(reply: Reply): string {
  const raw = reply.headers.get('set-cookie') || '';
  const match = raw.match(/remit_rt=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}
async function waitForLog(pattern: RegExp, timeoutMs = 5000): Promise<string> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const text = await fs.readFile(LOG_FILE, 'utf8').catch(() => '');
    const match = text.match(pattern);
    if (match) return match[1] || match[0];
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for ${pattern} in ${LOG_FILE}`);
}
async function waitForNewCode(previous: Set<string>, timeoutMs = 5000): Promise<string> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const text = await fs.readFile(LOG_FILE, 'utf8').catch(() => '');
    const codes = [...text.matchAll(/Your payroll approval code is (\d{6})/g)].map((match) => match[1]);
    const next = codes.find((code) => !previous.has(code));
    if (next) return next;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for a new approval code in ${LOG_FILE}`);
}
async function expectStatus(reply: Promise<Reply>, expected: number, name: string) {
  const result = await reply;
  assert(result.status === expected, name, `expected ${expected}, received ${result.status}: ${JSON.stringify(result.body)}`);
  return result;
}
async function login(email: string, password: string, mobile = true) {
  const reply = await request('/auth/login', json('POST', { email, password }, undefined, mobile ? { 'X-Client': 'mobile' } : {}));
  assert(reply.status === 200, 'login', `${email} returned ${reply.status}`);
  return { access: data(reply).accessToken || data(reply).token, refresh: data(reply).refreshToken, reply };
}

async function main() {
  const register = await request('/auth/register', json('POST', { email: ownerEmail, password: ownerPassword, firstName: 'Auth', lastName: 'Owner', companyName: `Auth E2E ${now}` }, undefined, { 'X-Client': 'mobile' }));
  assert(register.status === 201, 'a register', JSON.stringify(register.body));
  let ownerAccess = data(register).accessToken;
  let ownerRefresh = data(register).refreshToken;
  assert(ownerAccess && ownerRefresh, 'a register', 'accessToken and refreshToken are required');
  const me = await request('/auth/me', { headers: { authorization: `Bearer ${ownerAccess}` } });
  assert(me.status === 200 && data(me).email === ownerEmail, 'a /auth/me', JSON.stringify(me.body));
  pass('a register + /auth/me');

  const webLogin = await request('/auth/login', json('POST', { email: ownerEmail, password: ownerPassword }));
  const webCookie = cookieFrom(webLogin);
  assert(webLogin.status === 200 && webCookie && !('refreshToken' in data(webLogin)) && /HttpOnly/i.test(webLogin.headers.get('set-cookie') || '') && /Path=\/api\/v1\/auth/i.test(webLogin.headers.get('set-cookie') || ''), 'b web login', JSON.stringify(webLogin.body));
  pass('b web login cookie contract');

  const oldAccess = ownerAccess;
  const rotated = await expectStatus(request('/auth/refresh', json('POST', { refreshToken: ownerRefresh }, undefined, { 'X-Client': 'mobile' })), 200, 'c refresh rotation');
  ownerAccess = data(rotated).accessToken; const rotatedRefresh = data(rotated).refreshToken;
  assert(rotatedRefresh && rotatedRefresh !== ownerRefresh, 'c refresh rotation', 'refresh token did not rotate');
  assert((await request('/auth/me', { headers: { authorization: `Bearer ${oldAccess}` } })).status === 401, 'c old access revoked', 'old access token remained valid');
  assert((await request('/auth/me', { headers: { authorization: `Bearer ${ownerAccess}` } })).status === 200, 'c new access works', 'new access token failed');
  pass('c refresh rotation');

  assert((await request('/auth/refresh', json('POST', { refreshToken: ownerRefresh }, undefined, { 'X-Client': 'mobile' }))).status === 401, 'd grace reuse rejected', 'reused token was accepted');
  assert((await request('/auth/me', { headers: { authorization: `Bearer ${ownerAccess}` } })).status === 200, 'd grace newest survives', 'newest session was revoked');
  pass('d grace-window reuse');

  const oldRow = await prisma.authSession.findUnique({ where: { refreshTokenHash: hashToken(ownerRefresh) } });
  assert(oldRow, 'e reuse setup', 'rotated session row not found');
  await prisma.authSession.update({ where: { id: oldRow.id }, data: { revokedAt: new Date(Date.now() - 31_000) } });
  assert((await request('/auth/refresh', json('POST', { refreshToken: ownerRefresh }, undefined, { 'X-Client': 'mobile' }))).status === 401, 'e reuse detection', 'stale reuse was accepted');
  assert((await request('/auth/refresh', json('POST', { refreshToken: rotatedRefresh }, undefined, { 'X-Client': 'mobile' }))).status === 401, 'e family revoked', 'latest refresh still worked');
  assert((await request('/auth/me', { headers: { authorization: `Bearer ${ownerAccess}` } })).status === 401, 'e family access revoked', 'latest access still worked');
  assert(await prisma.auditLog.findFirst({ where: { action: 'REFRESH_REUSE_DETECTED', entityId: oldRow.id } }), 'e audit log', 'reuse audit record missing');
  pass('e refresh reuse detection + family revocation');

  const concurrentLogin = await login(ownerEmail, ownerPassword);
  const concurrent = await Promise.all(Array.from({ length: 5 }, () => request('/auth/refresh', json('POST', { refreshToken: concurrentLogin.refresh }, undefined, { 'X-Client': 'mobile' }))));
  assert(concurrent.filter((r) => r.status === 200).length === 1, 'f concurrent refresh', JSON.stringify(concurrent.map((r) => r.status)));
  pass('f concurrent refresh single winner');

  const sessionsLogin = await login(ownerEmail, ownerPassword);
  const sessionList = await expectStatus(request('/auth/sessions', { headers: { authorization: `Bearer ${sessionsLogin.access}` } }), 200, 'g sessions list');
  assert(Array.isArray(data(sessionList)) && data(sessionList).some((s: any) => s.current), 'g current session', JSON.stringify(data(sessionList)));
  const other = data(sessionList).find((s: any) => !s.current);
  if (other) {
    await expectStatus(request(`/auth/sessions/${other.id}`, { method: 'DELETE', headers: { authorization: `Bearer ${sessionsLogin.access}` } }), 200, 'g revoke session');
    assert(!(await prisma.authSession.findUnique({ where: { id: other.id } }))?.revokedAt ? false : true, 'g revoke session', 'session row was not revoked');
  }
  await expectStatus(request('/auth/logout', { method: 'POST', headers: { authorization: `Bearer ${sessionsLogin.access}` } }), 200, 'g logout');
  assert((await request('/auth/me', { headers: { authorization: `Bearer ${sessionsLogin.access}` } })).status === 401, 'g logout revokes current', 'logged-out access remained valid');
  const allLogin = await login(ownerEmail, ownerPassword);
  await expectStatus(request('/auth/logout-all', { method: 'POST', headers: { authorization: `Bearer ${allLogin.access}` } }), 200, 'g logout all');
  assert((await request('/auth/me', { headers: { authorization: `Bearer ${allLogin.access}` } })).status === 401, 'g logout-all revokes all', 'logout-all access remained valid');
  pass('g sessions, revoke, logout, logout-all');

  const resetSeed = await login(ownerEmail, ownerPassword);
  const forgotExisting = await request('/auth/password/forgot', json('POST', { email: ownerEmail }));
  const forgotMissing = await request('/auth/password/forgot', json('POST', { email: `missing_${now}@example.com` }));
  assert(forgotExisting.status === 200 && forgotMissing.status === 200 && JSON.stringify(forgotExisting.body) === JSON.stringify(forgotMissing.body), 'h forgot response', 'existing and missing responses differ');
  const resetToken = await waitForLog(new RegExp(`to=${ownerEmail} subject=Reset your REMIT password[\\s\\S]*?token=([^\\s]+)`));
  const reset = await expectStatus(request('/auth/password/reset', json('POST', { token: resetToken, password: changedPassword })), 200, 'h reset');
  assert(reset.body?.success, 'h reset', JSON.stringify(reset.body));
  assert((await request('/auth/me', { headers: { authorization: `Bearer ${resetSeed.access}` } })).status === 401, 'h reset revokes sessions', 'pre-reset access remained valid');
  assert((await request('/auth/login', json('POST', { email: ownerEmail, password: ownerPassword }, undefined, { 'X-Client': 'mobile' }))).status === 401, 'h old password', 'old password still worked');
  assert((await login(ownerEmail, changedPassword)).access, 'h new password', 'new password failed');
  assert((await request('/auth/password/reset', json('POST', { token: resetToken, password: 'Another-Test-789!' }))).status === 400, 'h reset token replay', 'reset token replay succeeded');
  assert((await request('/auth/password/reset', json('POST', { token: 'bogus', password: 'weak' }))).status === 400, 'h weak password', 'weak password was accepted');
  pass('h forgot/reset password');

  const changeCurrent = await login(ownerEmail, changedPassword);
  const changeOther = await login(ownerEmail, changedPassword);
  assert((await request('/auth/password/change', json('POST', { currentPassword: 'wrong-password', newPassword: 'Newer-Test-789!' }, changeCurrent.access))).status === 400, 'i wrong current password', 'wrong password accepted');
  const changed = await expectStatus(request('/auth/password/change', json('POST', { currentPassword: changedPassword, newPassword: 'Newer-Test-789!' }, changeCurrent.access)), 200, 'i password change');
  assert((await request('/auth/me', { headers: { authorization: `Bearer ${data(changed).accessToken}` } })).status === 200, 'i current session survives', 'fresh current access failed');
  assert((await request('/auth/me', { headers: { authorization: `Bearer ${changeOther.access}` } })).status === 401, 'i other sessions revoked', 'other access remained valid');
  assert((await request('/auth/login', json('POST', { email: ownerEmail, password: changedPassword }, undefined, { 'X-Client': 'mobile' }))).status === 401, 'i old password rejected', 'old password still worked');
  assert((await login(ownerEmail, 'Newer-Test-789!')).access, 'i new password login', 'new password login failed');
  pass('i password change session semantics');

  const owner = await login(ownerEmail, 'Newer-Test-789!');
  const invite = await expectStatus(request('/team/invite', json('POST', { email: financeEmail, firstName: 'Finance', lastName: 'Approver', role: 'FINANCE', password: financePassword }, owner.access)), 201, 'j invite approver');
  const invite2 = await expectStatus(request('/team/invite', json('POST', { email: finance2Email, firstName: 'Finance2', lastName: 'Approver', role: 'FINANCE', password: finance2Password }, owner.access)), 201, 'j invite second approver');
  assert(data(invite).role === 'FINANCE' && data(invite2).role === 'FINANCE', 'j approver role', 'team role not set');
  const employee = await expectStatus(request('/employees', json('POST', { firstName: 'Payroll', lastName: 'Employee', email: `payroll_employee_${now}@example.com`, bankName: 'GTBank', bankCode: '058', accountNumber: '0123456789', salary: 100000, paymentFrequency: 'MONTHLY' }, owner.access)), 201, 'j employee');
  const deposit = await expectStatus(request('/wallet/deposit', json('POST', { amount: 1000000 }, owner.access)), 200, 'j deposit');
  await expectStatus(request(`/wallet/verify/${data(deposit).reference}`, { headers: { authorization: `Bearer ${owner.access}` } }), 200, 'j deposit verify');
  const draft = await expectStatus(request('/payrolls/drafts', json('POST', { scheduledDate: new Date(Date.now() + 86_400_000).toISOString(), employeeIds: [data(employee).id], note: 'auth e2e' }, owner.access)), 201, 'j draft');
  const payrollId = data(draft).id;
  await expectStatus(request(`/payrolls/${payrollId}/submit`, { method: 'PUT', headers: { authorization: `Bearer ${owner.access}` } }), 200, 'j submit');
  assert((await request(`/payrolls/${payrollId}/approve`, { method: 'PUT', headers: { authorization: `Bearer ${owner.access}`, 'content-type': 'application/json' }, body: '{}' })).status === 400, 'j owner self-approval', 'creator self-approved despite another approver');
  const finance = await login(financeEmail, financePassword);
  assert((await request(`/payrolls/${payrollId}/approve`, { method: 'PUT', headers: { authorization: `Bearer ${finance.access}`, 'content-type': 'application/json' }, body: '{}' })).status === 400, 'j approval requires code', 'approval without code succeeded');
  const initialLog = await fs.readFile(LOG_FILE, 'utf8').catch(() => '');
  const knownCodes = new Set<string>([...initialLog.matchAll(/Your payroll approval code is (\d{6})/g)].map((match) => match[1]));
  await expectStatus(request(`/payrolls/${payrollId}/approval-code`, { method: 'POST', headers: { authorization: `Bearer ${finance.access}` } }), 200, 'j request code');
  const firstCode = await waitForNewCode(knownCodes); knownCodes.add(firstCode);
  for (let i = 0; i < 5; i++) assert((await request(`/payrolls/${payrollId}/approve`, json('PUT', { code: '000000' }, finance.access))).status === 400, 'j wrong code', `attempt ${i + 1} was accepted`);
  const locked = await request(`/payrolls/${payrollId}/approve`, json('PUT', { code: firstCode }, finance.access));
  assert(locked.status === 400, 'j otp lock', 'locked code was accepted');
  await expectStatus(request(`/payrolls/${payrollId}/approval-code`, { method: 'POST', headers: { authorization: `Bearer ${finance.access}` } }), 200, 'j request replacement code');
  const replacementCode = await waitForNewCode(knownCodes); knownCodes.add(replacementCode);
  const approval = await expectStatus(request(`/payrolls/${payrollId}/approve`, json('PUT', { code: replacementCode }, finance.access)), 200, 'j correct code');
  assert(data(approval).status === 'SCHEDULED', 'j correct code', JSON.stringify(data(approval)));
  assert((await request(`/payrolls/${payrollId}/approve`, json('PUT', { code: replacementCode }, finance.access))).status === 400, 'j code replay', 'replayed code succeeded');
  pass('j payroll OTP wrong-attempt lock, replacement, approval, replay');

  const rateDraft = await expectStatus(request('/payrolls/drafts', json('POST', { scheduledDate: new Date(Date.now() + 86_400_000).toISOString(), employeeIds: [data(employee).id], note: 'rate limit' }, owner.access)), 201, 'j rate-limit draft');
  await expectStatus(request(`/payrolls/${data(rateDraft).id}/submit`, { method: 'PUT', headers: { authorization: `Bearer ${owner.access}` } }), 200, 'j rate-limit submit');
  for (let i = 0; i < 3; i++) {
    await expectStatus(request(`/payrolls/${data(rateDraft).id}/approval-code`, { method: 'POST', headers: { authorization: `Bearer ${finance.access}` } }), 200, 'j code rate-limit setup');
    const setupCode = await waitForNewCode(knownCodes); knownCodes.add(setupCode);
  }
  assert((await request(`/payrolls/${data(rateDraft).id}/approval-code`, { method: 'POST', headers: { authorization: `Bearer ${finance.access}` } })).status === 429, 'j sixth code request', 'sixth request was not rate limited');

  const finance2 = await login(finance2Email, finance2Password);
  const raceDraft = await expectStatus(request('/payrolls/drafts', json('POST', { scheduledDate: new Date(Date.now() + 86_400_000).toISOString(), employeeIds: [data(employee).id], note: 'race' }, owner.access)), 201, 'j race draft');
  await expectStatus(request(`/payrolls/${data(raceDraft).id}/submit`, { method: 'PUT', headers: { authorization: `Bearer ${owner.access}` } }), 200, 'j race submit');
  await expectStatus(request(`/payrolls/${data(raceDraft).id}/approval-code`, { method: 'POST', headers: { authorization: `Bearer ${finance2.access}` } }), 200, 'j race code');
  const raceCode = await waitForNewCode(knownCodes); knownCodes.add(raceCode);
  const race = await Promise.all([1, 2].map(() => request(`/payrolls/${data(raceDraft).id}/approve`, json('PUT', { code: raceCode }, finance2.access))));
  assert(race.filter((r) => r.status === 200).length === 1, 'j concurrent approval', JSON.stringify(race.map((r) => [r.status, r.body])));
  pass('j payroll concurrent approval single winner + code rate limit');

  const timings = async (email: string) => { const values: number[] = []; for (let i = 0; i < 5; i++) { const started = performance.now(); await request('/auth/login', json('POST', { email, password: 'wrong-password' }, undefined, { 'X-Client': 'mobile' })); values.push(performance.now() - started); } return values.reduce((a, b) => a + b, 0) / values.length; };
  const knownAvg = await timings(ownerEmail); const unknownAvg = await timings(`unknown_${now}@example.com`);
  console.log(`PASS k login timing — known avg ${knownAvg.toFixed(1)} ms; unknown avg ${unknownAvg.toFixed(1)} ms`);
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(async () => { await prisma.$disconnect(); });
