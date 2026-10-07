Persist the weather location choice and coordinates in browser storage, and use unit coordinates when unavailable; this prevents repeated permission prompts on the welcome screen.
Keep Reception and Camareiras / Manutenção as separate bonus sectors but capture all three scores in one form, saving both records atomically and calculating final values in the database; this prevents mixed reports, partial submissions, and client-side value tampering.
Group paired bonus evaluations by avaliacao_id and edit them through a role-checked database function; this preserves independent sector calculations and makes legacy Reception-only entries completable without guessing cleaning scores.
Render paired bonus sectors as one evaluation row with Reception and Camareiras / Manutenção stacked; this avoids presenting one guest review as duplicate entries.
Wrap the router in an outer error boundary and throttle stale-asset reloads for one minute; the router's inner boundary ignores falsy thrown values and can otherwise leave a blank screen or enter a reload loop.
Protect manager routes with the reusable role-and-screen guard, and keep `/gestor` strictly manager-only; hidden navigation is not access control.
Keep all financial records and attachments behind database and storage policies restricted to gestor/admin roles; route protection alone is insufficient.
Generate monthly financial entries from recurring templates through the role-checked database function; this keeps generation idempotent and prevents client-side bypasses.
Treat the database as the schedule source of truth, and anchor work cycles to continuous base dates instead of restarting them each month; this preserves patterns across month boundaries.
Publish schedules through manager-only atomic operations, sync freelancer costs by stable schedule identifiers, and expose employee schedules only through a value-free published-schedule RPC; this prevents duplication, partial updates, and financial leakage.
Keep housekeeping load forecasts as immutable manager-only snapshots calculated server-side from Cloudbeds and the published schedule; this preserves audit history and protects operational data.
Model pending additive schedule-benefit columns with a narrow local database contract until their migration is applied; this keeps generated types untouched without bypassing migration order.
