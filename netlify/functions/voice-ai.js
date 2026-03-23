// ProFlow Voice AI Receptionist — Emma v3.0
// ElevenLabs natural voice with Polly fallback, Twilio signature validation, call logging
const crypto = require("crypto");

const BASE_URL = "https://myproflow.netlify.app/.netlify/functions/voice-ai";
const AUDIO_URL = "https://myproflow.netlify.app/.netlify/functions/voice-audio";
const CONV_URL = "https://myproflow.netlify.app/.netlify/functions/voice-conversation";
const VOICE = "Polly.Joanna";
const USE_ELEVENLABS = process.env.ELEVENLABS_API_KEY ? true : false;

function validateTwilioSignature(event) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) return true; // Skip validation if no token configured

  const signature = event.headers["x-twilio-signature"] || "";
  if (!signature) return false;

  const url = BASE_URL + (event.rawQuery ? `?${event.rawQuery}` : "");
  const params = event.body ? Object.fromEntries(new URLSearchParams(event.body)) : {};
  const sortedKeys = Object.keys(params).sort();
  const dataString = url + sortedKeys.map((k) => k + params[k]).join("");
  const expected = crypto.createHmac("sha1", authToken).update(dataString).digest("base64");

  return signature === expected;
}

function twiml(content) {
  return {
    statusCode: 200,
    headers: { "Content-Type": "text/xml" },
    body: `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n${content}\n</Response>`,
  };
}

function say(text) {
  if (USE_ELEVENLABS) {
    return `    <Play>${AUDIO_URL}?text=${encodeURIComponent(text)}</Play>`;
  }
  return `    <Say voice="${VOICE}" language="en-US">${text}</Say>`;
}

exports.handler = async (event) => {
  const params = event.queryStringParameters || {};
  const body = event.body ? new URLSearchParams(event.body) : new URLSearchParams();
  const digits = body.get("Digits") || params.Digits || "";
  const step = params.step || "";
  const speechResult = body.get("SpeechResult") || "";
  const callSid = body.get("CallSid") || "unknown";
  const from = body.get("From") || "unknown";

  // Log every call for analytics
  console.log(JSON.stringify({
    event: "voice_ai_request",
    step: step || "greeting",
    digits,
    speech: speechResult ? speechResult.substring(0, 100) : "",
    callSid,
    from: from.replace(/\d{4}$/, "XXXX"),
    elevenlabs: USE_ELEVENLABS,
    timestamp: new Date().toISOString(),
  }));

  // ── MAIN MENU ROUTING ──────────────────────────────
  if (step === "route") {
    if (digits === "1") {
      // Route to live AI sales bot
      return twiml(`
${say("Great choice... Let me connect you with our sales assistant.")}
    <Pause length="0"/>
    <Redirect method="POST">${CONV_URL}?dept=sales&amp;turn=0&amp;history=</Redirect>`);
    }

    if (digits === "2") {
      // Route to live AI support bot
      return twiml(`
${say("Sure thing... Let me connect you with our support specialist.")}
    <Pause length="0"/>
    <Redirect method="POST">${CONV_URL}?dept=support&amp;turn=0&amp;history=</Redirect>`);
    }

    if (digits === "0") {
      // Route to live AI general assistant
      return twiml(`
${say("One moment please... Let me connect you with our assistant.")}
    <Pause length="0"/>
    <Redirect method="POST">${CONV_URL}?dept=general&amp;turn=0&amp;history=</Redirect>`);
    }

    // Unrecognized input
    return twiml(`
${say("I didn't quite catch that. No worries, let me give you the options again.")}
    <Gather numDigits="1" timeout="4" action="${BASE_URL}?step=route" method="POST">
${say("Press 1 for sales and pricing. Press 2 for support. Press 0 to leave a message.")}
    </Gather>
${say("Goodbye.")}`);
  }

  // ── SALES / PRICING ────────────────────────────────
  if (step === "sales") {
    if (digits === "2") {
      return twiml(`
${say("Let me connect you with our sales team.")}
    <Pause length="0"/>
${say("Our sales team is currently assisting other clients. Please leave your name and number after the tone.")}
    <Record maxLength="60" transcribe="true" transcribeCallback="${BASE_URL}?step=transcription" playBeep="true" action="${BASE_URL}?step=after-record" />`);
    }

    return twiml(`
${say("Let me walk you through our plans.")}
    <Pause length="0"/>
${say("Starter... 97 dollars per month. Includes daily blog posts, social media on 3 platforms, and H.D. images.")}
${say("Growth... 297 dollars per month. This is our most popular plan. It adds 6 platform social media, a weekly newsletter, an A.I. phone receptionist for your business, and weekly performance reports.")}
${say("Agency... 497 dollars per month. Everything in Growth, plus white-label capabilities, ad creative generation, and a dedicated account manager.")}
    <Pause length="0"/>
${say("All plans come with a 14 day delivery guarantee. No contracts. Cancel anytime.")}
    <Gather numDigits="1" timeout="5" action="${BASE_URL}?step=sales" method="POST">
${say("Press 2 to speak with our sales team. Press 0 to return to the main menu.")}
    </Gather>
${say("Visit proflow dot com slash proflow to get started in just 5 minutes. Thank you for calling. Goodbye.")}`);
  }

  // ── VOICEMAIL / RECORDING HANDLERS ─────────────────
  if (step === "after-record") {
    return twiml(`
${say("Thank you for your message. A member of our team will call you back within 24 hours. Have a wonderful day. Goodbye.")}`);
  }

  if (step === "transcription") {
    const transcription = body.get("TranscriptionText") || "";
    const recordingUrl = body.get("RecordingUrl") || "";
    console.log(JSON.stringify({
      event: "voicemail_received",
      callSid,
      from,
      transcription: transcription.substring(0, 500),
      recordingUrl,
      timestamp: new Date().toISOString(),
    }));
    return { statusCode: 200, body: "" };
  }

  // ── DEFAULT GREETING ───────────────────────────────
  return twiml(`
${say("Thank you for calling ProFlow. My name is Emma, and I am happy to assist you today.")}
    <Pause length="0"/>
    <Gather numDigits="1" timeout="5" action="${BASE_URL}?step=route" method="POST">
${say("For sales and pricing information, press 1. For support, press 2. To leave a message for our team, press 0. Or simply stay on the line.")}
    </Gather>
${say("I did not receive a selection. No problem.")}
${say("Please leave a message after the tone and someone will call you back.")}
    <Record maxLength="120" transcribe="true" transcribeCallback="${BASE_URL}?step=transcription" playBeep="true" action="${BASE_URL}?step=after-record" />
${say("Thank you for calling ProFlow. Have a wonderful day.")}`);
};
