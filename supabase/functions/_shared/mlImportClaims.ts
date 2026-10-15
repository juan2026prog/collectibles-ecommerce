// claim_ml_import_items already increments attempts transactionally. Only
// restore that increment for work never started, while this worker still owns it.
export async function releaseUnstartedMlItems(client: any, items: any[], workerId: string) {
  const byAttempt = new Map<number, string[]>();
  for (const item of items) {
    if (!Number.isInteger(item.attempts) || item.attempts < 1) throw new Error('Invalid ML import claim attempt');
    if (!byAttempt.has(item.attempts)) byAttempt.set(item.attempts, []);
    byAttempt.get(item.attempts)!.push(item.id);
  }
  let released = 0;
  for (const [attempts, ids] of byAttempt) {
    const { data, error } = await client.from('ml_import_job_items')
      .update({ status: 'pending', attempts: attempts - 1, locked_by: null, locked_at: null })
      .in('id', ids).eq('status', 'running').eq('locked_by', workerId).eq('attempts', attempts).select('id');
    if (error) throw new Error('ML import claim release unavailable');
    released += data?.length || 0;
  }
  return released;
}
