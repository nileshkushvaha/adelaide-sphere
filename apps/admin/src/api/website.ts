import { httpClient, type HttpClient } from './http-client';
import { queryParams } from './query';
import type { CollectionMeta } from './admins';

/**
 * Website content modules (SRS 1.2 section 26). Public marketing and support
 * content — none of these records grants access to anything.
 */
export type WebsiteContentStatus = 'draft' | 'published';

export interface Faq {
  id: string;
  question: string;
  /** Sanitised server-side; what the public page renders. */
  answerHtml: string;
  /** What the editor wrote; the editable value. */
  answerSource: string;
  answerFormat: 'markdown' | 'html';
  groupName: string | null;
  displayOrder: number;
  status: WebsiteContentStatus;
  publishedAt: string | null;
  version: number;
  updatedAt: string;
}

export interface FaqInput {
  question: string;
  answer: string;
  answerFormat?: 'markdown' | 'html';
  groupName?: string | null;
  displayOrder?: number;
}

export interface FaqListQuery {
  page?: number;
  pageSize?: number;
  status?: WebsiteContentStatus;
  groupName?: string;
  q?: string;
}


export const faqsApi = {
  /** One record by id, whatever page of the list it is on. */
  get(id: string, client: HttpClient = httpClient) {
    return client.request<{ data: Faq }>(`/admin/faqs/${encodeURIComponent(id)}`).then((r) => r.data.data);
  },
  list(query: FaqListQuery = {}, client: HttpClient = httpClient) {
    return client.request<{ data: Faq[]; meta: CollectionMeta }>('/admin/faqs', { query: queryParams({ ...query }) }).then((r) => r.data);
  },
  create(input: FaqInput, client: HttpClient = httpClient) {
    return client.request<{ data: Faq }>('/admin/faqs', { method: 'POST', body: input }).then((r) => r.data.data);
  },
  update(id: string, input: FaqInput & { expectedVersion: number }, client: HttpClient = httpClient) {
    return client.request<{ data: Faq }>(`/admin/faqs/${id}`, { method: 'PUT', body: input }).then((r) => r.data.data);
  },
  setPublished(id: string, published: boolean, expectedVersion: number, client: HttpClient = httpClient) {
    return client.request<{ data: Faq }>(`/admin/faqs/${id}/${published ? 'publish' : 'unpublish'}`, { method: 'POST', body: { expectedVersion } }).then((r) => r.data.data);
  },
  reorder(order: { id: string; displayOrder: number }[], client: HttpClient = httpClient) {
    return client.request('/admin/faqs/reorder', { method: 'POST', body: { order } }).then(() => undefined);
  },
  remove(id: string, client: HttpClient = httpClient) {
    return client.request(`/admin/faqs/${id}`, { method: 'DELETE' }).then(() => undefined);
  },
};

export type AlertSeverity = 'informational' | 'warning' | 'emergency';

export interface ServiceAlert {
  id: string;
  title: string;
  message: string;
  severity: AlertSeverity;
  linkLabel: string | null;
  linkUrl: string | null;
  linkExternal: boolean;
  dismissible: boolean;
  contentVersion: number;
  startsAt: string | null;
  endsAt: string | null;
  priority: number;
  displayOrder: number;
  status: WebsiteContentStatus;
  publishedAt: string | null;
  version: number;
  updatedAt: string;
}

export interface ServiceAlertInput {
  title: string;
  message: string;
  severity: AlertSeverity;
  linkLabel?: string | null;
  linkUrl?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  dismissible?: boolean;
  priority?: number;
  displayOrder?: number;
}

export const serviceAlertsApi = {
  /** One record by id, whatever page of the list it is on. */
  get(id: string, client: HttpClient = httpClient) {
    return client.request<{ data: ServiceAlert }>(`/admin/service-alerts/${encodeURIComponent(id)}`).then((r) => r.data.data);
  },
  list(query: { page?: number; pageSize?: number; status?: WebsiteContentStatus; severity?: AlertSeverity; q?: string } = {}, client: HttpClient = httpClient) {
    return client.request<{ data: ServiceAlert[]; meta: CollectionMeta }>('/admin/service-alerts', { query: queryParams({ ...query }) }).then((r) => r.data);
  },
  create(input: ServiceAlertInput, client: HttpClient = httpClient) {
    return client.request<{ data: ServiceAlert }>('/admin/service-alerts', { method: 'POST', body: input }).then((r) => r.data.data);
  },
  update(id: string, input: ServiceAlertInput & { expectedVersion: number }, client: HttpClient = httpClient) {
    return client.request<{ data: ServiceAlert }>(`/admin/service-alerts/${id}`, { method: 'PUT', body: input }).then((r) => r.data.data);
  },
  setPublished(id: string, published: boolean, expectedVersion: number, client: HttpClient = httpClient) {
    return client.request<{ data: ServiceAlert }>(`/admin/service-alerts/${id}/${published ? 'publish' : 'unpublish'}`, { method: 'POST', body: { expectedVersion } }).then((r) => r.data.data);
  },
  remove(id: string, client: HttpClient = httpClient) {
    return client.request(`/admin/service-alerts/${id}`, { method: 'DELETE' }).then(() => undefined);
  },
};

export interface Testimonial {
  id: string;
  displayName: string;
  relationship: string | null;
  quote: string;
  /** Stars the person gave, 1–5; null when they gave none. */
  rating: number | null;
  businessId: string | null;
  mediaId: string | null;
  /** The image itself, resolved by the API so it can be shown without a lookup. */
  image: { id: string; url: string; alt: string; width: number; height: number } | null;
  /** Recorded consent. Publication is refused while this is null. */
  displayOrder: number;
  status: WebsiteContentStatus;
  publishedAt: string | null;
  version: number;
  updatedAt: string;
}

export interface TestimonialInput {
  displayName: string;
  relationship?: string | null;
  quote: string;
  rating?: number | null;
  businessId?: string | null;
  mediaId?: string | null;
  displayOrder?: number;
}

export interface PartnerOrganisation {
  id: string;
  name: string;
  relationshipLabel: string | null;
  mediaId: string | null;
  /** The image itself, resolved by the API so it can be shown without a lookup. */
  image: { id: string; url: string; alt: string; width: number; height: number } | null;
  logoAlt: string | null;
  websiteUrl: string | null;
  /** Recorded authorisation to display the mark. Publication is refused while this is null. */
  authorisedAt: string | null;
  authorisedByAdminId: string | null;
  authorisationNote: string | null;
  displayOrder: number;
  status: WebsiteContentStatus;
  publishedAt: string | null;
  version: number;
  updatedAt: string;
}

export interface PartnerInput {
  name: string;
  relationshipLabel?: string | null;
  mediaId?: string | null;
  logoAlt?: string | null;
  websiteUrl?: string | null;
  displayOrder?: number;
}

export const testimonialsApi = {
  /** One record by id, whatever page of the list it is on. */
  get(id: string, client: HttpClient = httpClient) {
    return client.request<{ data: Testimonial }>(`/admin/testimonials/${encodeURIComponent(id)}`).then((r) => r.data.data);
  },
  list(query: { page?: number; pageSize?: number; status?: WebsiteContentStatus; q?: string } = {}, client: HttpClient = httpClient) {
    return client.request<{ data: Testimonial[]; meta: CollectionMeta }>('/admin/testimonials', { query: queryParams({ ...query }) }).then((r) => r.data);
  },
  create(input: TestimonialInput, client: HttpClient = httpClient) {
    return client.request<{ data: Testimonial }>('/admin/testimonials', { method: 'POST', body: input }).then((r) => r.data.data);
  },
  update(id: string, input: TestimonialInput & { expectedVersion: number }, client: HttpClient = httpClient) {
    return client.request<{ data: Testimonial }>(`/admin/testimonials/${id}`, { method: 'PUT', body: input }).then((r) => r.data.data);
  },
  setPublished(id: string, published: boolean, expectedVersion: number, client: HttpClient = httpClient) {
    return client.request<{ data: Testimonial }>(`/admin/testimonials/${id}/${published ? 'publish' : 'unpublish'}`, { method: 'POST', body: { expectedVersion } }).then((r) => r.data.data);
  },
  remove(id: string, client: HttpClient = httpClient) {
    return client.request(`/admin/testimonials/${id}`, { method: 'DELETE' }).then(() => undefined);
  },
};

export const partnersApi = {
  /** One record by id, whatever page of the list it is on. */
  get(id: string, client: HttpClient = httpClient) {
    return client.request<{ data: PartnerOrganisation }>(`/admin/partners/${encodeURIComponent(id)}`).then((r) => r.data.data);
  },
  list(query: { page?: number; pageSize?: number; status?: WebsiteContentStatus; q?: string } = {}, client: HttpClient = httpClient) {
    return client.request<{ data: PartnerOrganisation[]; meta: CollectionMeta }>('/admin/partners', { query: queryParams({ ...query }) }).then((r) => r.data);
  },
  create(input: PartnerInput, client: HttpClient = httpClient) {
    return client.request<{ data: PartnerOrganisation }>('/admin/partners', { method: 'POST', body: input }).then((r) => r.data.data);
  },
  update(id: string, input: PartnerInput & { expectedVersion: number }, client: HttpClient = httpClient) {
    return client.request<{ data: PartnerOrganisation }>(`/admin/partners/${id}`, { method: 'PUT', body: input }).then((r) => r.data.data);
  },
  authorise(id: string, expectedVersion: number, note: string | null, client: HttpClient = httpClient) {
    return client.request<{ data: PartnerOrganisation }>(`/admin/partners/${id}/authorise`, { method: 'POST', body: { expectedVersion, note } }).then((r) => r.data.data);
  },
  setPublished(id: string, published: boolean, expectedVersion: number, client: HttpClient = httpClient) {
    return client.request<{ data: PartnerOrganisation }>(`/admin/partners/${id}/${published ? 'publish' : 'unpublish'}`, { method: 'POST', body: { expectedVersion } }).then((r) => r.data.data);
  },
  remove(id: string, client: HttpClient = httpClient) {
    return client.request(`/admin/partners/${id}`, { method: 'DELETE' }).then(() => undefined);
  },
};
