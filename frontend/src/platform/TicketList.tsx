import { clsx } from "clsx";
import { Search } from "lucide-react";
import { formatDate } from "../api";
import { StatusPill } from "../components/ui/StatusPill";
import type { PlatformSupportTicket } from "../platform-api";

export type QueueFilter = "all" | "mine" | "unassigned";

export function TicketList({
  tickets,
  loading,
  selectedId,
  search,
  queue,
  onSearchChange,
  onQueueChange,
  onSelect,
}: {
  tickets: PlatformSupportTicket[];
  loading: boolean;
  selectedId: string;
  search: string;
  queue: QueueFilter;
  onSearchChange: (value: string) => void;
  onQueueChange: (value: QueueFilter) => void;
  onSelect: (id: string) => void;
}) {
  const query = search.trim().toLowerCase();
  const visibleTickets = query
    ? tickets.filter((ticket) =>
        [
          ticket.reference,
          ticket.subject,
          ticket.company.name,
          ticket.createdBy.email,
        ].some((value) => value.toLowerCase().includes(query)),
      )
    : tickets;

  return (
    <div className="platform-list">
      <div className="platform-list-tools">
        <div>
          <Search size={15} />
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search tickets or companies"
          />
        </div>
        <select
          value={queue}
          onChange={(event) => onQueueChange(event.target.value as QueueFilter)}
        >
          <option value="all">All tickets</option>
          <option value="mine">Assigned to me</option>
          <option value="unassigned">Unassigned</option>
        </select>
      </div>

      {loading ? <div className="platform-empty">Loading queue…</div> : null}
      {!loading
        ? visibleTickets.map((ticket) => (
            <button
              key={ticket.id}
              className={clsx({ "is-active": selectedId === ticket.id })}
              onClick={() => onSelect(ticket.id)}
            >
              <div>
                <span>{ticket.reference}</span>
                <StatusPill value={ticket.status} />
              </div>
              <strong>{ticket.subject}</strong>
              <p>
                {ticket.company.name} · {ticket.priority.toLowerCase()} priority
              </p>
              <small>
                {ticket.assignedTo
                  ? `${ticket.assignedTo.firstName} ${ticket.assignedTo.lastName}`
                  : "Unassigned"}{" "}
                · {formatDate(ticket.lastMessageAt)}
              </small>
            </button>
          ))
        : null}
      {!loading && !visibleTickets.length ? (
        <div className="platform-empty">No tickets match this queue.</div>
      ) : null}
    </div>
  );
}
