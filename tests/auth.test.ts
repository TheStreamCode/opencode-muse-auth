import { test } from "node:test"
import assert from "node:assert/strict"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { mkdtempSync } from "node:fs"
import {
  readCache,
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
