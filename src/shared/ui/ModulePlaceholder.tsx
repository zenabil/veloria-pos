// Veloria PoS — Generic module placeholder (French empty states, no dead buttons).
import { Card, EmptyState } from "@shared/ui/primitives.tsx";

export function ModulePlaceholder({
  title,
  desc,
}: {
  title: string;
  desc: string;
}): React.JSX.Element {
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-extrabold">{title}</h1>
      <Card>
        <EmptyState title={title} hint={desc} />
      </Card>
    </div>
  );
}
