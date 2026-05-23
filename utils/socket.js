// utils/socket.js
// ── Socket.IO singleton ───────────────────────────────────────────────────────
// Holds the single `io` instance for the entire app lifetime.
// Controllers call getIO().emit(...) to broadcast real-time events.
// initSocket() is called once from server.js after the HTTP server starts.

/** @type {import('socket.io').Server | null} */
let _io = null;

/**
 * Store the Socket.IO server instance.
 * Called once in server.js during startup.
 * @param {import('socket.io').Server} io
 */
export const initSocket = (io) => {
  _io = io;
};

/**
 * Return the Socket.IO server instance.
 * Returns null if called before initSocket (safe – controllers guard against null).
 * @returns {import('socket.io').Server | null}
 */
export const getIO = () => _io;

/**
 * Convenience: emit an event to ALL connected clients.
 * Safe to call even before socket is initialised (no-op in that case).
 * @param {string} event  - e.g. 'hourly-production:changed'
 * @param {any}    payload - optional data sent to clients
 */
export const emitToAll = (event, payload = {}) => {
  if (_io) {
    _io.emit(event, payload);
  }
};
