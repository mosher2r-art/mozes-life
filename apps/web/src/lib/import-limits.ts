/** Temporary files use Worker memory. Keep the original Node capacity locally. */
export const packageByteLimit = (cloudflare: boolean) => (cloudflare ? 8 : 500) * 1024 ** 2;
