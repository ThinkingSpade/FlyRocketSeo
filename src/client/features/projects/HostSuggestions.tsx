/**
 * Type-ahead options for a host or URL input, drawn from the project's apex and
 * its included subdomains.
 *
 * A `<datalist>` rather than a select: both call sites accept any target, not
 * only ones on the project, so the list has to suggest without constraining.
 * It also degrades to nothing when a project has no subdomains, which keeps the
 * field exactly as it was for single-site projects.
 *
 * Render `null` for an empty list instead of an empty `<datalist>`: an empty one
 * still binds to the input and Safari renders the dropdown affordance for it.
 */
export function HostSuggestions({
  id,
  hosts,
  toValue,
}: {
  id: string;
  hosts: string[];
  /** Maps a bare host to what the bound input expects (a URL, say). */
  toValue?: (host: string) => string;
}) {
  if (hosts.length === 0) return null;

  return (
    <datalist id={id}>
      {hosts.map((host) => (
        <option key={host} value={toValue ? toValue(host) : host} />
      ))}
    </datalist>
  );
}
