// Both entrypoints must register authentication, not just satisfy the shape.
import { test } from "node:test"
import assert from "node:assert/strict"

import plugin, { setupV2 as runSetupV2 } from "../dist/index.js"
import localPlugin from "../index.js"

const ADAPTER_BASE_URL = "http://127.0.0.1:43219/v1"

/** Stub the loopback adapter so the setup tests never bind a real port. */
function makeAdapterStub(url = ADAPTER_BASE_URL) {
  const closed: boolean[] = []
  return {
    closed,
    factory: async () => ({
      baseUrl: url,
      close: async () => {
        closed.push(true)
      },
    }),
  }
}

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

async function setupV2(connection = undefined, credential = undefined, stub = makeAdapterStub()) {
  let registration
  const hooks = new Map<string, (event: any) => Promise<void> | void>()
  const cleanup = await runSetupV2(
    {
      integration: {
        transform: async (transform: (editor: any) => void) => {
          transform({ method: { update: (value: any) => { registration = value } } })
        },
        connection: { active: async () => connection, resolve: async () => credential },
      },
      session: {
        hook: async (name: string, callback: (event: any) => Promise<void> | void, scope: unknown) => {
          assert.deepEqual(scope, { providerID: "meta" })
          hooks.set(name, callback)
          return { dispose: async () => {} }
        },
      },
    },
    { adapter: stub.factory },
  )
  return { registration, hooks, cleanup, stub }
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
    assert.ok(Number.isFinite(credential.expires))
    assert.ok(credential.expires > Date.now())
    assert.notEqual(credential.expires, Number.MAX_SAFE_INTEGER)
    assert.ok(!JSON.stringify(credential).includes("temporary-oauth-secret"))
    assert.equal(registration.label(credential), "user@example.com")
  } finally {
    globalThis.fetch = original
  }
})

test("V2 setup registers both adapter hooks for the meta provider", async () => {
  const { hooks } = await setupV2()
  assert.deepEqual([...hooks.keys()], ["model.request", "http.request"])
})

test("V2 teardown closes the loopback adapter", async () => {
  const { cleanup, stub } = await setupV2()
  assert.deepEqual(stub.closed, [])
  await cleanup()
  assert.deepEqual(stub.closed, [true])
})

test("V2 setup keeps the direct endpoint and logs when the adapter cannot start", async () => {
  const errors: string[] = []
  const original = console.error
  console.error = (...args: unknown[]) => {
    errors.push(args.map(String).join(" "))
  }
  try {
    const stub = {
      factory: async (): Promise<never> => {
        throw new Error("bind failed")
      },
    }
    const { hooks, cleanup } = await setupV2(undefined, undefined, stub)
    assert.deepEqual([...hooks.keys()], ["http.request"])
    assert.equal(errors.length, 1)
    assert.match(errors[0], /adapter could not start/)
    assert.match(errors[0], /bind failed/)
    await cleanup()
  } finally {
    console.error = original
  }
})

test("V2 model request hook points subscription inference at the adapter", async () => {
  const { hooks } = await setupV2({ type: "credential", id: "test" }, {
    type: "oauth", methodID: "muse-code-subscription", access: "inference-key",
  })
  const event: { baseURL?: string } = {}
  await hooks.get("model.request")!(event)
  assert.equal(event.baseURL, ADAPTER_BASE_URL)
})

test("V2 model request hook points every meta connection at the adapter", async () => {
  const { hooks } = await setupV2({ type: "credential", id: "test" }, { type: "key", key: "api-key" })
  const event: { baseURL?: string } = {}
  await hooks.get("model.request")!(event)
  assert.equal(event.baseURL, ADAPTER_BASE_URL)
})

test("V2 request hook uses the active subscription credential", async () => {
  const { hooks } = await setupV2({ type: "credential", id: "test" }, {
    type: "oauth", methodID: "muse-code-subscription", access: "inference-key",
  })
  const request = new Request("https://api.meta.ai/v1/responses", {
    method: "POST",
    headers: { Authorization: "Bearer original", "content-type": "application/json" },
    body: JSON.stringify({ input: "hi" }),
  })
  const event = { request }
  await hooks.get("http.request")!(event)
  assert.equal(event.request.headers.get("Authorization"), "Bearer inference-key")
  assert.equal(event.request.url, `${ADAPTER_BASE_URL}/responses`)
  assert.equal(event.request.method, "POST")
  assert.equal(event.request.headers.get("content-type"), "application/json")
  assert.deepEqual(await event.request.json(), { input: "hi" })
})

test("V2 request hook does not rewrite a request already on the adapter", async () => {
  const { hooks } = await setupV2({ type: "credential", id: "test" }, {
    type: "oauth", methodID: "muse-code-subscription", access: "inference-key",
  })
  const request = new Request(`${ADAPTER_BASE_URL}/responses`, { method: "POST", body: "{}" })
  const event = { request }
  await hooks.get("http.request")!(event)
  assert.equal(event.request, request)
  assert.equal(event.request.headers.get("Authorization"), "Bearer inference-key")
})

test("V2 request hook routes plain meta connections through the adapter", async () => {
  for (const credential of [undefined, { type: "key", key: "api-key" }, {
    type: "oauth", methodID: "other", access: "other-key",
  }]) {
    const { hooks } = await setupV2({ type: "credential", id: "test" }, credential)
    const request = new Request("https://api.meta.ai/v1/responses", { headers: { Authorization: "Bearer original" } })
    const event = { request }
    await hooks.get("http.request")!(event)
    assert.equal(event.request.headers.get("Authorization"), "Bearer original")
    assert.equal(event.request.url, `${ADAPTER_BASE_URL}/responses`)
  }
})

test("V2 request hook keeps the host API key for a plain meta credential", async () => {
  const { hooks } = await setupV2({ type: "credential", id: "test" }, { type: "key", key: "api-key" })
  const request = new Request("https://api.meta.ai/v1/responses", {
    method: "POST",
    headers: { Authorization: "Bearer llm-key", "content-type": "application/json" },
    body: JSON.stringify({ input: "hi" }),
  })
  const event = { request }
  await hooks.get("http.request")!(event)
  assert.equal(event.request.headers.get("Authorization"), "Bearer llm-key")
  assert.equal(event.request.url, `${ADAPTER_BASE_URL}/responses`)
  assert.deepEqual(await event.request.json(), { input: "hi" })
})

test("server plugin returns the auth hook for provider meta", async () => {
  const hooks = await plugin.server({ client: { app: { log: async () => {} } } })
  assert.ok(hooks.auth)
  assert.equal(hooks.auth.provider, "meta")
  assert.equal(typeof hooks.auth.loader, "function")
  assert.ok(Array.isArray(hooks.auth.methods))
  assert.equal(hooks.auth.methods.length, 1)
  assert.equal(hooks.auth.methods[0].type, "oauth")
  assert.equal(typeof hooks.auth.methods[0].authorize, "function")
})

test("V1 loader prefers the host auth store over the legacy cache", async () => {
  const hooks = await plugin.server({ client: { app: { log: async () => {} } } })
  const loaded = await hooks.auth.loader(async () => ({ type: "api", key: "LLM|stored" }))
  assert.deepEqual(loaded, { apiKey: "LLM|stored" })
})

test("V1 login failure is logged without secret material", async () => {
  const original = globalThis.fetch
  const logs = []
  globalThis.fetch = async (input) => {
    const url = String(input)
    const body = url.includes("authorization") ? {
      device_code: "device", user_code: "ABCD", verification_uri: "https://auth.meta.com/device",
      interval: 1, expires_in: 600,
    } : { error: "access_denied", error_description: "denied" }
    return new Response(JSON.stringify(body), { status: url.includes("authorization") ? 200 : 400 })
  }
  try {
    const hooks = await plugin.server({
      client: {
        app: {
          log: async (entry) => {
            logs.push(entry)
          },
        },
      },
    })
    const auth = await hooks.auth.methods[0].authorize()
    const result = await auth.callback()
    assert.deepEqual(result, { type: "failed" })
    assert.equal(logs.length, 1)
    assert.equal(logs[0].body.level, "error")
    assert.match(logs[0].body.message, /Muse Code login failed/)
    assert.ok(!JSON.stringify(logs).includes("Bearer "))
  } finally {
    globalThis.fetch = original
  }
})

test("V2 login failure rejects with a descriptive error", async () => {
  const original = globalThis.fetch
  globalThis.fetch = async (input) => {
    const url = String(input)
    const body = url.includes("authorization") ? {
      device_code: "device", user_code: "ABCD", verification_uri: "https://auth.meta.com/device",
      interval: 1, expires_in: 600,
    } : { error: "access_denied", error_description: "denied" }
    return new Response(JSON.stringify(body), { status: url.includes("authorization") ? 200 : 400 })
  }
  try {
    const { registration } = await setupV2()
    const auth = await registration.authorize({})
    await assert.rejects(auth.callback, /Muse Code login failed/)
  } finally {
    globalThis.fetch = original
  }
})
