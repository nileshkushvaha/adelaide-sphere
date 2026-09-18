import { screen, waitFor, within } from "@testing-library/react";
import {
  AiFactReviewPage,
  AiOverviewPage,
  AiTopicDetailPage,
  AiTopicQueuePage,
} from "./AiContentPages";
import { ResearchSourcesPage } from "./ResearchSourcesPage";
import { PricingPage } from "./PricingPage";
import { AiSettingsPage } from "./AiSettingsPage";
import { AdminShell } from "@/layouts/AdminShell";
import {
  providerWithPermissions,
  renderWithProviders,
  user,
} from "@/test/render";
import { ApiError } from "@/api/errors";
import { aiContentApi } from "@/api/ai-content";
import type * as AiContentModule from "@/api/ai-content";
import { settingsGroupsApi } from "@/api/settings-groups";

vi.mock("@/api/ai-content", async (importOriginal) => ({
  ...(await importOriginal<typeof AiContentModule>()),
  aiContentApi: {
    list: vi.fn(),
    create: vi.fn(),
    detail: vi.fn(),
    priority: vi.fn(),
    action: vi.fn(),
    overview: vi.fn(),
    research: vi.fn(),
    checkNovelty: vi.fn(),
    setSources: vi.fn(),
    researchAction: vi.fn(),
    confirmFacts: vi.fn(),
    resolveClaim: vi.fn(),
    addClaim: vi.fn(),
    discover: vi.fn(),
    discovery: vi.fn(),
    sources: vi.fn(),
    createSource: vi.fn(),
    updateSource: vi.fn(),
    setArticleSettings: vi.fn(),
    generate: vi.fn(),
    generation: vi.fn(),
    approve: vi.fn(),
    recheckFacts: vi.fn(),
    applyProposal: vi.fn(),
    resolveOperation: vi.fn(),
    budget: vi.fn(),
    resumePaidCalls: vi.fn(),
    prices: vi.fn(),
    proposePrice: vi.fn(),
    approvePrice: vi.fn(),
    images: vi.fn(),
    generateImage: vi.fn(),
    approveImage: vi.fn(),
    rejectImage: vi.fn(),
  },
}));
vi.mock("@/api/blog", () => ({
  blogApi: () => ({ listTerms: vi.fn(async () => [{ id: "cmcategoryabcdefghijklmn", name: "Cafes" }]), listAuthors: vi.fn(async () => []) }),
}));
vi.mock("@/api/settings-groups", () => ({
  settingsGroupsApi: { registry: vi.fn(), values: vi.fn(), update: vi.fn() },
}));
const permissions = [
  "ai_content.view",
  "ai_content.manage_topics",
  "ai_content.configure",
  "ai_content.review",
  "ai_content.generate",
  "ai_content.approve",
  "posts.update",
];
const topic = {
  id: "cmabcdefghijklmnopqrstuv",
  title: "Adelaide cafe guide",
  brief: null,
  priority: 0,
  source: "manual" as const,
  status: "queued" as const,
  reason: null,
  version: 1,
  createdByAdminId: "a1",
  createdAt: "2026-09-18T00:00:00.000Z",
  updatedAt: "2026-09-18T00:00:00.000Z",
  postId: null,
  humanModifiedAt: null,
  failureStage: null,
  failureCode: null,
  selectionReason: "Manual topic",
  noveltyStatus: "clear" as const,
  noveltyCheckedAt: null,
  noveltyDetail: [],
  researchUrls: [],
  topicApprovedAt: null,
  topicApprovedByAdminId: null,
  followUpOfPostId: null,
  followUpReason: null,
  categoryId: null,
  imageMode: null,
};
const budget = {
  enabled: true,
  currency: "USD",
  warningPercent: 70,
  workflowLimitMicros: 250_000,
  day: { period: "2026-09-18", reservedMicros: 0, settledMicros: 380_000, limitMicros: 500_000, warning: true },
  month: { period: "2026-09", reservedMicros: 0, settledMicros: 380_000, limitMicros: 10_000_000, warning: false },
  imageDay: { period: "2026-09-18", reservedMicros: 0, settledMicros: 0, limitMicros: 0, warning: false },
  imageMonth: { period: "2026-09", reservedMicros: 0, settledMicros: 0, limitMicros: 0, warning: false },
  uncertainOperations: 0,
  uncertainMicros: 0,
  outcomeUnknownOperations: 0,
  paidCallsHaltedAt: null as string | null,
  paidHaltReason: null as string | null,
};
const options = { authProvider: providerWithPermissions(permissions) };
const imagePost = { id: "cmpostabcdefghijklmnopqr", version: 4, coverMediaId: null, coverAlt: null };
const noImages = { globalMode: "hybrid" as const, override: null, brief: null, size: "1536x1024", quality: "medium", disclosureText: "Illustrative image created with AI.", post: null, jobs: [] };
const storedImage = {
  id: "cmimagejobabcdefghijklmn",
  imageVersion: 1,
  status: "stored" as const,
  prompt: "A generic café counter",
  model: "gpt-image-2.5-flare",
  size: "1536x1024",
  quality: "medium",
  width: 1536,
  height: 1024,
  disclosureText: "Illustrative image created with AI.",
  approvedAt: null,
  reviewNote: null,
  failureCode: null,
  createdAt: "2026-09-19T01:00:00.000Z",
  operationId: "cmimageopabcdefghijklmno",
  operation: { state: "succeeded", costState: "settled" as const, reservedMicros: 60_000, settledMicros: 48_000, errorClass: null, priceSchedule: { version: "openai-gpt-image-2.5-flare-v1", currency: "USD" } },
  media: { id: "cmmediaabcdefghijklmnopq", status: "ready" as const, rejectionReason: null, previewUrl: "http://127.0.0.1:9020/adelaide-sphere-media/media/x/card.webp" },
  isFeatured: false,
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(aiContentApi.research).mockResolvedValue({ packets: [], packet: null });
  vi.mocked(aiContentApi.generation).mockResolvedValue({ runs: [], operations: [], approvals: [], post: null, factReview: null });
  vi.mocked(aiContentApi.budget).mockResolvedValue(budget);
  vi.mocked(aiContentApi.images).mockResolvedValue(noImages);
  vi.mocked(aiContentApi.list).mockResolvedValue({
    data: [topic],
    meta: { total: 1, page: 1, pageSize: 20 },
  });
  vi.mocked(aiContentApi.detail).mockResolvedValue({ ...topic, version: 2 });
  vi.mocked(aiContentApi.action).mockResolvedValue({ ...topic, version: 2 });
  vi.mocked(aiContentApi.priority).mockResolvedValue({ ...topic, version: 2 });
  vi.mocked(aiContentApi.create).mockResolvedValue(topic);
  vi.mocked(aiContentApi.overview).mockResolvedValue({
    enabled: false,
    executionActive: false,
    generationAvailable: false,
    counts: {
      queued: 1,
      paused: 0,
      researching: 0,
      generating: 0,
      needs_fact_review: 0,
      ready_for_review: 0,
      approved: 0,
      scheduled: 0,
      published: 0,
      failed: 0,
      cancelled: 0,
      rejected: 0,
    },
  });
});
it("shows disabled defaults and real queue counts without generation or cost statistics", async () => {
  renderWithProviders(<AiOverviewPage />, options);
  expect(await screen.findByText("Disabled")).toBeInTheDocument();
  expect(screen.getByText("Inactive")).toBeInTheDocument();
  expect(screen.getByText(/never publish without approval/)).toBeInTheDocument();
  expect(screen.getByText("Not available")).toBeInTheDocument();
  expect(screen.queryByText(/tokens used/i)).not.toBeInTheDocument();
});
it("creates a manual topic and retains the same request key/input on an ambiguous response retry", async () => {
  const ue = user();
  vi.mocked(aiContentApi.create).mockRejectedValueOnce(
    new ApiError({
      kind: "network",
      status: null,
      code: null,
      userMessage: "Response was lost",
    }),
  );
  renderWithProviders(<AiTopicQueuePage />, options);
  await ue.type(
    await screen.findByLabelText("Title / topic"),
    "A new city guide",
  );
  await ue.click(screen.getByRole("button", { name: "Create topic" }));
  expect(await screen.findByText("Response was lost")).toBeInTheDocument();
  expect(screen.getByLabelText("Title / topic")).toHaveValue(
    "A new city guide",
  );
  await ue.click(screen.getByRole("button", { name: "Create topic" }));
  await waitFor(() => expect(aiContentApi.create).toHaveBeenCalledTimes(2));
  const calls = vi.mocked(aiContentApi.create).mock.calls;
  expect(calls[0]![1]).toBe(calls[1]![1]);
  expect(calls[0]![0]).toMatchObject({
    title: "A new city guide",
    priority: 0,
  });
});
it("reprioritizes with expected version and keeps new input through a conflict", async () => {
  const ue = user();
  vi.mocked(aiContentApi.priority).mockRejectedValueOnce(
    new ApiError({
      kind: "conflict",
      status: 409,
      code: "STALE_VERSION",
      userMessage: "Topic changed",
    }),
  );
  renderWithProviders(<AiTopicQueuePage />, options);
  await ue.click(await screen.findByRole("button", { name: "Reprioritize" }));
  const dialog = await screen.findByRole("dialog");
  await ue.clear(within(dialog).getByLabelText("New priority"));
  await ue.type(within(dialog).getByLabelText("New priority"), "20");
  await ue.click(
    within(dialog).getByRole("button", { name: "Confirm change" }),
  );
  expect(await screen.findByText("Topic changed")).toBeInTheDocument();
  expect(within(dialog).getByLabelText("New priority")).toHaveValue("20");
  await ue.click(
    within(dialog).getByRole("button", {
      name: "Load latest version (keep input)",
    }),
  );
  await waitFor(() =>
    expect(
      within(dialog).getByRole("button", { name: "Confirm change" }),
    ).toBeEnabled(),
  );
  await ue.click(
    within(dialog).getByRole("button", { name: "Confirm change" }),
  );
  await waitFor(() =>
    expect(aiContentApi.priority).toHaveBeenLastCalledWith(
      expect.objectContaining({ version: 2 }),
      20,
    ),
  );
});
it("pauses only through an explicit confirmed action", async () => {
  const ue = user();
  renderWithProviders(<AiTopicQueuePage />, options);
  await ue.click(await screen.findByRole("button", { name: "Pause" }));
  await ue.click(
    within(await screen.findByRole("dialog")).getByRole("button", {
      name: "Confirm change",
    }),
  );
  await waitFor(() =>
    expect(aiContentApi.action).toHaveBeenCalledWith(topic, "pause", undefined),
  );
  expect(await screen.findByText("Topic updated.")).toBeInTheDocument();
});
it("requires a reason and confirmation to cancel", async () => {
  const ue = user();
  renderWithProviders(<AiTopicQueuePage />, options);
  await ue.click(await screen.findByRole("button", { name: "Cancel" }));
  const dialog = await screen.findByRole("dialog");
  await ue.click(
    within(dialog).getByRole("button", { name: "Confirm change" }),
  );
  await screen.findByText(/Please enter Reason/i);
  expect(aiContentApi.action).not.toHaveBeenCalled();
  await ue.type(within(dialog).getByLabelText("Reason"), "Not needed");
  await ue.click(
    within(dialog).getByRole("button", { name: "Confirm change" }),
  );
  await waitFor(() =>
    expect(aiContentApi.action).toHaveBeenLastCalledWith(
      topic,
      "cancel",
      "Not needed",
    ),
  );
});
it("requires the declared navigation permissions", async () => {
  renderWithProviders(
    <AdminShell>
      <p>content</p>
    </AdminShell>,
    { authProvider: providerWithPermissions(["ai_content.view"]) },
  );
  expect(
    await screen.findByRole("link", { name: "AI Content" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Topic Queue" })).toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: "AI Settings" }),
  ).not.toBeInTheDocument();
});
it("does not offer topic mutations without manage permission", async () => {
  renderWithProviders(<AiTopicQueuePage />, {
    authProvider: providerWithPermissions(["ai_content.view"]),
  });
  await screen.findByRole("link", { name: topic.title });
  expect(
    screen.queryByRole("button", { name: "Create topic" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Pause" }),
  ).not.toBeInTheDocument();
});
it("saves owned settings with the loaded version and retains unsaved changes after a conflict", async () => {
  const ue = user();
  vi.mocked(settingsGroupsApi.registry).mockResolvedValue([
    {
      key: "ai_content",
      label: "AI Content",
      description: "",
      owner: "AiContentModule",
      viewPermission: "ai_content.configure",
      updatePermission: "ai_content.configure",
      note: null,
      settings: [
        {
          key: "enabled",
          label: "Configured enabled",
          description: "Execution remains inactive",
          type: "boolean",
          default: false,
          bounds: {},
          visibility: "private",
          effect: "runtime",
          viewPermission: "ai_content.configure",
          updatePermission: "ai_content.configure",
          invalidates: [],
          unit: null,
          limitNote: null,
          consequence: null,
        },
      ],
    },
  ]);
  vi.mocked(settingsGroupsApi.values).mockResolvedValue({
    group: "ai_content",
    values: { enabled: false },
    version: 4,
    updatedAt: topic.createdAt,
    updatedByAdminId: null,
  });
  vi.mocked(settingsGroupsApi.update).mockRejectedValue(
    new ApiError({
      kind: "conflict",
      status: 409,
      code: "STALE_VERSION",
      userMessage: "Settings changed",
    }),
  );
  renderWithProviders(<AiSettingsPage />, options);
  const toggle = await screen.findByRole("switch");
  expect(toggle).not.toBeChecked();
  await ue.click(toggle);
  await ue.click(screen.getByRole("button", { name: "Save AI settings" }));
  expect(await screen.findByText("Settings changed")).toBeInTheDocument();
  expect(toggle).toBeChecked();
  expect(settingsGroupsApi.update).toHaveBeenCalledWith("ai-content", 4, {
    enabled: true,
  });
});
it("shows a linked article, sticky human-edit protection and a failure stage on topic detail", async () => {
  vi.mocked(aiContentApi.detail).mockResolvedValue({
    ...topic,
    status: "failed",
    postId: "cmpostabcdefghijklmnopqr",
    humanModifiedAt: "2026-09-18T01:00:00.000Z",
    failureStage: "application",
    failureCode: "slug_conflict",
    version: 5,
  });
  renderWithProviders(<AiTopicDetailPage />, {
    ...options,
    initialEntries: [`/admin/ai-content/topics/${topic.id}`],
    routePath: "/ai-content/topics/:id",
  });
  expect(await screen.findByText("Failed")).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Open the article" }),
  ).toHaveAttribute("href", "/admin/posts/cmpostabcdefghijklmnopqr");
  expect(
    screen.getByText(/Automation will not change this article/),
  ).toBeInTheDocument();
  expect(screen.getByText("application: slug_conflict")).toBeInTheDocument();
});

const packet = {
  id: "cmpacketabcdefghijklmnop",
  version: 1,
  status: "needs_fact_review" as const,
  reasons: ["1 material claim need fact review"],
  changes: null,
  freshUntil: null,
  evaluatedAt: "2026-09-18T01:00:00.000Z",
  createdAt: "2026-09-18T00:59:00.000Z",
  context: [],
  evidence: [
    { id: "cmevidenceabcdefghijklmn", url: "https://cafe.example.org/", finalUrl: null, host: "cafe.example.org", tier: "official_business" as const, fetchStatus: "ok", httpStatus: 200, contentHash: "a".repeat(64), title: "Example Cafe", sourceDate: null, fetchedAt: "2026-09-18T00:59:30.000Z", textPreview: "Open weekdays", textLength: 13 },
  ],
  claims: [
    { id: "cmclaimabcdefghijklmnopq", kind: "opening_hours", subject: "Example Cafe", value: "Mo-Fr 07:00-15:00", material: true, origin: "extracted" as const, status: "conflicting" as const, reason: "Credible sources disagree", validUntil: null, freshUntil: null, excluded: false, accepted: false, resolutionNote: null, version: 3, sources: [{ evidenceId: "cmevidenceabcdefghijklmn", excerpt: "openingHours: Mo-Fr 07:00-15:00", location: "json-ld" }] },
  ],
};
it("shows evidence and claims for fact review and sends an evidence-backed decision with the claim version", async () => {
  const ue = user();
  vi.mocked(aiContentApi.detail).mockResolvedValue({ ...topic, status: "needs_fact_review", noveltyStatus: "clear", researchUrls: [{ url: "https://cafe.example.org/" }], version: 4 });
  vi.mocked(aiContentApi.research).mockResolvedValue({ packets: [{ id: packet.id, version: 1, status: packet.status, createdAt: packet.createdAt }], packet });
  vi.mocked(aiContentApi.resolveClaim).mockResolvedValue({ status: "verified" });
  renderWithProviders(<AiTopicDetailPage />, { ...options, initialEntries: [`/admin/ai-content/topics/${topic.id}`], routePath: "/ai-content/topics/:id" });
  expect(await screen.findByText("Mo-Fr 07:00-15:00")).toBeInTheDocument();
  expect(screen.getByText("conflicting")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Example Cafe" })).toHaveAttribute("rel", "noopener noreferrer nofollow");
  await ue.click(screen.getByRole("button", { name: "Accept" }));
  const dialog = await screen.findByRole("dialog");
  await ue.type(within(dialog).getByRole("textbox", { name: "Reason" }), "The venue site is primary");
  await ue.click(within(dialog).getByRole("button", { name: "Accept" }));
  await waitFor(() => expect(aiContentApi.resolveClaim).toHaveBeenCalledWith(expect.objectContaining({ id: packet.claims[0]!.id, version: 3 }), "accept", "The venue site is primary"));
});
it("shows the server's novelty refusal when approving research, keeping the topic as it was", async () => {
  const ue = user();
  vi.mocked(aiContentApi.detail).mockResolvedValue({ ...topic, researchUrls: [{ url: "https://cafe.example.org/" }], version: 2 });
  vi.mocked(aiContentApi.researchAction).mockRejectedValue(
    new ApiError({ kind: "conflict", status: 409, code: "NOVELTY_DUPLICATE", userMessage: "This topic duplicates existing content or another topic.", fields: { novelty: ["Best coffee in Norwood (post published: same topic)"] } }),
  );
  renderWithProviders(<AiTopicDetailPage />, { ...options, initialEntries: [`/admin/ai-content/topics/${topic.id}`], routePath: "/ai-content/topics/:id" });
  await ue.click(await screen.findByRole("button", { name: "Approve topic for research" }));
  expect(await screen.findByText("This topic duplicates existing content or another topic.")).toBeInTheDocument();
  expect(screen.getByText("Best coffee in Norwood (post published: same topic)")).toBeInTheDocument();
  expect(aiContentApi.researchAction).toHaveBeenCalledWith(expect.objectContaining({ version: 2 }), "approve", undefined);
});
it("hides research actions from an administrator without review permission", async () => {
  vi.mocked(aiContentApi.detail).mockResolvedValue({ ...topic, researchUrls: [{ url: "https://cafe.example.org/" }] });
  renderWithProviders(<AiTopicDetailPage />, { authProvider: providerWithPermissions(["ai_content.view"]), initialEntries: [`/admin/ai-content/topics/${topic.id}`], routePath: "/ai-content/topics/:id" });
  expect(await screen.findByText("Research and fact review")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Approve topic for research" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Save sources" })).not.toBeInTheDocument();
});
it("opens the fact review queue filtered to topics that need a decision", async () => {
  renderWithProviders(<AiFactReviewPage />, options);
  await waitFor(() => expect(aiContentApi.list).toHaveBeenCalledWith(expect.objectContaining({ status: "needs_fact_review" }), expect.anything()));
  expect(screen.getByRole("heading", { name: "Fact review" })).toBeInTheDocument();
});
it("adds a research source and shows the server's validation on the field", async () => {
  const ue = user();
  vi.mocked(aiContentApi.sources).mockResolvedValue([]);
  vi.mocked(aiContentApi.createSource).mockRejectedValue(new ApiError({ kind: "validation", status: 400, code: "VALIDATION_ERROR", userMessage: "Some fields are invalid", fields: { host: ["Enter a public host name such as example.org"] } }));
  renderWithProviders(<ResearchSourcesPage />, options);
  await ue.type(await screen.findByLabelText("Host"), "localhost");
  await ue.type(screen.getByLabelText("Name"), "Local");
  await ue.click(screen.getByLabelText("Kind of source"));
  await ue.click(await screen.findByText("Official: business, venue or organiser"));
  await ue.click(screen.getByRole("button", { name: "Add source" }));
  expect(await screen.findByText("Enter a public host name such as example.org")).toBeInTheDocument();
});

it("requests a draft with one idempotency key that survives a lost response, and approves the exact article version", async () => {
  const ue = user();
  vi.mocked(aiContentApi.detail).mockResolvedValue({ ...topic, status: "researching", categoryId: "cmcategoryabcdefghijklmn", version: 7 });
  vi.mocked(aiContentApi.generate).mockRejectedValueOnce(new ApiError({ kind: "network", status: null, code: null, userMessage: "Response was lost" })).mockResolvedValueOnce({ operationId: "op", created: false, topic });
  renderWithProviders(<AiTopicDetailPage />, { ...options, initialEntries: [`/admin/ai-content/topics/${topic.id}`], routePath: "/ai-content/topics/:id" });
  await ue.click(await screen.findByRole("button", { name: "Generate draft" }));
  expect(await screen.findByText("Response was lost")).toBeInTheDocument();
  // Retry once the button has left its loading state (antd's transition confuses the style-based role query).
  const retry = screen.getByText("Generate draft").closest("button")!;
  await waitFor(() => expect(retry).toBeEnabled());
  await ue.click(retry);
  await waitFor(() => expect(aiContentApi.generate).toHaveBeenCalledTimes(2));
  const keys = vi.mocked(aiContentApi.generate).mock.calls.map((c) => c[2]);
  expect(keys[0]).toBe(keys[1]);
});
it("approves the article version the reviewer is looking at, and shows unsupported facts the server lists", async () => {
  const ue = user();
  vi.mocked(aiContentApi.detail).mockResolvedValue({ ...topic, status: "ready_for_review", postId: "cmpostabcdefghijklmnopqr", version: 9 });
  vi.mocked(aiContentApi.generation).mockResolvedValue({
    runs: [],
    operations: [{ id: "cmopabcdefghijklmnopqrst", kind: "generate", scope: "full", state: "succeeded", attempts: 1, provider: "openai", model: "gpt-5.6-terra", providerPhase: "done", resultCode: "generated:covered", errorClass: null, estimatedMaxMicros: 120_000, reservedMicros: 120_000, settledMicros: 38_466, costState: "settled", inputTokens: 1233, cachedInputTokens: 0, outputTokens: 3000, reasoningTokens: 1000, resolutionNote: null, createdAt: "2026-09-18T01:00:00.000Z", priceSchedule: { version: "openai-gpt-5.6-terra-2026-07-30", currency: "USD" } }],
    approvals: [],
    post: { id: "cmpostabcdefghijklmnopqr", version: 4, title: "Example Cafe in Norwood", excerpt: "x", seoTitle: null, seoDescription: null, seoKeywords: null, status: "draft", firstPublishedAt: null },
    factReview: { violations: [], flags: [] },
  });
  vi.mocked(aiContentApi.approve).mockRejectedValue(new ApiError({ kind: "conflict", status: 409, code: "UNSUPPORTED_FACTS", userMessage: "Some facts in the article are not supported by verified evidence.", fields: { facts: ['body.3: "1999" (unsupported value)'] } }));
  renderWithProviders(<AiTopicDetailPage />, { ...options, initialEntries: [`/admin/ai-content/topics/${topic.id}`], routePath: "/ai-content/topics/:id" });
  expect(await screen.findByText(/settled: USD 0\.04/)).toBeInTheDocument();
  await ue.click(screen.getByRole("button", { name: "Approve version 4" }));
  expect(await screen.findByText('body.3: "1999" (unsupported value)')).toBeInTheDocument();
  expect(aiContentApi.approve).toHaveBeenCalledWith(expect.objectContaining({ version: 9 }), 4, undefined);
});
it("asks a reviewer to confirm the facts of the exact version, shows possible names, and needs a note", async () => {
  const ue = user();
  vi.mocked(aiContentApi.detail).mockResolvedValue({ ...topic, status: "needs_fact_review", postId: "cmpostabcdefghijklmnopqr", version: 9 });
  vi.mocked(aiContentApi.generation).mockResolvedValue({
    runs: [],
    operations: [],
    approvals: [],
    post: { id: "cmpostabcdefghijklmnopqr", version: 4, title: "Example Cafe in Norwood", excerpt: "x", seoTitle: null, seoDescription: null, seoKeywords: null, status: "draft", firstPublishedAt: null },
    factReview: { violations: [], flags: [{ field: "body.2", token: "Zorbo", reason: "possible_name" }] },
  });
  vi.mocked(aiContentApi.confirmFacts).mockResolvedValue({ status: "ready_for_review" });
  renderWithProviders(<AiTopicDetailPage />, { ...options, initialEntries: [`/admin/ai-content/topics/${topic.id}`], routePath: "/ai-content/topics/:id" });
  expect(await screen.findByText("Zorbo (body.2)")).toBeInTheDocument();
  const confirm = screen.getByText("Confirm facts of version 4").closest("button")!;
  expect(confirm).toBeDisabled();
  expect(screen.queryByRole("button", { name: /Approve version/ })).not.toBeInTheDocument();
  await ue.type(screen.getByLabelText("Fact check note"), "Checked hours and address against the council page");
  await waitFor(() => expect(confirm).toBeEnabled());
  await ue.click(confirm);
  await waitFor(() => expect(aiContentApi.confirmFacts).toHaveBeenCalledWith(expect.objectContaining({ version: 9 }), 4, "Checked hours and address against the council page"));
});
it("generates a featured image only after confirming the cost, with one request key per intended image", async () => {
  const ue = user();
  vi.mocked(aiContentApi.detail).mockResolvedValue({ ...topic, status: "ready_for_review", postId: imagePost.id, version: 9 });
  vi.mocked(aiContentApi.images).mockResolvedValue({ ...noImages, brief: { prompt: "A generic café counter with pastries", altDraft: "Illustration of a cafe counter" }, post: imagePost });
  vi.mocked(aiContentApi.generateImage).mockResolvedValue({ operationId: "cmop", jobId: "cmjob", created: true });
  renderWithProviders(<AiTopicDetailPage />, { ...options, initialEntries: [`/admin/ai-content/topics/${topic.id}`], routePath: "/ai-content/topics/:id" });
  expect(await screen.findByDisplayValue("A generic café counter with pastries")).toBeInTheDocument();
  expect(screen.getByText("Alt draft (written before any image exists)")).toBeInTheDocument();
  await ue.click(screen.getByRole("button", { name: "Generate image" }));
  expect(aiContentApi.generateImage).not.toHaveBeenCalled();
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByText(/reserved from the image budget/)).toBeInTheDocument();
  await ue.click(within(dialog).getByRole("button", { name: "Generate image" }));
  await waitFor(() => expect(aiContentApi.generateImage).toHaveBeenCalledWith(expect.objectContaining({ version: 9 }), expect.stringMatching(/^[0-9a-f-]{36}$/), undefined));
});
it("offers no Generate image action in manual mode, and holds a request whose outcome is unknown", async () => {
  vi.mocked(aiContentApi.detail).mockResolvedValue({ ...topic, status: "ready_for_review", postId: imagePost.id, version: 9, imageMode: "manual" });
  vi.mocked(aiContentApi.images).mockResolvedValue({ ...noImages, override: "manual", post: imagePost, jobs: [{ ...storedImage, status: "outcome_unknown", media: null, operation: { ...storedImage.operation, costState: "reserved", settledMicros: null } }] });
  renderWithProviders(<AiTopicDetailPage />, { ...options, initialEntries: [`/admin/ai-content/topics/${topic.id}`], routePath: "/ai-content/topics/:id" });
  expect(await screen.findByText("The provider may have made this image")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Generate/ })).not.toBeInTheDocument();
  expect(screen.getByText("up to USD 0.06 reserved")).toBeInTheDocument();
});
it("approves the actual image only with alt text written from it, for the article version shown", async () => {
  const ue = user();
  vi.mocked(aiContentApi.detail).mockResolvedValue({ ...topic, status: "ready_for_review", postId: imagePost.id, version: 9 });
  vi.mocked(aiContentApi.images).mockResolvedValue({ ...noImages, post: imagePost, jobs: [storedImage] });
  vi.mocked(aiContentApi.approveImage).mockResolvedValue({ postId: imagePost.id, postVersion: 5 });
  renderWithProviders(<AiTopicDetailPage />, { ...options, initialEntries: [`/admin/ai-content/topics/${topic.id}`], routePath: "/ai-content/topics/:id" });
  expect(await screen.findByAltText("Generated image 1, awaiting description")).toBeInTheDocument();
  expect(screen.getByText("USD 0.05 (settled)")).toBeInTheDocument();
  const approve = screen.getByText("Approve and use as featured image").closest("button")!;
  expect(approve).toBeDisabled();
  await ue.type(screen.getByLabelText("Alt text for image 1"), "Illustration of a café counter with a coffee machine and pastries");
  expect(approve).toBeDisabled();
  await ue.click(screen.getByRole("checkbox", { name: /from the image above/ }));
  await waitFor(() => expect(approve).toBeEnabled());
  await ue.click(approve);
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByText(/Facts and approval must be confirmed again/)).toBeInTheDocument();
  await ue.click(within(dialog).getByRole("button", { name: "Approve and use" }));
  await waitFor(() => expect(aiContentApi.approveImage).toHaveBeenCalledWith(storedImage.id, 4, "Illustration of a café counter with a coffee machine and pastries"));
});
it("shows a paid-call halt with its reason and the over-threshold warning", async () => {
  vi.mocked(aiContentApi.budget).mockResolvedValue({ ...budget, paidCallsHaltedAt: "2026-09-18T01:00:00.000Z", paidHaltReason: "provider reported model gpt-5.6-sol, approved gpt-5.6-terra" });
  vi.mocked(aiContentApi.prices).mockResolvedValue([]);
  renderWithProviders(<PricingPage />, options);
  expect(await screen.findByText("Paid calls are halted")).toBeInTheDocument();
  expect(screen.getByText(/gpt-5.6-sol/)).toBeInTheDocument();
  expect(screen.getByText("over 70%")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Resume after reconciling" })).toBeInTheDocument();
});
it("approves a proposed price only after confirmation", async () => {
  const ue = user();
  vi.mocked(aiContentApi.prices).mockResolvedValue([{ id: "cmpriceabcdefghijklmnopq", version: "openai-gpt-5.6-terra-2026-07-30", provider: "openai", model: "gpt-5.6-terra", serviceTier: "default", currency: "USD", inputMicrosPerMTok: 2_000_000, cachedInputMicrosPerMTok: 200_000, outputMicrosPerMTok: 12_000_000, longContextThresholdTokens: 272000, sourceUrl: "https://developers.openai.com/api/docs/pricing", effectiveFrom: "2026-07-30T00:00:00.000Z", status: "proposed", approvedAt: null }]);
  vi.mocked(aiContentApi.approvePrice).mockResolvedValue({} as never);
  renderWithProviders(<PricingPage />, options);
  expect(await screen.findByText("USD 2.00 / USD 0.20 / USD 12.00")).toBeInTheDocument();
  await ue.click(screen.getByRole("button", { name: "Approve" }));
  expect(aiContentApi.approvePrice).not.toHaveBeenCalled();
  const dialog = await screen.findByRole("dialog");
  await ue.click(within(dialog).getByRole("button", { name: "OK" }));
  await waitFor(() => expect(aiContentApi.approvePrice).toHaveBeenCalledWith("cmpriceabcdefghijklmnopq"));
});
