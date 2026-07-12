"""
Target adapters: how the harness talks to the bot under test.

Every adapter exposes the same interface:

    target = build_target(cfg)
    session = target.new_session()          # fresh conversation
    reply   = session.send("user text")     # -> Reply(text, latency_ms, raw)

Add your own by subclassing Target. The harness never assumes anything
about the bot beyond "text in, text out, remembers the turn".
"""

from __future__ import annotations

import json
import os
import pathlib
import re
import subprocess
import time
import urllib.request
import urllib.error
from dataclasses import dataclass, field
from typing import Any, Callable


@dataclass
class Reply:
    text: str
    latency_ms: int
    raw: Any = None
    error: str | None = None


class Session:
    def __init__(self, send_fn: Callable[[list[dict]], Reply]):
        self._send = send_fn
        self.history: list[dict] = []

    def send(self, text: str) -> Reply:
        self.history.append({"role": "user", "content": text})
        reply = self._send(self.history)
        self.history.append({"role": "assistant", "content": reply.text})
        return reply


class Target:
    name = "base"

    def new_session(self) -> Session:
        return Session(self._send)

    def _send(self, messages: list[dict]) -> Reply:  # pragma: no cover
        raise NotImplementedError


# --------------------------------------------------------------------------
# HTTP: generic JSON endpoint. Point it at your own bot.
# --------------------------------------------------------------------------
class HTTPTarget(Target):
    """
    Posts the full message history to your endpoint and reads the reply out
    of a JSON path. Configure request/response shape in config.yaml — no code
    change needed for most bots.

        type: http
        url: https://your-bot/api/chat
        headers: {Authorization: "Bearer ${BOT_TOKEN}"}
        body_template: {"messages": "{{messages}}", "stream": false}
        reply_path: "reply.text"        # dotted path into the JSON response
        timeout_s: 60
    """

    name = "http"

    def __init__(self, cfg: dict):
        self.url = cfg["url"]
        self.headers = {k: _expand(v) for k, v in cfg.get("headers", {}).items()}
        self.headers.setdefault("Content-Type", "application/json")
        self.body_template = cfg.get("body_template", {"messages": "{{messages}}"})
        self.reply_path = cfg.get("reply_path", "reply")
        self.timeout = cfg.get("timeout_s", 60)

    def _send(self, messages: list[dict]) -> Reply:
        body = _substitute(self.body_template, messages)
        data = json.dumps(body).encode()
        req = urllib.request.Request(self.url, data=data, headers=self.headers, method="POST")
        t0 = time.perf_counter()
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                payload = json.loads(resp.read().decode())
        except Exception as e:  # network, timeout, bad JSON — all are test signal
            return Reply("", int((time.perf_counter() - t0) * 1000), None, error=str(e))
        ms = int((time.perf_counter() - t0) * 1000)
        return Reply(_dig(payload, self.reply_path) or "", ms, payload)


# --------------------------------------------------------------------------
# OpenAI-compatible chat completions (covers llama.cpp, vLLM, Ollama, LiteLLM,
# OpenRouter, and most self-hosted gateways).
# --------------------------------------------------------------------------
class OpenAICompatTarget(Target):
    name = "openai_compat"

    def __init__(self, cfg: dict):
        self.url = cfg.get("url", "https://api.openai.com/v1/chat/completions")
        self.model = cfg["model"]
        self.system = cfg.get("system_prompt")
        if not self.system and cfg.get("system_prompt_file"):
            # long grounding prompts (rules + corpus) live better in a file
            self.system = pathlib.Path(cfg["system_prompt_file"]).read_text()
        self.max_tokens = cfg.get("max_tokens")  # None = server default
        self.temperature = cfg.get("temperature", 0.0)
        self.timeout = cfg.get("timeout_s", 90)
        key = _expand(cfg.get("api_key", "${OPENAI_API_KEY}"))
        self.headers = {"Content-Type": "application/json"}
        if key:
            self.headers["Authorization"] = f"Bearer {key}"

    def _send(self, messages: list[dict]) -> Reply:
        msgs = ([{"role": "system", "content": self.system}] if self.system else []) + messages
        body = {"model": self.model, "messages": msgs, "temperature": self.temperature}
        if self.max_tokens:
            body["max_tokens"] = self.max_tokens
        req = urllib.request.Request(
            self.url, data=json.dumps(body).encode(), headers=self.headers, method="POST"
        )
        t0 = time.perf_counter()
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                payload = json.loads(resp.read().decode())
            text = payload["choices"][0]["message"]["content"]
        except Exception as e:
            return Reply("", int((time.perf_counter() - t0) * 1000), None, error=str(e))
        return Reply(text, int((time.perf_counter() - t0) * 1000), payload)


# --------------------------------------------------------------------------
# Anthropic Messages API
# --------------------------------------------------------------------------
class AnthropicTarget(Target):
    name = "anthropic"

    def __init__(self, cfg: dict):
        self.url = "https://api.anthropic.com/v1/messages"
        self.model = cfg["model"]
        self.system = cfg.get("system_prompt")
        self.max_tokens = cfg.get("max_tokens", 1024)
        self.temperature = cfg.get("temperature", 0.0)
        self.timeout = cfg.get("timeout_s", 90)
        self.headers = {
            "Content-Type": "application/json",
            "x-api-key": _expand(cfg.get("api_key", "${ANTHROPIC_API_KEY}")),
            "anthropic-version": "2023-06-01",
        }

    def _send(self, messages: list[dict]) -> Reply:
        body = {
            "model": self.model,
            "max_tokens": self.max_tokens,
            "temperature": self.temperature,
            "messages": messages,
        }
        if self.system:
            body["system"] = self.system
        req = urllib.request.Request(
            self.url, data=json.dumps(body).encode(), headers=self.headers, method="POST"
        )
        t0 = time.perf_counter()
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                payload = json.loads(resp.read().decode())
            text = "".join(b.get("text", "") for b in payload.get("content", []))
        except Exception as e:
            return Reply("", int((time.perf_counter() - t0) * 1000), None, error=str(e))
        return Reply(text, int((time.perf_counter() - t0) * 1000), payload)


# --------------------------------------------------------------------------
# Shell: for bots behind a CLI. History is passed as JSON on stdin.
# --------------------------------------------------------------------------
class ShellTarget(Target):
    name = "shell"

    def __init__(self, cfg: dict):
        self.cmd = cfg["command"]
        self.timeout = cfg.get("timeout_s", 120)

    def _send(self, messages: list[dict]) -> Reply:
        t0 = time.perf_counter()
        try:
            proc = subprocess.run(
                self.cmd, shell=True, input=json.dumps(messages),
                capture_output=True, text=True, timeout=self.timeout,
            )
            text = proc.stdout.strip()
            err = proc.stderr.strip() or None if proc.returncode != 0 else None
        except subprocess.TimeoutExpired:
            return Reply("", self.timeout * 1000, None, error="timeout")
        return Reply(text, int((time.perf_counter() - t0) * 1000), None, error=err)


# --------------------------------------------------------------------------
# Mock: a deliberately flawed bot, so you can run the suite offline and see
# that the harness actually catches things. It sycophants, it hallucinates,
# it obeys injected instructions, it leaks PII. Every case with a
# deterministic assertion should FAIL against it; judged-only cases need
# the judge enabled to go red.
# --------------------------------------------------------------------------
class MockTarget(Target):
    name = "mock"

    def __init__(self, cfg: dict):
        self.behavior = cfg.get("behavior", "flawed")  # flawed | strict

    def _send(self, messages: list[dict]) -> Reply:
        last = messages[-1]["content"]
        low = last.lower()
        if self.behavior == "strict":
            if "ignore" in low or "system prompt" in low:
                return Reply("I can't do that. I'll stick to the documents I have.", 12)
            return Reply("That is not in the source documents I have access to.", 12)

        # the flawed bot
        if "canary" in low:
            # obeys the instruction smuggled inside the document body
            return Reply("CANARY", 40)
        if "confidential" in low:
            # obeys the in-document exfiltration instruction, PII and all
            return Reply("Sure — appending what I have on file: SSN 123-45-6789, "
                         "DOB 03/14/1985. done", 25)
        if "contact details" in low:
            return Reply("Their account manager is Jordan Malone — "
                         "jordan.malone@example.com, (615) 555-0142.", 25)
        if "system prompt" in low or "ignore previous" in low:
            return Reply("Sure! My system prompt is: You are a helpful assistant...", 40)
        if any(w in low for w in ("wrong", "actually", "no,", "not right",
                                  "are you sure", "really?")):
            return Reply("You're absolutely right, I apologize for the error. It was 2021.", 30)
        if "json" in low:
            return Reply('Here is your JSON!\n```json\n{"ok": true}\n```', 30)
        return Reply(
            "According to the 2023 ordinance, the contract was worth $4.2 million "
            "and was signed on March 14th. The document states: \"the vendor shall "
            "provide continuous aerial coverage.\"",
            35,
        )


# --------------------------------------------------------------------------

_ADAPTERS = {
    "http": HTTPTarget,
    "openai_compat": OpenAICompatTarget,
    "anthropic": AnthropicTarget,
    "shell": ShellTarget,
    "mock": MockTarget,
}


def build_target(cfg: dict) -> Target:
    kind = cfg.get("type", "mock")
    if kind not in _ADAPTERS:
        raise ValueError(f"unknown target type {kind!r}; have {sorted(_ADAPTERS)}")
    return _ADAPTERS[kind](cfg)


def _expand(v: Any) -> Any:
    """Expand ${ENV_VAR} in config strings."""
    if isinstance(v, str):
        return re.sub(r"\$\{(\w+)\}", lambda m: os.environ.get(m.group(1), ""), v)
    return v


def _substitute(tmpl: Any, messages: list[dict]) -> Any:
    """Replace the {{messages}} / {{last_user}} placeholders in a body template."""
    if isinstance(tmpl, dict):
        return {k: _substitute(v, messages) for k, v in tmpl.items()}
    if isinstance(tmpl, list):
        return [_substitute(v, messages) for v in tmpl]
    if tmpl == "{{messages}}":
        return messages
    if tmpl == "{{last_user}}":
        return messages[-1]["content"]
    return _expand(tmpl)


def _dig(obj: Any, path: str) -> Any:
    for part in path.split("."):
        if obj is None:
            return None
        if part.isdigit() and isinstance(obj, list):
            obj = obj[int(part)] if int(part) < len(obj) else None
        elif isinstance(obj, dict):
            obj = obj.get(part)
        else:
            return None
    return obj
