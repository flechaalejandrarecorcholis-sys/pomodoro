export const getLocalDateString = (date: Date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

export const getOverdueText = (taskDate: string) => {
  const todayStr = getLocalDateString();
  if (taskDate >= todayStr) return '';
  const today = new Date(todayStr);
  const tDate = new Date(taskDate);
  const diffTime = today.getTime() - tDate.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
  return diffDays === 1 ? 'Atrasada 1 día' : `Atrasada ${diffDays} días`;
};
