// opencode-muse-auth: Muse Spark in opencode billed to the Muse Code
// monthly subscription (Meta device login, no API key, no third-party CLI).
//
// V1 calls server(); V2 calls setup(). Each registers its own auth API.
// V2 also routes inference through the loopback wire adapter (src/adapter.ts,
// ADAPTER_CONTRACT.md): Meta refuses subscription requests whose flat tool
// names collide with Muse Code's builtins.
import type { Plugin } from "@opencode-ai/plugin"
import { Plugin as V2Plugin, Integration } from "@opencode/plugin"
import { DEFAULT_UPSTREAM, startMuseCodeAdapter, type RunningAdapter } from "./adapter.js"
import {
  writeCache,
  deviceAuthorize,
  pollToken,
  mintKey,
  resolveLoaderKey,
} from "./auth.js"

const TEN_YEARS_MS = 10 * 365 * 24 * 60 * 60 * 1000

/** Origin of the real Meta inference endpoint; the adapter forwards to it. */
const META_ORIGIN = new URL(DEFAULT_UPSTREAM).origin

type LogClient = {
  app?: {
    log?: (input: {
      body: {
        service: string
        level: "error"
        message: string
        extra?: Record<string, unknown>
      }
    }) => Promise<unknown>
  }
}

/** Keep diagnostics useful without ever copying a credential into a log line. */
function describeError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error)
  return text
    .replace(/Bearer\s+\S+/gi, "Bearer ***")
    .replace(/LLM\|[^\s"']+/g, "LLM|***")
    .slice(0, 300)
}

async function logAuthFailure(client: unknown, error: unknown): Promise<void> {
  try {
    const candidate = client as LogClient | undefined
    await candidate?.app?.log?.({
      body: {
        service: "opencode-muse-auth",
        level: "error",
        message: "Muse Code login failed",
        extra: { error: describeError(error) },
      },
    })
  } catch {
    // Logging must never break the auth flow.
  }
}

/** The part of a running adapter the plugin needs. */
type AdapterHandle = Pick<RunningAdapter, "baseUrl" | "close">

/** Starts the loopback adapter; tests inject a stub instead of binding a port. */
export type AdapterFactory = () => Promise<AdapterHandle>

/** Options for {@link setupV2}; the adapter is a test seam. */
export interface V2SetupOptions {
  readonly adapter?: AdapterFactory
}

/** Start the loopback adapter; `off` keeps the proxy but skips the reshaping. */
function startLocalAdapter(): Promise<AdapterHandle> {
  return startMuseCodeAdapter({ passthrough: process.env["MUSE_CODE_ADAPTER"] === "off" })
}

/**
 * Rewrite one direct Meta request onto the adapter origin.
 *
 * Only the origin changes: path, query, method, headers, body and signal are
 * preserved. A request already targeting the adapter, or any other host, is
 * returned untouched.
 */
function routeThroughAdapter(request: Request, baseUrl: string): Request {
  const url = new URL(request.url)
  const target = new URL(baseUrl)
  if (url.origin === target.origin || url.origin !== META_ORIGIN) return request
  url.protocol = target.protocol
  url.hostname = target.hostname
  url.port = target.port
  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers: request.headers,
    signal: request.signal,
    redirect: request.redirect,
  }
  if (request.method !== "GET" && request.method !== "HEAD" && request.body !== null) {
    init.body = request.body
    init.duplex = "half"
  }
  return new Request(url.toString(), init)
}

/**
 * V2 setup. Returns the cleanup function, which stops the adapter.
 *
 * @param options - test seam; production calls setup without options.
 */
export async function setupV2(
  ctx: V2Plugin.Context,
  options: V2SetupOptions = {},
): Promise<() => Promise<void>> {
  const methodID = Integration.MethodID.make("muse-code-subscription")
  await ctx.integration.transform((editor) => {
    editor.method.update({
      integrationID: "meta",
      method: {
        id: methodID,
        type: "oauth",
        label: "Muse Code subscription (Meta device login)",
      },
      async authorize() {
        const device = await deviceAuthorize()
        const url = device.verification_uri_complete || device.verification_uri
        const callback = (async () => {
          try {
            const access = await pollToken(device.device_code, device.interval, device.expires_in)
            const minted = await mintKey(access)
            return {
              type: "oauth" as const,
              methodID,
              access: minted.apiKey,
              refresh: "",
              expires: Date.now() + TEN_YEARS_MS,
              metadata: { accountId: minted.accountId, ...(minted.email ? { email: minted.email } : {}) },
            }
          } catch (error) {
            throw new Error(`Muse Code login failed: ${describeError(error)}`)
          }
        })()
        // The runtime awaits this promise after displaying the device code.
        // Attach a handler immediately in case the exchange fails first.
        void callback.catch(() => {})
        return {
          url,
          instructions: `Open ${url}\nEnter code: ${device.user_code}`,
          mode: "auto" as const,
          expiresAt: Date.now() + device.expires_in * 1000,
          callback,
        }
      },
      label: (credential) => typeof credential.metadata?.email === "string"
        ? credential.metadata.email : "Muse Code subscription",
    })
  })

  // Meta's gate inspects the declared tool names, so subscription inference
  // goes through a loopback proxy that aliases the colliding names and
  // restores them in the response. Failures keep the pre-adapter behavior.
  let started: AdapterHandle | undefined
  try {
    started = await (options.adapter ?? startLocalAdapter)()
  } catch (error) {
    console.error(
      `opencode-muse-auth: the local request adapter could not start; ` +
      `subscription requests will not be reshaped: ${describeError(error)}`,
    )
  }
  const adapter = started

  async function subscription() {
    const connection = await ctx.integration.connection.active("meta")
    if (!connection) return undefined
    const credential = await ctx.integration.connection.resolve(connection)
    if (credential?.type !== "oauth" || credential.methodID !== methodID) return undefined
    return credential
  }

  if (adapter) {
    // Every Meta inference request must reach the adapter: it reshapes the tool
    // declarations the gate inspects, so the credential type does not matter
    // (V1 API key or V2 OAuth). Native provider drivers honor this override.
    const baseUrl = adapter.baseUrl
    await ctx.session.hook("model.request", async (event) => {
      event.baseURL = baseUrl
    }, { providerID: "meta" })
  }

  // Meta's native provider expects a bearer inference key, not the short-lived
  // OAuth token used to mint it: when the active Muse connection resolves one,
  // put it on the request. AI SDK routes drop model.request.baseURL
  // (opencode#55984), so this hook also rewrites the assembled request onto the
  // adapter origin.
  await ctx.session.hook("http.request", async (event) => {
    const credential = await subscription()
    if (credential) event.request.headers.set("Authorization", `Bearer ${credential.access}`)
    if (adapter) event.request = routeThroughAdapter(event.request, adapter.baseUrl)
  }, { providerID: "meta" })

  return async () => {
    await adapter?.close()
  }
}

// V1 has no adapter: its inference keeps going straight to api.meta.ai and
// still receives Meta's client-restriction 403.
const MuseCodeAuth: Plugin = async ({ client }) => {
  return {
    auth: {
      provider: "meta",
      methods: [
        {
          type: "oauth",
          label: "Muse Code subscription (Meta device login)",
          async authorize() {
            const device = await deviceAuthorize()
            const url = device.verification_uri_complete || device.verification_uri
            return {
              url,
              method: "auto",
              instructions: `Open ${url}\nEnter code: ${device.user_code}`,
              callback: async () => {
                try {
                  const access = await pollToken(device.device_code, device.interval, device.expires_in)
                  const minted = await mintKey(access)
                  await writeCache(minted)
                  return { type: "success", key: minted.apiKey }
                } catch (error) {
                  await logAuthFailure(client, error)
                  return { type: "failed" }
                }
              },
            }
          },
        },
      ],
      loader: async (auth) => {
        const key = await resolveLoaderKey(auth)
        return key ? { apiKey: key } : {}
      },
    },
  }
}

export default {
  ...V2Plugin.define({
    id: "muse-code-auth",
    setup: (ctx) => setupV2(ctx),
  }),
  server: MuseCodeAuth,
}
