# Restore drill log (SRS BACK 002)

One row per drill. A drill is only complete when every manual step in
`infrastructure/backup/restore-drill.sh` has been carried out and any defect it
found has an owner and a target date.

| Date | Backup point | Restored by | RTO (restore time) | RPO (data gap) | Schema/content checks | Media checksums | Privacy deletions replayed | Outbound mail disabled | Defects raised |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-09-07 | 2026-09-07T00:55Z (development data) | Implementation team | 1 s | ~0 (backup taken minutes before) | 45 tables, 0 collation mismatches, counts verified (3 businesses, 1 article, 3 media assets, 2 administrators, 0 pending outbox events) | not applicable — the development bucket holds three fixtures, checked by hand | none existed at the backup point | yes: no worker was started in the isolated database | none |

## Notes on the 2026-09-07 drill

- **Scope**: a rehearsal against the local Compose MySQL to prove the procedure
  and the scripts, not a production drill. It restored a development database
  into `melbourne_sphere_restore` (the script refuses any name that does not end
  in `_restore`) and dropped it afterwards.
- **Encryption**: the local machine has `gpg` but not `age`, so the scripts now
  use whichever is installed; the drill used a symmetric passphrase generated
  for the run and kept outside the repository.
- **Known gap**: the backup ran with `--no-binlog-position` because the local
  application account has no `RELOAD`/`BINLOG ADMIN` privilege. A production
  backup **must** record the binlog position, or the one-hour RPO in BACK 001
  cannot be met. The production backup account needs those privileges.
- **Still required before launch**: the same drill against a production-shaped
  environment, including media checksum verification, privacy-deletion replay
  and a cache/queue rebuild, with the measured RPO and RTO recorded above.
