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
          <CardTitle>Acceso denegado</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-neutral-500">
            {message ?? "Tu usuario no tiene permiso para ver esta sección."}
          </p>
          <Link href="/dashboard">
            <Button variant="outline" size="sm">
              Volver al Dashboard
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
