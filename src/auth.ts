// Shared Meta device-login logic (no third-party CLI).
// Flow parameters are compatible with the published behavior of oh-my-pi
// (MIT-licensed; see NOTICE).

import { homedir } from "node:os"
import { join, dirname } from "node:path"
import { readFile, writeFile, mkdir, chmod } from "node:fs/promises"

export const CLIENT_ID = "1031625952748946"
export const DEVICE_URL = "https://auth.meta.com/oidc/device/authorization/"
export const TOKEN_URL = "https://auth.meta.com/oidc/device/token/"
export const KEY_URL = "https://api.meta.ai/muse-code/key"
export const CACHE_PATH = join(homedir(), ".config", "opencode", "muse-code-sub.json")

const HEADERS: Record<string, string> = {
  Accept: "application/json",
  "x-api-version": "1.0.0",
}
const REQUEST_TIMEOUT_MS = 25_000
const MIN_INTERVAL_S = 1
const SLOW_DOWN_STEP_S = 5

export interface DeviceAuthorization {
  device_code: string
  user_code: string
  verification_uri: string
  verification_uri_complete?: string
  interval: number
  expires_in: number
}

export interface MintedCredential {
  oauthAccessToken: string
  apiKey: string
  accountId: string
  email?: string
}

type DeviceResponse = {
  device_code?: unknown
  user_code?: unknown
  verification_uri?: unknown
  verification_uri_complete?: unknown
  interval?: unknown
  expires_in?: unknown
}

type TokenResponse = {
  error?: unknown
  error_description?: unknown
  access_token?: unknown
}

type KeyResponse = {
  api_key?: unknown
  is_subs_active?: unknown
  require_payment?: unknown
  action_url?: unknown
  require_payment_action_url?: unknown
  user_email?: unknown
  user_id?: unknown
}

export async function readCache(path: string = CACHE_PATH): Promise<string> {
  try {
    const blob = (await readFile(path, "utf8").then(JSON.parse)) as Partial<MintedCredential>
    return typeof blob?.apiKey === "string" && blob.apiKey.trim() ? blob.apiKey.trim() : ""
  } catch {
    return ""
  }
}

export async function writeCache(credentials: MintedCredential, path: string = CACHE_PATH): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(credentials, null, 2))
  try {
    await chmod(path, 0o600)
  } catch {
    /* Windows ACLs inherit profile permissions */
  }
}

async function postForm(url: string, params: Record<string, string>): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: { ...HEADERS, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`HTTP ${res.status} ${text.slice(0, 200)}`.trim())
  return JSON.parse(text)
}

export async function deviceAuthorize(): Promise<DeviceAuthorization> {
  const body = (await postForm(DEVICE_URL, { client_id: CLIENT_ID })) as DeviceResponse
  const { device_code, user_code, verification_uri, interval, expires_in } = body
  if (
    typeof device_code !== "string" ||
    !device_code ||
    typeof user_code !== "string" ||
    !user_code ||
    typeof verification_uri !== "string" ||
    !verification_uri ||
    typeof interval !== "number" ||
    typeof expires_in !== "number"
  ) {
    throw new Error("device authorization response is missing fields")
  }
  const complete = body.verification_uri_complete
  return {
    device_code,
    user_code,
    verification_uri,
    ...(typeof complete === "string" && complete ? { verification_uri_complete: complete } : {}),
    interval,
    expires_in,
  }
}

export async function pollToken(deviceCode: string, intervalS: number, expiresInS: number): Promise<string> {
  let interval = Math.max(MIN_INTERVAL_S, Number(intervalS) || 5)
  const deadline = Date.now() + Number(expiresInS || 600) * 1000
  let slowDowns = 0
  while (Date.now() < deadline) {
    // The token endpoint answers HTTP errors (e.g. 400 authorization_pending)
    // as part of the normal flow: never throw here, classify instead.
    let body: TokenResponse | null = null
    try {
      const res = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { ...HEADERS, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
          client_id: CLIENT_ID,
          device_code: deviceCode,
        }).toString(),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      try {
        body = (await res.json()) as TokenResponse
      } catch {
        body = null
      }
    } catch {
      body = null
    }
    if (body && !body.error) {
      if (typeof body.access_token !== "string" || !body.access_token) {
        throw new Error("token response has no access_token")
      }
      return body.access_token
    }
    if (body?.error === "slow_down") {
      slowDowns += 1
      interval = Math.max(MIN_INTERVAL_S, interval + SLOW_DOWN_STEP_S)
    } else if (body?.error !== "authorization_pending") {
      throw new Error(`login failed: ${body?.error || "unreadable token response"}`)
    }
    const remaining = deadline - Date.now()
    if (remaining <= 0) break
    const { promise, resolve } = Promise.withResolvers<void>()
    setTimeout(resolve, Math.min(interval, remaining) * 1000)
    await promise
  }
  throw new Error(
    slowDowns ? "login timed out after slow_down responses" : "login timed out waiting for approval",
  )
}

export async function mintKey(accessToken: string): Promise<MintedCredential> {
  const res = await fetch(KEY_URL, {
    method: "POST",
    headers: { ...HEADERS, "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ onboard: true }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`key exchange failed: HTTP ${res.status} ${text.slice(0, 200)}`.trim())
  const body = JSON.parse(text) as KeyResponse
  if (body.is_subs_active === false) throw new Error("Muse Code subscription is inactive for this account")
  if (typeof body.api_key !== "string" || !body.api_key.trim()) {
    const action = String(body.action_url || body.require_payment_action_url || "").trim()
    if (body.require_payment === true || action) {
      throw new Error(`Muse Code subscription is required${action ? ": " + action : ""}`)
    }
    throw new Error("key response is missing api_key")
  }
  const email = String(body.user_email || "").trim().toLowerCase() || undefined
  const accountId = String(body.user_id || "").trim() || email
  if (!accountId) throw new Error("key response is missing account identity")
  return { oauthAccessToken: accessToken, apiKey: body.api_key.trim(), accountId, email }
}
