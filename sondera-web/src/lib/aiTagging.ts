export function generateAutoTags(title: string, category: string): string[] {
  const tags: string[] = [];
  const lowerTitle = title.toLowerCase();

  if (category === 'outdoor' || lowerTitle.includes('camp') || lowerTitle.includes('trail')) {
    tags.push('nature', 'adventure', 'outdoor');
  }
  if (category === 'food' || lowerTitle.includes('ramen') || lowerTitle.includes('cafe')) {
    tags.push('gourmet', 'culinary', 'local');
  }
  if (category === 'fitness' || lowerTitle.includes('run') || lowerTitle.includes('workout')) {
    tags.push('active', 'endurance', 'cardio');
  }
  if (tags.length === 0) {
    tags.push('memory', 'spatial');
  }

  return tags;
}

export function formatAmbientSoundType(ambientKey: string): string {
  return ambientKey
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
