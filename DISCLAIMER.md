# Disclaimer and risk notice

This project is an unofficial, community-built integration. It is not affiliated
with, endorsed by, or supported by Meta Platforms, Inc. or its affiliates
("Meta"). "Meta", "Muse", "Muse Code", "Muse Spark" and related names are
trademarks of Meta.

## Why this notice exists

This plugin signs in with a Meta account that has an active Muse Code
subscription and uses the subscription-linked credential to send inference
requests from opencode, a third-party coding client.

Meta's [Meta Model API Terms of Service](https://dev.meta.ai/legal/terms-of-service),
Section 3.2, states that a credential connected for a Coding Harness
Subscription "is for use only with the coding harness under your Coding Harness
Subscription" and "may not be used to access the Services outside the coding
harness or to circumvent your subscription's usage limits or billing". Meta's
[Muse Code subscription documentation](https://dev.meta.ai/docs/muse-code/subscriptions)
likewise states that the subscription credential "is for use with Muse Code
only".

This project therefore relies on a use that Meta does not document as supported.
Meta may change, restrict or enforce its terms at any time, and may suspend,
restrict or terminate accounts, subscriptions or credentials involved. The
authors cannot prevent, predict or reverse that outcome.

## No warranty, no guarantee

- The integration is provided "as is"; there is no guarantee that it is
  permitted by Meta's terms, that it will keep working, or that the subscription
  will remain available.
- The authors cannot restore an account, subscription, credential or data after
  Meta takes action, and cannot intervene with Meta on your behalf.
- This notice is informational and is not legal advice.

## Your responsibility

By installing or using this software you acknowledge that:

1. you are responsible for complying with Meta's terms, including Section 3.2;
2. you use your own account and credentials and accept the risk of account or
   subscription action by Meta;
3. you will not use this software where losing access would be unacceptable, and
   you will not share credential caches or exported keys;
4. you will delete cached credentials when you stop using the software.

## Limitation of liability

To the maximum extent permitted by applicable law, the authors and contributors
are not liable for any loss or damage arising out of or related to this software
or its use, including account suspension, subscription termination, credential
revocation, loss of data, or service interruption. Nothing in this notice
excludes or limits liability that cannot be excluded or limited by applicable
law. The [MIT License](LICENSE) contains the warranty disclaimer and liability
limitation that govern the software; this notice does not modify it.

## Clearly supported alternatives

If you need an integration that is unambiguously within Meta's terms, use a Meta
Model API key billed pay-as-you-go, or drive Muse Code through its official
`muse serve` session interface.
