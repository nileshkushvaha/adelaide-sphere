import { ApiProperty } from '@nestjs/swagger';

export class DashboardMetricDto {
  @ApiProperty({ description: 'Stable key the UI maps to a route and label' }) key!: string;
  @ApiProperty() label!: string;
  @ApiProperty() value!: number;
  @ApiProperty({ description: 'Admin route this metric links to' }) href!: string;
  @ApiProperty({ enum: ['neutral', 'attention', 'critical'], description: 'Severity for presentation only' }) tone!: 'neutral' | 'attention' | 'critical';
}

export class DashboardActivityDto {
  @ApiProperty() id!: string;
  @ApiProperty() action!: string;
  @ApiProperty({ type: String, nullable: true }) actorName!: string | null;
  @ApiProperty({ type: String, nullable: true }) targetType!: string | null;
  @ApiProperty({ type: String, nullable: true }) targetId!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Readable name of the record, where it is not private' }) targetLabel!: string | null;
  @ApiProperty({ description: 'Activity area (ACT 002)' }) category!: string;
  @ApiProperty() domainLabel!: string;
  @ApiProperty({ enum: ['success', 'failure'] }) outcome!: 'success' | 'failure';
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class DashboardScheduledPostDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ format: 'date-time' }) scheduledAt!: string;
  @ApiProperty({ description: 'True when the scheduled time has passed and the article is still not published' }) overdue!: boolean;
}

export class DashboardTrendSeriesDto {
  @ApiProperty({ enum: ['reviews', 'comments', 'enquiries'] }) key!: 'reviews' | 'comments' | 'enquiries';
  @ApiProperty() label!: string;
  @ApiProperty({ description: 'Admin route for this queue' }) href!: string;
  @ApiProperty({ type: [Number], description: 'Submissions per Adelaide calendar day, aligned with `days`' }) points!: number[];
  @ApiProperty({ description: 'Submissions in the current period' }) total!: number;
  @ApiProperty({ description: 'Submissions in the period before it, for the change figure' }) previousTotal!: number;
}

export class DashboardTrendDto {
  @ApiProperty({ type: [String], description: 'Adelaide calendar days (YYYY-MM-DD), oldest first' }) days!: string[];
  @ApiProperty({ type: [DashboardTrendSeriesDto], description: 'Only the queues the caller may moderate or read' }) series!: DashboardTrendSeriesDto[];
}

export class DashboardFigureDto {
  @ApiProperty() key!: string;
  @ApiProperty() label!: string;
  @ApiProperty() value!: number;
  @ApiProperty() href!: string;
  @ApiProperty({ type: Number, nullable: true, description: 'How many were added in the current period, where that is meaningful' }) recent!: number | null;
}

export class DashboardBreakdownItemDto {
  @ApiProperty() key!: string;
  @ApiProperty() label!: string;
  @ApiProperty() value!: number;
}

export class DashboardDto {
  @ApiProperty({ type: [DashboardMetricDto], description: 'Only metrics the signed-in administrator may see' }) metrics!: DashboardMetricDto[];
  @ApiProperty({ type: [DashboardScheduledPostDto], nullable: true, description: 'Upcoming scheduled articles; null without posts.view' }) scheduledPosts!: DashboardScheduledPostDto[] | null;
  @ApiProperty({ type: [DashboardActivityDto], nullable: true, description: 'Recent audit entries, never private message text (SRS ADM 003); null without audit.read' }) activity!: DashboardActivityDto[] | null;
  @ApiProperty({ description: 'Length of the reporting period in days' }) periodDays!: number;
  @ApiProperty({ type: DashboardTrendDto }) trend!: DashboardTrendDto;
  @ApiProperty({ type: [DashboardFigureDto], description: 'Headline totals the caller may see' }) figures!: DashboardFigureDto[];
  @ApiProperty({ type: Number, nullable: true, description: 'Mean of approved ratings to one decimal; null without reviews.view or without approved reviews' }) averageRating!: number | null;
  @ApiProperty({ type: [DashboardBreakdownItemDto], nullable: true, description: 'Approved reviews by rating, five stars first; null without reviews.view' }) ratingDistribution!: DashboardBreakdownItemDto[] | null;
  @ApiProperty({ type: [DashboardBreakdownItemDto], nullable: true, description: 'Enquiries received in the period by delivery state; null without enquiries.read' }) enquiryDelivery!: DashboardBreakdownItemDto[] | null;
  @ApiProperty({ type: [DashboardBreakdownItemDto], nullable: true, description: 'Listings by status; null without listings.read' }) listingStatus!: DashboardBreakdownItemDto[] | null;
  @ApiProperty({ type: [DashboardBreakdownItemDto], nullable: true, description: 'Primary categories with the most published listings; null without listings.read' }) topCategories!: DashboardBreakdownItemDto[] | null;
  @ApiProperty({ format: 'date-time' }) generatedAt!: string;
}
