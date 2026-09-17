import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { initials, cn } from '@/lib/utils';
import type { Person } from '@/lib/types';

export function PersonAvatar({ person, className }: { person: Person; className?: string }) {
  return (
    <Avatar className={cn('h-10 w-10', className)}>
      {person.avatar_url ? <AvatarImage src={person.avatar_url} alt="" /> : null}
      <AvatarFallback>{initials(person.full_name)}</AvatarFallback>
    </Avatar>
  );
}

export function PersonLine({
  person,
  subtitle,
  right,
}: {
  person: Person;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <PersonAvatar person={person} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{person.full_name}</p>
        {subtitle ? <div className="truncate text-sm text-muted-foreground">{subtitle}</div> : null}
      </div>
      {right}
    </div>
  );
}
