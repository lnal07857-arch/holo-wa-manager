import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Phase-based message pools
const MESSAGE_POOLS = {
  phase1: [
    "Hey 👋",
    "Wie läuft dein Tag so?",
    "Alles klar bei dir?",
    "Kleiner Check-in: alles okay?",
    "Bin gleich wieder da, kurze Pause."
  ],
  phase2: [
    "Haha das war wirklich lustig 😂",
    "Schickst du mir mal das Foto von gestern?",
    "Ich probier's gleich nochmal — hat bei mir funktioniert.",
    "Welchen Kaffee trinkst du heute?",
    "Das Meeting wurde verschoben, kein Stress.",
    "Hast du die Nachricht bekommen?",
    "Perfekt, genau so machen wir das!"
  ],
  phase3: [
    "Hier der Link, den ich meinte: https://example.com",
    "Ich hab das jetzt getestet und es lief stabil.",
    "Können wir das morgen kurz durchgehen?",
    "Ich schicke dir mal die Info.",
    "Top, danke für die schnelle Rückmeldung!",
    "Das klingt nach einem guten Plan.",
    "Lass uns das so umsetzen wie besprochen."
  ],
  emojis: ["😊", "👍", "😂", "🙌", "👌", "🔥"],
  smallReplies: ["Ok", "Cool", "Klar", "Danke!", "Perfekt", "Super"]
};

// Helper functions
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function computePhase(startDate: Date): 'phase1' | 'phase2' | 'phase3' {
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - startDate.getTime()) / (24 * 3600 * 1000));
  
  if (diffDays < 7) return 'phase1';
  if (diffDays < 14) return 'phase2';
  return 'phase3';
}

function inActiveHours(settings: any): boolean {
  const hour = new Date().getHours();
  return hour >= settings.active_start_hour && hour < settings.active_end_hour;
}

function inSleepWindow(settings: any): boolean {
  const hour = new Date().getHours();
  if (settings.sleep_start_hour < settings.sleep_end_hour) {
    return hour >= settings.sleep_start_hour && hour < settings.sleep_end_hour;
  } else {
    return hour >= settings.sleep_start_hour || hour < settings.sleep_end_hour;
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[Warmup Runner] Starting enhanced warmup cycle');
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: warmupSettings, error: settingsError } = await supabase
      .from('warmup_settings')
      .select('*')
      .eq('is_running', true);

    if (settingsError) throw settingsError;

    console.log(`[Warmup Runner] Found ${warmupSettings?.length || 0} active session(s)`);

    for (const settings of warmupSettings || []) {
      console.log(`[Warmup Runner] Processing user ${settings.user_id}`);
      
      // Check sleep window
      if (inSleepWindow(settings)) {
        console.log(`[Warmup Runner] In sleep window, skipping`);
        continue;
      }

      // Check time interval
      const now = new Date();
      const lastRun = settings.last_run_at ? new Date(settings.last_run_at) : null;
      
      if (lastRun) {
        const minutesSinceLastRun = (now.getTime() - lastRun.getTime()) / (1000 * 60);
        if (minutesSinceLastRun < settings.interval_minutes) {
          console.log(`[Warmup Runner] Not enough time passed, skipping`);
          continue;
        }
      }

      // Allow some activity outside active hours with low probability
      if (!inActiveHours(settings) && Math.random() > 0.05) {
        console.log(`[Warmup Runner] Outside active hours, skipping`);
        continue;
      }

      // Fetch connected accounts
      const { data: accounts, error: accountsError } = await supabase
        .from('whatsapp_accounts')
        .select('*')
        .eq('user_id', settings.user_id)
        .eq('status', 'connected');

      if (accountsError) throw accountsError;

      // Verify live status with gateway to avoid pairing with offline clients
      const activeAccounts: any[] = [];
      for (const acc of accounts || []) {
        try {
          const { data: statusData, error: statusError } = await supabase.functions.invoke('whatsapp-gateway', {
            body: { action: 'status', accountId: acc.id },
          });
          const isLive = !statusError && statusData && (
            statusData.ready === true ||
            statusData.status === 'connected' ||
            statusData.state === 'CONNECTED'
          );
          if (isLive) activeAccounts.push(acc);
        } catch (_) {
          // ignore
        }
      }
      console.log(`[Warmup Runner] Active accounts after verification: ${activeAccounts.length}`);

      if (!activeAccounts || activeAccounts.length < 2) {
        console.log(`[Warmup Runner] Not enough live accounts`);
        await supabase
          .from('warmup_settings')
          .update({ last_run_at: now.toISOString() })
          .eq('user_id', settings.user_id);
        continue;
      }

      // Compute current phase
      const phase = computePhase(settings.started_at ? new Date(settings.started_at) : now);
      console.log(`[Warmup Runner] Current phase: ${phase}`);

      // Update phase if changed
      if (settings.phase !== phase) {
        await supabase
          .from('warmup_settings')
          .update({ phase })
          .eq('user_id', settings.user_id);
      }

      // Generate pairs if needed
      let accountPairs = settings.all_pairs as [string, string][];
      let currentPairIndex = settings.current_pair_index || 0;
      
      if (!accountPairs || accountPairs.length === 0 || currentPairIndex >= accountPairs.length) {
        const shuffledAccounts = [...activeAccounts].sort(() => Math.random() - 0.5);
        accountPairs = [];
        
        for (let i = 0; i < shuffledAccounts.length; i++) {
          for (let j = i + 1; j < shuffledAccounts.length; j++) {
            accountPairs.push([shuffledAccounts[i].id, shuffledAccounts[j].id]);
          }
        }
        
        accountPairs.sort(() => Math.random() - 0.5);
        currentPairIndex = 0;
        
        console.log(`[Warmup Runner] Generated ${accountPairs.length} pairs`);
      }

      const currentPair = accountPairs[currentPairIndex];
      
      if (!currentPair || currentPair.length !== 2) {
        console.log(`[Warmup Runner] Invalid pair, skipping`);
        const nextIndex = currentPairIndex + 1;
        const completedRounds = nextIndex >= accountPairs.length 
          ? (settings.completed_rounds || 0) + 1 
          : settings.completed_rounds;
        
        await supabase
          .from('warmup_settings')
          .update({ 
            last_run_at: now.toISOString(),
            current_pair_index: nextIndex >= accountPairs.length ? 0 : nextIndex,
            completed_rounds: completedRounds
          })
          .eq('user_id', settings.user_id);
        continue;
      }

      const [senderId, receiverId] = currentPair;
      const senderAccount = activeAccounts.find(a => a.id === senderId);
      const receiverAccount = activeAccounts.find(a => a.id === receiverId);

      if (!senderAccount || !receiverAccount) {
        console.log(`[Warmup Runner] Accounts not found`);
        continue;
      }

      // Send messages with typing simulation
      // Ensure WhatsApp client is initialized for sender
      try {
        const { data: initData, error: initError } = await supabase.functions.invoke('whatsapp-gateway', {
          body: { action: 'initialize', accountId: senderId },
        });
        if (initError || initData?.error) {
          console.error('[Warmup Runner] Initialize error:', initError || initData?.error);
        }
      } catch (e) {
        console.error('[Warmup Runner] Initialize call failed:', e);
      }

      const messagesToSend = settings.messages_per_session || 3;
      let sentCount = 0;

      for (let i = 0; i < messagesToSend; i++) {
        // Select message based on phase
        let message: string;
        const r = Math.random();
        
        if (r < 0.12) {
          message = pick(MESSAGE_POOLS.smallReplies);
        } else if (r < 0.3) {
          message = `${pick(MESSAGE_POOLS.emojis)} ${pick(MESSAGE_POOLS[phase])}`;
        } else {
          message = pick(MESSAGE_POOLS[phase]);
        }

        try {
          // Simulate typing delay
          const typingMs = randInt(settings.min_typing_ms, settings.max_typing_ms);
          console.log(`[Warmup Runner] Typing simulation: ${typingMs}ms`);
          await sleep(typingMs);

          // Inter-message delay
          const delaySec = randInt(settings.min_delay_sec, settings.max_delay_sec);
          await sleep(delaySec * 1000);

          // Send message
          const cleanedPhone = (receiverAccount.phone_number || '').replace(/\D/g, '');
          const { data: sendData, error: sendError } = await supabase.functions.invoke('whatsapp-gateway', {
            body: {
              action: 'send-message',
              accountId: senderId,
              phoneNumber: cleanedPhone,
              message: message
            }
          });

          if (sendError || sendData?.error) {
            console.error(`[Warmup Runner] Send error:`, sendError || sendData?.error);
            // Increment blocks counter
            const { data: statsData } = await supabase
              .from('account_warmup_stats')
              .select('blocks')
              .eq('account_id', senderId)
              .single();
            
            await supabase
              .from('account_warmup_stats')
              .upsert({
                user_id: settings.user_id,
                account_id: senderId,
                blocks: (statsData?.blocks || 0) + 1
              }, {
                onConflict: 'account_id'
              });
            break;
          }

          // Store message
          await supabase.from('messages').insert({
            account_id: senderId,
            contact_phone: receiverAccount.phone_number,
            contact_name: receiverAccount.account_name,
            message_text: message,
            direction: 'outgoing',
            is_warmup: true,
            sent_at: now.toISOString()
          });

          // Update stats
          await supabase.rpc('increment_warmup_stats', {
            p_account_id: senderId,
            p_to_phone: cleanedPhone,
            p_count: 1
          });

          sentCount++;
          console.log(`[Warmup Runner] Sent ${i + 1}/${messagesToSend}: ${message.substring(0, 30)}...`);
          
        } catch (error) {
          console.error(`[Warmup Runner] Error:`, error);
          break;
        }
      }

      // Update settings
      const nextPairIndex = currentPairIndex + 1;
      const completedRounds = nextPairIndex >= accountPairs.length 
        ? (settings.completed_rounds || 0) + 1 
        : settings.completed_rounds;

      await supabase
        .from('warmup_settings')
        .update({
          last_run_at: now.toISOString(),
          messages_sent: (settings.messages_sent || 0) + sentCount,
          all_pairs: accountPairs,
          current_pair_index: nextPairIndex >= accountPairs.length ? 0 : nextPairIndex,
          completed_rounds: completedRounds,
          last_message: sentCount > 0 ? `${senderAccount.account_name} → ${receiverAccount.account_name}` : settings.last_message
        })
        .eq('user_id', settings.user_id);

      console.log(`[Warmup Runner] Cycle complete: ${sentCount} messages sent, phase ${phase}`);
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Enhanced warmup cycle completed' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Warmup Runner] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
