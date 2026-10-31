/** Minimal stroke icons (24px grid, currentColor). Decorative: always aria-hidden. */
const base = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

export const IconCheck = (p: { className?: string }) => <svg {...base} {...p}><path d="M5 12.5l4.2 4.2L19 7" /></svg>;
export const IconX = (p: { className?: string }) => <svg {...base} {...p}><path d="M6 6l12 12M18 6L6 18" /></svg>;
export const IconCheckCircle = (p: { className?: string }) => <svg {...base} {...p}><circle cx="12" cy="12" r="9.25" /><path d="M7.8 12.4l2.9 2.9 5.5-5.6" /></svg>;
export const IconXCircle = (p: { className?: string }) => <svg {...base} {...p}><circle cx="12" cy="12" r="9.25" /><path d="M9 9l6 6M15 9l-6 6" /></svg>;
export const IconInfo = (p: { className?: string }) => <svg {...base} {...p}><circle cx="12" cy="12" r="9.25" /><path d="M12 11v5.5M12 7.6v.1" /></svg>;
export const IconAlert = (p: { className?: string }) => <svg {...base} {...p}><path d="M12 3.8L2.8 19.5h18.4L12 3.8z" /><path d="M12 10v4.2M12 17v.1" /></svg>;
export const IconStar = (p: { className?: string }) => <svg {...base} {...p}><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" /></svg>;
/** In RTL, "forward" points left. */
export const IconForward = (p: { className?: string }) => <svg {...base} {...p}><path d="M19 12H5M11 6l-6 6 6 6" /></svg>;
export const IconBack = (p: { className?: string }) => <svg {...base} {...p}><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
export const IconUp = (p: { className?: string }) => <svg {...base} {...p}><path d="M6 15l6-6 6 6" /></svg>;
export const IconDown = (p: { className?: string }) => <svg {...base} {...p}><path d="M6 9l6 6 6-6" /></svg>;
