import { Headphones, LogOut, Users } from "lucide-react";
import type { PlatformUser } from "../platform-api";

export function PlatformSidebar({
  user,
  onLogout,
}: {
  user: PlatformUser;
  onLogout: () => void;
}) {
  return (
    <aside>
      <div className="platform-mark">
        <i />
        <strong>REMIT</strong>
        <span>SUPPORT</span>
      </div>
      <nav>
        <button className="is-active">
          <Headphones size={18} /> Ticket queue
        </button>
        <button disabled>
          <Users size={18} /> Staff management
        </button>
      </nav>
      <div className="platform-profile">
        <span>
          {user.firstName[0]}
          {user.lastName[0]}
        </span>
        <div>
          <strong>
            {user.firstName} {user.lastName}
          </strong>
          <small>{user.role.replaceAll("_", " ")}</small>
        </div>
        <button onClick={onLogout} aria-label="Log out">
          <LogOut size={17} />
        </button>
      </div>
    </aside>
  );
}
