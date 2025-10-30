// Simple in-memory app state to gate WhatsApp processing by active UI login
// Persisting to disk is unnecessary; a short heartbeat window is enough

let lastHeartbeatAt = 0;
let authenticated = false;

function setAuthenticated(isAuthenticated) {
  authenticated = isAuthenticated;
}

function isAuthenticated() {
  return authenticated;
}

function setHeartbeat() {
  lastHeartbeatAt = Date.now();
}

function clearHeartbeat() {
  lastHeartbeatAt = 0;
}

function isActiveWithin(windowMs = 2 * 60 * 1000) { // default 2 minutes
  if (!lastHeartbeatAt) return false;
  return Date.now() - lastHeartbeatAt <= windowMs;
}

module.exports = {
  setHeartbeat,
  clearHeartbeat,
  isActiveWithin,
  setAuthenticated,
  isAuthenticated,
};
