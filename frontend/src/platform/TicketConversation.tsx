import { clsx } from "clsx";
import { formatDate } from "../api";
import type { PlatformSupportMessage } from "../platform-types";

export function TicketConversation({
  messages,
}: {
  messages: PlatformSupportMessage[];
}) {
  return (
    <div className="platform-messages">
      {messages.map((message) => (
        <article
          key={message.id}
          className={clsx(`is-${message.senderType.toLowerCase()}`, {
            "is-internal": message.isInternal,
          })}
        >
          <div>
            <strong>{getMessageAuthor(message)}</strong>
            <time>{formatDate(message.createdAt)}</time>
          </div>
          <p>{message.body}</p>
        </article>
      ))}
    </div>
  );
}

function getMessageAuthor(message: PlatformSupportMessage) {
  if (message.isInternal) return "Private note";
  if (message.authorPlatformUser) {
    return `${message.authorPlatformUser.firstName} - REMIT Support`;
  }
  if (message.author) {
    return `${message.author.firstName} ${message.author.lastName}`;
  }
  return "System";
}
