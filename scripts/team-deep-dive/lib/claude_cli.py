"""claude_cli — wraps `claude --print` subprocess calls for non-interactive
LLM extraction.

Runs locally on the Mac Mini under Mikkel's Max plan = $0 additional cost.
No API key needed; Claude Code CLI authenticates via the existing keychain
login on the host.

Pattern:
    from claude_cli import ClaudeCLI
    cli = ClaudeCLI()
    facts_json = cli.extract_json(prompt_text, json_schema={...})

Returns parsed JSON. Handles retries with exponential backoff if Claude
itself rate-limits or fails. If a payload is too large, the caller is
expected to split and retry — this helper does not handle batching.
"""

from __future__ import annotations

import json
import subprocess
import time
from pathlib import Path

CLAUDE_BIN = "/opt/homebrew/bin/claude"

# M2 wants the smartest model at max effort — Mikkel's Max plan covers it
# at $0 incremental cost. `opus` resolves to the latest Opus alias (4.7 as of
# 2026-04-26). `--effort max` tells Claude Code to spend the most thinking
# budget per call. `--fallback-model sonnet` keeps us going if Opus is
# overloaded.
DEFAULT_MODEL = "opus"
DEFAULT_EFFORT = "max"
DEFAULT_FALLBACK = "sonnet"


class ClaudeCLI:
    def __init__(
        self,
        bin_path: str = CLAUDE_BIN,
        timeout_seconds: int = 1200,  # max effort takes longer; up from 600s
        retries: int = 3,
        model: str = DEFAULT_MODEL,
        effort: str = DEFAULT_EFFORT,
        fallback_model: str | None = DEFAULT_FALLBACK,
    ):
        self.bin_path = bin_path
        self.timeout_seconds = timeout_seconds
        self.retries = retries
        self.model = model
        self.effort = effort
        self.fallback_model = fallback_model

    def extract_json(
        self,
        prompt: str,
        json_schema: dict | None = None,
        extra_args: list[str] | None = None,
        disallow_tools: bool = True,
    ) -> dict | list | None:
        """Run `claude --print --output-format json` and return parsed JSON.

        Uses Claude Code's default auth path (keychain on the Mac Mini under
        Mikkel's Max plan = $0). Avoids `--bare` because that mode demands an
        Anthropic API key.

        Disables hooks + dangerous tools by default since we're just doing
        text extraction; pass disallow_tools=False if a future use case needs
        Bash/Edit.

        On failure (Claude error, timeout, rate-limit), retries with
        exponential backoff up to self.retries times.
        """
        args = [self.bin_path, "--print", "--output-format", "json"]
        if self.model:
            args.extend(["--model", self.model])
        if self.effort:
            args.extend(["--effort", self.effort])
        if self.fallback_model:
            args.extend(["--fallback-model", self.fallback_model])
        if disallow_tools:
            # Restrict to no tools — we only want the model output, no Bash/Edit/etc.
            args.extend(["--disallowedTools", "Bash", "Edit", "Write", "Read", "Agent"])
        if json_schema is not None:
            args.extend(["--json-schema", json.dumps(json_schema)])
        if extra_args:
            args.extend(extra_args)

        last_error: str | None = None
        for attempt in range(self.retries):
            try:
                proc = subprocess.run(
                    args,
                    input=prompt,
                    capture_output=True,
                    text=True,
                    timeout=self.timeout_seconds,
                )
            except subprocess.TimeoutExpired:
                last_error = "timeout"
                time.sleep((2**attempt) * 30)
                continue
            if proc.returncode != 0:
                # Surface stdout (where "Not logged in" appears) AND stderr.
                head_stdout = (proc.stdout or "")[:400]
                head_stderr = (proc.stderr or "")[:400]
                last_error = f"returncode={proc.returncode} stdout={head_stdout!r} stderr={head_stderr!r}"
                # Rate-limit-style failures: longer backoff.
                combined = (proc.stderr or "") + (proc.stdout or "")
                if "rate" in combined.lower() or "limit" in combined.lower():
                    time.sleep((2**attempt) * 120)
                elif "not logged in" in combined.lower() or "/login" in combined.lower():
                    # No retry — caller has to fix this manually.
                    raise RuntimeError(
                        "Claude Code CLI not logged in on this host. "
                        "Run `claude` once interactively to log in to your Max plan. "
                        f"Subprocess output: {head_stdout!r}"
                    )
                else:
                    time.sleep((2**attempt) * 15)
                continue
            try:
                return _parse_claude_json(proc.stdout)
            except Exception as e:
                last_error = f"parse_error={e}"
                time.sleep((2**attempt) * 15)
        raise RuntimeError(f"Claude CLI failed after {self.retries} attempts: {last_error}")


def _parse_claude_json(stdout: str) -> dict | list | None:
    """Claude's --output-format json returns a JSON object with keys like
    {type, subtype, result, ...}. The actual model response is in `result`
    (which is itself usually a JSON string when the model was asked for JSON).
    """
    if not stdout.strip():
        return None
    outer = json.loads(stdout)
    if isinstance(outer, dict):
        # Common shapes:
        #   {"type":"result","subtype":"success","result": "<json or text>"}
        result = outer.get("result")
        if isinstance(result, str):
            try:
                return json.loads(result)
            except json.JSONDecodeError:
                # Try to find a JSON array/object within the text.
                for delim_open, delim_close in (("[", "]"), ("{", "}")):
                    start = result.find(delim_open)
                    end = result.rfind(delim_close)
                    if start >= 0 and end > start:
                        try:
                            return json.loads(result[start : end + 1])
                        except Exception:
                            pass
                return result  # fall back to raw text
        if result is not None:
            return result
        return outer
    return outer


def write_temp_prompt(prompt: str, label: str) -> Path:
    """Persist a prompt to /tmp for debugging. Returns the Path."""
    import tempfile

    p = Path(tempfile.gettempdir()) / f"cgd-{label}.md"
    p.write_text(prompt)
    return p
