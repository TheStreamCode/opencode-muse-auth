// opencode-muse-auth: Muse Spark in opencode billed to the Muse Code
// monthly subscription (Meta device login, no API key, no third-party CLI).
//
// V1 calls server(); V2 calls setup(). Each registers its own auth API.
import type { Plugin } from "@opencode-ai/plugin"
import { Plugin as V2Plugin, Integration } from "@opencode/plugin"
import { readCache, writeCache, deviceAuthorize, pollToken, mintKey } from "./auth.js"

const MuseCodeAuth: Plugin = async () => {
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
                } catch {
                  return { type: "failed" }
                }
              },
            }
          },
        },
      ],
      loader: async () => {
        const key = await readCache()
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
              const access = await pollToken(device.device_code, device.interval, device.expires_in)
              const minted = await mintKey(access)
              return {
                type: "oauth" as const,
                methodID,
                access: minted.apiKey,
                refresh: "",
                expires: Number.MAX_SAFE_INTEGER,
                metadata: { accountId: minted.accountId, ...(minted.email ? { email: minted.email } : {}) },
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
