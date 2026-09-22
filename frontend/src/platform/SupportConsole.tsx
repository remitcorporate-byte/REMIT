import { useState } from "react";
import { clsx } from "clsx";
import { RefreshCw } from "lucide-react";
import { Notice } from "../components/ui/Notice";
import type { PlatformUser } from "../platform-types";
import { PlatformSidebar } from "./PlatformSidebar";
import { QueueMetrics } from "./QueueMetrics";
import { TicketList } from "./TicketList";
import { TicketThread } from "./TicketThread";
import { useSupportQueue } from "./useSupportQueue";
import "./platform-shell.css";
import "./platform-queue.css";
import "./platform-responsive.css";

export function SupportConsole({
  user,
  onLogout,
}: {
  user: PlatformUser;
  onLogout: () => void;
}) {
  const supportQueue = useSupportQueue();
  const [search, setSearch] = useState("");

  return (
    <div className="platform-shell">
      <PlatformSidebar user={user} onLogout={onLogout} />
      <main>
        <header>
          <div>
            <span>Platform operations</span>
            <h1>Customer support queue</h1>
          </div>
          <button onClick={supportQueue.refresh}>
            <RefreshCw size={16} />
            Refresh
          </button>
        </header>

        <div className="platform-content">
          {supportQueue.error ? (
            <Notice title="Support console issue" tone="danger">
              {supportQueue.error}
            </Notice>
          ) : null}

          <QueueMetrics summary={supportQueue.summary} />

          <section
            className={clsx("platform-queue", {
              "has-selection": Boolean(supportQueue.selectedId),
            })}
          >
            <TicketList
              tickets={supportQueue.tickets}
              loading={supportQueue.loading}
              selectedId={supportQueue.selectedId}
              search={search}
              queue={supportQueue.queue}
              onSearchChange={setSearch}
              onQueueChange={supportQueue.setQueue}
              onSelect={supportQueue.setSelectedId}
            />
            <TicketThread
              ticket={supportQueue.ticket}
              loading={supportQueue.detailLoading}
              submitting={supportQueue.submitting}
              currentUser={user}
              staff={supportQueue.staff}
              onBack={() => supportQueue.setSelectedId("")}
              onAssign={supportQueue.assign}
              onStatusChange={supportQueue.updateStatus}
              onMessage={supportQueue.addMessage}
            />
          </section>
        </div>
      </main>
    </div>
  );
}
