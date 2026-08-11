import { Gear, User } from "@phosphor-icons/react";
import { ThemePreferenceMenuItems } from "@/client/components/ThemePreferenceMenuItems";
import { signOutAndRedirect } from "@/lib/auth-client";
import { Button } from "@cloudflare/kumo/components/button";
import { DropdownMenu } from "@cloudflare/kumo/components/dropdown";

// Account dropdown shared by the onboarding wizard and the onboarding chat so a
// signed-in user can reach Settings / theme / sign out from either surface.
// Fixed top-right; renders nothing until we know the user's email.
export function OnboardingAccountMenu({
  email,
}: {
  email: string | undefined;
}) {
  if (!email) return null;

  const handleSignOut = () => signOutAndRedirect();

  return (
    <div className="fixed top-4 right-4">
      <DropdownMenu>
        <DropdownMenu.Trigger
          render={
            <Button
              type="button"
              variant="ghost"
              shape="circle"
              aria-label="Open account menu"
            >
              <User className="h-5 w-5" />
            </Button>
          }
        />
        <DropdownMenu.Content align="end" className="min-w-56">
          <DropdownMenu.Group>
            <DropdownMenu.Label>
              <span className="block truncate" data-ph-mask>
                {email}
              </span>
            </DropdownMenu.Label>
          </DropdownMenu.Group>
          <DropdownMenu.LinkItem icon={Gear} href="/settings">
            Settings
          </DropdownMenu.LinkItem>
          <ThemePreferenceMenuItems />
          <DropdownMenu.Separator />
          <DropdownMenu.Item variant="danger" onClick={handleSignOut}>
            Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu>
    </div>
  );
}
