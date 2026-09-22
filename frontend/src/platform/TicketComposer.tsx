import { FormEvent, useState } from "react";
import { Send } from "lucide-react";
import "./platform-composer.css";

export function TicketComposer({
  disabled,
  onMessage,
}: {
  disabled: boolean;
  onMessage: (message: string, isInternal: boolean) => Promise<void>;
}) {
  const [message, setMessage] = useState("");
  const [internal, setInternal] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!message.trim()) return;

    await onMessage(message.trim(), internal);
    setMessage("");
    setInternal(false);
  };

  return (
    <form className="platform-compose" onSubmit={submit}>
      <textarea
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        placeholder={
          internal
            ? "Write a private note for support staff..."
            : "Reply to the customer..."
        }
      />
      <div>
        <label>
          <input
            type="checkbox"
            checked={internal}
            onChange={(event) => setInternal(event.target.checked)}
          />
          Private internal note
        </label>
        <button disabled={disabled || !message.trim()}>
          <Send size={15} />
          {internal ? "Add note" : "Send reply"}
        </button>
      </div>
    </form>
  );
}
