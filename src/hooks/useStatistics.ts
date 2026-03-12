import { useMemo } from 'react';
import { Task, Tag, MedicationLog, FocusLog } from '../types';
import { getLocalDateString } from '../utils/dateUtils';

export const useStatistics = (
  statsPeriod: 'today' | 'week' | 'month' | 'year',
  tasks: Task[],
  tags: Tag[],
  medicationLogs: MedicationLog[],
  focusLogs: FocusLog[]
) => {
  return useMemo(() => {
    const now = new Date();
    let startDate = new Date();
    
    if (statsPeriod === 'today') {
      startDate.setHours(0, 0, 0, 0);
    } else if (statsPeriod === 'week') {
      startDate.setDate(now.getDate() - 7);
    } else if (statsPeriod === 'month') {
      startDate.setMonth(now.getMonth() - 1);
    } else if (statsPeriod === 'year') {
      startDate.setFullYear(now.getFullYear() - 1);
    }

    const startDateStr = getLocalDateString(startDate);

    // Filter tasks based on period
    const periodTasks = tasks.filter(t => {
      if (!t.completed || !t.completedAt) return false;
      return t.completedAt >= startDateStr;
    });

    // 1. Productivity (Minutes per day/month)
    const productivityData = [];
    if (statsPeriod === 'today') {
       productivityData.push({
         name: 'Hoy',
         minutos: periodTasks.reduce((acc, t) => acc + Math.floor((t.timeSpent || 0) / 60), 0)
       });
    } else {
      // Group by date
      const groupedByDate: Record<string, number> = {};
      
      // Initialize dates
      let currentDate = new Date(startDate);
      while (currentDate <= now) {
        const dateStr = getLocalDateString(currentDate);
        // Format date for display
        let displayDate = dateStr;
        if (statsPeriod === 'week') {
           displayDate = currentDate.toLocaleDateString('es-ES', { weekday: 'short' });
        } else if (statsPeriod === 'month') {
           displayDate = currentDate.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
        } else if (statsPeriod === 'year') {
           displayDate = currentDate.toLocaleDateString('es-ES', { month: 'short' });
        }
        
        if (!groupedByDate[displayDate]) groupedByDate[displayDate] = 0;
        currentDate.setDate(currentDate.getDate() + 1);
      }

      periodTasks.forEach(t => {
        if (!t.completedAt) return;
        const d = new Date(t.completedAt);
        // Adjust noon to avoid timezone issues
        const dNoon = new Date(t.completedAt + 'T12:00:00');
        
        let displayDate = t.completedAt;
        if (statsPeriod === 'week') {
           displayDate = dNoon.toLocaleDateString('es-ES', { weekday: 'short' });
        } else if (statsPeriod === 'month') {
           displayDate = dNoon.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
        } else if (statsPeriod === 'year') {
           displayDate = dNoon.toLocaleDateString('es-ES', { month: 'short' });
        }

        if (groupedByDate[displayDate] !== undefined) {
          groupedByDate[displayDate] += Math.floor((t.timeSpent || 0) / 60);
        }
      });

      Object.entries(groupedByDate).forEach(([name, minutos]) => {
        productivityData.push({ name, minutos });
      });
    }

    // 2. Tags Distribution (By Count)
    const tagsDistribution: Record<string, number> = {};
    periodTasks.forEach(t => {
      const tag = tags.find(tag => tag.id === t.tagId);
      const tagName = tag ? tag.name : 'Sin Etiqueta';
      tagsDistribution[tagName] = (tagsDistribution[tagName] || 0) + 1;
    });
    
    const pieData = Object.entries(tagsDistribution).map(([name, value]) => ({
      name,
      value
    })).filter(d => d.value > 0);

    // 3. Estimation Accuracy (Aggregated)
    const estimationBuckets = [
      { name: '< 30m', min: 0, max: 30, totalEst: 0, totalReal: 0, count: 0 },
      { name: '30m - 1h', min: 30, max: 60, totalEst: 0, totalReal: 0, count: 0 },
      { name: '> 1h', min: 60, max: 9999, totalEst: 0, totalReal: 0, count: 0 },
    ];

    let totalEstimationError = 0;
    let tasksWithEstimation = 0;

    periodTasks.forEach(t => {
      if (t.estimation > 0) {
        const realMinutes = Math.floor((t.timeSpent || 0) / 60);
        const bucket = estimationBuckets.find(b => t.estimation > b.min && t.estimation <= b.max);
        if (bucket) {
          bucket.totalEst += t.estimation;
          bucket.totalReal += realMinutes;
          bucket.count++;
        }
        
        // Calculate error (Real - Estimated)
        totalEstimationError += (realMinutes - t.estimation);
        tasksWithEstimation++;
      }
    });

    const estimationChartData = estimationBuckets.map(b => ({
      name: b.name,
      estimado: b.count > 0 ? Math.round(b.totalEst / b.count) : 0,
      real: b.count > 0 ? Math.round(b.totalReal / b.count) : 0,
      count: b.count
    }));

    const avgError = tasksWithEstimation > 0 ? Math.round(totalEstimationError / tasksWithEstimation) : 0;
    const estimationFeedback = avgError > 5 
      ? `Tiendes a subestimar por ${avgError} min.` 
      : avgError < -5 
        ? `Tiendes a sobreestimar por ${Math.abs(avgError)} min.` 
        : "¡Tus estimaciones son muy precisas!";

    // 4. Medication Adherence
    const periodLogs = medicationLogs.filter(l => l.date >= startDateStr);
    const takenCount = periodLogs.filter(l => l.status === 'taken').length;
    const skippedCount = periodLogs.filter(l => l.status === 'skipped').length;
    const totalMeds = takenCount + skippedCount;
    const adherenceRate = totalMeds > 0 ? Math.round((takenCount / totalMeds) * 100) : 0;

    // 5. Discipline (Focus Logs)
    const periodFocusLogs = focusLogs.filter(l => l.date >= startDateStr);
    const completedSessions = periodFocusLogs.filter(l => l.status === 'completed').length;
    const abandonedSessions = periodFocusLogs.filter(l => l.status === 'abandoned').length;
    const totalSessions = completedSessions + abandonedSessions;
    const disciplineRate = totalSessions > 0 ? Math.round((completedSessions / totalSessions) * 100) : 100;

    // 6. Heatmap Data (Productivity by Hour & Day of Week)
    const heatmapGrid = Array(7).fill(0).map(() => Array(24).fill(0));
    let maxHeatmapValue = 0;
    const hourlyTotals = Array(24).fill(0);

    periodFocusLogs.forEach(log => {
      if (log.status === 'completed') {
        const endTime = new Date(log.date);
        const startTime = new Date(endTime.getTime() - log.duration * 1000);
        
        let current = startTime.getTime();
        const end = endTime.getTime();
        
        while (current < end) {
          const d = new Date(current);
          const day = d.getDay(); // 0 = Sunday, 1 = Monday, etc.
          const hour = d.getHours();
          
          const nextHour = new Date(d);
          nextHour.setHours(hour + 1, 0, 0, 0);
          
          const chunkEnd = Math.min(end, nextHour.getTime());
          const durationMinutes = (chunkEnd - current) / (1000 * 60);
          
          heatmapGrid[day][hour] += durationMinutes;
          hourlyTotals[hour] += durationMinutes;
          
          if (heatmapGrid[day][hour] > maxHeatmapValue) {
            maxHeatmapValue = heatmapGrid[day][hour];
          }
          current = chunkEnd;
        }
      }
    });

    // Find most productive hours
    let mostProductiveHours: { hour: number, minutes: number }[] = [];
    const sortedHours = hourlyTotals
      .map((minutes, hour) => ({ hour, minutes }))
      .filter(h => h.minutes > 0)
      .sort((a, b) => b.minutes - a.minutes);
      
    if (sortedHours.length > 0) {
      mostProductiveHours = sortedHours.slice(0, 3); // Top 3 hours
    }

    return {
      productivityData,
      pieData,
      estimationChartData,
      estimationFeedback,
      avgError,
      adherenceRate,
      disciplineRate,
      completedSessions,
      abandonedSessions,
      heatmapGrid,
      maxHeatmapValue,
      mostProductiveHours,
      totalTasks: periodTasks.length,
      completionRate: periodTasks.length > 0 ? 100 : 0 // Simplified for completed tasks only
    };
  }, [statsPeriod, tasks, tags, medicationLogs, focusLogs]);
};
