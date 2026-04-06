type GatewayStatusPayload = {
  connected?: boolean;
  status?: string | null;
  is_connected?: boolean;
  is_logged_in?: boolean;
};

const KNOWN_STATUSES = new Set([
  "connected",
  "disconnected",
  "initializing",
  "pending",
  "qr_generated",
  "qr_required",
  "not_found",
]);

export function isConnectedStatus(payload: GatewayStatusPayload | null | undefined): boolean {
  if (!payload) return false;
  if (payload.connected === true) return true;
  if (payload.status === "connected") return true;
  if (payload.is_connected === true && payload.is_logged_in === true) return true;
  return false;
}

export function normalizeGatewayAccountStatus(
  payload: GatewayStatusPayload | null | undefined,
  fallbackStatus = "disconnected"
): string {
  if (!payload) return fallbackStatus;

  const rawStatus = typeof payload.status === "string" ? payload.status.toLowerCase() : null;
  if (rawStatus && KNOWN_STATUSES.has(rawStatus)) {
    return rawStatus;
  }

  // go-whatsapp style: is_connected + is_logged_in
  if (payload.is_connected === true && payload.is_logged_in === true) return "connected";
  if (payload.is_connected === false) return "disconnected";

  if (payload.connected === true) return "connected";
  if (payload.connected === false) return "disconnected";

  return fallbackStatus;
}