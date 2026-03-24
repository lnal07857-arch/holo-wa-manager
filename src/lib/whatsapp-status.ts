type GatewayStatusPayload = {
  connected?: boolean;
  status?: string | null;
};

const KNOWN_STATUSES = new Set([
  "connected",
  "disconnected",
  "initializing",
  "pending",
  "qr_generated",
  "not_found",
]);

export function isConnectedStatus(payload: GatewayStatusPayload | null | undefined): boolean {
  if (!payload) return false;
  return payload.connected === true || payload.status === "connected";
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

  if (payload.connected === true) return "connected";
  if (payload.connected === false) return "disconnected";

  return fallbackStatus;
}