// Voice Conversation AI — Claude-powered departmental bots
// Handles real-time phone conversations via Twilio + Claude + ElevenLabs

const BASE_URL = "https://myproflow.netlify.app/.netlify/functions/voice-ai";
const CONV_URL = "https://myproflow.netlify.app/.netlify/functions/voice-conversation";
const AUDIO_URL = "https://myproflow.netlify.app/.netlify/functions/voice-audio";

const SYSTEM_PROMPTS = {
  sales: `You are Emma, the ProFlow AI sales assistant at ProFlow. You help callers understand ProFlow — a done-for-you AI content engine that replaces an entire content team.

Key facts you know:
- Starter plan: $97/mo (daily blog posts, 3-platform social media, HD images)
- Growth plan: $297/mo (6 platforms, newsletter, AI receptionist, weekly reports) — most popular
- Agency plan: $497/mo (white-label, ad creatives, dedicated manager)
- Traditional content team costs $4,900+/mo — ProFlow saves over $4,600/mo
- Setup takes 5 minutes. 14-day delivery guarantee. No contracts. Cancel anytime.
- Clients get: 30 blog posts, 90+ social posts, 30 HD images, 4 newsletters per month
- Website: nyspotlightreport.com/proflow

Rules:
- Keep responses to 2-3 sentences MAX (this is a phone call, not a blog post)
- Be warm, confident, and conversational — like a real NYC sales pro
- Handle objections by emphasizing ROI and the guarantee
- If they want to sign up, direct them to nyspotlightreport.com/activate
- If you can't answer something, offer to have the team follow up by email`,

  support: `You are Emma, the ProFlow support specialist at ProFlow. You help existing clients with their ProFlow content engine.

You can help with:
- Content delivery questions (blog posts, social media scheduling)
- Voice AI receptionist setup
- Dashboard access and analytics
- Billing and plan changes
- Technical issues with integrations

Rules:
- Keep responses to 2-3 sentences MAX
- Be empathetic, patient, and solution-oriented
- If you need to escalate, say you'll have the team email them within 24 hours
- For billing issues, direct them to email nyspotlightreport@gmail.com
- Log the issue clearly so support can follow up`,

  general: `You are Emma, the AI assistant at ProFlow. You answer general questions about the company and its services.

About ProFlow:
- Founded in 2020, based in New York
- ProFlow is the main product — an AI content automation system
- Chairman: S.C. Thomas
- Phone: (631) 892-9817
- Website: nyspotlightreport.com

Rules:
- Keep responses to 2-3 sentences MAX
- If they want sales info, mention you can transfer them (they can press 1 from the main menu)
- If they need support, mention they can press 2
- Be friendly and helpful
- If they want to leave a message, let them know you'll transfer to voicemail`
};

function twiml(content) {
  return {
    statusCode: 200,
    headers: { "Content-Type": "text/xml" },
    body: `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n${content}\n</Response>`,
  };
}

function play(text) {
  return `    <Play>${AUDIO_URL}?text=${encodeURIComponent(text)}</Play>`;
}

async function callClaude(systemPrompt, history) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return "I'm having a technical issue right now. Let me transfer you to leave a message.";

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 200,
        system: systemPrompt,
        messages: history,
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!resp.ok) {
      console.error("Claude API error:", resp.status);
      return "I'm having trouble connecting right now. Let me transfer you to leave a message.";
    }

    const data = await resp.json();
    return data.content?.[0]?.text || "I didn't quite catch that. Could you repeat that for me?";
  } catch (err) {
    console.error("Claude call failed:", err.message);
    return "I'm experiencing a brief technical issue. Let me transfer you to voicemail so someone can call you back.";
  }
}

async function logToSupabase(callSid, fromNumber, dept, turn, callerText, aiResponse) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;
  if (!url || !key) return;

  try {
    await fetch(`${url}/rest/v1/voice_conversations`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        call_sid: callSid,
        from_number: fromNumber,
        department: dept,
        turn,
        caller_text: callerText,
        ai_response: aiResponse,
      }),
      signal: AbortSignal.timeout(3000),
    }).catch(() => {});
  } catch (_) {}
}

exports.handler = async (event) => {
  const params = event.queryStringParameters || {};
  const body = event.body ? new URLSearchParams(event.body) : new URLSearchParams();

  const dept = params.dept || "general";
  const turn = parseInt(params.turn || "0", 10);
  const historyB64 = params.history || "";
  const speechResult = body.get("SpeechResult") || "";
  const callSid = body.get("CallSid") || "unknown";
  const from = body.get("From") || "unknown";

  // Decode conversation history
  let history = [];
  if (historyB64) {
    try {
      history = JSON.parse(Buffer.from(historyB64, "base64").toString("utf-8"));
    } catch (_) {
      history = [];
    }
  }

  // Log incoming
  console.log(JSON.stringify({
    event: "voice_conversation",
    dept,
    turn,
    speech: speechResult ? speechResult.substring(0, 100) : "",
    callSid,
    from: from.replace(/\d{4}$/, "XXXX"),
    timestamp: new Date().toISOString(),
  }));

  // If no speech detected (first turn greeting or silence)
  if (!speechResult && turn === 0) {
    // First turn — just the greeting, wait for speech
    const greeting = dept === "sales"
      ? "Hi there! I'm Emma, your ProFlow sales assistant. I can answer any questions about our plans, pricing, or how the system works. What would you like to know?"
      : dept === "support"
      ? "Hi! I'm Emma, your ProFlow support specialist. I'm here to help with any issues or questions about your account. What can I help you with today?"
      : "Hi! I'm Emma from ProFlow. How can I help you today?";

    const encodedHistory = Buffer.from(JSON.stringify([
      { role: "assistant", content: greeting }
    ])).toString("base64");

    return twiml(`
${play(greeting)}
    <Gather input="speech" speechTimeout="auto" timeout="10"
      action="${CONV_URL}?dept=${dept}&amp;turn=1&amp;history=${encodedHistory}" method="POST">
      <Pause length="0"/>
    </Gather>
${play("Are you still there? Feel free to ask me anything.")}
    <Gather input="speech" speechTimeout="auto" timeout="8"
      action="${CONV_URL}?dept=${dept}&amp;turn=1&amp;history=${encodedHistory}" method="POST">
      <Pause length="0"/>
    </Gather>
${play("No worries. Let me transfer you to voicemail.")}
    <Record maxLength="120" transcribe="true"
      transcribeCallback="${BASE_URL}?step=transcription" playBeep="true"
      action="${BASE_URL}?step=after-record"/>`);
  }

  // Max turns check
  if (turn >= 10) {
    return twiml(`
${play("It's been wonderful talking with you! Let me transfer you so our team can follow up personally. Please leave a message after the tone.")}
    <Record maxLength="120" transcribe="true"
      transcribeCallback="${BASE_URL}?step=transcription" playBeep="true"
      action="${BASE_URL}?step=after-record"/>`);
  }

  // Add caller speech to history
  if (speechResult) {
    history.push({ role: "user", content: speechResult });
  }

  // Trim history if too long (keep last 6 messages to stay under URL limits)
  if (history.length > 8) {
    history = [history[0], ...history.slice(-6)];
  }

  // Get AI response
  const systemPrompt = SYSTEM_PROMPTS[dept] || SYSTEM_PROMPTS.general;
  const aiResponse = await callClaude(systemPrompt, history);

  // Add response to history
  history.push({ role: "assistant", content: aiResponse });

  // Log to Supabase (fire and forget)
  logToSupabase(callSid, from, dept, turn, speechResult, aiResponse);

  // Encode updated history
  const encodedHistory = Buffer.from(JSON.stringify(history)).toString("base64");
  const nextTurn = turn + 1;

  // Check if AI wants to end the call (transfer to voicemail)
  const wantsTransfer = aiResponse.toLowerCase().includes("transfer") && aiResponse.toLowerCase().includes("voicemail");

  if (wantsTransfer) {
    return twiml(`
${play(aiResponse)}
    <Pause length="1"/>
${play("Please leave your message after the tone.")}
    <Record maxLength="120" transcribe="true"
      transcribeCallback="${BASE_URL}?step=transcription" playBeep="true"
      action="${BASE_URL}?step=after-record"/>`);
  }

  return twiml(`
${play(aiResponse)}
    <Gather input="speech" speechTimeout="auto" timeout="10"
      action="${CONV_URL}?dept=${dept}&amp;turn=${nextTurn}&amp;history=${encodedHistory}" method="POST">
      <Pause length="0"/>
    </Gather>
${play("I'm still here if you have any other questions.")}
    <Gather input="speech" speechTimeout="auto" timeout="8"
      action="${CONV_URL}?dept=${dept}&amp;turn=${nextTurn}&amp;history=${encodedHistory}" method="POST">
      <Pause length="0"/>
    </Gather>
${play("It sounds like we're wrapping up. Thank you so much for calling ProFlow. Have a wonderful day!")}`);
};
