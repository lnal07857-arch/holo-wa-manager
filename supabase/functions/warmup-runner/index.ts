import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DEFAULT_MESSAGES = [
  "Hallo, wie geht es dir?",
  "Hey, alles klar?",
  "Moin!",
  "Guten Morgen!",
  "Hi, was geht?",
  "Servus!",
  "Grüß dich!",
  "Na, alles gut?",
  "Danke, mir geht's gut!",
  "Alles bestens, danke!",
  "Ja, alles super bei mir",
  "Mir geht es sehr gut, danke der Nachfrage",
  "Passt alles, danke!",
  "Bestens!",
  "Perfekt!",
  "Alles klar!",
  "Verstanden!",
  "Ok, danke!",
  "Super, danke!",
  "Sehr gut, danke!",
  "Was machst du gerade?",
  "Was gibt es Neues?",
  "Wie war dein Tag?",
  "Alles gut bei dir?",
  "Kommst du zurecht?",
  "Hast du heute viel vor?",
  "Wie läuft es bei dir?",
  "Was treibst du so?",
  "Arbeitest du gerade?",
  "Schon Feierabend?",
  "Hast du schon Pläne fürs Wochenende?",
  "Wie war dein Wochenende?",
  "Ich arbeite gerade",
  "Bin gerade unterwegs",
  "Nichts Besonderes",
  "Das Übliche halt",
  "Ganz ok, nichts Besonderes",
  "Nicht viel los heute",
  "Bin noch im Büro",
  "Gerade am Entspannen",
  "Gleich Feierabend",
  "Hab heute frei",
  "Das freut mich!",
  "Schön zu hören!",
  "Cool!",
  "Sehr schön!",
  "Top!",
  "Freut mich für dich!",
  "Das klingt gut!",
  "Prima!",
  "Bis später!",
  "Bis dann!",
  "Mach's gut!",
  "Bis bald!",
  "Schönen Tag noch!",
  "Dir auch!",
  "Ciao!",
  "Tschüss!",
  "Einen schönen Abend!",
  "Gute Nacht!",
  "Ok",
  "Ja",
  "Stimmt",
  "Genau",
  "Richtig",
  "Klar",
  "Sicher",
  "Auf jeden Fall",
  "Definitiv",
  "Passt",
  "Alles gut 👍",
  "Danke dir! 😊",
  "Super! 🎉",
  "Perfekt! ✅",
  "Freut mich! 😊",
  "Alles klar! 👌",
  "Top! 👍",
  "Ok! ✌️",
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('[Warmup Runner] Starting warmup cycle');

    // Get all users with active warmup
    const { data: warmupSettings, error: settingsError } = await supabase
      .from('warmup_settings')
      .select('*')
      .eq('is_running', true);

    if (settingsError) {
      console.error('[Warmup Runner] Error fetching settings:', settingsError);
      throw settingsError;
    }

    if (!warmupSettings || warmupSettings.length === 0) {
      console.log('[Warmup Runner] No active warmup sessions found');
      return new Response(
        JSON.stringify({ message: 'No active warmup sessions' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    console.log(`[Warmup Runner] Found ${warmupSettings.length} active warmup session(s)`);

    // Process each user's warmup
    for (const settings of warmupSettings) {
      try {
        // Check if enough time has passed since last run
        const lastRun = settings.last_run_at ? new Date(settings.last_run_at).getTime() : 0;
        const now = Date.now();
        const intervalMs = settings.interval_minutes * 60 * 1000;

        if (now - lastRun < intervalMs) {
          console.log(`[Warmup Runner] Skipping user ${settings.user_id} - not enough time passed`);
          continue;
        }

        console.log(`[Warmup Runner] Processing warmup for user ${settings.user_id}`);

        // Get user's connected accounts
        const { data: accounts, error: accountsError } = await supabase
          .from('whatsapp_accounts')
          .select('*')
          .eq('user_id', settings.user_id)
          .eq('status', 'connected');

        if (accountsError || !accounts || accounts.length < 2) {
          console.log(`[Warmup Runner] Not enough accounts for user ${settings.user_id}`);
          continue;
        }

        // Create or update pairs if needed
        let allPairs = settings.all_pairs as [string, string][] || [];
        if (allPairs.length === 0 || settings.current_pair_index >= allPairs.length) {
          // Generate new pairs
          allPairs = [];
          for (let i = 0; i < accounts.length; i++) {
            for (let j = i + 1; j < accounts.length; j++) {
              allPairs.push([accounts[i].id, accounts[j].id]);
            }
          }
          // Shuffle
          allPairs.sort(() => Math.random() - 0.5);
          
          await supabase
            .from('warmup_settings')
            .update({
              all_pairs: allPairs,
              current_pair_index: 0,
              completed_rounds: settings.completed_rounds + (settings.current_pair_index >= (settings.all_pairs as any[])?.length ? 1 : 0)
            })
            .eq('id', settings.id);
          
          settings.current_pair_index = 0;
          settings.all_pairs = allPairs;
        }

        // Get current pair
        const pairIds = allPairs[settings.current_pair_index];
        const acc1 = accounts.find(a => a.id === pairIds[0]);
        const acc2 = accounts.find(a => a.id === pairIds[1]);

        if (!acc1 || !acc2) {
          console.log(`[Warmup Runner] Pair accounts not found, skipping`);
          await supabase
            .from('warmup_settings')
            .update({
              current_pair_index: (settings.current_pair_index + 1) % allPairs.length,
              skipped_pairs: settings.skipped_pairs + 1
            })
            .eq('id', settings.id);
          continue;
        }

        console.log(`[Warmup Runner] Using pair: ${acc1.account_name} ↔ ${acc2.account_name}`);

        // Send messages
        let sessionMessages = 0;
        let lastMsg = '';

        for (let i = 0; i < settings.messages_per_session; i++) {
          // Message 1: acc1 -> acc2
          const message1 = DEFAULT_MESSAGES[Math.floor(Math.random() * DEFAULT_MESSAGES.length)];
          const cleaned1 = (acc2.phone_number || '').replace(/\D/g, '');
          
          const { data: sendData1, error: sendError1 } = await supabase.functions.invoke('whatsapp-gateway', {
            body: {
              action: 'send-message',
              accountId: acc1.id,
              phoneNumber: cleaned1,
              message: message1,
            }
          });

          if (!sendError1 && !sendData1?.error) {
            sessionMessages++;
            lastMsg = `${acc1.account_name} → ${acc2.account_name}: ${message1}`;
            
            await supabase.from('messages').insert({
              account_id: acc1.id,
              contact_phone: acc2.phone_number,
              contact_name: null,
              message_text: message1,
              direction: 'outgoing',
              is_warmup: true,
              sent_at: new Date().toISOString(),
            });

            // Random delay between 5-15 seconds
            const delay1 = 5000 + Math.random() * 10000;
            console.log(`[Warmup] Waiting ${Math.round(delay1/1000)}s before next message`);
            await new Promise(resolve => setTimeout(resolve, delay1));
          }

          // Message 2: acc2 -> acc1
          const message2 = DEFAULT_MESSAGES[Math.floor(Math.random() * DEFAULT_MESSAGES.length)];
          const cleaned2 = (acc1.phone_number || '').replace(/\D/g, '');
          
          const { data: sendData2, error: sendError2 } = await supabase.functions.invoke('whatsapp-gateway', {
            body: {
              action: 'send-message',
              accountId: acc2.id,
              phoneNumber: cleaned2,
              message: message2,
            }
          });

          if (!sendError2 && !sendData2?.error) {
            sessionMessages++;
            lastMsg = `${acc2.account_name} → ${acc1.account_name}: ${message2}`;
            
            await supabase.from('messages').insert({
              account_id: acc2.id,
              contact_phone: acc1.phone_number,
              contact_name: null,
              message_text: message2,
              direction: 'outgoing',
              is_warmup: true,
              sent_at: new Date().toISOString(),
            });

            // Random delay between 5-15 seconds
            const delay2 = 5000 + Math.random() * 10000;
            console.log(`[Warmup] Waiting ${Math.round(delay2/1000)}s before next message`);
            await new Promise(resolve => setTimeout(resolve, delay2));
          }
        }

        // Update settings
        const nextIndex = (settings.current_pair_index + 1) % allPairs.length;
        await supabase
          .from('warmup_settings')
          .update({
            messages_sent: settings.messages_sent + sessionMessages,
            current_pair_index: nextIndex,
            last_message: lastMsg,
            last_run_at: new Date().toISOString(),
            completed_rounds: settings.completed_rounds + (nextIndex === 0 ? 1 : 0)
          })
          .eq('id', settings.id);

        console.log(`[Warmup Runner] Completed session for user ${settings.user_id}: ${sessionMessages} messages sent`);
      } catch (userError) {
        console.error(`[Warmup Runner] Error processing user ${settings.user_id}:`, userError);
      }
    }

    return new Response(
      JSON.stringify({ success: true, processed: warmupSettings.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    console.error('[Warmup Runner] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});