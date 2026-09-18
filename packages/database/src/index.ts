/**
 * @adelaide-sphere/database — backend-only database access.
 *
 * Import this package from the API and worker only. It must never be bundled
 * into browser code (SRS ARC 002). No client is created at import time.
 * Long-running processes should use DatabaseConnection (managed lifecycle);
 * createDatabaseClient is the low-level factory for scripts.
 */
export { createDatabaseClient } from './client.js';
export type { CreateDatabaseClientOptions, DatabaseClient } from './client.js';
export { DatabaseConnection, DatabaseUnavailableError } from './connection.js';
export type {
  DatabaseCheckResult,
  DatabaseConnectionEvent,
  DatabaseConnectionOptions,
  DatabaseConnectionState,
  MinimalClient,
} from './connection.js';
export { parseMysqlUrl, hasVerifiedTls, MYSQL_SSL_MODES, VERIFIED_SSL_MODES } from './url.js';
export type { MysqlConnectionSettings, MysqlSslMode } from './url.js';
export { sslOptionFor } from './client.js';
export { databaseCode, retryTransaction } from './retry.js';
export { Prisma, AdminUserStatus, AdminTokenPurpose, BusinessStatus, AddressVisibility, HoursMode, HoursExceptionKind, BusinessLinkKind, ReviewStatus, AbuseReportReason, AbuseReportStatus, AbuseReportOutcome, EnquiryKind, EnquiryHandlingStatus, EnquiryDeliveryStatus, OutboxStatus, PostStatus, MediaStatus, MediaVariantKind, RedirectKind, PostBodyFormat, AuthorLinkKind, StaticPageStatus, EmailDeliveryStatus, WebsiteContentStatus, ServiceAlertSeverity, ScheduledRunTrigger, ScheduledRunOutcome, AITopicStatus, AIRunStatus, AIFactCheckStatus, AIOperationKind, AIOperationState, AIApprovalKind, AINoveltyStatus, AISourceTier, AIPacketStatus, AIFetchStatus, AIClaimKind, AIClaimStatus, AIClaimOrigin, AICostState, AIPriceStatus, AIBudgetScope, AIImageMode, AIImageSlot, AIImageJobStatus } from './generated/prisma/client.js';
export type {
  AdminLoginChallenge,
  AdminRecoveryCode,
  AdminRole,
  AdminSession,
  AdminUser,
  AuditLog,
  Business,
  BusinessAddress,
  BusinessCategory,
  BusinessRating,
  BusinessService,
  Category,
  LocalArea,
  Service,
  ServiceSynonym,
  PasswordResetToken,
  Permission,
  Role,
  RolePermission,
  SystemProbe, OpeningInterval, HoursException, BusinessLink, Setting, EmailDelivery, EmailDeliveryEvent, Faq, ServiceAlert, Testimonial, PartnerOrganisation, Review, AbuseReport, IdempotencyRecord, Enquiry, OutboxEvent, ProviderMessageEvent, Post, Author, BlogCategory, BlogTag, PostTag, ContentRevision, Comment, MediaAsset, MediaVariant, BusinessMedia, Redirect, AuthorLink, StaticPage, FeaturedPlacement, ScheduledTaskRun, ScheduledTaskState } from './generated/prisma/client.js';
