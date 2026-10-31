import Image from "next/image";

/**
 * The approved logo file is used unmodified. It ships on a black backdrop, so it is
 * always placed on a black plate. A transparent / vector master is still required
 * from the brand owner before it can sit directly on light surfaces.
 */
export function Logo({ width = 240, priority = false }: { width?: number; priority?: boolean }) {
  return (
    <span className="logo-plate">
      <Image
        src="/brand/mozes-life-logo-on-black.webp"
        alt="MOZES LIFE — לומדים להציל חיים"
        width={2000}
        height={667}
        style={{ width, height: "auto" }}
        priority={priority}
      />
    </span>
  );
}
