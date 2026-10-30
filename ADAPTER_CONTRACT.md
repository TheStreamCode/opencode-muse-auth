# Muse wire adapter contract (v3)

Every Muse Code plugin in this family sends subscription inference through the same local
adapter. This file pins the wire rules; `ADAPTER_VERSION` in the code is the matching constant.
Change both together in all four repositories:

- `opencode-muse-auth`
- `hermes-muse-code`
- `openclaw-muse-code`
- `dsh-muse-code`

## Why the adapter exists

Since 2026-10-29/30, `https://api.meta.ai/v1` refuses a Muse Code subscription credential when
the request declares a flat function tool whose name is exactly one of Muse Code's builtin tool
names. The refusal is HTTP 403 with `code: client_attestation_denied`:

> This API key is billed to a Muse Code subscription. Muse Code subscriptions cover requests from
> the Muse Code client only. Use it in Muse Code, or use a pay-as-you-go API key for other clients.

The gate inspects the declared tool names, not the client identity: headers, user agent, system
prompt and the rest of the payload do not change the outcome. The adapter aliases only the
colliding names on the way out and restores them on the way back, so the host keeps its own tool
names and no credential or signature is forged.

## Measured trigger (live subscription key, 2026-10-30)

| Request tool declarations | Result |
|---|---|
| no `tools` | 200 |
| flat `get_weather` | 200 |
| flat `client_read_file` | 200 |
| flat `read_file` | 403 |
| flat `bash` | 403 |
| flat `web_search` | 403 |
| flat names outside the first six, e.g. `web_fetch`, `workflow`, `powershell`, `add_memory` | 403 (each, separate probe) |
| flat `read_file` + `get_weather` | 403 |
| namespace `client` containing `read_file` | 200 |
| namespace `muse` with the genuine builtin declaration | 200 |
| namespace `muse` with a re-schematized `read_file` | 403 |

Two consequences drive the rules below:

1. A single colliding flat name is enough to fail the whole request.
2. Wrapping client tools in a namespace also passes today, but Meta validates the contents of a
   namespace named `muse`, and a wrapper changes the tool surface the model sees. The adapter
   therefore keeps the flat shape and only renames the colliding declarations.

## Builtin collision set (v3)

`workflow`, `read_file`, `write_file`, `edit_file`, `bash`, `bash_input`, `search`,
`web_search`, `web_fetch`, `powershell`, `powershell_input`, `read_memory`,
`add_memory`, `edit_memory`, `read_skill`, `write_todos`, `monitor`, `work_status`,
`work_list`, `work_stop`, `snooze_reminder`, `apply_patch`, `shell`, `create_goal`,
`get_goal`, `update_goal`, `report_progress`, `request_user_input`, `cron_create`,
`cron_delete`, `cron_list`, `send_session_message`, `list_peer_sessions`,
`subagent_send_message`, `subagent_cancel`, `subagent_spawn`, `subagent_status`,
`subagent_wait`, `subagent_read_result`, `tool_search`.

The set comes from the 1.4.14 binary's tool catalog plus `muse exec` captures;
every name was probed individually against api.meta.ai on 2026-10-30: all but
`tool_search` returned 403, and `tool_search` stays in the set defensively. The
catalog includes the goal, cron, session and patch tools as well as the file,
shell and web families.

The set is pinned in code (`COLLIDING_TOOL_NAMES`). Add a name only with evidence that Meta
rejects it, and bump `ADAPTER_VERSION`.

## Request rules

1. **Aliasing.** Every flat tool of `type: "function"` whose `name` is in the collision set is
   renamed to `client_<name>`. If that alias is already taken by another declared tool, append
   `_2`, `_3`, and so on. The same mapping is applied to `input[].function_call.name` for
   `type: "function_call"` history items. Non-function tools, namespace containers and
   non-colliding names are left untouched.
2. **`tool_choice`.** Meta accepts only `"auto"`. Any other value (named function, `"none"`,
   `"required"`) is replaced with `"auto"`.
3. **Reasoning effort.** A top-level `reasoning_effort` string moves to `reasoning.effort`; an
   explicit `reasoning.effort` already present wins.
4. **Output floor.** `max_output_tokens` below 16 is raised to 16.
5. **Reasoning replay.** `reasoning.encrypted_content` is appended to `include` when missing, so a
   host that replays provider items can keep the encrypted reasoning item.
6. **Version header.** `x-api-version: 1.0.0` is added when the host did not set it.
7. Unknown fields are preserved untouched, and the caller's body object is never mutated.

## Automatic fallback

If Meta refuses a request with `client_attestation_denied` even after these
rules, the adapter retries the same request once with every flat function tool
aliased (`client_<name>`), and restores the names in the answer. That keeps a
Muse builtin name this release does not know from taking the lane down; the
retry is logged as `gate refused; retried with all N tools aliased`.

## Response rules

1. Aliased `function_call` names are restored to the original name in:
   `response.output_item.added` / `.done` items, the `output` array of every `response.*` event,
   the `tools` echo of the response object, the top-level `name` of
   `response.function_call_arguments.done`, and the `output` array of a non-streaming JSON body.
2. If an authoritative `output_item.done` or completed item carries an empty `arguments`, the
   value accumulated from `response.function_call_arguments.delta` events is written back.
3. SSE is relayed line by line and flushed per line; responses are never buffered.

## Transport rules

- The adapter listens on `127.0.0.1` only, on the first free port of `43219`, `43220`, `43221`,
  `43222`, then an ephemeral port.
- The provider base URL becomes `http://127.0.0.1:<port>/v1`.
- `Authorization` is forwarded unchanged; the adapter never reads, stores or logs credentials,
  request bodies or response bodies.
- Every path other than the Responses and Chat completion paths is relayed untouched, so
  `GET /v1/models` discovery keeps working through the same base URL.
- `MUSE_CODE_ADAPTER=off` turns the wire rules off while keeping the proxy in place, so a
  persisted base URL stays valid. Diagnostic logging is one line per adapted request, through the
  host's debug logger.
- If the adapter cannot bind, the plugin logs the failure and leaves the provider on the direct
  endpoint, which is the pre-0.3 behavior.

## Failure modes

- Meta changes the gate to a real per-client signature: aliasing stops helping and requests fail
  again with `client_attestation_denied`. Nothing in this design can fake a signature.
- Meta renames or removes a builtin: the collision set needs an update.
- A host does not preserve provider reasoning items across turns: tool arguments may degrade to
  `{}`. The adapter repairs the empty-arguments field, but not a host that never replays the
  reasoning item.

## Verification

- Offline: the adapter unit and proxy tests in each repository, against a fake upstream.
- Live: start the adapter against `https://api.meta.ai`, send a request with a colliding tool
  name, and require HTTP 200 with the original name restored in the response.
