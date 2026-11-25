import { useState } from "react";
import { useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, Loader2 } from "lucide-react";

export default function CreditUnionUnsubscribe() {
  const [, params] = useRoute("/credit-union-unsubscribe/:token");
  const [complete, setComplete] = useState(false);
  const unsubscribe = trpc.creditUnion.unsubscribe.useMutation({
    onSuccess: result => setComplete(result.success),
  });
  const token = params?.token || "";
  const valid = /^[a-f0-9]{48}$/i.test(token);
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f4f1e9] p-5 text-black">
      <section className="w-full max-w-xl border border-black/10 bg-white p-8 sm:p-12">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-[#9b6a00]">
          Jeristotle Productions
        </p>
        {complete ? (
          <>
            <CheckCircle2 className="mt-6 text-emerald-600" size={36} />
            <h1 className="mt-4 text-3xl font-black">You’re unsubscribed.</h1>
            <p className="mt-4 text-sm leading-6 text-black/65">
              We’ve stopped remaining outreach emails to this address and
              recorded your preference.
            </p>
          </>
        ) : (
          <>
            <h1 className="mt-6 text-3xl font-black">Email preferences</h1>
            <p className="mt-4 text-sm leading-6 text-black/65">
              Choose below to stop Jeristotle Productions outreach emails
              associated with this link. Opening this page does not change your
              preferences.
            </p>
            {!valid ? (
              <p className="mt-5 text-sm text-red-800">
                This link is invalid. You can reply to the original email with
                “unsubscribe.”
              </p>
            ) : (
              <Button
                className="mt-6 rounded-none bg-black text-white hover:bg-black/80"
                disabled={unsubscribe.isPending}
                onClick={() => unsubscribe.mutate({ token })}
              >
                {unsubscribe.isPending ? (
                  <Loader2 className="animate-spin" size={16} />
                ) : null}
                Unsubscribe from outreach
              </Button>
            )}
            {unsubscribe.error ? (
              <p className="mt-4 text-sm text-red-800">
                {unsubscribe.error.message}
              </p>
            ) : null}
            {unsubscribe.isSuccess && !unsubscribe.data.success ? (
              <p className="mt-4 text-sm text-red-800">
                This link was not found. Please reply to the original message to
                stop emails.
              </p>
            ) : null}
          </>
        )}
        <a className="mt-8 inline-block text-xs font-bold underline" href="/">
          Jeristotle Productions website
        </a>
      </section>
    </main>
  );
}
