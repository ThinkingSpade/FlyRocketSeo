import { Monitor, Moon, Sun } from "lucide-react";
import { DropdownMenu } from "@cloudflare/kumo/components/dropdown";
import { type ThemePreference, useThemePreference } from "@/client/lib/theme";

const THEME_OPTIONS: {
  value: ThemePreference;
  label: string;
  icon: typeof Sun;
}[] = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
];

/**
 * The theme picker inside the account menu.
 *
 * This was a hand-rolled radiogroup — three icon buttons in a segmented row,
 * with DaisyUI `tooltip` supplying the only label each one had. It is now a
 * real menu radio group, which is what it always was semantically.
 *
 * That trades a compact icon row for three labelled rows, and the extra height
 * is worth it: the icon-only version relied on a hover tooltip to say what the
 * buttons did, so it told a touch user nothing and a screen-reader user only
 * what `aria-label` repeated. Base UI also brings the arrow-key roving focus
 * the old div-of-buttons never had.
 */
export function ThemePreferenceMenuItems() {
  const { themePreference, setThemePreference } = useThemePreference();

  return (
    <>
      <DropdownMenu.RadioGroup
        value={themePreference}
        onValueChange={(next) => {
          // Base UI types the value as unknown/any. Resolving it against the
          // option list recovers ThemePreference without an assertion, which
          // the lint config forbids, and ignores anything that is not ours.
          const selected = THEME_OPTIONS.find(
            (option) => option.value === next,
          );
          if (selected) setThemePreference(selected.value);
        }}
      >
        {/* Inside the RadioGroup, not beside it. Base UI's group label reads
            its context from an enclosing Group/RadioGroup and throws without
            one ("MenuGroupContext is missing"), which took the whole account
            menu down. Nesting it is also what makes the label name the radio
            group for assistive tech. */}
        <DropdownMenu.Label>Theme</DropdownMenu.Label>
        {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
          <DropdownMenu.RadioItem
            key={value}
            value={value}
            icon={Icon}
            // Stay open on pick. Choosing a theme is something people compare —
            // closing the menu would mean reopening it to try the other two.
            closeOnClick={false}
          >
            {label}
          </DropdownMenu.RadioItem>
        ))}
      </DropdownMenu.RadioGroup>
    </>
  );
}
