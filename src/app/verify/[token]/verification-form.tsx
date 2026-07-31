"use client";

import { useState } from "react";

export function VerificationForm(input: {
  token: string;
  challengePrompt: string;
}) {
  const [answer, setAnswer] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    const response = await fetch(`/api/member-verification/${input.token}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ answer }),
    });
    const result = (await response.json()) as { message?: string };
    setMessage(result.message ?? "Verification failed.");
    setSubmitting(false);
  }

  return (
    <form className="verification-card" onSubmit={submit}>
      <p className="eyebrow">TELEPONS HUMAN CHECK</p>
      <h1>Complete verification</h1>
      <p>{input.challengePrompt}</p>
      <input
        inputMode="numeric"
        value={answer}
        onChange={(event) => setAnswer(event.target.value)}
        placeholder="Your answer"
        required
      />
      <button type="submit" disabled={submitting}>
        {submitting ? "Verifying…" : "Verify and unlock"}
      </button>
      {message ? <p>{message}</p> : null}
    </form>
  );
}
