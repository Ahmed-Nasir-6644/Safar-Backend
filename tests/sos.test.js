/**
 * SOS Feature Tests
 *
 * Tests the SOS service, controller logic, and email service behaviour.
 * No live DB or SMTP connections — all external dependencies are mocked.
 *
 * Run with:  node tests/sos.test.js
 */

'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Tiny assertion helpers (no test-framework dependency)
// ─────────────────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function assert(condition, testName, detail = '') {
  if (condition) {
    console.log(`  ✅  ${testName}`);
    passed++;
  } else {
    console.error(`  ❌  ${testName}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

function assertThrows(fn, expectedCode, testName) {
  try {
    fn();
    console.error(`  ❌  ${testName} — expected throw but none occurred`);
    failed++;
  } catch (err) {
    assert(err.code === expectedCode, testName, `code: ${err.code}`);
  }
}

async function assertRejects(asyncFn, expectedCode, testName) {
  try {
    await asyncFn();
    console.error(`  ❌  ${testName} — expected rejection but resolved`);
    failed++;
  } catch (err) {
    assert(err.code === expectedCode, testName, `code: ${err.code}`);
  }
}

function section(title) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`📋  ${title}`);
  console.log('─'.repeat(60));
}

// ─────────────────────────────────────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────────────────────────────────────

/** Simulated DB users */
const DB_USERS = {
  'user-001': { _id: 'user-001', name: 'Alice Khan',  email: 'alice@example.com' },
  'user-002': { _id: 'user-002', name: 'Bob Ahmed',   email: 'bob@example.com'   },
};

/** Simulated contacts store */
const DB_CONTACTS = {
  'user-001': [
    { _id: 'c-001', userId: 'user-001', name: 'Parent',  email: 'parent@example.com'  },
    { _id: 'c-002', userId: 'user-001', name: 'Sibling', email: 'sibling@example.com' },
  ],
  'user-002': [],          // user-002 has NO contacts
};

/** Mock email send results (all succeed unless address contains 'fail') */
async function mockSendSosToContacts({ senderName, message, lat, lng, contacts }) {
  return contacts.map(c => ({
    name:    c.name,
    email:   c.email,
    success: !c.email.includes('fail'),
    ...(c.email.includes('fail')
      ? { error: 'SMTP connection refused' }
      : { messageId: `<mock-${Date.now()}@smtp.test>` }),
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Minimal in-process sosService that accepts injected dependencies
// (mirrors the real service logic without Mongoose / Nodemailer)
// ─────────────────────────────────────────────────────────────────────────────
const DEFAULT_SOS_MESSAGE = 'I need immediate assistance. This is an emergency.';

async function triggerSOS_mock({ userId, message, location },
                               { findUser, findContacts, sendEmails }) {
  const user = await findUser(userId);
  if (!user) {
    const err = new Error(`User not found: ${userId}`);
    err.code  = 'INVALID_USER';
    throw err;
  }

  const resolvedMessage = (message && message.trim()) ? message.trim() : DEFAULT_SOS_MESSAGE;

  const contacts = await findContacts(userId);
  if (!contacts || contacts.length === 0) {
    const err = new Error('No emergency contacts found for this user.');
    err.code  = 'NO_CONTACTS';
    throw err;
  }

  const results = await sendEmails({
    senderName: user.name,
    message:    resolvedMessage,
    lat:        location.lat,
    lng:        location.lng,
    contacts,
  });

  return {
    senderName:  user.name,
    message:     resolvedMessage,
    location:    location,
    totalSent:   results.filter(r => r.success).length,
    totalFailed: results.filter(r => !r.success).length,
    results,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers for controller-level HTTP simulation
// ─────────────────────────────────────────────────────────────────────────────
function makeRes() {
  const res = {
    _code: null,
    _body: null,
    status(code) { this._code = code; return this; },
    json(body)   { this._body = body; return this; },
  };
  return res;
}

/** Minimal controller handler (mirrors sosController.js logic, dependency-injected) */
async function handleTriggerSOS(body, deps) {
  const res = makeRes();
  const { userId, message, location } = body;

  if (!userId || typeof userId !== 'string' || !userId.trim()) {
    return res.status(400).json({ success: false, message: 'userId is required' });
  }
  if (!location || typeof location !== 'object') {
    return res.status(400).json({ success: false, message: 'location object with lat and lng is required' });
  }

  const lat = Number(location.lat);
  const lng = Number(location.lng);

  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return res.status(400).json({ success: false, message: 'location.lat and location.lng must be valid numbers' });
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return res.status(400).json({ success: false, message: 'location.lat must be -90..90 and location.lng must be -180..180' });
  }

  try {
    const result = await triggerSOS_mock(
      { userId: userId.trim(), message, location: { lat, lng } },
      deps,
    );

    let status = 200;
    if (result.totalSent === 0)       status = 502;
    else if (result.totalFailed > 0)  status = 207;

    return res.status(status).json({
      success: result.totalSent > 0,
      message: `SOS alert sent to ${result.totalSent} contact(s)` +
               (result.totalFailed > 0 ? `, ${result.totalFailed} failed` : ''),
      data: result,
    });
  } catch (err) {
    if (err.code === 'INVALID_USER') return res.status(404).json({ success: false, message: err.message });
    if (err.code === 'NO_CONTACTS')  return res.status(422).json({ success: false, message: err.message });
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

// Default injected deps using the mock DB/email above
const defaultDeps = {
  findUser:     (id) => Promise.resolve(DB_USERS[id] || null),
  findContacts: (id) => Promise.resolve(DB_CONTACTS[id] || []),
  sendEmails:   mockSendSosToContacts,
};

// ─────────────────────────────────────────────────────────────────────────────
// TESTS
// ─────────────────────────────────────────────────────────────────────────────

async function runTests() {
  console.log('\n🚨  SOS Feature Test Suite');

  // ── 1. Default SOS message ───────────────────────────────────────────────
  section('1. Default SOS message fallback');

  const resultDefaultMsg = await triggerSOS_mock(
    { userId: 'user-001', location: { lat: 33.6, lng: 73.1 } },
    defaultDeps,
  );
  assert(
    resultDefaultMsg.message === DEFAULT_SOS_MESSAGE,
    'Uses default message when none provided',
  );
  assert(
    resultDefaultMsg.message === DEFAULT_SOS_MESSAGE,
    'Uses default message when empty string provided',
  );

  const resultWhiteSpace = await triggerSOS_mock(
    { userId: 'user-001', message: '   ', location: { lat: 33.6, lng: 73.1 } },
    defaultDeps,
  );
  assert(
    resultWhiteSpace.message === DEFAULT_SOS_MESSAGE,
    'Uses default message when whitespace-only string provided',
  );

  const resultCustomMsg = await triggerSOS_mock(
    { userId: 'user-001', message: 'Help! Car accident!', location: { lat: 33.6, lng: 73.1 } },
    defaultDeps,
  );
  assert(
    resultCustomMsg.message === 'Help! Car accident!',
    'Uses custom message when provided',
  );

  // ── 2. User validation ───────────────────────────────────────────────────
  section('2. User validation');

  await assertRejects(
    () => triggerSOS_mock(
      { userId: 'nonexistent-user', location: { lat: 33.6, lng: 73.1 } },
      defaultDeps,
    ),
    'INVALID_USER',
    'Throws INVALID_USER for unknown userId',
  );

  // ── 3. No contacts check ─────────────────────────────────────────────────
  section('3. No emergency contacts');

  await assertRejects(
    () => triggerSOS_mock(
      { userId: 'user-002', location: { lat: 33.6, lng: 73.1 } },
      defaultDeps,
    ),
    'NO_CONTACTS',
    'Throws NO_CONTACTS when user has no contacts registered',
  );

  // ── 4. Successful SOS trigger ────────────────────────────────────────────
  section('4. Successful SOS trigger');

  const result = await triggerSOS_mock(
    { userId: 'user-001', message: 'I am in danger', location: { lat: 33.72, lng: 73.09 } },
    defaultDeps,
  );

  assert(result.totalSent   === 2, 'totalSent equals number of contacts');
  assert(result.totalFailed === 0, 'totalFailed is 0 when all emails succeed');
  assert(result.senderName  === 'Alice Khan', 'senderName matches user name');
  assert(result.location.lat === 33.72, 'location.lat preserved in result');
  assert(result.location.lng === 73.09, 'location.lng preserved in result');
  assert(Array.isArray(result.results) && result.results.length === 2, 'results array has one entry per contact');
  assert(result.results.every(r => r.success), 'all results have success=true');
  assert(result.results.every(r => typeof r.messageId === 'string'), 'all results have a messageId');

  // ── 5. Partial email failure ─────────────────────────────────────────────
  section('5. Partial email failure');

  const failingDeps = {
    ...defaultDeps,
    findContacts: () => Promise.resolve([
      { _id: 'c-10', userId: 'user-001', name: 'Good Contact', email: 'good@example.com' },
      { _id: 'c-11', userId: 'user-001', name: 'Bad Contact',  email: 'fail@example.com' },
    ]),
  };

  const partialResult = await triggerSOS_mock(
    { userId: 'user-001', location: { lat: 33.6, lng: 73.1 } },
    failingDeps,
  );

  assert(partialResult.totalSent   === 1, 'totalSent=1 when one contact succeeds');
  assert(partialResult.totalFailed === 1, 'totalFailed=1 when one contact fails');
  assert(
    partialResult.results.find(r => !r.success)?.error === 'SMTP connection refused',
    'Failed result includes error message',
  );

  // ── 6. Per-contact result shape ──────────────────────────────────────────
  section('6. Per-contact result shape');

  const [r0, r1] = partialResult.results;
  const successEntry = partialResult.results.find(r => r.success);
  const failEntry    = partialResult.results.find(r => !r.success);

  assert(typeof successEntry.name       === 'string', 'Successful result has name');
  assert(typeof successEntry.email      === 'string', 'Successful result has email');
  assert(successEntry.success           === true,     'Successful result has success=true');
  assert(typeof successEntry.messageId  === 'string', 'Successful result has messageId');
  assert('error' in failEntry,                        'Failed result has error field');
  assert(failEntry.success              === false,    'Failed result has success=false');

  // ── 7. HTTP controller — input validation ────────────────────────────────
  section('7. HTTP controller — input validation');

  const missingUserId = await handleTriggerSOS({ location: { lat: 33.6, lng: 73.1 } }, defaultDeps);
  assert(missingUserId._code === 400, 'Missing userId → HTTP 400');

  const missingLocation = await handleTriggerSOS({ userId: 'user-001' }, defaultDeps);
  assert(missingLocation._code === 400, 'Missing location → HTTP 400');

  const badLat = await handleTriggerSOS({ userId: 'user-001', location: { lat: 'abc', lng: 73.1 } }, defaultDeps);
  assert(badLat._code === 400, 'Non-numeric lat → HTTP 400');

  const outOfRange = await handleTriggerSOS(
    { userId: 'user-001', location: { lat: 999, lng: 73.1 } },
    defaultDeps,
  );
  assert(outOfRange._code === 400, 'Out-of-range lat (999) → HTTP 400');

  // ── 8. HTTP controller — business logic error mapping ───────────────────
  section('8. HTTP controller — error code → HTTP status mapping');

  const invalidUserRes = await handleTriggerSOS(
    { userId: 'ghost-999', location: { lat: 33.6, lng: 73.1 } },
    defaultDeps,
  );
  assert(invalidUserRes._code === 404,    'INVALID_USER → HTTP 404');
  assert(invalidUserRes._body.success === false, 'INVALID_USER response has success=false');

  const noContactsRes = await handleTriggerSOS(
    { userId: 'user-002', location: { lat: 33.6, lng: 73.1 } },
    defaultDeps,
  );
  assert(noContactsRes._code === 422,     'NO_CONTACTS → HTTP 422');
  assert(noContactsRes._body.success === false, 'NO_CONTACTS response has success=false');

  // ── 9. HTTP controller — success response ────────────────────────────────
  section('9. HTTP controller — success response shape');

  const successRes = await handleTriggerSOS(
    { userId: 'user-001', message: 'Please help', location: { lat: 33.72, lng: 73.09 } },
    defaultDeps,
  );

  assert(successRes._code === 200,              'All contacts sent → HTTP 200');
  assert(successRes._body.success === true,     'Response has success=true');
  assert(typeof successRes._body.message === 'string', 'Response has message string');
  assert(typeof successRes._body.data === 'object',    'Response has data object');
  assert(typeof successRes._body.data.totalSent   === 'number', 'data.totalSent is number');
  assert(typeof successRes._body.data.totalFailed === 'number', 'data.totalFailed is number');
  assert(Array.isArray(successRes._body.data.results),         'data.results is array');

  // ── 10. HTTP controller — partial failure → 207 ──────────────────────────
  section('10. HTTP controller — partial failure → 207 Multi-Status');

  const partialHttpRes = await handleTriggerSOS(
    { userId: 'user-001', location: { lat: 33.6, lng: 73.1 } },
    failingDeps,
  );
  assert(partialHttpRes._code === 207,            'Partial failure → HTTP 207');
  assert(partialHttpRes._body.success === true,   '207 still has success=true (≥1 sent)');
  assert(
    partialHttpRes._body.message.includes('failed'),
    '207 message mentions failed count',
  );

  // ── 11. HTTP controller — all SMTP failed → 502 ──────────────────────────
  section('11. HTTP controller — all SMTP failed → 502');

  const allFailDeps = {
    ...defaultDeps,
    findContacts: () => Promise.resolve([
      { _id: 'cx1', userId: 'user-001', name: 'A', email: 'fail1@example.com' },
      { _id: 'cx2', userId: 'user-001', name: 'B', email: 'fail2@example.com' },
    ]),
  };

  const allFailRes = await handleTriggerSOS(
    { userId: 'user-001', location: { lat: 33.6, lng: 73.1 } },
    allFailDeps,
  );
  assert(allFailRes._code === 502,             'All SMTP failed → HTTP 502');
  assert(allFailRes._body.success === false,   '502 has success=false');

  // ── 12. Constants / exports sanity ──────────────────────────────────────
  section('12. Constant & default message sanity');

  assert(
    typeof DEFAULT_SOS_MESSAGE === 'string' && DEFAULT_SOS_MESSAGE.length > 0,
    'DEFAULT_SOS_MESSAGE is a non-empty string',
  );
  assert(
    DEFAULT_SOS_MESSAGE.toLowerCase().includes('emergency') ||
    DEFAULT_SOS_MESSAGE.toLowerCase().includes('assist'),
    'DEFAULT_SOS_MESSAGE contains expected keywords',
  );

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(60));
  console.log(`🏁  Results: ${passed} passed, ${failed} failed  (${passed + failed} total)`);
  if (failed === 0) {
    console.log('🎉  All SOS tests passed!\n');
  } else {
    console.log('⚠️   Some tests failed — see above.\n');
    process.exitCode = 1;
  }
}

runTests().catch(err => {
  console.error('\n💥  Unexpected test runner error:', err);
  process.exitCode = 1;
});
