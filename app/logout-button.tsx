import { Button } from "@/components/ui/Button";
import { logout } from "./actions";

// Plain <form> + Server Action: works without client JS.
export function LogoutButton() {
  return (
    <form action={logout}>
      <Button type="submit" variant="secondary" size="sm">
        Log out
      </Button>
    </form>
  );
}
