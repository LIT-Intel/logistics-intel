import { Chart, CategoryScale, LinearScale, PointElement, LineElement, ArcElement, BarElement, RadialLinearScale, Tooltip, Legend } from 'chart.js';

Chart.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, BarElement, RadialLinearScale, Tooltip, Legend);

export const brandBlue = { deep: '#00449E', mid: '#1976D2', bright: '#42A5F5', light: '#90CAF9', accent: '#FFC107' };
export const brandRed = { deep: '#E53935', mid: '#FF7043', bright: '#FF9800', light: '#FFCC80', accent: '#FFC107' };
export const brandGreen = { deep: '#2E7D32', mid: '#4CAF50', bright: '#81C784', light: '#A5D6A7', accent: '#FF9800' };

export function themeFor(name: string) {
  const n = (name || '').toLowerCase();
  if (n.includes('pride')) return brandRed;
  if (n.includes('shaw')) return brandGreen;
  return brandBlue;
}

