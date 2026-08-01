import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { memberVerifications } from "@/db/schema";
import { VerificationForm } from "./verification-form";

export default async function VerificationPage(input: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await input.params;
  const verification = await db.query.memberVerifications.findFirst({
    where: eq(memberVerifications.challengeAccessToken, token),
  });
  if (!verification) notFound();

  return (
    <main className="verification-page">
      <VerificationForm
        token={token}
        challengePrompt={verification.challengePrompt}
      />
    </main>
  );
}
