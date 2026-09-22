import type { PlatformSupportTicket, PlatformUser } from "../platform-types";

export function TicketControls({
  ticket,
  currentUser,
  staff,
  disabled,
  onAssign,
  onStatusChange,
}: {
  ticket: PlatformSupportTicket;
  currentUser: PlatformUser;
  staff: PlatformUser[];
  disabled: boolean;
  onAssign: (assignedToId: string | null) => Promise<void>;
  onStatusChange: (status: PlatformSupportTicket["status"]) => Promise<void>;
}) {
  const assignableStaff = staff.filter(
    (member) =>
      currentUser.role === "SUPPORT_ADMIN" || member.id === currentUser.id,
  );

  return (
    <div className="platform-actions">
      <label>
        <span>Assignee</span>
        <select
          disabled={disabled}
          value={ticket.assignedTo?.id || ""}
          onChange={(event) => void onAssign(event.target.value || null)}
        >
          {currentUser.role === "SUPPORT_ADMIN" ? (
            <option value="">Unassigned</option>
          ) : null}
          {assignableStaff.map((member) => (
            <option key={member.id} value={member.id}>
              {member.firstName} {member.lastName}
            </option>
          ))}
        </select>
      </label>

      <label>
        <span>Status</span>
        <select
          disabled={disabled}
          value={ticket.status}
          onChange={(event) =>
            void onStatusChange(
              event.target.value as PlatformSupportTicket["status"],
            )
          }
        >
          <option value="OPEN">Open</option>
          <option value="IN_PROGRESS">In progress</option>
          <option value="WAITING_FOR_CUSTOMER">Waiting for customer</option>
          <option value="RESOLVED">Resolved</option>
          <option value="CLOSED">Closed</option>
        </select>
      </label>
    </div>
  );
}
