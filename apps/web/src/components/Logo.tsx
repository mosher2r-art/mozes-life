import Image from "next/image";
import type { CSSProperties } from "react";

/** Original dark logo on light surfaces; owner-supplied silver logo on dark surfaces. */
export function Logo({ width = 240, priority = false, surface = "light", shine = false }: {
  width?: number;
  priority?: boolean;
  surface?: "dark" | "light";
  shine?: boolean;
}) {
  const dark = surface === "dark";
  const src = dark ? "/brand/mozes-life-opening-logo.png" : "/brand/mozes-life-logo-transparent.webp";
  return (
    <span className={`logo${dark ? " logo-silver" : ""}${shine ? " logo-shine" : ""}`} style={{ width, "--logo-mask": `url("${src}")` } as CSSProperties}>
      <Image src={src} alt="MOZES LIFE — לומדים להציל חיים" width={dark ? 2045 : 1992} height={dark ? 866 : 416} sizes={`${width}px`} style={{ width: "100%", height: "auto" }} priority={priority} />
    </span>
  );
}
