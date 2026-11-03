import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import path from "node:path";
import { tmpdir } from "node:os";
const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("aws4fetch", () => ({ AwsClient: class { fetch = fetchMock; } }));
import { driver, inspect, packageBaseUrl, localPath } from "./storage";

beforeEach(() => {
  vi.stubEnv("MEDIA_DRIVER", "none");
  vi.stubEnv("DEPLOY_TARGET", "cloudflare");
  vi.stubEnv("R2_ACCOUNT_ID", "test-account");
  vi.stubEnv("R2_ACCESS_KEY_ID", "test-key");
  vi.stubEnv("R2_SECRET_ACCESS_KEY", "test-only-not-a-real-secret");
  vi.stubEnv("R2_BUCKET", "test-bucket");
  vi.stubEnv("R2_PUBLIC_BASE_URL", "https://courseware.example.invalid");
  vi.stubEnv("BETTER_AUTH_URL", "https://app.example.invalid");
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("Worker object storage", () => {
  it("respects an absolute local storage directory without adding the working directory",()=>{const directory=path.join(tmpdir(),"mozes-storage-test");vi.stubEnv("MEDIA_LOCAL_DIR",directory);expect(localPath("private/media/test.png")).toBe(path.join(directory,"private/media/test.png"));});
  it("rejects the local driver rather than persisting into ephemeral Worker storage", () => {
    vi.stubEnv("MEDIA_DRIVER", "local");
    expect(() => driver()).toThrow(/Local storage/);
  });
  it("refuses executable courseware on the app origin", () => {
    vi.stubEnv("R2_PUBLIC_BASE_URL", "https://app.example.invalid/media");
    expect(() => packageBaseUrl()).toThrow(/different origin/);
  });
  it("reads only the signature and cancels a full response when the provider ignores Range", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(64).fill(7)); }, cancel,
    });
    fetchMock.mockResolvedValueOnce(new Response(body, { headers: { "content-length": "1073741824" } }));
    const result = await inspect("video/test.mp4");
    expect(result?.size).toBe(1073741824);
    expect(result?.head).toEqual(new Uint8Array(32).fill(7));
    expect(cancel).toHaveBeenCalledOnce();
  });
});
