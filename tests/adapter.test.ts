// Wire adapter: unit, streaming and proxy behavior against a fake upstream.
import { test } from "node:test"
import assert from "node:assert/strict"
import http from "node:http"

import {
  ADAPTER_VERSION,
  COLLIDING_TOOL_NAMES,
  DEFAULT_UPSTREAM,
  SseRestorer,
  planToolAliases,
  startMuseCodeAdapter,
  transformRequestBody,
  transformResponseBody,
} from "../dist/adapter.js"

const tool = (name: string, extra: Record<string, unknown> = {}) => ({
  type: "function",
  name,
  description: `Tool ${name}.`,
  parameters: { type: "object", properties: {} },
  ...extra,
})

test("adapter contract version and upstream are pinned", () => {
  assert.equal(ADAPTER_VERSION, 3)
  assert.equal(DEFAULT_UPSTREAM, "https://api.meta.ai")
  for (const name of ["read_file", "write_file", "edit_file", "bash", "web_search", "web_fetch", "workflow", "search", "write_todos", "apply_patch", "create_goal", "send_session_message", "tool_search"]) {
    assert.equal(COLLIDING_TOOL_NAMES.has(name), true)
  }
  assert.equal(COLLIDING_TOOL_NAMES.has("get_weather"), false)
  assert.equal(COLLIDING_TOOL_NAMES.size, 40)
})

test("only colliding flat function tools are aliased", () => {
  const plan = planToolAliases([
    tool("bash"),
    tool("get_weather"),
    tool("read_file"),
    { type: "namespace", name: "muse", tools: [tool("bash")] },
    { type: "web_search" },
  ])
  assert.deepEqual([...plan.aliases.entries()], [
    ["bash", "client_bash"],
    ["read_file", "client_read_file"],
  ])
  assert.equal(plan.reverse.get("client_bash"), "bash")
})

test("an alias that already exists gets a stable suffix", () => {
  const plan = planToolAliases([tool("bash"), tool("client_bash")])
  assert.equal(plan.aliases.get("bash"), "client_bash_2")
})

test("the all mode aliases every flat function tool", () => {
  const plan = planToolAliases(
    [tool("read"), tool("bash"), { type: "web_search" }, tool("get_weather")],
    { all: true },
  )
  assert.deepEqual([...plan.aliases.keys()], ["read", "bash", "get_weather"])
})

test("the request rewrite aliases tools, history and forced choice", () => {
  const original = {
    model: "muse-spark-1.3",
    tools: [tool("bash"), tool("get_weather")],
    input: [
      { type: "message", role: "user", content: "hi" },
      { type: "function_call", call_id: "call_1", name: "bash", arguments: "{}" },
      { type: "function_call_output", call_id: "call_1", output: "ok" },
    ],
    tool_choice: { type: "function", name: "bash" },
    reasoning_effort: "low",
    max_output_tokens: 8,
  }
  const { body, notes } = transformRequestBody(original)
  assert.deepEqual(body.tools.map((entry: { name: string }) => entry.name), ["client_bash", "get_weather"])
  assert.equal(body.input[1].name, "client_bash")
  assert.equal(body.input[2].name, undefined)
  assert.equal(body.tool_choice, "auto")
  assert.deepEqual(body.reasoning, { effort: "low" })
  assert.equal(body.reasoning_effort, undefined)
  assert.equal(body.max_output_tokens, 16)
  assert.deepEqual(body.include, ["reasoning.encrypted_content"])
  assert.equal(original.tools[0].name, "bash", "input object is not mutated")
  assert.equal(notes.length, 5)
})

test("a request without collisions only gets the parameter normalisation", () => {
  const { body, notes } = transformRequestBody({
    model: "muse-spark-1.3",
    tools: [tool("get_weather")],
    tool_choice: "auto",
    max_output_tokens: 64,
    include: ["reasoning.encrypted_content"],
  })
  assert.deepEqual(body.tools.map((entry: { name: string }) => entry.name), ["get_weather"])
  assert.equal(body.tool_choice, "auto")
  assert.equal(body.max_output_tokens, 64)
  assert.deepEqual(body.include, ["reasoning.encrypted_content"])
  assert.deepEqual(notes, [])
})

function sse(events: Array<{ type: string }>): string {
  return events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join("")
}

test("the SSE restorer restores names everywhere and repairs empty arguments", () => {
  const reverse = new Map([
    ["client_bash", "bash"],
    ["client_read_file", "read_file"],
  ])
  const restorer = new SseRestorer(reverse)
  const events = [
    { type: "response.created", response: { tools: [tool("client_bash", { description: "Runs a command." })], output: [] } },
    { type: "response.output_item.added", item: { type: "function_call", id: "fc_1", name: "client_bash", arguments: "" } },
    { type: "response.function_call_arguments.delta", item_id: "fc_1", delta: '{"command":"ls"}' },
    { type: "response.function_call_arguments.done", item_id: "fc_1", name: "client_bash", arguments: '{"command":"ls"}' },
    { type: "response.output_item.done", item: { type: "function_call", id: "fc_1", name: "client_bash", arguments: "" } },
    { type: "response.completed", response: { tools: [tool("client_bash", { description: "Runs a command." })], output: [{ type: "function_call", id: "fc_1", name: "client_bash", arguments: "" }] } },
  ]
  const out = sse(events)
    .split("\n")
    .map((line) => (line.startsWith("data:") ? restorer.feed(line) : line))
    .join("\n")
  assert.doesNotMatch(out, /client_bash/)
  assert.match(out, /"name":"bash"/)
  assert.match(out, /"arguments":"\{\\"command\\":\\"ls\\"\}"/)
})

test("the JSON response transform restores names and leaves other items alone", () => {
  const body = {
    output: [
      { type: "reasoning", id: "rs_1", encrypted_content: "x" },
      { type: "function_call", id: "fc_1", name: "client_bash", arguments: '{"command":"ls"}' },
      { type: "message", role: "assistant", content: [] },
    ],
  }
  const out = transformResponseBody(body, new Map([["client_bash", "bash"]]))
  assert.equal(out.output[1].name, "bash")
  assert.equal(out.output[0].encrypted_content, "x")
})

type Handler = (request: http.IncomingMessage, response: http.ServerResponse, body: string) => void

async function fakeUpstream(handler: Handler) {
  const server = http.createServer((request, response) => {
    const chunks: Buffer[] = []
    request.on("data", (chunk: Buffer) => chunks.push(chunk))
    request.on("end", () => handler(request, response, Buffer.concat(chunks).toString("utf8")))
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  if (address === null || typeof address === "string") throw new Error("fake upstream has no port")
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve) => {
      server.closeAllConnections()
      server.close(() => resolve())
    }),
  }
}

test("the proxy rewrites the body it forwards and restores the streamed answer", async () => {
  const seen: Array<{ url: string | undefined; body: any }> = []
  const upstream = await fakeUpstream((request, response, body) => {
    seen.push({ url: request.url, body: JSON.parse(body) })
    const events = [
      { type: "response.created", response: { tools: [], output: [] } },
      { type: "response.output_item.added", item: { type: "function_call", id: "fc_1", name: "client_bash", arguments: "" } },
      { type: "response.function_call_arguments.delta", item_id: "fc_1", delta: '{"command":"ls"}' },
      { type: "response.output_item.done", item: { type: "function_call", id: "fc_1", name: "client_bash", arguments: "" } },
      { type: "response.completed", response: { tools: [], output: [] } },
    ]
    response.writeHead(200, { "content-type": "text/event-stream" })
    response.end(sse(events))
  })
  const adapter = await startMuseCodeAdapter({ upstream: upstream.origin, ports: [0] })
  try {
    const res = await fetch(`${adapter.baseUrl}/responses`, {
      method: "POST",
      headers: { authorization: "Bearer LLM|test", "content-type": "application/json" },
      body: JSON.stringify({ model: "muse-spark-1.3", tools: [tool("bash")], tool_choice: "required", stream: true }),
    })
    assert.equal(res.status, 200)
    const text = await res.text()
    assert.doesNotMatch(text, /client_bash/)
    assert.match(text, /"name":"bash"/)
    assert.match(text, /"arguments":"\{\\"command\\":\\"ls\\"\}"/)
    assert.equal(seen.length, 1)
    assert.equal(seen[0].url, "/v1/responses")
    assert.equal(seen[0].body.tools[0].name, "client_bash")
    assert.equal(seen[0].body.tool_choice, "auto")
  } finally {
    await adapter.close()
    await upstream.close()
  }
})

test("non-streaming JSON answers are restored and other paths are relayed", async () => {
  const upstream = await fakeUpstream((request, response) => {
    if (request.method === "GET") {
      response.writeHead(200, { "content-type": "application/json" })
      response.end(JSON.stringify({ object: "list", data: [{ id: "muse-spark-1.3" }] }))
      return
    }
    response.writeHead(200, { "content-type": "application/json" })
    response.end(JSON.stringify({
      output: [{ type: "function_call", id: "fc_1", name: "client_read_file", arguments: '{"path":"a"}' }],
    }))
  })
  const adapter = await startMuseCodeAdapter({ upstream: upstream.origin, ports: [0] })
  try {
    const res = await fetch(`${adapter.baseUrl}/responses`, {
      method: "POST",
      headers: { authorization: "Bearer test", "content-type": "application/json" },
      body: JSON.stringify({ model: "muse-spark-1.3", tools: [tool("read_file")] }),
    })
    const body: any = await res.json()
    assert.equal(body.output[0].name, "read_file")

    const catalog = await fetch(`${adapter.baseUrl}/models`, { headers: { authorization: "Bearer test" } })
    assert.equal(catalog.status, 200)
    assert.deepEqual(await catalog.json(), { object: "list", data: [{ id: "muse-spark-1.3" }] })
  } finally {
    await adapter.close()
    await upstream.close()
  }
})

test("a gate refusal retries once with every tool aliased", async () => {
  const bodies: any[] = []
  const upstream = await fakeUpstream((_request, response, body) => {
    const parsed = JSON.parse(body)
    bodies.push(parsed)
    const unaliased = (parsed.tools ?? []).filter(
      (entry: any) => entry.type === "function" && !String(entry.name).startsWith("client_"),
    )
    if (unaliased.length > 0) {
      response.writeHead(403, { "content-type": "application/json" })
      response.end(JSON.stringify({ error: { code: "client_attestation_denied", type: "permission_error", message: "refused" } }))
      return
    }
    response.writeHead(200, { "content-type": "application/json" })
    response.end(JSON.stringify({
      output: [{ type: "function_call", id: "fc_1", name: parsed.tools[0].name, arguments: '{"a":"b"}' }],
    }))
  })
  const adapter = await startMuseCodeAdapter({ upstream: upstream.origin, ports: [0] })
  try {
    const res = await fetch(`${adapter.baseUrl}/responses`, {
      method: "POST",
      headers: { authorization: "Bearer test", "content-type": "application/json" },
      body: JSON.stringify({ model: "muse-spark-1.3", tools: [tool("future_muse_tool"), tool("get_weather")] }),
    })
    assert.equal(res.status, 200)
    const body: any = await res.json()
    assert.equal(body.output[0].name, "future_muse_tool")
    assert.equal(bodies.length, 2)
    assert.deepEqual(
      bodies[1].tools.map((entry: any) => entry.name),
      ["client_future_muse_tool", "client_get_weather"],
    )
  } finally {
    await adapter.close()
    await upstream.close()
  }
})

test("passthrough mode relays the original body", async () => {
  const seen: any[] = []
  const upstream = await fakeUpstream((_request, response, body) => {
    seen.push(JSON.parse(body))
    response.writeHead(200, { "content-type": "application/json" })
    response.end(JSON.stringify({ output: [] }))
  })
  const adapter = await startMuseCodeAdapter({ upstream: upstream.origin, ports: [0], passthrough: true })
  try {
    const payload = { model: "muse-spark-1.3", tools: [tool("bash")], tool_choice: "required" }
    await fetch(`${adapter.baseUrl}/responses`, {
      method: "POST",
      headers: { authorization: "Bearer test", "content-type": "application/json" },
      body: JSON.stringify(payload),
    })
    assert.deepEqual(seen[0], payload)
  } finally {
    await adapter.close()
    await upstream.close()
  }
})
