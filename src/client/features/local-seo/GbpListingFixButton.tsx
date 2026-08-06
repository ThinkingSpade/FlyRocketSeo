import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { TriangleAlert, Wand2 } from "lucide-react";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { useGbpWriteAvailable } from "@/client/features/auth/useEmailVerificationBypassed";
import {
  applyGbpListingUpdate,
  getGbpConnection,
  searchGbpCategories,
} from "@/serverFunctions/gbp";
import { Button } from "@cloudflare/kumo/components/button";
import { Input } from "@cloudflare/kumo/components/input";

/** The only two GBP Audit checks (gbpAudit.ts) this can actually fix. Every
 *  other check either isn't a listing field (reviews, rating, owner
 *  response) or needs a capability this feature doesn't have (claiming a
 *  profile, uploading logo/photos) -- see the branch brief's "wire the
 *  affordance to the checks it can actually fix" and gbpAudit.ts's own
 *  `unknown` handling for the same "don't offer what we can't do" rule. */
const FIXABLE_CHECK_KEYS = new Set(["description", "category"]);

function isGbpFixableCheck(checkKey: string): boolean {
  return FIXABLE_CHECK_KEYS.has(checkKey);
}

/**
 * Inline "push this fix to Google" affordance for one GBP Audit row. Renders
 * nothing when GBP writing isn't available or this project isn't connected
 * yet -- GbpConnectionCard elsewhere on the page already carries the "what
 * connecting would enable" messaging, so this button just stays silently
 * absent rather than repeating it on every row (and never renders a button
 * that can't work).
 */
export function GbpListingFixButton({
  projectId,
  checkKey,
  status,
}: {
  projectId: string;
  checkKey: string;
  status: "warn" | "fail";
}) {
  const gbpWriteAvailable = useGbpWriteAvailable();
  const connectionQuery = useQuery({
    queryKey: ["gbpConnection", projectId],
    queryFn: () => getGbpConnection({ data: { projectId } }),
    enabled: gbpWriteAvailable,
  });
  const [open, setOpen] = React.useState(false);

  if (!gbpWriteAvailable || !connectionQuery.data?.connected) return null;
  if (!isGbpFixableCheck(checkKey)) return null;

  if (!open) {
    return (
      <button
        type="button"
        className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        onClick={() => setOpen(true)}
      >
        <Wand2 className="size-3" />
        Fix on Google
      </button>
    );
  }

  return checkKey === "description" ? (
    <DescriptionFixForm projectId={projectId} onClose={() => setOpen(false)} />
  ) : (
    <CategoryFixForm
      projectId={projectId}
      isPrimary={status === "fail"}
      onClose={() => setOpen(false)}
    />
  );
}

function ConfirmBar({
  pending,
  onConfirm,
  onCancel,
  label,
}: {
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  label: string;
}) {
  return (
    <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-2 py-1.5 text-xs">
      <TriangleAlert className="size-3.5 shrink-0 text-warning" />
      <span>{label}</span>
      <Button
        type="button"
        variant="primary"
        size="xs"
        disabled={pending}
        onClick={onConfirm}
      >
        {pending ? "Applying…" : "Confirm"}
      </Button>
      <Button type="button" variant="ghost" size="xs" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}

function DescriptionFixForm({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [description, setDescription] = React.useState("");
  const [confirming, setConfirming] = React.useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      applyGbpListingUpdate({
        data: { projectId, update: { kind: "description", description } },
      }),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success("Description updated on Google Business Profile");
        onClose();
        void queryClient.invalidateQueries({
          queryKey: ["business-profile", projectId],
        });
      } else {
        toast.error(result.message);
      }
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  return (
    <div className="mt-1.5 space-y-1.5">
      <textarea
        className="textarea textarea-bordered textarea-xs w-full"
        rows={3}
        placeholder="What does this business do, where, and what sets it apart?"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
      />
      {confirming ? (
        <ConfirmBar
          pending={mutation.isPending}
          onConfirm={() => mutation.mutate()}
          onCancel={() => setConfirming(false)}
          label="This replaces the live description on Google. Continue?"
        />
      ) : (
        <div className="flex gap-2">
          <Button
            type="button"
            variant="primary"
            size="xs"
            disabled={!description.trim()}
            onClick={() => setConfirming(true)}
          >
            Save to Google
          </Button>
          <Button type="button" variant="ghost" size="xs" onClick={onClose}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}

function CategoryFixForm({
  projectId,
  isPrimary,
  onClose,
}: {
  projectId: string;
  isPrimary: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [query, setQuery] = React.useState("");
  const [selected, setSelected] = React.useState<{
    name: string;
    displayName: string;
  } | null>(null);
  const [confirming, setConfirming] = React.useState(false);

  // regionCode is a pragmatic "US" default (this app's own default project
  // locationCode is also the US, 2840) -- resolving a project's DataForSEO
  // locationCode to an ISO region code isn't wired up yet. It only narrows
  // which categories Google considers relevant to search, never the
  // correctness of whichever category id ends up selected.
  const searchQuery = useQuery({
    queryKey: ["gbpCategorySearch", projectId, query],
    queryFn: () =>
      searchGbpCategories({
        data: { projectId, query, regionCode: "US", languageCode: "en" },
      }),
    enabled: query.trim().length >= 2,
  });

  const mutation = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error("No category selected");
      return applyGbpListingUpdate({
        data: {
          projectId,
          update: {
            kind: isPrimary ? "primaryCategory" : "addAdditionalCategory",
            category: selected,
          },
        },
      });
    },
    onSuccess: (result) => {
      if (result.ok) {
        toast.success("Category updated on Google Business Profile");
        onClose();
        void queryClient.invalidateQueries({
          queryKey: ["business-profile", projectId],
        });
      } else {
        toast.error(result.message);
      }
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  const suggestions = searchQuery.data?.ok ? searchQuery.data.categories : [];

  return (
    <div className="mt-1.5 space-y-1.5">
      <Input
        type="text"
        size="xs"
        className="w-full"
        placeholder="Search Google's category list (e.g. Pizza restaurant)"
        value={selected ? selected.displayName : query}
        onChange={(event) => {
          setSelected(null);
          setQuery(event.target.value);
        }}
      />
      {!selected && suggestions.length > 0 ? (
        <ul className="max-h-32 divide-y divide-base-300 overflow-y-auto rounded border border-base-300">
          {suggestions.map((category) => (
            <li key={category.name}>
              <button
                type="button"
                className="w-full px-2 py-1 text-left text-xs hover:bg-base-200"
                onClick={() => setSelected(category)}
              >
                {category.displayName}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {confirming ? (
        <ConfirmBar
          pending={mutation.isPending}
          onConfirm={() => mutation.mutate()}
          onCancel={() => setConfirming(false)}
          label={`This ${isPrimary ? "sets the primary category" : "adds an additional category"} on Google. Continue?`}
        />
      ) : (
        <div className="flex gap-2">
          <Button
            type="button"
            variant="primary"
            size="xs"
            disabled={!selected}
            onClick={() => setConfirming(true)}
          >
            Save to Google
          </Button>
          <Button type="button" variant="ghost" size="xs" onClick={onClose}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
