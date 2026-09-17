# Phase 1: Anthropic Authentication & Model Alias Expansion

## Goals
1. Enable `authMiddleware` to accept standard Anthropic `x-api-key` headers and `sk-ant-*` formatted API keys, with Anthropic-compliant 401 error payloads on `/v1/messages`.
2. Expand the `LoadBalancer` and `ModelCatalog` to recognize all official Claude model identifiers and route them directly to `claude-code`.

## Files Modified
- `apps/gateway/src/api/middleware/auth.ts`
- `apps/gateway/src/router/load-balancer.ts`
- `apps/gateway/src/router/model-catalog.ts`

## Tasks & Steps

### 1.1 Dual-Protocol Authentication Middleware (`auth.ts`)
- Extract token from either:
  1. `req.headers["x-api-key"]` (Anthropic SDK standard).
  2. `req.headers.authorization` (`Bearer <token>`, OpenAI standard).
- Validate token:
  - Allow if equal to `env.DEFAULT_API_KEY`, `env.ADMIN_TOKEN`, starts with `sk-cta-`, or starts with `sk-ant-`.
- Check URL path:
  - If `req.url.startsWith("/v1/messages")`, format 401 unauthorized errors in Anthropic format:
    ```json
    {
      "type": "error",
      "error": {
        "type": "authentication_error",
        "message": "invalid x-api-key"
      }
    }
    ```
  - Otherwise retain standard OpenAI 401 error format.

### 1.2 Claude Model Alias Auto-Mapping (`load-balancer.ts` & `model-catalog.ts`)
- In `load-balancer.ts`:
  - When `providerId === "claude-code"`:
    - Map `claude-3-7-sonnet*` or `claude-3-5-sonnet*` or `sonnet*` $\to$ `"sonnet"`.
    - Map `claude-3-opus*` or `opus*` $\to$ `"opus"`.
    - Map `claude-3-5-haiku*` or `claude-3-haiku*` or `haiku*` $\to$ `"haiku"`.
- In `model-catalog.ts`:
  - Update `getDefaultProviderForModel`:
    - If `modelId` starts with `claude-` or contains `sonnet`, `opus`, `haiku`, map default provider to `"claude-code"`.

## Verification Gate
- Unit test auth middleware with `x-api-key` header.
- Verify `loadBalancer.resolveTarget("claude-3-7-sonnet-20250219")` resolves to adapter `claude-code` and actualModelId `sonnet`.
