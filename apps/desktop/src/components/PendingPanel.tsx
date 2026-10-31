import { useCallback, useEffect, useState } from "react";
import * as api from "../lib/tauriApi";
import type { PendingRecord } from "../lib/tauriApi";

const POLL_MS = 5000;
const EXCERPT_LEN = 120;

function excerpt(body: string): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > EXCERPT_LEN ? `${flat.slice(0, EXCERPT_LEN)}…` : flat;
}

type Props = {
  /** Called after an approve/reject so the desk can reload notes. */
  onResolved?: () => void;
  pollMs?: number;
};

export function PendingPanel({ onResolved, pollMs = POLL_MS }: Props) {
  const [records, setRecords] = useState<PendingRecord[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await api.listPending();
      setRecords(list.filter((r) => r.status === "pending"));
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), pollMs);
    return () => clearInterval(timer);
  }, [refresh, pollMs]);

  const act = async (id: string, action: (id: string) => Promise<unknown>) => {
    setBusyId(id);
    try {
      await action(id);
      setError(null);
      onResolved?.();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusyId(null);
      await refresh();
    }
  };

  return (
    <section className="pending" aria-label="Pending approvals">
      <header>
        <h2>Pending approval</h2>
        <span className="badge" aria-label="Pending count">
          {records.length}
        </span>
      </header>
      {error ? (
        <p role="status" className="error">
          {error}
        </p>
      ) : null}
      {records.length === 0 ? (
        <p className="muted">No changes waiting for approval.</p>
      ) : (
        <ul>
          {records.map((r) => {
            const title = r.note?.title || r.targetIdOrPath || "Untitled";
            return (
              <li key={r.id} className="pending-item">
                <div className="pending-head">
                  <span className="note-title">{title}</span>
                  <span className="op">{r.op}</span>
                </div>
                {r.note ? <span className="note-meta">{r.note.shelf}</span> : null}
                {r.note?.body ? <p className="excerpt">{excerpt(r.note.body)}</p> : null}
                <div className="actions">
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    aria-label={`Approve ${title}`}
                    onClick={() => void act(r.id, api.approvePending)}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="danger"
                    disabled={busyId === r.id}
                    aria-label={`Reject ${title}`}
                    onClick={() => void act(r.id, api.rejectPending)}
                  >
                    Reject
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
