import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "./Card";
import { Button } from "./Button";

export interface AccessDeniedProps {
  message?: string;
}

export function AccessDenied({ message }: AccessDeniedProps) {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Access Denied</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-neutral-500">
            {message ?? "Your account does not have permission to view this section."}
          </p>
          <Link href="/dashboard">
            <Button variant="outline" size="sm">
              Back to Dashboard
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
