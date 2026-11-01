import Image from "next/image";

/**
 * Brand logo.
 * - light surfaces: transparent version (black backdrop removed from the approved file;
 *   shapes and colours untouched — approved by the brand owner).
 * - dark surfaces: the original on-black file, composited with `mix-blend-mode: lighten`
 *   so its backdrop disappears. A light-on-dark logo variant is still pending.
 */
export function Logo({
  width = 240,
  priority = false,
  surface = "light",
}: {
  width?: number;
  priority?: boolean;
  surface?: "dark" | "light";
}) {
  const dark = surface === "dark";
  return (
    <span className={dark ? "logo logo-blend" : "logo"}>
      <Image
        src={dark ? "/brand/mozes-life-logo-on-black.webp" : "/brand/mozes-life-logo-transparent.webp"}
        alt="MOZES LIFE — לומדים להציל חיים"
        width={dark ? 2000 : 1992}
        height={dark ? 667 : 416}
        style={{ width, height: "auto" }}
        priority={priority}
      />
    </span>
  );
}
