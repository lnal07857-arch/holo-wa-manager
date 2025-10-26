import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Phase-based message pools with more variety
const MESSAGE_POOLS = {
  phase1: [
    "Hey 👋",
    "Wie läuft dein Tag so?",
    "Alles klar bei dir?",
    "Kleiner Check-in: alles okay?",
    "Bin gleich wieder da, kurze Pause.",
    "Na, was geht?",
    "Alles fit?",
    "Kurze Frage: bist du erreichbar?",
    "Hey! Wie siehts aus?",
    "Moin!",
    "Servus 👋",
    "Hallo! Kurz Zeit?",
    "Yo, alles gut?",
    "Was machst du gerade?",
    "Bist du noch wach?",
    "Kurzes Update von mir",
    "Mal melden wollte ich",
    "Lange nichts gehört!",
    "Grüße!"
  ],
  phase2: [
    "Haha das war wirklich lustig 😂",
    "Schickst du mir mal das Foto von gestern?",
    "Ich probier's gleich nochmal — hat bei mir funktioniert.",
    "Welchen Kaffee trinkst du heute?",
    "Das Meeting wurde verschoben, kein Stress.",
    "Hast du die Nachricht bekommen?",
    "Perfekt, genau so machen wir das!",
    "Wie lief dein Termin?",
    "Das Wetter ist ja heute mega gut ☀️",
    "Hab grade an dich gedacht",
    "Kennst du das auch? 😅",
    "Bin gespannt was du dazu sagst",
    "Lass mal telefonieren die Tage",
    "Schau dir das mal an wenn du Zeit hast",
    "Genau mein Ding!",
    "Das passt perfekt",
    "Hätte nicht gedacht dass das klappt",
    "Mega interessant",
    "Hast du schon gehört?",
    "Weißt du noch von neulich?",
    "Das müssen wir nochmal machen",
    "War ne coole Sache",
    "Danke nochmal fürs letzte Mal",
    "Fand ich richtig gut",
    "Läuft bei dir soweit?",
    "Alles entspannt?",
    "Hoffe bei dir läuft alles smooth"
  ],
  phase3: [
    "Hier der Link, den ich meinte: https://example.com",
    "Ich hab das jetzt getestet und es lief stabil.",
    "Können wir das morgen kurz durchgehen?",
    "Ich schicke dir mal die Info.",
    "Top, danke für die schnelle Rückmeldung!",
    "Das klingt nach einem guten Plan.",
    "Lass uns das so umsetzen wie besprochen.",
    "Hab dir ne Mail geschickt dazu",
    "Schau mal in die Gruppe rein",
    "Können wir das diese Woche noch klären?",
    "Passt mir gut, sag Bescheid",
    "Ich meld mich dann nochmal",
    "Lass uns das finalisieren",
    "Bin dabei, kein Problem",
    "Verstehe ich gut",
    "Macht absolut Sinn",
    "Guter Punkt!",
    "Da hast du recht",
    "Stimmt, daran hab ich nicht gedacht",
    "Super Idee eigentlich",
    "Können wir gerne machen",
    "Passt für mich",
    "Hab ich notiert",
    "Bin dran",
    "Mach ich heute noch",
    "Schaue ich mir an",
    "Danke für den Hinweis",
    "Wird erledigt",
    "Alles klar, verstanden"
  ],
  emojis: ["😊", "👍", "😂", "🙌", "👌", "🔥", "✌️", "💪", "🤝", "⭐", "✨", "💯"],
  smallReplies: ["Ok", "Cool", "Klar", "Danke!", "Perfekt", "Super", "👍", "Genau", "Stimmt", "Ja", "Geht klar", "Mach ich", "Verstanden", "Alles gut", "Jo"],
  responses: [
    "Ja genau",
    "Seh ich auch so",
    "Bei mir auch",
    "Stimmt total",
    "Auf jeden Fall",
    "Kann ich bestätigen",
    "Geht mir genauso",
    "Absolut",
    "100%",
    "Sehe ich genauso",
    "Exakt",
    "Genau das!"
  ]
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

      // Time values (defer interval check until after verifying live accounts)
      const now = new Date();
      const lastRun = settings.last_run_at ? new Date(settings.last_run_at) : null;
      const minutesSinceLastRun = lastRun
        ? (now.getTime() - lastRun.getTime()) / (1000 * 60)
        : Infinity;

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
          const { data: statusData, error: statusError } = await supabase.functions.invoke('wa-gateway', {
            body: { action: 'status', accountId: acc.id },
          });
           const isLive = !statusError && statusData && (
             statusData.ready === true ||
             statusData.status === 'connected' ||
             statusData.state === 'CONNECTED' ||
             statusData.connected === true
           );
          if (isLive) activeAccounts.push(acc);
        } catch (_) {
          // ignore
        }
      }
      console.log(`[Warmup Runner] Active accounts after verification: ${activeAccounts.length}`);

      if (!activeAccounts || activeAccounts.length < 2) {
        console.log(`[Warmup Runner] Not enough live accounts`);
        // Do not update last_run_at here, retry next minute
        continue;
      }

      // Time interval check (after verifying live accounts)
      if (minutesSinceLastRun < settings.interval_minutes) {
        console.log(`[Warmup Runner] Not enough time passed (${minutesSinceLastRun.toFixed(1)}m < ${settings.interval_minutes}m), skipping`);
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

      // Generate all possible pairs (filter out inactive accounts from existing pairs)
      const activeIds = new Set(activeAccounts.map((a: any) => a.id));
      let accountPairs = (settings.all_pairs as [string, string][]) || [];
      let currentPairIndex = settings.current_pair_index || 0;

      // Filter existing pairs to only include active accounts
      accountPairs = accountPairs.filter(
        (p) => activeIds.has(p[0]) && activeIds.has(p[1])
      );
      
      // Calculate expected number of pairs: n*(n-1)/2 for n accounts
      const expectedPairs = (activeAccounts.length * (activeAccounts.length - 1)) / 2;
      
      if (!accountPairs || accountPairs.length !== expectedPairs || currentPairIndex >= accountPairs.length) {
        accountPairs = [];
        
        // Generate ALL possible pairs systematically
        for (let i = 0; i < activeAccounts.length; i++) {
          for (let j = i + 1; j < activeAccounts.length; j++) {
            accountPairs.push([activeAccounts[i].id, activeAccounts[j].id]);
          }
        }
        
        // Shuffle pairs for variety
        accountPairs.sort(() => Math.random() - 0.5);
        currentPairIndex = 0;
        
        console.log(`[Warmup Runner] Generated ALL ${accountPairs.length} pairs (expected: ${expectedPairs})`);
      } else {
        console.log(`[Warmup Runner] Using existing pairs: ${accountPairs.length}/${expectedPairs}`);
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
        console.log(`[Warmup Runner] Accounts not found in active set, advancing pair index`);
        const nextIndex = currentPairIndex + 1;
        const completedRounds = nextIndex >= accountPairs.length 
          ? (settings.completed_rounds || 0) + 1 
          : settings.completed_rounds;
        await supabase
          .from('warmup_settings')
          .update({ 
            last_run_at: now.toISOString(),
            current_pair_index: nextIndex >= accountPairs.length ? 0 : nextIndex,
            completed_rounds: completedRounds,
            all_pairs: accountPairs
          })
          .eq('user_id', settings.user_id);
        continue;
      }

      // Send messages with typing simulation
      // Ensure WhatsApp client is initialized for sender
      try {
        const { data: initData, error: initError } = await supabase.functions.invoke('wa-gateway', {
          body: { action: 'initialize', accountId: senderId },
        });
        if (initError || initData?.error) {
          console.error('[Warmup Runner] Initialize error:', initError || initData?.error);
        }
      } catch (e) {
        console.error('[Warmup Runner] Initialize call failed:', e);
      }

      // Reduce messages per session for more natural flow (1-2 messages)
      const messagesToSend = Math.random() < 0.7 ? 1 : 2;
      let sentCount = 0;
      
      // 50% chance receiver responds instead (better balance)
      const shouldReceiverRespond = Math.random() < 0.5;
      const actualSender = shouldReceiverRespond ? receiverAccount : senderAccount;
      const actualReceiver = shouldReceiverRespond ? senderAccount : receiverAccount;
      
      console.log(`[Warmup Runner] ${actualSender.account_name} → ${actualReceiver.account_name} (${messagesToSend} msg${messagesToSend > 1 ? 's' : ''})`);

      for (let i = 0; i < messagesToSend; i++) {
        // Select message based on phase with more variety
        let message: string;
        const r = Math.random();
        
        if (r < 0.15) {
          message = pick(MESSAGE_POOLS.smallReplies);
        } else if (r < 0.25) {
          message = pick(MESSAGE_POOLS.responses);
        } else if (r < 0.35) {
          message = `${pick(MESSAGE_POOLS.emojis)} ${pick(MESSAGE_POOLS[phase])}`;
        } else if (r < 0.45) {
          message = pick(MESSAGE_POOLS.emojis);
        } else {
          message = pick(MESSAGE_POOLS[phase]);
        }

        try {
          // Simulate typing delay (shorter for more natural feel)
          const typingMs = randInt(settings.min_typing_ms, settings.max_typing_ms);
          await sleep(typingMs);

          // Variable inter-message delay (2-20 seconds)
          const delaySec = randInt(settings.min_delay_sec, Math.min(settings.max_delay_sec, 20));
          await sleep(delaySec * 1000);

          // Send message (using actual sender/receiver which might be reversed)
          const cleanedPhone = (actualReceiver.phone_number || '').replace(/\D/g, '');
          const { data: sendData, error: sendError } = await supabase.functions.invoke('wa-gateway', {
            body: {
              action: 'send-message',
              accountId: actualSender.id,
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
              .eq('account_id', actualSender.id)
              .single();
            
            await supabase
              .from('account_warmup_stats')
              .upsert({
                user_id: settings.user_id,
                account_id: actualSender.id,
                blocks: (statsData?.blocks || 0) + 1
              }, {
                onConflict: 'account_id'
              });
            break;
          }

          // Store outgoing message
          await supabase.from('messages').insert({
            account_id: actualSender.id,
            contact_phone: actualReceiver.phone_number,
            contact_name: actualReceiver.account_name,
            message_text: message,
            direction: 'outgoing',
            is_warmup: true,
            sent_at: now.toISOString()
          });

          // Store incoming message for receiver (simulate conversation)
          await supabase.from('messages').insert({
            account_id: actualReceiver.id,
            contact_phone: actualSender.phone_number,
            contact_name: actualSender.account_name,
            message_text: message,
            direction: 'incoming',
            is_warmup: true,
            sent_at: now.toISOString()
          });

          // Update stats for sender
          await supabase.rpc('increment_warmup_stats', {
            p_account_id: actualSender.id,
            p_to_phone: cleanedPhone,
            p_count: 1
          });
          
          // Update received stats for receiver
          const { data: receiverStats } = await supabase
            .from('account_warmup_stats')
            .select('received_messages')
            .eq('account_id', actualReceiver.id)
            .single();
          
          await supabase
            .from('account_warmup_stats')
            .upsert({
              user_id: settings.user_id,
              account_id: actualReceiver.id,
              received_messages: (receiverStats?.received_messages || 0) + 1
            }, {
              onConflict: 'account_id'
            });

          sentCount++;
          console.log(`[Warmup Runner] ✓ ${i + 1}/${messagesToSend}: "${message.substring(0, 40)}${message.length > 40 ? '...' : ''}"`);
          
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
          last_message: sentCount > 0 ? `${actualSender.account_name} → ${actualReceiver.account_name}` : settings.last_message
        })
        .eq('user_id', settings.user_id);

      console.log(`[Warmup Runner] ✅ Cycle complete: ${sentCount} msg sent | ${actualSender.account_name}→${actualReceiver.account_name} | Phase: ${phase} | Round: ${completedRounds}`);
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
