// netlify/functions/voice-audio.js
// ElevenLabs TTS proxy for Twilio <Play> integration
// Returns audio/mpeg for a given text query parameter

exports.handler = async (event) => {
  const text = (event.queryStringParameters || {}).text;
  if (!text) {
    return { statusCode: 400, body: "Missing text parameter" };
  }

  const API_KEY = process.env.ELEVENLABS_API_KEY;
  if (!API_KEY) {
    // Fallback: return empty audio so Twilio doesn't error
    console.error("ELEVENLABS_API_KEY not configured");
    return { statusCode: 500, body: "TTS not configured" };
  }

  // "Sarah" voice — warm, professional female
  const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "EXAVITQu4vr4xnSDxMaL";

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": API_KEY,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text: decodeURIComponent(text),
          model_id: "eleven_turbo_v2",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.3,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("ElevenLabs API error:", response.status, errText);
      return { statusCode: 502, body: "TTS generation failed" };
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=3600",
      },
      body: audioBuffer.toString("base64"),
      isBase64Encoded: true,
    };
  } catch (err) {
    console.error("voice-audio error:", err.message);
    return { statusCode: 500, body: "TTS error" };
  }
};
