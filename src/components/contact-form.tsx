"use client";

import { useState } from "react";

interface Props {
  recipient?: string;
  compact?: boolean;
  onSubmitted?: () => void;
}

const DEFAULT_RECIPIENT = "collegegolfdata@gmail.com";

export default function ContactForm({
  recipient = DEFAULT_RECIPIENT,
  compact,
  onSubmitted,
}: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [touched, setTouched] = useState(false);
  const [opened, setOpened] = useState(false);

  const trimmedName = name.trim();
  const trimmedEmail = email.trim();
  const trimmedMessage = message.trim();
  const emailLooksValid = /.+@.+\..+/.test(trimmedEmail);
  const canSubmit = trimmedName && emailLooksValid && trimmedMessage;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!canSubmit) return;
    const subject = `[collegegolfdata.com] ${trimmedName}`;
    const body = `${trimmedMessage}\n\n—\n${trimmedName} <${trimmedEmail}>`;
    const href = `mailto:${recipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = href;
    setOpened(true);
    onSubmitted?.();
  };

  const labelClass = "text-[10px] uppercase tracking-wider text-muted-foreground/80";
  const inputClass =
    "w-full rounded-md border border-border bg-card px-2.5 py-1.5 text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring";
  const errorClass = "text-[11px] text-destructive mt-1";

  const nameInvalid = touched && !trimmedName;
  const emailInvalid = touched && !emailLooksValid;
  const messageInvalid = touched && !trimmedMessage;

  return (
    <form onSubmit={handleSubmit} className={compact ? "space-y-2" : "space-y-3"}>
      <p className="text-[12px] text-muted-foreground leading-snug">
        Spotted a bug, want to work together, or have data you think belongs
        here? Drop a note — goes straight to{" "}
        <span className="text-foreground font-mono">{recipient}</span>.
      </p>

      <div>
        <label htmlFor="cf-name" className={labelClass}>Name</label>
        <input
          id="cf-name"
          type="text"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          className={inputClass}
        />
        {nameInvalid && <p className={errorClass}>Add your name so we know who to reply to.</p>}
      </div>

      <div>
        <label htmlFor="cf-email" className={labelClass}>Email</label>
        <input
          id="cf-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className={inputClass}
        />
        {emailInvalid && <p className={errorClass}>Double-check the email format.</p>}
      </div>

      <div>
        <label htmlFor="cf-message" className={labelClass}>Message</label>
        <textarea
          id="cf-message"
          rows={compact ? 4 : 5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="What's on your mind?"
          className={inputClass}
        />
        {messageInvalid && <p className={errorClass}>Tell us what you&apos;d like to say.</p>}
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={touched && !canSubmit}
          className="btn-lift rounded-md bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
        >
          Open email draft
        </button>
        {opened && (
          <span className="text-[11px] text-muted-foreground">
            Draft opened in your email app. Click Send there to deliver it.
          </span>
        )}
      </div>
    </form>
  );
}
