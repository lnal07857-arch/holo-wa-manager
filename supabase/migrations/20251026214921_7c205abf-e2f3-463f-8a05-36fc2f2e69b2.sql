-- Tabelle für VPN-Server Health-Tracking
CREATE TABLE IF NOT EXISTS public.vpn_server_health (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  server_host TEXT NOT NULL UNIQUE,
  server_region TEXT NOT NULL DEFAULT 'DE',
  is_healthy BOOLEAN NOT NULL DEFAULT true,
  last_check_at TIMESTAMP WITH TIME ZONE,
  last_success_at TIMESTAMP WITH TIME ZONE,
  last_failure_at TIMESTAMP WITH TIME ZONE,
  failure_count INTEGER NOT NULL DEFAULT 0,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  response_time_ms INTEGER,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index für schnelle Abfragen
CREATE INDEX IF NOT EXISTS idx_vpn_server_health_is_healthy ON public.vpn_server_health(is_healthy);
CREATE INDEX IF NOT EXISTS idx_vpn_server_health_region ON public.vpn_server_health(server_region);
CREATE INDEX IF NOT EXISTS idx_vpn_server_health_last_check ON public.vpn_server_health(last_check_at);

-- RLS Policies
ALTER TABLE public.vpn_server_health ENABLE ROW LEVEL SECURITY;

-- Alle authentifizierten Benutzer können Server-Status lesen
CREATE POLICY "Authenticated users can view VPN server health"
  ON public.vpn_server_health
  FOR SELECT
  TO authenticated
  USING (true);

-- Nur Service Role kann Health-Status aktualisieren (für Edge Functions)
CREATE POLICY "Service role can update VPN server health"
  ON public.vpn_server_health
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Trigger für updated_at
CREATE TRIGGER update_vpn_server_health_updated_at
  BEFORE UPDATE ON public.vpn_server_health
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Funktion zum Markieren eines Servers als ungesund
CREATE OR REPLACE FUNCTION public.mark_vpn_server_unhealthy(
  p_server_host TEXT,
  p_error_message TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO vpn_server_health (
    server_host,
    is_healthy,
    last_check_at,
    last_failure_at,
    failure_count,
    consecutive_failures,
    error_message
  )
  VALUES (
    p_server_host,
    false,
    now(),
    now(),
    1,
    1,
    p_error_message
  )
  ON CONFLICT (server_host)
  DO UPDATE SET
    is_healthy = false,
    last_check_at = now(),
    last_failure_at = now(),
    failure_count = vpn_server_health.failure_count + 1,
    consecutive_failures = vpn_server_health.consecutive_failures + 1,
    error_message = p_error_message;
END;
$$;

-- Funktion zum Markieren eines Servers als gesund
CREATE OR REPLACE FUNCTION public.mark_vpn_server_healthy(
  p_server_host TEXT,
  p_response_time_ms INTEGER DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO vpn_server_health (
    server_host,
    is_healthy,
    last_check_at,
    last_success_at,
    consecutive_failures,
    response_time_ms
  )
  VALUES (
    p_server_host,
    true,
    now(),
    now(),
    0,
    p_response_time_ms
  )
  ON CONFLICT (server_host)
  DO UPDATE SET
    is_healthy = true,
    last_check_at = now(),
    last_success_at = now(),
    consecutive_failures = 0,
    response_time_ms = p_response_time_ms,
    error_message = NULL;
END;
$$;