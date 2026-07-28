import { describe, expect, it } from "vitest";
import {
  buildPublishQueue,
  canStartPublishing,
  describePublishBlockReason,
  describeScheduleValidationErrors,
  GBP_POST_CONTENT_MAX_LENGTH,
  orderPublishQueue,
  selectDuePosts,
  validateScheduledPost,
  type GbpPostValidationError,
  type GbpScheduledPostRecord,
  type GbpScheduledPostStatus,
} from "./gbpPostSchedule";

const NOW = new Date("2026-07-27T12:00:00.000Z");

function post(
  overrides: Partial<GbpScheduledPostRecord> & { id: string },
): GbpScheduledPostRecord {
  return {
    status: "scheduled",
    scheduledAt: "2026-07-27T11:00:00.000Z",
    ...overrides,
  };
}

describe("selectDuePosts", () => {
  it("includes a scheduled post whose time has already passed", () => {
    const due = selectDuePosts(
      [
        post({
          id: "a",
          status: "scheduled",
          scheduledAt: "2026-07-27T11:00:00.000Z",
        }),
      ],
      NOW,
    );
    expect(due.map((p) => p.id)).toEqual(["a"]);
  });

  it("includes a scheduled post whose time is exactly now", () => {
    const due = selectDuePosts(
      [post({ id: "a", status: "scheduled", scheduledAt: NOW.toISOString() })],
      NOW,
    );
    expect(due.map((p) => p.id)).toEqual(["a"]);
  });

  it("excludes a scheduled post whose time is still in the future", () => {
    const due = selectDuePosts(
      [
        post({
          id: "a",
          status: "scheduled",
          scheduledAt: "2026-07-27T13:00:00.000Z",
        }),
      ],
      NOW,
    );
    expect(due).toEqual([]);
  });

  it.each<GbpScheduledPostStatus>([
    "draft",
    "publishing",
    "published",
    "failed",
  ])("excludes a %s post even when its scheduled time has passed", (status) => {
    const due = selectDuePosts(
      [post({ id: "a", status, scheduledAt: "2026-07-27T11:00:00.000Z" })],
      NOW,
    );
    expect(due).toEqual([]);
  });

  it("filters a mixed batch down to only the due, scheduled posts", () => {
    const due = selectDuePosts(
      [
        post({
          id: "due-1",
          status: "scheduled",
          scheduledAt: "2026-07-27T10:00:00.000Z",
        }),
        post({
          id: "not-due",
          status: "scheduled",
          scheduledAt: "2026-07-27T13:00:00.000Z",
        }),
        post({
          id: "already-publishing",
          status: "publishing",
          scheduledAt: "2026-07-27T09:00:00.000Z",
        }),
        post({
          id: "due-2",
          status: "scheduled",
          scheduledAt: "2026-07-27T11:30:00.000Z",
        }),
      ],
      NOW,
    );
    expect(due.map((p) => p.id).toSorted()).toEqual(["due-1", "due-2"]);
  });
});

describe("orderPublishQueue", () => {
  it("orders posts oldest-scheduled-first", () => {
    const ordered = orderPublishQueue([
      post({ id: "later", scheduledAt: "2026-07-27T11:00:00.000Z" }),
      post({ id: "earliest", scheduledAt: "2026-07-27T09:00:00.000Z" }),
      post({ id: "middle", scheduledAt: "2026-07-27T10:00:00.000Z" }),
    ]);
    expect(ordered.map((p) => p.id)).toEqual(["earliest", "middle", "later"]);
  });

  it("breaks an exact-tie on scheduledAt deterministically by id", () => {
    const ordered = orderPublishQueue([
      post({ id: "b", scheduledAt: "2026-07-27T10:00:00.000Z" }),
      post({ id: "a", scheduledAt: "2026-07-27T10:00:00.000Z" }),
    ]);
    expect(ordered.map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("does not mutate the input array", () => {
    const input = [
      post({ id: "b", scheduledAt: "2026-07-27T11:00:00.000Z" }),
      post({ id: "a", scheduledAt: "2026-07-27T09:00:00.000Z" }),
    ];
    const snapshot = [...input];
    orderPublishQueue(input);
    expect(input).toEqual(snapshot);
  });
});

describe("buildPublishQueue", () => {
  it("selects only due posts and orders them oldest-first", () => {
    const queue = buildPublishQueue(
      [
        post({
          id: "future",
          status: "scheduled",
          scheduledAt: "2026-07-27T13:00:00.000Z",
        }),
        post({
          id: "due-later",
          status: "scheduled",
          scheduledAt: "2026-07-27T11:30:00.000Z",
        }),
        post({
          id: "already-published",
          status: "published",
          scheduledAt: "2026-07-27T08:00:00.000Z",
        }),
        post({
          id: "due-earlier",
          status: "scheduled",
          scheduledAt: "2026-07-27T09:00:00.000Z",
        }),
      ],
      NOW,
    );
    expect(queue.map((p) => p.id)).toEqual(["due-earlier", "due-later"]);
  });

  it("returns an empty queue when nothing is due", () => {
    expect(
      buildPublishQueue(
        [
          post({
            id: "a",
            status: "draft",
            scheduledAt: "2026-07-27T08:00:00.000Z",
          }),
        ],
        NOW,
      ),
    ).toEqual([]);
  });
});

// The double-publish guard: the one property that causes real user harm
// (a duplicate post on a client's live Google profile) if it's ever wrong.
// canStartPublishing below is only the IN-PROCESS half of that guard (belt);
// it has no notion of "another caller already claimed this row," so it
// cannot exercise the property that actually prevents two concurrent
// publishes. The DB-level compare-and-swap that does -- claimForPublishing's
// `status = 'scheduled'` WHERE predicate -- is tested against a real
// (in-memory) conditional update in
// src/server/features/gbp/repositories/GbpScheduledPostRepository.test.ts.
describe("canStartPublishing", () => {
  it("allows a scheduled post to start publishing", () => {
    expect(canStartPublishing("scheduled")).toBe(true);
  });

  it.each<GbpScheduledPostStatus>([
    "draft",
    "publishing",
    "published",
    "failed",
  ])("refuses a %s post", (status) => {
    expect(canStartPublishing(status)).toBe(false);
  });
});

describe("describePublishBlockReason", () => {
  it("gives no reason for a scheduled post -- it is not blocked", () => {
    expect(describePublishBlockReason("scheduled")).toBeNull();
  });

  it("explains why a draft is blocked", () => {
    expect(describePublishBlockReason("draft")).toMatch(
      /not.*scheduled|hasn't been scheduled/i,
    );
  });

  it("explains why an already-publishing post is blocked", () => {
    expect(describePublishBlockReason("publishing")).toMatch(
      /already publishing/i,
    );
  });

  it("explains why an already-published post is blocked", () => {
    expect(describePublishBlockReason("published")).toMatch(
      /already.*published/i,
    );
  });

  it("explains why a failed post is blocked (and doesn't auto-retry)", () => {
    expect(describePublishBlockReason("failed")).toMatch(/resched/i);
  });
});

describe("validateScheduledPost", () => {
  const validFuture = "2026-07-27T13:00:00.000Z";

  it("accepts a normal, valid post", () => {
    expect(
      validateScheduledPost(
        {
          content: "New summer hours starting Monday!",
          scheduledAt: validFuture,
          callToActionType: null,
          callToActionUrl: null,
        },
        NOW,
      ),
    ).toEqual([]);
  });

  it("rejects empty content", () => {
    expect(
      validateScheduledPost(
        {
          content: "",
          scheduledAt: validFuture,
          callToActionType: null,
          callToActionUrl: null,
        },
        NOW,
      ),
    ).toContain("empty_content");
  });

  it("rejects whitespace-only content as empty", () => {
    expect(
      validateScheduledPost(
        {
          content: "   \n\t  ",
          scheduledAt: validFuture,
          callToActionType: null,
          callToActionUrl: null,
        },
        NOW,
      ),
    ).toContain("empty_content");
  });

  // Google's documented `localPost.summary` limit --
  // https://developers.google.com/my-business/reference/rest/v4/accounts.locations.localPosts
  it("accepts content at exactly the documented character limit", () => {
    expect(GBP_POST_CONTENT_MAX_LENGTH).toBe(1500);
    const content = "a".repeat(GBP_POST_CONTENT_MAX_LENGTH);
    expect(
      validateScheduledPost(
        {
          content,
          scheduledAt: validFuture,
          callToActionType: null,
          callToActionUrl: null,
        },
        NOW,
      ),
    ).toEqual([]);
  });

  it("rejects content one character over the documented limit", () => {
    const content = "a".repeat(GBP_POST_CONTENT_MAX_LENGTH + 1);
    expect(
      validateScheduledPost(
        {
          content,
          scheduledAt: validFuture,
          callToActionType: null,
          callToActionUrl: null,
        },
        NOW,
      ),
    ).toContain("content_too_long");
  });

  it("rejects a scheduled time in the past", () => {
    expect(
      validateScheduledPost(
        {
          content: "Valid content",
          scheduledAt: "2026-07-27T11:00:00.000Z",
          callToActionType: null,
          callToActionUrl: null,
        },
        NOW,
      ),
    ).toContain("scheduled_in_past");
  });

  it("rejects a scheduled time exactly equal to now (must be strictly future)", () => {
    expect(
      validateScheduledPost(
        {
          content: "Valid content",
          scheduledAt: NOW.toISOString(),
          callToActionType: null,
          callToActionUrl: null,
        },
        NOW,
      ),
    ).toContain("scheduled_in_past");
  });

  it("requires a CTA url for a non-CALL action type", () => {
    expect(
      validateScheduledPost(
        {
          content: "Book now",
          scheduledAt: validFuture,
          callToActionType: "BOOK",
          callToActionUrl: null,
        },
        NOW,
      ),
    ).toContain("cta_url_required");
  });

  it("accepts a non-CALL action type with a url", () => {
    expect(
      validateScheduledPost(
        {
          content: "Book now",
          scheduledAt: validFuture,
          callToActionType: "BOOK",
          callToActionUrl: "https://example.com/book",
        },
        NOW,
      ),
    ).toEqual([]);
  });

  it("rejects a url on a CALL action type (Google does not accept one)", () => {
    expect(
      validateScheduledPost(
        {
          content: "Call us",
          scheduledAt: validFuture,
          callToActionType: "CALL",
          callToActionUrl: "https://example.com",
        },
        NOW,
      ),
    ).toContain("cta_url_not_allowed_for_call");
  });

  it("accepts a CALL action type with no url", () => {
    expect(
      validateScheduledPost(
        {
          content: "Call us",
          scheduledAt: validFuture,
          callToActionType: "CALL",
          callToActionUrl: null,
        },
        NOW,
      ),
    ).toEqual([]);
  });

  it("combines every applicable error at once", () => {
    const errors = validateScheduledPost(
      {
        content: "",
        scheduledAt: "2026-07-27T00:00:00.000Z",
        callToActionType: "SHOP",
        callToActionUrl: null,
      },
      NOW,
    );
    expect(errors).toEqual(
      expect.arrayContaining([
        "empty_content",
        "scheduled_in_past",
        "cta_url_required",
      ]),
    );
    expect(errors).toHaveLength(3);
  });
});

describe("describeScheduleValidationErrors (finding A3)", () => {
  // The exact failing input from finding A3: validateScheduledPost re-run
  // server-side rejects on "scheduled_in_past" (the time passed between the
  // form's own check and the request reaching the server) -- a LOCAL
  // validation failure. Google's API is never called on this path (see
  // GbpWriteService.schedulePost, which returns before ever creating the
  // scheduled row), so the message must not attribute it to Google.
  it("describes a scheduled_in_past error without attributing it to Google", () => {
    const message = describeScheduleValidationErrors(["scheduled_in_past"]);
    expect(message).toBe("Pick a time in the future.");
    expect(message.toLowerCase()).not.toContain("google");
  });

  it.each<GbpPostValidationError>([
    "empty_content",
    "content_too_long",
    "cta_url_required",
    "cta_url_not_allowed_for_call",
  ])("describes a %s error without attributing it to Google", (error) => {
    const message = describeScheduleValidationErrors([error]);
    expect(message.toLowerCase()).not.toContain("google reject");
    expect(message.length).toBeGreaterThan(0);
  });

  it("joins every applicable error into one message", () => {
    const message = describeScheduleValidationErrors([
      "empty_content",
      "scheduled_in_past",
    ]);
    expect(message).toBe(
      "Write something before scheduling. Pick a time in the future.",
    );
  });
});
