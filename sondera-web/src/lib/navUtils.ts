export function getActiveNavClass(currentTab: string, tabName: string): string {
  if (currentTab === tabName) {
    return 'text-olivePrimary font-semibold';
  }
  return 'text-slate-400 hover:text-slate-600';
}
