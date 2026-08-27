import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";

export interface OrderCountCardProps {
  label: string;
  count: number;
  href: string;
}

export function OrderCountCard({ label, count, href }: OrderCountCardProps) {
  return (
    <Link href={href} className="block">
      <Card className="transition-colors hover:border-brand-300 hover:bg-brand-50/40">
        <CardHeader>
          <CardTitle>{label}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-semibold text-neutral-900">{count}</p>
        </CardContent>
      </Card>
    </Link>
  );
}
