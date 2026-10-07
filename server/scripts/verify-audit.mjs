import { sequelize } from '../src/models/index.js';
import { verify } from '../src/services/audit-maintenance.service.js';

try {
  const { ok, problems, seals, unsealedRows } = await verify();
  console.log(`Checked ${seals} seal(s); ${unsealedRows} recent row(s) are signed but not sealed yet.`);
  if (ok) {
    console.log('Audit log is intact.');
  } else {
    console.error(`\n${problems.length} problem(s) found:`);
    for (const p of problems) console.error(`  [${p.stream}] ${p.message}`);
  }
  await sequelize.close();
  process.exit(ok ? 0 : 1);
} catch (err) {
  console.error('Could not verify the audit log:', err.message);
  process.exit(2);
}
