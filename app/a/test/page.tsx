"use client";

import { useEffect, useRef, useState } from "react";
// Default import for this SDK build
import { StreamingAvatar } from "@heygen/streaming-avatar";

type AvatarConfig = {
  displayName: string;
  heygens: {
    avatarId?: string;
    customAvatarId?: string;
    language?: string;
    quality?: "low" | "medium" | "high";
    transport?: "websocket" | "livekit";
    emotion?: string;
  };
  voice: {
    provider: string;
    model: string;
    customVoiceId?: string;
    voice_settings?: {
      speaking_rate?: number;
      stability?: number;
      similarity_boost?: number;
    };
  };
  stt: { provider: string };
};

export default function TestAvatarPage() {
  const [config, setConfig] = useState<AvatarConfig | null>(null);
  const [context, setContext] = useState<{ instructions: string; knowledge: string } | null>(null);
  const [status, setStatus] = useState<string>("Loading config…");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const avatarRef = useRef<any>(null); // keep simple for this SDK typing

  useEffect(() => {
    (async () => {
      try {
        // Load config
        const cfgRes = await fetch("/api/get-avatar-config");
        const cfg = await cfgRes.json();
        if (!cfgRes.ok) {
          setStatus(`Config error: ${cfg.error || "unknown"}`);
          return;
        }
        setConfig(cfg);
        setStatus("Config loaded. Loading context…");

        // Load instructions + KB
        const ctxRes = await fetch("/api/get-avatar-context");
        const ctx = await ctxRes.json();
        if (!ctxRes.ok) {
          setStatus(`Context error: ${ctx.error || "unknown"}`);
          return;
        }
        setContext(ctx);
        setStatus("Ready");
      } catch (e: any) {
        setStatus(`Load error: ${e.message}`);
      }
    })();
  }, []);

  async function startAvatar() {
    if (!config) return;
    setStatus("Starting avatar…");

    try {
      // 1) Get a fresh one-time token
      const tokenRes = await fetch("/api/get-access-token");
      const tokenJson = await tokenRes.json();
      if (!tokenRes.ok || !tokenJson?.token) {
        throw new Error(tokenJson?.error || "Failed to get access token");
      }
      const token: string = tokenJson.token;

      // 2) Init client with token
      const client = new (StreamingAvatar as any)({ token });
      avatarRef.current = client;

      // 3) Start avatar (this build returns a MediaStream)
      const stream: MediaStream = await client.createStartAvatar({
        avatarName: config.heygens.avatarId || config.heygens.customAvatarId,
        quality: config.heygens.quality || "medium",
        language: (config.heygens.language || "en") as string,
        transport: (config.heygens.transport || "websocket") as "websocket" | "livekit",
        emotion: config.heygens.emotion || "neutral",
        voice: {
          provider: config.voice.provider,
          model: config.voice.model,
          voiceId: config.voice.customVoiceId,
          voice_settings: config.voice.voice_settings,
        },
      });

      // 4) Pipe MediaStream to <video>
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => void 0);
      }

      setStatus("Avatar started and streaming.");
    } catch (e: any) {
      setStatus(`Start error: ${e.message}`);
    }
  }

  return (
    <div style={{ padding: 24, display: "grid", gap: 16 }}>
      <h1>{config?.displayName ?? "Test Avatar"}</h1>
      <p><strong>Status:</strong> {status}</p>

      <button
        onClick={startAvatar}
        disabled={!config || !context}
        style={{ padding: "10px 16px", width: 200 }}
      >
        Start Avatar
      </button>

      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{ width: 640, height: 360, background: "#000" }}
      />

      <details>
        <summary>Show loaded config</summary>
        <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(config, null, 2)}</pre>
      </details>

      <details>
        <summary>Show instructions (first 2,000 chars)</summary>
        <pre style={{ whiteSpace: "pre-wrap" }}>
          {context?.instructions?.slice(0, 2000) || "(none)"}
          {(context?.instructions?.length ?? 0) > 2000 ? "…(truncated)" : ""}
        </pre>
      </details>

      <details>
        <summary>Show KB (first 2,000 chars)</summary>
        <pre style={{ whiteSpace: "pre-wrap" }}>
          {context?.knowledge?.slice(0, 2000) || "(none)"}
          {(context?.knowledge?.length ?? 0) > 2000 ? "…(truncated)" : ""}
        </pre>
      </details>
    </div>
  );
}
