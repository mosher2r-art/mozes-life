"use client";

import { useEffect, useRef } from "react";
import type { Block, ComponentOf, Inline } from "@mozes/content-schema";
import { usePlayer } from "./context";
import { IconAlert, IconInfo, IconStar } from "./icons";

function InlineText({ node }: { node: Inline }) {
  let el: React.ReactNode = node.text;
  if (node.bold) el = <strong>{el}</strong>;
  if (node.italic) el = <em>{el}</em>;
  if (node.href) {
    el = (
      <a href={node.href} target="_blank" rel="noopener noreferrer">
        {el}
      </a>
    );
  }
  return <>{el}</>;
}

const Inlines = ({ nodes }: { nodes: Inline[] }) => (
  <>
    {nodes.map((n, i) => (
      <InlineText key={i} node={n} />
    ))}
  </>
);

export function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((b, i) => {
        if (b.kind === "paragraph") return <p key={i}><Inlines nodes={b.content} /></p>;
        const List = b.ordered ? "ol" : "ul";
        return (
          <List key={i}>
            {b.items.map((item, j) => (
              <li key={j}><Inlines nodes={item} /></li>
            ))}
          </List>
        );
      })}
    </>
  );
}

export function HeadingView({ c }: { c: ComponentOf<"heading"> }) {
  // Screen title is the page's h1 inside the player; content headings start at h2.
  const Tag = (["h2", "h3", "h4"] as const)[c.level - 1]!;
  return <Tag className={`mp-heading mp-heading-${c.level}`}>{c.text}</Tag>;
}

export function RichTextView({ c }: { c: ComponentOf<"richText"> }) {
  return <div className="mp-richtext"><Blocks blocks={c.body} /></div>;
}

const CALLOUT_LABEL = { info: "מידע", warning: "שימו לב", success: "חשוב לזכור" } as const;

const CALLOUT_ICON = { info: IconInfo, warning: IconAlert, success: IconStar } as const;

export function CalloutView({ c }: { c: ComponentOf<"callout"> }) {
  const Icon = CALLOUT_ICON[c.tone];
  return (
    <aside className={`mp-callout mp-callout-${c.tone}`} aria-label={CALLOUT_LABEL[c.tone]}>
      <Icon className="mp-callout-icon" />
      <div className="mp-callout-body">
        <Blocks blocks={c.body} />
      </div>
    </aside>
  );
}

export function MissingMedia() {
  return <div className="mp-media-missing" role="note">קובץ המדיה אינו זמין</div>;
}

export function ImageView({ c, cover = false }: { c: ComponentOf<"image">; cover?: boolean }) {
  const { resolveMedia } = usePlayer();
  const m = resolveMedia(c.media);
  if (!m) return <MissingMedia />;
  return (
    <figure className={`mp-figure${cover ? " mp-cover" : ""}`}>
      <img src={m.src} alt={c.decorative ? "" : c.alt} loading="lazy" />
      {c.caption && <figcaption>{c.caption}</figcaption>}
    </figure>
  );
}

export function VideoView({
  c,
  cover = false,
  onPausePoint,
}: {
  c: ComponentOf<"video">;
  cover?: boolean;
  onPausePoint?: () => void;
}) {
  const { resolveMedia, dispatch } = usePlayer();
  const ref = useRef<HTMLVideoElement>(null);
  const paused = useRef(false);
  const lastSent = useRef(0);
  const src = resolveMedia(c.media);
  const poster = c.poster ? resolveMedia(c.poster) : null;
  const captions = c.captions && !Array.isArray(c.captions) ? resolveMedia(c.captions) : null;

  useEffect(() => {
    paused.current = false;
    lastSent.current = 0;
  }, [c.id]);

  if (!src) return <MissingMedia />;

  const onTime = () => {
    const v = ref.current;
    if (!v || !v.duration) return;
    const pct = (v.currentTime / v.duration) * 100;
    if (pct - lastSent.current >= 5 || pct >= 99) {
      lastSent.current = pct;
      dispatch({ type: "media_progress", componentId: c.id, percent: pct });
    }
    if (c.pauseAtMs !== undefined && !paused.current && v.currentTime * 1000 >= c.pauseAtMs) {
      paused.current = true;
      v.pause();
      onPausePoint?.();
    }
  };

  return (
    <figure className={`mp-figure mp-video${cover ? " mp-cover" : ""}`}>
      <video
        ref={ref}
        controls
        playsInline
        preload="metadata"
        poster={poster?.src}
        onTimeUpdate={onTime}
        onEnded={() => {
          dispatch({ type: "media_progress", componentId: c.id, percent: 100 });
          onPausePoint?.();
        }}
      >
        <source src={src.src} type={src.mime} />
        {captions && <track kind="captions" src={captions.src} srcLang="he" label="עברית" default />}
      </video>
      {c.transcript && (
        <details className="mp-transcript">
          <summary>תמליל</summary>
          <p>{c.transcript}</p>
        </details>
      )}
    </figure>
  );
}

export function AudioView({ c }: { c: ComponentOf<"audio"> }) {
  const { resolveMedia, dispatch } = usePlayer();
  const m = resolveMedia(c.media);
  if (!m) return <MissingMedia />;
  return (
    <figure className="mp-figure mp-audio">
      <audio
        controls
        preload="metadata"
        src={m.src}
        onEnded={() => dispatch({ type: "media_progress", componentId: c.id, percent: 100 })}
      />
      <details className="mp-transcript">
        <summary>תמליל</summary>
        <p>{c.transcript}</p>
      </details>
    </figure>
  );
}
