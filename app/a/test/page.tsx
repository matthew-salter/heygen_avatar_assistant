"use client";

import { useEffect, useRef, useState } from "react";
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
  const avatarRef = useRef<any>(null);

  useEffect(() => {
    (async () => {
      try {
        // 1) load config
        const cfgRes = await fetch("/api/get-avatar-config");
        const cfg = await cfgRes.json();
        if (cfgRes.ok) {
          setConfig(cfg);
          setStatus("Config loaded. Loading context…");
        } else {
          setStatus(`Config error: ${cfg.error || "unknown"}`);
          return;
        }

        // 2) load instructions + knowledge
        const ctxRes = await fetch("/api/get-avatar-context");
        const ctx = await ctxRes.json();
        if (ctxRes.ok) {
          setContext(ctx);
          setStatus("Ready");
        } else {
          setStatus(`Context error: ${ctx.error || "unknown"}`);
          return;
        }
      } catch (e: any) {
        setStatus(`Load error: ${e.message}`);
      }
    })();
  }, []);

  async function startAvatar() {
    if (!config) return;
    setStatus("Starting avatar…");

    try {
      // 1) get access token from your existing API
      const tokenRes = await fetch("/api/get-access-token");
      const tokenJson = await tokenRes.json();
      if (!tokenRes.ok) throw new Error(tokenJson.error || "Failed to get access token");
      const token = tokenJson?.token || tokenJson?.access_token || tokenJson?.data?.token;

      // 2) init SDK
      const avatar = new StreamingAvatar({ token });
      avatarRef.current = avatar;

      // 3) start streaming avatar session
      const session = await avatar.createStartAvatar({
        avatarName: config.heygens.avatarId || config.heygens.customAvatarId,
        quality: config.heygens.quality || "low",
        language: config.heygens.language || "English",
        transport: config.heygens.transport || "websocket",
        emotion: config.heygens.emotion || "neutral",
        voice: {
          provider: config.voice.provider,
          voiceId: config.voice.customVoiceId,
          model: config.voice.model,
          voice_settings: config.voice.voice_settings, // may or may not be respected by HeyGen
        },
      });

      // 4) attach avatar video to element
      if (videoRef.current) {
        avatar.attachToElement(videoRef.current);
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

      {/* Where the avatar video will render */}
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