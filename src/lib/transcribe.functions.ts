import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const transcribeAudio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { audioBase64: string; mimeType: string }) => data)
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY não configurada");

    const bin = Uint8Array.from(atob(data.audioBase64), (c) => c.charCodeAt(0));
    const mime = data.mimeType || "audio/webm";
    const blob = new Blob([bin], { type: mime });
    const subtype = (mime.split("/")[1] || "webm").split(";")[0];
    const extMap: Record<string, string> = {
      webm: "webm",
      mp4: "mp4",
      "x-m4a": "m4a",
      m4a: "m4a",
      mpeg: "mp3",
      mp3: "mp3",
      wav: "wav",
      wave: "wav",
      ogg: "ogg",
    };
    const ext = extMap[subtype] ?? "webm";

    const form = new FormData();
    form.append("model", "openai/gpt-4o-mini-transcribe");
    form.append("file", blob, `audio.${ext}`);

    const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Transcrição falhou (${res.status}): ${body}`);
    }
    const json = (await res.json()) as { text?: string };
    return { text: json.text ?? "" };
  });
