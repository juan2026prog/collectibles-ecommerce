// Hosted read-only monitor. Four sequential requests; retry only each failed probe once.
import { checkDatabaseStability, probeDatabasePath } from './check_database_stability.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export async function monitorDatabaseStability(fetcher = fetch, pause = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  const initial = await checkDatabaseStability(fetcher);
  const retries = [];
  for (const check of initial.checks) {
    if (check.ok) continue;
    await pause(1000);
    retries.push({ ...await probeDatabasePath(check.path, fetcher), attempt:2 });
  }
  const confirmed = initial.checks.filter(check => !check.ok && !retries.find(retry => retry.path === check.path)?.ok);
  return { checked_at:initial.checked_at, completed_at:new Date().toISOString(), ok:confirmed.length === 0,
    checks:initial.checks, retries, confirmed_failures:confirmed.map(check => check.path),
    recovered_probes:retries.filter(check => check.ok).map(check => check.path),
    limits:['Point-in-time public HTTP checks; CDN hits do not establish direct PostgreSQL availability.',
      'Network/DNS errors require independent corroboration; not automatically classified as a site outage.',
      'No CPU/RAM/IOPS or load/peak measurement. Database internals are sampled separately by private SQL cron.'] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const output = process.argv[2] || 'monitoring-output/stability.json';
  const result = await monitorDatabaseStability();
  await mkdir(new URL('.', pathToFileURL(output)), { recursive:true });
  await writeFile(output, JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result));
  process.exitCode = result.ok ? 0 : 1;
}
