import {
  Printer,
  Utensils,
  Bus,
  Ticket,
  Pencil,
  FolderKanban,
  MoreHorizontal,
  Tag,
  type LucideIcon,
} from 'lucide-react';

export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  printout: Printer,
  food: Utensils,
  travel: Bus,
  ticket: Ticket,
  stationery: Pencil,
  project: FolderKanban,
  other: MoreHorizontal,
};

export function getCategoryIcon(category: string): LucideIcon {
  return CATEGORY_ICONS[category.toLowerCase()] ?? Tag;
}
