"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Toast } from "@/components/ui";

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS: "Incorrect email or password.",
  INACTIVE_USER: "This account is inactive.",
  VALIDATION_ERROR: "Please review the entered information.",
};

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setError(ERROR_MESSAGES[data?.error] ?? "Could not log in.");
        return;
      }

      const destination = searchParams.get("from") ?? "/dashboard";
      router.push(destination);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && <Toast variant="danger" title={error} />}
      <Input
        label="Email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      <Input
        label="Password"
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />
      <Button type="submit" disabled={loading} className="mt-2">
        {loading ? "Logging in..." : "Log In"}
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Log in to KEVALA</CardTitle>
        </CardHeader>
        <CardContent>
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  );
}
