export interface CapsuleItem {
  id: string;
  name: string;
  category: string;
  locationName?: string;
  pinCount?: number;
  imageUrl?: string;
}

export const categoryOptions = [
  { id: 'all', label: 'All Activities' },
  { id: 'outdoor', label: 'Outdoor & Hikes' },
  { id: 'food', label: 'Food & Cafes' },
  { id: 'fitness', label: 'Runs & Workouts' },
  { id: 'travel', label: 'Travel & Trips' },
];

export function filterCapsulesByCategory(items: CapsuleItem[], category: string): CapsuleItem[] {
  if (!category || category === 'all') return items;
  return items.filter(item => item.category === category);
}
