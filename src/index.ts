// opencode-muse-auth: Muse Spark in opencode billed to the Muse Code
// monthly subscription (Meta device login, no API key, no third-party CLI).
//
// V1 calls server(); V2 calls setup(). Each registers its own auth API.
import type { Plugin } from "@opencode-ai/plugin"
import { Plugin as V2Plugin, Integration } from "@opencode/plugin"
import {
  writeCache,
  deviceAuthorize,
  pollToken,
  mintKey,
  resolveLoaderKey,
} from "./auth.js"

const TEN_YEARS_MS = 10 * 365 * 24 * 60 * 60 * 1000

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
    async setup(ctx) {
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
      // Meta's native provider expects a bearer inference key, not the
      // short-lived OAuth token used to mint it. Honor the active connection.
      await ctx.session.hook("http.request", async (event) => {
        const connection = await ctx.integration.connection.active("meta")
        if (!connection) return
        const credential = await ctx.integration.connection.resolve(connection)
        if (credential?.type === "oauth" && credential.methodID === methodID) {
          event.request.headers.set("Authorization", `Bearer ${credential.access}`)
        }
      }, { providerID: "meta" })
    },
  }),
  server: MuseCodeAuth,
}
