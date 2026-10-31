import Image from "next/image";

/**
 * The approved logo file is used unmodified (it ships on a black backdrop).
 * On dark surfaces the backdrop is dropped visually with `mix-blend-mode: lighten`,
 * which only changes how pixels are composited, not the artwork. On light surfaces
 * it sits on a black plate until a transparent/vector master is supplied.
 */
export function Logo({
  width = 240,
  priority = false,
  surface = "dark",
}: {
  width?: number;
  priority?: boolean;
  surface?: "dark" | "light";
}) {
  return (
    <span className={surface === "dark" ? "logo logo-blend" : "logo logo-plate"}>
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
