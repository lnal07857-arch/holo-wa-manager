const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[Heartbeat Keepalive] Starting heartbeat check');

    const railwayServerUrl = Deno.env.get('RAILWAY_SERVER_URL');
    
    if (!railwayServerUrl) {
      throw new Error('RAILWAY_SERVER_URL environment variable is not set');
    }

    // Call the heartbeat endpoint on the Railway server
    const response = await fetch(`${railwayServerUrl}/api/heartbeat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Railway server returned ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    console.log('[Heartbeat Keepalive] Heartbeat successful:', data);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Heartbeat check completed',
        data,
        timestamp: new Date().toISOString(),
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('[Heartbeat Keepalive] Error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        timestamp: new Date().toISOString(),
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
