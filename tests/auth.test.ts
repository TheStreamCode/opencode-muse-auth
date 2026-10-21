import { test } from "node:test"
import assert from "node:assert/strict"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { mkdtempSync, readFileSync } from "node:fs"
import {
  AUTH_CONTRACT_VERSION,
  CLIENT_ID,
  DEVICE_URL,
  KEY_URL,
  TOKEN_URL,
  readCache,
  resolveLoaderKey,
  writeCache,
  deviceAuthorize,
  pollToken,
  mintKey,
} from "../dist/auth.js"

type Handler = (url: string) => { status: number; body: unknown }

function stubFetch(handler: Handler): void {
  globalThis.fetch = (async (input: unknown) => {
    const url = String(input)
    const { status, body } = handler(url)
    return new Response(JSON.stringify(body), { status })
  }) as typeof fetch
}

const DEVICE_OK = {
  device_code: "dc",
  user_code: "ABCD-EFGH",
  verification_uri: "https://auth.meta.com/device",
  verification_uri_complete: "https://auth.meta.com/device?user_code=ABCD-EFGH",
  interval: 0,
  expires_in: 600,
}

const KEY_OK = {
  api_key: "LLM|fresh",
  user_email: "User@Example.com",
  user_id: "uid-1",
  is_subs_active: true,
}

test("cache roundtrip keeps credentials", async () => {
  const dir = mkdtempSync(join(tmpdir(), "muse-auth-"))
  const path = join(dir, "creds.json")
  await writeCache({ oauthAccessToken: "dca-x", apiKey: "LLM|k", accountId: "uid-1" }, path)
  assert.equal(await readCache(path), "LLM|k")
})

test("cache miss resolves empty", async () => {
  assert.equal(await readCache(join(tmpdir(), "muse-auth-absent.json")), "")
})

test("cache never persists the OAuth access token", async () => {
  const dir = mkdtempSync(join(tmpdir(), "muse-auth-"))
  const path = join(dir, "creds.json")
  await writeCache(
    { oauthAccessToken: "dca-secret", apiKey: "LLM|k", accountId: "uid-1", email: "u@e.c" },
    path,
  )
  const raw = readFileSync(path, "utf8")
  assert.ok(!raw.includes("dca-secret"))
  assert.ok(!raw.includes("oauthAccessToken"))
  assert.deepStrictEqual(JSON.parse(raw), { apiKey: "LLM|k", accountId: "uid-1", email: "u@e.c" })
})

test("device authorize validates fields", async () => {
  stubFetch(() => ({ status: 200, body: DEVICE_OK }))
  const device = await deviceAuthorize()
  assert.equal(device.user_code, "ABCD-EFGH")
  stubFetch(() => ({ status: 200, body: { user_code: "x" } }))
  await assert.rejects(deviceAuthorize(), /missing fields/)
})

test("poll completes after pending", async () => {
  let calls = 0
  stubFetch(() => {
    calls += 1
    return calls === 1
      ? { status: 400, body: { error: "authorization_pending" } }
      : { status: 200, body: { access_token: "dca-new" } }
  })
  assert.equal(await pollToken("dc", 0, 600), "dca-new")
})

test("poll rejects terminal errors", async () => {
  stubFetch(() => ({ status: 400, body: { error: "access_denied" } }))
  await assert.rejects(pollToken("dc", 0, 600), /access_denied/)
})

test("poll survives transient transport failures", async () => {
  const original = globalThis.fetch
  let calls = 0
  globalThis.fetch = (async () => {
    calls += 1
    if (calls <= 2) {
      throw new TypeError("fetch failed")
    }
    return calls === 3
      ? new Response(JSON.stringify({ error: "authorization_pending" }), { status: 400 })
      : new Response(JSON.stringify({ access_token: "dca-after-blip" }))
  }) as typeof fetch
  try {
    assert.equal(await pollToken("dc", 1, 600), "dca-after-blip")
    assert.equal(calls, 4)
  } finally {
    globalThis.fetch = original
  }
})

test("poll keeps polling after unparseable token responses", async () => {
  const original = globalThis.fetch
  let calls = 0
  globalThis.fetch = (async () => {
    calls += 1
    return calls === 1
      ? new Response("<html>bad gateway</html>", { status: 502 })
      : new Response(JSON.stringify({ access_token: "dca-after-html" }))
  }) as typeof fetch
  try {
    assert.equal(await pollToken("dc", 1, 600), "dca-after-html")
    assert.equal(calls, 2)
  } finally {
    globalThis.fetch = original
  }
})

test("poll still aborts on terminal OAuth errors after a transport blip", async () => {
  const original = globalThis.fetch
  let calls = 0
  globalThis.fetch = (async () => {
    calls += 1
    return calls === 1
      ? Promise.reject(new TypeError("fetch failed"))
      : new Response(JSON.stringify({ error: "access_denied" }), { status: 400 })
  }) as typeof fetch
  try {
    await assert.rejects(pollToken("dc", 0, 600), /access_denied/)
    assert.equal(calls, 2)
  } finally {
    globalThis.fetch = original
  }
})

test("poll reports transport failures when it times out", async () => {
  const original = globalThis.fetch
  globalThis.fetch = (async () => {
    throw new TypeError("fetch failed")
  }) as typeof fetch
  try {
    await assert.rejects(pollToken("dc", 1, 1), /1 network error/)
  } finally {
    globalThis.fetch = original
  }
})

test("mint validates subscription", async () => {
  stubFetch(() => ({ status: 200, body: KEY_OK }))
  const minted = await mintKey("dca-x")
  assert.deepStrictEqual(minted, {
    oauthAccessToken: "dca-x",
    apiKey: "LLM|fresh",
    accountId: "uid-1",
    email: "user@example.com",
  })
  stubFetch(() => ({ status: 200, body: { ...KEY_OK, is_subs_active: false } }))
  await assert.rejects(mintKey("dca-x"), /inactive/)
  stubFetch(() => ({
    status: 200,
    body: { require_payment: true, action_url: "https://example.com/pay" },
  }))
  await assert.rejects(mintKey("dca-x"), /example\.com\/pay/)
})

test("auth contract is pinned", () => {
  assert.equal(AUTH_CONTRACT_VERSION, 1)
  assert.equal(CLIENT_ID, "1031625952748946")
  assert.equal(DEVICE_URL, "https://auth.meta.com/oidc/device/authorization/")
  assert.equal(TOKEN_URL, "https://auth.meta.com/oidc/device/token/")
  assert.equal(KEY_URL, "https://api.meta.ai/muse-code/key")
})

test("loader key prefers the host auth store", async () => {
  const key = await resolveLoaderKey(
    async () => ({ type: "api", key: "LLM|stored" }),
    async () => "LLM|cache",
  )
  assert.equal(key, "LLM|stored")
})

test("loader key falls back to the legacy cache", async () => {
  assert.equal(
    await resolveLoaderKey(async () => ({ type: "oauth" }), async () => "LLM|cache"),
    "LLM|cache",
  )
  assert.equal(
    await resolveLoaderKey(
      async () => {
        throw new Error("store unavailable")
      },
      async () => "LLM|cache",
    ),
    "LLM|cache",
  )
  assert.equal(await resolveLoaderKey(async () => undefined, async () => ""), "")
})
