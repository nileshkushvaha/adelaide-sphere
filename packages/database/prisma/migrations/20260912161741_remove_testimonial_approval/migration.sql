-- Testimonials are entered by administrators who hold the permission to enter
-- them, and publication is decided by status alone. The recorded approval —
-- who approved the quote, when, and how consent was obtained — is therefore
-- removed at the client's instruction (SRS TSTM 002, amended; see the change
-- log entry for this revision).
--
-- reviewed: this drops three columns and the evidence they held. There is no
-- reverse migration that restores the values: re-adding the columns would give
-- every row a NULL approval, not its original record. The client accepted this
-- explicitly, and the residual risk — that the site has no stored evidence a
-- person agreed to be quoted — is recorded in the SRS change log rather than
-- being carried silently.
ALTER TABLE `testimonials` DROP FOREIGN KEY `testimonials_approvedByAdminId_fkey`;

ALTER TABLE `testimonials`
  DROP COLUMN `approvedByAdminId`,
  DROP COLUMN `approvedAt`,
  DROP COLUMN `approvalNote`;
