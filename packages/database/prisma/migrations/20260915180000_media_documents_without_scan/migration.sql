-- Documents are no longer virus-scanned (client decision of 15 Sep 2026: no
-- scanner on the server). The two scan columns added by
-- 20260915170000_media_documents earlier the same day are removed.
-- reviewed: both columns were introduced in the same unreleased change, were
-- only ever written on development databases, and no code reads them any more.
ALTER TABLE `media_assets` DROP COLUMN `scanEngine`,
    DROP COLUMN `scannedAt`;
