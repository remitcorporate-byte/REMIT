import { useCallback, useEffect, useState } from "react";
import { platformApi } from "../platform-api";
import type {
  PlatformSupportSummary,
  PlatformSupportTicket,
  PlatformUser,
} from "../platform-types";
import type { QueueFilter } from "./TicketList";

export function useSupportQueue() {
  const [summary, setSummary] = useState<PlatformSupportSummary | null>(null);
  const [tickets, setTickets] = useState<PlatformSupportTicket[]>([]);
  const [staff, setStaff] = useState<PlatformUser[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [ticket, setTicket] = useState<PlatformSupportTicket | null>(null);
  const [queue, setQueue] = useState<QueueFilter>("all");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const assignedFilter = getAssignedFilter(queue);
      const [nextSummary, nextTickets, nextStaff] = await Promise.all([
        platformApi.summary(),
        platformApi.tickets(assignedFilter),
        platformApi.staff(),
      ]);

      setSummary(nextSummary);
      setTickets(nextTickets);
      setStaff(nextStaff.filter((member) => member.isActive));
    } catch (failure) {
      setError(getErrorMessage(failure, "Could not load support queue"));
    } finally {
      setLoading(false);
    }
  }, [queue]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!selectedId) {
      setTicket(null);
      return;
    }

    let requestIsCurrent = true;
    setDetailLoading(true);

    platformApi
      .ticket(selectedId)
      .then((selectedTicket) => {
        if (requestIsCurrent) setTicket(selectedTicket);
      })
      .catch((failure) => {
        if (requestIsCurrent) {
          setError(getErrorMessage(failure, "Could not load ticket"));
        }
      })
      .finally(() => {
        if (requestIsCurrent) setDetailLoading(false);
      });

    return () => {
      requestIsCurrent = false;
    };
  }, [selectedId]);

  const updateTicket = async (
    action: () => Promise<PlatformSupportTicket>,
  ) => {
    setSubmitting(true);
    setError("");

    try {
      setTicket(await action());
      await refresh();
    } catch (failure) {
      setError(getErrorMessage(failure, "Support action failed"));
    } finally {
      setSubmitting(false);
    }
  };

  return {
    summary,
    tickets,
    staff,
    selectedId,
    ticket,
    queue,
    loading,
    detailLoading,
    submitting,
    error,
    refresh,
    setSelectedId,
    setQueue,
    assign: (assignedToId: string | null) =>
      updateTicket(() => platformApi.assign(selectedId, assignedToId)),
    updateStatus: (status: PlatformSupportTicket["status"]) =>
      updateTicket(() => platformApi.updateStatus(selectedId, status)),
    addMessage: (message: string, isInternal: boolean) =>
      updateTicket(() =>
        platformApi.addMessage(selectedId, message, isInternal),
      ),
  };
}

function getAssignedFilter(queue: QueueFilter) {
  if (queue === "mine") return "&assigned=me";
  if (queue === "unassigned") return "&assigned=unassigned";
  return "";
}

function getErrorMessage(failure: unknown, fallback: string) {
  return failure instanceof Error ? failure.message : fallback;
}
