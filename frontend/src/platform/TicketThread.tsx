import { ArrowLeft, MessageSquare } from "lucide-react";
import { StatusPill } from "../components/ui/StatusPill";
import type { PlatformSupportTicket, PlatformUser } from "../platform-types";
import { TicketComposer } from "./TicketComposer";
import { TicketControls } from "./TicketControls";
import { TicketConversation } from "./TicketConversation";
import "./platform-ticket.css";

export function TicketThread({
  ticket,
  loading,
  submitting,
  currentUser,
  staff,
  onBack,
  onAssign,
  onStatusChange,
  onMessage,
}: {
  ticket: PlatformSupportTicket | null;
  loading: boolean;
  submitting: boolean;
  currentUser: PlatformUser;
  staff: PlatformUser[];
  onBack: () => void;
  onAssign: (assignedToId: string | null) => Promise<void>;
  onStatusChange: (status: PlatformSupportTicket["status"]) => Promise<void>;
  onMessage: (message: string, isInternal: boolean) => Promise<void>;
}) {
  if (loading) {
    return (
      <div className="platform-thread">
        <div className="platform-empty">Loading conversation...</div>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="platform-thread">
        <div className="platform-empty platform-select">
          <MessageSquare />
          <strong>Select a ticket</strong>
          <span>Review the conversation and take action.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="platform-thread">
      <button className="platform-back" onClick={onBack}>
        <ArrowLeft size={14} />
        Back to queue
      </button>

      <div className="platform-ticket-heading">
        <div>
          <span>{ticket.reference} - {ticket.company.name}</span>
          <h2>{ticket.subject}</h2>
          <p>
            {ticket.createdBy.firstName} {ticket.createdBy.lastName} - {ticket.createdBy.email}
          </p>
        </div>
        <StatusPill value={ticket.status} />
      </div>

      <TicketControls
        ticket={ticket}
        currentUser={currentUser}
        staff={staff}
        disabled={submitting}
        onAssign={onAssign}
        onStatusChange={onStatusChange}
      />

      <TicketConversation messages={ticket.messages} />

      {ticket.status !== "CLOSED" ? (
        <TicketComposer disabled={submitting} onMessage={onMessage} />
      ) : null}
    </div>
  );
}
