import { logout } from "./actions";

// Plain <form> + Server Action: works without client JS.
export function LogoutButton() {
  return (
    <form action={logout}>
      <button type="submit" className="rounded border px-3 py-1.5 text-sm">
        Log out
      </button>
    </form>
  );
}
