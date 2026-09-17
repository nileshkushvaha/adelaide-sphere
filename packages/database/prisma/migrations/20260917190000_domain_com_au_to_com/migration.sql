-- The site's domain is adelaidesphere.com; stored content, links and addresses
-- still carrying the earlier `adelaidesphere.com.au` name are rewritten to it
-- (user decision, 17 Sep 2026). The same replacement corrects the `media.`,
-- `www.` and `mail.` hosts and any email address on the old domain.
--
-- Data only: no table, column or row is added, removed or emptied.
--
-- Safe to re-run. Every statement is guarded by a LIKE over the same columns it
-- rewrites, so a database with nothing to change is not touched, and a repeat
-- run (or a re-run after an interrupted one) changes nothing further.
--
-- `REGEXP_REPLACE` matches case-insensitively under utf8mb4_unicode_ci, so
-- `AdelaideSphere.com.au` is corrected too. A JSON column is compared and
-- rewritten as text and parsed back, with the character set and collation
-- stated explicitly: a bare `CAST(json AS CHAR)` takes the client connection's
-- character set (latin1 for the `mysql` CLI's default) and the utf8mb4_bin
-- collation, and MySQL then refuses to mix it with the text columns beside it.
--
-- Deliberately excluded:
--   * visitor-submitted text (reviews, comments, enquiries, abuse reports) —
--     their words are not ours to edit;
--   * logs and history that record what actually happened (audit_logs,
--     email_deliveries and its events, outbox_events, idempotency_records);
--   * admin_users.email, which is a login identity and is changed per person;
--   * encrypted columns (*Encrypted), whose ciphertext cannot be searched — a
--     private enquiry address on the old domain must be re-entered in the admin.
--
-- `updatedAt` is left alone on purpose: the sitemap's last-modified times must
-- keep describing real content changes (SRS SEO 002).

-- settings
UPDATE `settings` SET
    `data` = CAST(REGEXP_REPLACE(CAST(`data` AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com') AS JSON)
WHERE CAST(`data` AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci LIKE '%adelaidesphere.com.au%';

-- static_pages
UPDATE `static_pages` SET
    `title` = REGEXP_REPLACE(`title`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com'),
    `sanitizedBody` = REGEXP_REPLACE(`sanitizedBody`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com'),
    `bodySource` = REGEXP_REPLACE(`bodySource`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com'),
    `seoTitle` = REGEXP_REPLACE(`seoTitle`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com'),
    `seoDescription` = REGEXP_REPLACE(`seoDescription`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com'),
    `seoKeywords` = REGEXP_REPLACE(`seoKeywords`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com'),
    `contactEmail` = REGEXP_REPLACE(`contactEmail`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com'),
    `sections` = CAST(REGEXP_REPLACE(CAST(`sections` AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com') AS JSON)
WHERE CONCAT_WS(' ', `title`, `sanitizedBody`, `bodySource`, `seoTitle`, `seoDescription`, `seoKeywords`, `contactEmail`, CAST(`sections` AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci) LIKE '%adelaidesphere.com.au%';

-- page_autosaves
UPDATE `page_autosaves` SET
    `title` = REGEXP_REPLACE(`title`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com'),
    `sections` = CAST(REGEXP_REPLACE(CAST(`sections` AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com') AS JSON)
WHERE CONCAT_WS(' ', `title`, CAST(`sections` AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci) LIKE '%adelaidesphere.com.au%';

-- posts
UPDATE `posts` SET
    `title` = REGEXP_REPLACE(`title`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com'),
    `excerpt` = REGEXP_REPLACE(`excerpt`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com'),
    `bodyMarkdown` = REGEXP_REPLACE(`bodyMarkdown`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com'),
    `sanitizedBody` = REGEXP_REPLACE(`sanitizedBody`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com'),
    `searchText` = REGEXP_REPLACE(`searchText`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com'),
    `coverAlt` = REGEXP_REPLACE(`coverAlt`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com'),
    `seoTitle` = REGEXP_REPLACE(`seoTitle`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com'),
    `seoDescription` = REGEXP_REPLACE(`seoDescription`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com'),
    `seoKeywords` = REGEXP_REPLACE(`seoKeywords`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com')
WHERE CONCAT_WS(' ', `title`, `excerpt`, `bodyMarkdown`, `sanitizedBody`, `searchText`, `coverAlt`, `seoTitle`, `seoDescription`, `seoKeywords`) LIKE '%adelaidesphere.com.au%';

-- post_autosaves
UPDATE `post_autosaves` SET
    `title` = REGEXP_REPLACE(`title`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com'),
    `excerpt` = REGEXP_REPLACE(`excerpt`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com'),
    `bodySource` = REGEXP_REPLACE(`bodySource`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com')
WHERE CONCAT_WS(' ', `title`, `excerpt`, `bodySource`) LIKE '%adelaidesphere.com.au%';

-- content_revisions
UPDATE `content_revisions` SET
    `title` = REGEXP_REPLACE(`title`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com'),
    `excerpt` = REGEXP_REPLACE(`excerpt`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com'),
    `sanitizedSnapshot` = REGEXP_REPLACE(`sanitizedSnapshot`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com'),
    `bodySource` = REGEXP_REPLACE(`bodySource`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com'),
    `sectionsSnapshot` = CAST(REGEXP_REPLACE(CAST(`sectionsSnapshot` AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com') AS JSON)
WHERE CONCAT_WS(' ', `title`, `excerpt`, `sanitizedSnapshot`, `bodySource`, CAST(`sectionsSnapshot` AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci) LIKE '%adelaidesphere.com.au%';

-- businesses
UPDATE `businesses` SET
    `description` = REGEXP_REPLACE(`description`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com'),
    `publicEmail` = REGEXP_REPLACE(`publicEmail`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com'),
    `publicUrl` = REGEXP_REPLACE(`publicUrl`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com'),
    `contentRightsNote` = REGEXP_REPLACE(`contentRightsNote`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com'),
    `seoTitle` = REGEXP_REPLACE(`seoTitle`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com'),
    `seoDescription` = REGEXP_REPLACE(`seoDescription`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com'),
    `seoKeywords` = REGEXP_REPLACE(`seoKeywords`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com')
WHERE CONCAT_WS(' ', `description`, `publicEmail`, `publicUrl`, `contentRightsNote`, `seoTitle`, `seoDescription`, `seoKeywords`) LIKE '%adelaidesphere.com.au%';

-- business_links
UPDATE `business_links` SET
    `url` = REGEXP_REPLACE(`url`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com'),
    `label` = REGEXP_REPLACE(`label`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com')
WHERE CONCAT_WS(' ', `url`, `label`) LIKE '%adelaidesphere.com.au%';

-- business_media
UPDATE `business_media` SET
    `caption` = REGEXP_REPLACE(`caption`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com'),
    `altOverride` = REGEXP_REPLACE(`altOverride`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com')
WHERE CONCAT_WS(' ', `caption`, `altOverride`) LIKE '%adelaidesphere.com.au%';

-- categories
UPDATE `categories` SET
    `description` = REGEXP_REPLACE(`description`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com'),
    `seoTitle` = REGEXP_REPLACE(`seoTitle`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com'),
    `seoDescription` = REGEXP_REPLACE(`seoDescription`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com'),
    `seoKeywords` = REGEXP_REPLACE(`seoKeywords`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com')
WHERE CONCAT_WS(' ', `description`, `seoTitle`, `seoDescription`, `seoKeywords`) LIKE '%adelaidesphere.com.au%';

-- local_areas
UPDATE `local_areas` SET
    `editorialIntro` = REGEXP_REPLACE(`editorialIntro`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com'),
    `seoTitle` = REGEXP_REPLACE(`seoTitle`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com'),
    `seoDescription` = REGEXP_REPLACE(`seoDescription`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com'),
    `seoKeywords` = REGEXP_REPLACE(`seoKeywords`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com')
WHERE CONCAT_WS(' ', `editorialIntro`, `seoTitle`, `seoDescription`, `seoKeywords`) LIKE '%adelaidesphere.com.au%';

-- blog_categories
UPDATE `blog_categories` SET
    `landingContent` = REGEXP_REPLACE(`landingContent`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com'),
    `seoTitle` = REGEXP_REPLACE(`seoTitle`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com'),
    `seoDescription` = REGEXP_REPLACE(`seoDescription`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com'),
    `seoKeywords` = REGEXP_REPLACE(`seoKeywords`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com')
WHERE CONCAT_WS(' ', `landingContent`, `seoTitle`, `seoDescription`, `seoKeywords`) LIKE '%adelaidesphere.com.au%';

-- blog_tags
UPDATE `blog_tags` SET
    `landingContent` = REGEXP_REPLACE(`landingContent`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com'),
    `seoTitle` = REGEXP_REPLACE(`seoTitle`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com'),
    `seoDescription` = REGEXP_REPLACE(`seoDescription`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com'),
    `seoKeywords` = REGEXP_REPLACE(`seoKeywords`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com')
WHERE CONCAT_WS(' ', `landingContent`, `seoTitle`, `seoDescription`, `seoKeywords`) LIKE '%adelaidesphere.com.au%';

-- authors
UPDATE `authors` SET
    `shortBio` = REGEXP_REPLACE(`shortBio`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com'),
    `bio` = REGEXP_REPLACE(`bio`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com'),
    `publicEmail` = REGEXP_REPLACE(`publicEmail`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com'),
    `websiteUrl` = REGEXP_REPLACE(`websiteUrl`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com'),
    `seoTitle` = REGEXP_REPLACE(`seoTitle`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com'),
    `seoDescription` = REGEXP_REPLACE(`seoDescription`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com'),
    `expertise` = CAST(REGEXP_REPLACE(CAST(`expertise` AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com') AS JSON)
WHERE CONCAT_WS(' ', `shortBio`, `bio`, `publicEmail`, `websiteUrl`, `seoTitle`, `seoDescription`, CAST(`expertise` AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci) LIKE '%adelaidesphere.com.au%';

-- author_links
UPDATE `author_links` SET
    `url` = REGEXP_REPLACE(`url`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com'),
    `label` = REGEXP_REPLACE(`label`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com')
WHERE CONCAT_WS(' ', `url`, `label`) LIKE '%adelaidesphere.com.au%';

-- faqs
UPDATE `faqs` SET
    `question` = REGEXP_REPLACE(`question`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com'),
    `answerHtml` = REGEXP_REPLACE(`answerHtml`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com'),
    `answerSource` = REGEXP_REPLACE(`answerSource`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com')
WHERE CONCAT_WS(' ', `question`, `answerHtml`, `answerSource`) LIKE '%adelaidesphere.com.au%';

-- service_alerts
UPDATE `service_alerts` SET
    `title` = REGEXP_REPLACE(`title`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com'),
    `message` = REGEXP_REPLACE(`message`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com'),
    `linkLabel` = REGEXP_REPLACE(`linkLabel`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com'),
    `linkUrl` = REGEXP_REPLACE(`linkUrl`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com')
WHERE CONCAT_WS(' ', `title`, `message`, `linkLabel`, `linkUrl`) LIKE '%adelaidesphere.com.au%';

-- menu_items
UPDATE `menu_items` SET
    `url` = REGEXP_REPLACE(`url`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com'),
    `label` = REGEXP_REPLACE(`label`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com'),
    `titleAttribute` = REGEXP_REPLACE(`titleAttribute`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com'),
    `description` = REGEXP_REPLACE(`description`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com')
WHERE CONCAT_WS(' ', `url`, `label`, `titleAttribute`, `description`) LIKE '%adelaidesphere.com.au%';

-- redirects
UPDATE `redirects` SET
    `sourcePath` = REGEXP_REPLACE(`sourcePath`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com'),
    `targetPath` = REGEXP_REPLACE(`targetPath`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com')
WHERE CONCAT_WS(' ', `sourcePath`, `targetPath`) LIKE '%adelaidesphere.com.au%';

-- partner_organisations
UPDATE `partner_organisations` SET
    `websiteUrl` = REGEXP_REPLACE(`websiteUrl`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com'),
    `logoAlt` = REGEXP_REPLACE(`logoAlt`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com'),
    `authorisationNote` = REGEXP_REPLACE(`authorisationNote`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com')
WHERE CONCAT_WS(' ', `websiteUrl`, `logoAlt`, `authorisationNote`) LIKE '%adelaidesphere.com.au%';

-- testimonials
UPDATE `testimonials` SET
    `quote` = REGEXP_REPLACE(`quote`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com'),
    `relationship` = REGEXP_REPLACE(`relationship`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com')
WHERE CONCAT_WS(' ', `quote`, `relationship`) LIKE '%adelaidesphere.com.au%';

-- media_assets
UPDATE `media_assets` SET
    `title` = REGEXP_REPLACE(`title`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com'),
    `altText` = REGEXP_REPLACE(`altText`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com'),
    `credit` = REGEXP_REPLACE(`credit`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com'),
    `rightsNote` = REGEXP_REPLACE(`rightsNote`, 'adelaidesphere\\.com\\.au', 'adelaidesphere.com')
WHERE CONCAT_WS(' ', `title`, `altText`, `credit`, `rightsNote`) LIKE '%adelaidesphere.com.au%';
