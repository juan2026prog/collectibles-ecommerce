# Collectibles 2026 — AI Part 4: Controlled Automation

Part 4 closes the AI pipeline with controlled actions.

Flow: Part 3 evidence/intelligence -> deterministic policy engine -> durable action queue -> explicit admin approval -> server-side executor -> audit/reconciliation.

Safety posture at launch:
- Production database starts with auto_publish=false and auto_purchase=false.
- Existing AUTOPILOT mode is downgraded to SEMIAUTOMATIC during migration.
- Browser code cannot directly place a Zinc order.
- Even an AUTO_EXECUTE policy result becomes REQUIRES_APPROVAL.
- Approval is a SECURITY DEFINER RPC that independently verifies profiles.is_admin.
- Queue transitions record approved_by, approved_at and an audit event.
- Kill switch, margin/profit, authenticity, seller, stock and opportunity-score rules remain authoritative.
- Part 3 AI score adjustments never bypass deterministic rules.

This is the final architecture layer; enabling unattended external mutations is intentionally not part of the launch configuration.
