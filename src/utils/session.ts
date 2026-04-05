/**
 * Shared session validation helpers.
 */

const INACTIVITY_WINDOW_MINUTES = 30;

/** Check if a session is active (not expired and recently active). */
export function isSessionActive(session: { expiresAt: Date; lastSeen: Date }): boolean {
  const now = new Date();
  const inactivityWindow = new Date(now.getTime() - INACTIVITY_WINDOW_MINUTES * 60 * 1000);

  return (
    now < session.expiresAt &&
    session.lastSeen >= inactivityWindow
  );
}
