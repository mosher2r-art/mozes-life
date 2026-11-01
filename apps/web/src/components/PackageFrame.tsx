"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Runs imported courseware from its own origin inside a sandboxed iframe and relays SCORM data.
 * Messages are accepted only from the package origin and only with the MOZES runtime marker.
 */
export function PackageFrame({
  launchUrl,
  title,
  cmi,
  learner,
  onCommit,
  className,
}: {
  launchUrl: string;
  title: string;
  cmi: Record<string, string>;
  learner: { id: string; name: string };
  onCommit?: (cmi: Record<string, string>) => void;
  className?: string;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const pkgOrigin = new URL(launchUrl, "https://placeholder.invalid").origin;
  const init = useRef({ cmi, learner });
  const commit = useRef(onCommit);
  commit.current = onCommit;

  useEffect(() => {
    setSrc(`${launchUrl}?parent=${encodeURIComponent(window.location.origin)}`);
  }, [launchUrl]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== pkgOrigin || e.source !== frame.current?.contentWindow) return;
      const msg = e.data as { source?: string; type?: string; data?: unknown };
      if (!msg || msg.source !== "mozes-runtime") return;
      if (msg.type === "ready") {
        frame.current?.contentWindow?.postMessage({ source: "mozes-app", type: "init", ...init.current }, pkgOrigin);
      } else if (msg.type === "commit" && msg.data && typeof msg.data === "object") {
        const clean: Record<string, string> = {};
        for (const [k, v] of Object.entries(msg.data as Record<string, unknown>)) if (k.startsWith("cmi.")) clean[k] = String(v);
        commit.current?.(clean);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [pkgOrigin]);

  return src ? (
    <iframe
      ref={frame}
      src={src}
      title={title}
      className={className}
      // Separate origin + sandbox: the courseware can run its own scripts but cannot reach the app.
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
      allow="fullscreen; autoplay"
      referrerPolicy="no-referrer"
    />
  ) : null;
}
