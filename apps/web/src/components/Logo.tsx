import Image from "next/image";

/**
 * Brand logo — both files are supplied by the brand owner; shapes and colours are untouched
 * (only transparent margins were trimmed).
 * - light surfaces: dark lettering on transparent background.
 * - dark surfaces: light (silver) lettering on transparent background.
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
    <span className="logo">
      <Image
        src={dark ? "/brand/mozes-life-logo-light.webp" : "/brand/mozes-life-logo-transparent.webp"}
        alt="MOZES LIFE — לומדים להציל חיים"
        width={dark ? 1968 : 1992}
        height={dark ? 395 : 416}
        style={{ width, height: "auto" }}
        priority={priority}
      />
    </span>
  );
}
