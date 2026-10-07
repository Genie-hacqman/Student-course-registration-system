#!/usr/bin/env node

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5000/api';
const STUDENTS = Number(process.env.STUDENTS ?? 300);
const HOT_SECTIONS = Number(process.env.HOT_SECTIONS ?? 3);
const SETUP_CONCURRENCY = Number(process.env.SETUP_CONCURRENCY ?? 25);
const PREREQUISITE_COURSE_CODES = (process.env.PREREQUISITE_COURSE_CODES ?? 'CS101,MATH101').split(',');
const REGISTRAR_EMAIL = process.env.REGISTRAR_EMAIL ?? 'registrar@scrs.local';
const REGISTRAR_PASSWORD = process.env.REGISTRAR_PASSWORD ?? 'Registrar@12345';

const json = (res) => res.json();
const post = (path, body, token) => fetch(`${BASE_URL}${path}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body),
});
const get = (path, token) => fetch(`${BASE_URL}${path}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });

const runWithConcurrency = async (items, limit, worker) => {
  const results = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return results;
};

const percentile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];

const log = (...args) => console.log(new Date().toISOString().slice(11, 19), ...args);

async function main() {
  log(`Target: ${BASE_URL} | students: ${STUDENTS} | hot sections: ${HOT_SECTIONS}`);

  const programsRes = await get('/programs');
  const { data: programs } = await json(programsRes);
  if (!programs?.length) throw new Error('No programs found — seed the database first (npm run db:seed:demo)');
  const program = programs[0];
  log(`Using program ${program.code} (id ${program.id})`);

  log(`Registering ${STUDENTS} student accounts (concurrency ${SETUP_CONCURRENCY})...`);
  const setupStart = Date.now();
  const stamp = Date.now();
  const students = await runWithConcurrency(
    Array.from({ length: STUDENTS }, (_, i) => i),
    SETUP_CONCURRENCY,
    async (i) => {
      const res = await post('/auth/register', {
        firstName: 'Load', lastName: `Test${i}`,
        email: `loadtest-${stamp}-${i}@example.com`,
        password: 'Passw0rd!', programId: program.id, level: 200,
        studentNumber: `LT${stamp}${String(i).padStart(4, '0')}`,
      });
      const body = await json(res);
      if (res.status !== 201) throw new Error(`Registration failed for student ${i}: ${res.status} ${JSON.stringify(body)}`);
      return { token: body.data.accessToken };
    },
  );
  log(`Registered ${students.length} students in ${((Date.now() - setupStart) / 1000).toFixed(1)}s`);

  log(`Granting passing prior results (${PREREQUISITE_COURSE_CODES.join(', ')}) so students are eligible for gated sections...`);
  const registrarLogin = await json(await post('/auth/login', { email: REGISTRAR_EMAIL, password: REGISTRAR_PASSWORD }));
  const registrarToken = registrarLogin.data?.accessToken;
  if (!registrarToken) throw new Error(`Could not log in as registrar (${REGISTRAR_EMAIL}) — is the database seeded with demo data?`);
  const importRows = students.flatMap((s, i) => PREREQUISITE_COURSE_CODES.map((courseCode) => ({
    studentNumber: `LT${stamp}${String(i).padStart(4, '0')}`, courseCode, grade: 'B',
  })));
  const importRes = await json(await post('/results/import', { results: importRows }, registrarToken));
  if (importRes.data?.failed) throw new Error(`Result import had ${importRes.data.failed} failures: ${JSON.stringify(importRes.data.errors.slice(0, 5))}`);
  log(`Imported ${importRes.data?.imported ?? 0} prior results`);

  const available = await json(await get('/registrations/available-courses', students[0].token));
  const eligibleSections = available.data.courses
    .flatMap((c) => c.sections.map((s) => ({ ...s, courseCode: c.code })))
    .filter((s) => s.status === 'eligible')
    .sort((a, b) => a.capacity - b.capacity);
  if (eligibleSections.length < HOT_SECTIONS) {
    throw new Error(`Only ${eligibleSections.length} eligible sections available; need at least ${HOT_SECTIONS}. Seed more demo data or lower HOT_SECTIONS.`);
  }
  const hotSections = eligibleSections.slice(0, HOT_SECTIONS);
  log('Hot sections (smallest capacity = most contended):');
  for (const s of hotSections) log(`  ${s.courseCode} section ${s.sectionCode}: capacity ${s.capacity}, id ${s.id}`);

  const attempts = students.map((student, i) => ({ student, section: hotSections[i % hotSections.length] }));

  log(`Firing ${attempts.length} concurrent registration attempts...`);
  const burstStart = Date.now();
  const outcomes = await Promise.all(attempts.map(async ({ student, section }) => {
    const startedAt = Date.now();
    let status;
    let rule;
    try {
      const res = await post('/registrations/items', { courseSectionId: section.id }, student.token);
      status = res.status;
      if (status === 422) {
        const body = await json(res);
        rule = body.error?.details?.[0]?.rule;
      }
    } catch (err) {
      status = 'NETWORK_ERROR';
      rule = err.message;
    }
    return { sectionId: section.id, status, rule, latencyMs: Date.now() - startedAt };
  }));
  const burstDurationMs = Date.now() - burstStart;

  const latencies = outcomes.map((o) => o.latencyMs).sort((a, b) => a - b);
  console.log('\n=== Latency (ms) ===');
  console.log(`  min ${latencies[0]}  p50 ${percentile(latencies, 0.5)}  p95 ${percentile(latencies, 0.95)}  p99 ${percentile(latencies, 0.99)}  max ${latencies.at(-1)}`);
  console.log(`  total wall-clock: ${(burstDurationMs / 1000).toFixed(2)}s  |  throughput: ${(outcomes.length / (burstDurationMs / 1000)).toFixed(1)} req/s`);

  console.log('\n=== Per-section correctness ===');
  let allPassed = true;
  for (const section of hotSections) {
    const forThisSection = outcomes.filter((o) => o.sectionId === section.id);
    const succeeded = forThisSection.filter((o) => o.status === 201).length;
    const rejectedCapacity = forThisSection.filter((o) => o.status === 422 && o.rule === 'CAPACITY').length;
    const unexpected = forThisSection.filter((o) => o.status !== 201 && !(o.status === 422 && o.rule === 'CAPACITY'));
    const ok = succeeded === section.capacity && unexpected.length === 0;
    allPassed &&= ok;
    console.log(`  ${section.courseCode} (capacity ${section.capacity}): ${forThisSection.length} attempts -> ${succeeded} succeeded, ${rejectedCapacity} correctly rejected (full)${unexpected.length ? `, ${unexpected.length} UNEXPECTED (${[...new Set(unexpected.map((o) => o.status))].join(',')})` : ''} ${ok ? '✔' : '✖ FAIL'}`);
  }

  const serverErrors = outcomes.filter((o) => o.status === 500 || o.status === 'NETWORK_ERROR');
  console.log(`\n=== Verdict: ${allPassed && serverErrors.length === 0 ? 'PASS' : 'FAIL'} ===`);
  if (serverErrors.length) console.log(`  ${serverErrors.length} requests errored unexpectedly (500 or network failure) — this should never happen.`);
  if (!allPassed) console.log('  A section did not land on exactly `capacity` successes — see above.');

  process.exit(allPassed && serverErrors.length === 0 ? 0 : 1);
}

main().catch((err) => { console.error('Load test crashed:', err); process.exit(1); });
