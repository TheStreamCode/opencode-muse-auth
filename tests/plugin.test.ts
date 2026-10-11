// The opencode v2 plugin contract: opencode loads plugins ONLY from the
// module's default export, which must carry an `id` and the `server` plugin
// function (opencode 1.18.29+ accepts the same shape). A regression back to
// the v1 named-export shape fails at every opencode startup with
// PluginModule.LoadError — only visible as a WARN in the log — so pin the
// exported shape here.
import { test } from "node:test"
import assert from "node:assert/strict"

import plugin from "../dist/index.js"

test("default export satisfies the opencode v2 PluginModule shape", () => {
  assert.equal(typeof plugin, "object")
  assert.ok(plugin && !Array.isArray(plugin))
  assert.equal(typeof plugin.id, "string")
  assert.ok(plugin.id.length > 0)
  assert.equal(typeof plugin.server, "function")
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
