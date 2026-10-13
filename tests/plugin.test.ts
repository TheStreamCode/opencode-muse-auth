// Both entrypoints must register authentication, not just satisfy the shape.
import { test } from "node:test"
import assert from "node:assert/strict"

import plugin from "../dist/index.js"
import localPlugin from "../index.js"

test("local directory entrypoint exposes the built plugin", () => {
  assert.equal(localPlugin, plugin)
})

test("default export satisfies the opencode v2 PluginModule shape", () => {
  assert.equal(typeof plugin, "object")
  assert.ok(plugin && !Array.isArray(plugin))
  assert.equal(typeof plugin.id, "string")
  assert.ok(plugin.id.length > 0)
  assert.equal(typeof plugin.server, "function")
  assert.equal(typeof plugin.setup, "function")
})

async function setupV2(connection = undefined, credential = undefined) {
  let registration
  let requestHook
  await plugin.setup({
    integration: {
      transform: async (transform) => transform({ method: { update: (value) => { registration = value } } }),
      connection: { active: async () => connection, resolve: async () => credential },
    },
    session: {
      hook: async (name, callback, scope) => {
        assert.equal(name, "http.request")
        assert.deepEqual(scope, { providerID: "meta" })
        requestHook = callback
      },
    },
  })
  return { registration, requestHook }
}

test("V2 setup registers Meta subscription authentication", async () => {
  const { registration } = await setupV2()
  assert.equal(registration.integrationID, "meta")
  assert.equal(registration.method.type, "oauth")
  assert.match(registration.method.label, /Muse Code subscription/)
  assert.equal(typeof registration.authorize, "function")
})

test("V2 device flow returns only the inference key as its credential", async () => {
  const original = globalThis.fetch
  globalThis.fetch = async (input) => {
    const url = String(input)
    const body = url.includes("authorization") ? {
      device_code: "device", user_code: "ABCD", verification_uri: "https://auth.meta.com/device",
      interval: 1, expires_in: 600,
    } : url.includes("token") ? { access_token: "temporary-oauth-secret" } : {
      api_key: "inference-key", user_id: "account", user_email: "User@example.com", is_subs_active: true,
    }
    return new Response(JSON.stringify(body))
  }
  try {
    const { registration } = await setupV2()
    const auth = await registration.authorize({})
    assert.equal(auth.mode, "auto")
    assert.match(auth.instructions, /ABCD/)
    assert.ok(auth.expiresAt > Date.now())
    const credential = await auth.callback
    assert.equal(credential.access, "inference-key")
    assert.equal(credential.refresh, "")
    assert.equal(credential.methodID, registration.method.id)
    assert.ok(!JSON.stringify(credential).includes("temporary-oauth-secret"))
    assert.equal(registration.label(credential), "user@example.com")
  } finally {
    globalThis.fetch = original
  }
})

test("V2 request hook uses the active subscription credential", async () => {
  const { requestHook } = await setupV2({ type: "credential", id: "test" }, {
    type: "oauth", methodID: "muse-code-subscription", access: "inference-key",
  })
  const request = new Request("https://api.meta.ai/v1/responses")
  await requestHook({ request })
  assert.equal(request.headers.get("Authorization"), "Bearer inference-key")
})

test("V2 request hook leaves non-subscription connections unchanged", async () => {
  for (const credential of [undefined, { type: "key", key: "api-key" }, {
    type: "oauth", methodID: "other", access: "other-key",
  }]) {
    const { requestHook } = await setupV2({ type: "credential", id: "test" }, credential)
    const request = new Request("https://api.meta.ai/v1/responses", { headers: { Authorization: "Bearer original" } })
    await requestHook({ request })
    assert.equal(request.headers.get("Authorization"), "Bearer original")
  }
})

test("server plugin returns the auth hook for provider meta", async () => {
  const hooks = await plugin.server()
  assert.ok(hooks.auth)
  assert.equal(hooks.auth.provider, "meta")
  assert.equal(typeof hooks.auth.loader, "function")
  assert.ok(Array.isArray(hooks.auth.methods))
  assert.equal(hooks.auth.methods.length, 1)
  assert.equal(hooks.auth.methods[0].type, "oauth")
  assert.equal(typeof hooks.auth.methods[0].authorize, "function")
})
