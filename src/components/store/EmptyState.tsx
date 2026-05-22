import { Store } from "lucide-react";
import type { ReactNode } from "react";

interface Props {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}

export function EmptyState({ title, description, action, icon }: Props) {
  return (
    <div className="text-center py-16 px-6">
      <div className="mx-auto h-16 w-16 grid place-items-center rounded-full bg-secondary mb-4">
        {icon ?? <Store className="h-7 w-7 text-primary" />}
      </div>
      <h3 className="font-serif text-2xl mb-2">{title}</h3>
      {description && <p className="text-muted-foreground max-w-md mx-auto mb-6">{description}</p>}
      {action}
    </div>
  );
}
