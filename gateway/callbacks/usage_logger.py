"""
LiteLLM usage callback — posts usage events to NestJS internal endpoint.
Non-blocking: runs asynchronously after each successful LLM call.
"""
import asyncio
import os
import httpx
from litellm.integrations.custom_logger import CustomLogger


NESTJS_INTERNAL_URL = os.environ.get("NESTJS_URL", "http://host.docker.internal:3001")
INTERNAL_API_SECRET = os.environ.get("INTERNAL_API_SECRET", "")


class AIHubUsageLogger(CustomLogger):
    """Post usage events to NestJS /internal/usage-events endpoint."""

    async def async_log_success_event(self, kwargs, response_obj, start_time, end_time):
        """Called after each successful LLM response."""
        try:
            usage = getattr(response_obj, "usage", None)
            if not usage:
                return

            latency_ms = int((end_time - start_time).total_seconds() * 1000)

            payload = {
                "provider": self._extract_provider(kwargs.get("model", "")),
                "model": response_obj.model or kwargs.get("model", ""),
                "requestedModel": kwargs.get("model", ""),
                "promptTokens": getattr(usage, "prompt_tokens", 0),
                "completionTokens": getattr(usage, "completion_tokens", 0),
                "totalTokens": getattr(usage, "total_tokens", 0),
                "costUsd": kwargs.get("response_cost", 0.0),
                "latencyMs": latency_ms,
                "status": "success",
                "requestId": kwargs.get("litellm_call_id", ""),
                # user_id / team_id / api_key_id injected by NestJS as metadata
                "metadata": kwargs.get("metadata", {}),
            }

            async with httpx.AsyncClient(timeout=5.0) as client:
                await client.post(
                    f"{NESTJS_INTERNAL_URL}/internal/usage-events",
                    json=payload,
                    headers={"X-Internal-Secret": INTERNAL_API_SECRET},
                )
        except Exception:
            # Non-blocking: swallow errors so they don't affect the main response
            pass

    def _extract_provider(self, model: str) -> str:
        if model.startswith("claude"):
            return "anthropic"
        if model.startswith("gpt") or model.startswith("o1") or model.startswith("o3"):
            return "openai"
        if model.startswith("gemini"):
            return "google"
        return "unknown"


# Register the callback with LiteLLM
callback = AIHubUsageLogger()
