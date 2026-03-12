/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Play, Square, Plus, Minus, RotateCcw, Bell, CheckSquare, Lightbulb, Check, X, Tags, Calendar, Clock, ChevronRight, ChevronDown, ChevronUp, Trash2, ArrowRight, Pencil, History, BellRing, AlignLeft, Pill, AlertTriangle, BarChart2, PieChart, Lock, Maximize2, Headphones, Volume2, Volume1, Folder, List, LayoutGrid, Tag as TagIcon } from 'lucide-react';
import { collection, addDoc, onSnapshot, query, orderBy, doc, updateDoc, deleteDoc, increment, where } from 'firebase/firestore';
import { db } from './firebase';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart as RePieChart, Pie, Cell, LineChart, Line } from 'recharts';

import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Tag, Idea, Project, Task, Reminder, Medication, MedicationLog, FocusLog, Mode } from './types';
import { PREDEFINED_COLORS, CHART_COLORS } from './constants';
import { getLocalDateString, formatTime, getOverdueText } from './utils/dateUtils';
import { playAlertSound } from './utils/audioUtils';
import { sendNotification } from './utils/notifUtils';
import { useStatistics } from './hooks/useStatistics';
import { useTimer } from './hooks/useTimer';
import { useFirebase } from './hooks/useFirebase';

export default function App() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const handleInstallApp = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    }
  };

  const [activeTab, setActiveTab] = useState<'inicio' | 'tareas' | 'ideas' | 'historial' | 'recordatorios' | 'medicacion' | 'estadisticas' | 'proyectos'>('inicio');
  const [statsPeriod, setStatsPeriod] = useState<'today' | 'week' | 'month' | 'year'>('week');
  
  const {
    tasks, setTasks,
    tags, setTags,
    ideas, setIdeas,
    reminders, setReminders,
    medications, setMedications,
    medicationLogs, setMedicationLogs,
    projects, setProjects,
    focusLogs, setFocusLogs,
    scheduledTasks, setScheduledTasks
  } = useFirebase();

  const addFocusLog = async (status: 'completed' | 'abandoned', duration: number) => {
    const newLog = {
      date: new Date().toISOString(),
      status,
      duration
    };

    if (!import.meta.env.VITE_FIREBASE_PROJECT_ID) {
      const updatedLogs = [...focusLogs, { ...newLog, id: Date.now().toString() }];
      setFocusLogs(updatedLogs);
      localStorage.setItem('focusLogs', JSON.stringify(updatedLogs));
    } else {
      try {
        await addDoc(collection(db, 'focusLogs'), newLog);
      } catch (error) {
        console.error("Error adding focus log: ", error);
      }
    }
  };
  
  // Scheduled Tasks State
  const [isAddingScheduledTask, setIsAddingScheduledTask] = useState(false);
  const [editingScheduledTaskId, setEditingScheduledTaskId] = useState<string | null>(null);
  const [newScheduledTaskTitle, setNewScheduledTaskTitle] = useState('');
  const [newScheduledTaskEstimation, setNewScheduledTaskEstimation] = useState(25);
  const [newScheduledTaskTagId, setNewScheduledTaskTagId] = useState<string>('');
  const [newScheduledTaskRecurrence, setNewScheduledTaskRecurrence] = useState<{ type: 'daily' | 'weekly' | 'monthly', daysOfWeek?: number[], dayOfMonth?: number }>({ type: 'daily' });
  const [isSubmittingScheduledTask, setIsSubmittingScheduledTask] = useState(false);

  // Scheduled Tasks Prompt State
  const [showScheduledPrompt, setShowScheduledPrompt] = useState(false);
  const [dueScheduledTasks, setDueScheduledTasks] = useState<any[]>([]);
  const [selectedScheduledTasksToAdd, setSelectedScheduledTasksToAdd] = useState<string[]>([]);

  // Check for due scheduled tasks
  useEffect(() => {
    if (scheduledTasks.length === 0) return;
    
    const today = new Date();
    const todayStr = getLocalDateString(today);
    const todayDayOfWeek = today.getDay();
    const todayDayOfMonth = today.getDate();

    const due = scheduledTasks.filter(st => {
      // If already prompted today, skip
      if (st.lastPromptedDate === todayStr) return false;

      if (st.recurrence.type === 'daily') return true;
      if (st.recurrence.type === 'weekly' && st.recurrence.daysOfWeek?.includes(todayDayOfWeek)) return true;
      if (st.recurrence.type === 'monthly' && st.recurrence.dayOfMonth === todayDayOfMonth) return true;
      
      return false;
    });

    if (due.length > 0 && !showScheduledPrompt) {
      setDueScheduledTasks(due);
      setSelectedScheduledTasksToAdd(due.map(t => t.id));
      setShowScheduledPrompt(true);
    }
  }, [scheduledTasks]);

  const handleAddScheduledTasksToToday = async () => {
    const todayStr = getLocalDateString();
    const tasksToAdd = dueScheduledTasks.filter(st => selectedScheduledTasksToAdd.includes(st.id));
    
    try {
      if (!import.meta.env.VITE_FIREBASE_PROJECT_ID) {
        // Local fallback
        const newTasks = tasksToAdd.map(st => ({
          id: Date.now().toString() + Math.random().toString(36).substring(7),
          title: st.title,
          completed: false,
          selected: false,
          date: todayStr,
          estimation: st.estimation,
          tagId: st.tagId,
          isBacklog: false
        }));
        setTasks([...tasks, ...newTasks]);
        
        const updatedScheduledTasks = scheduledTasks.map(st => 
          dueScheduledTasks.some(due => due.id === st.id) 
            ? { ...st, lastPromptedDate: todayStr } 
            : st
        );
        setScheduledTasks(updatedScheduledTasks);
      } else {
        // Firebase
        await Promise.all([
          ...tasksToAdd.map(st => addDoc(collection(db, 'tasks'), {
            title: st.title,
            completed: false,
            selected: false,
            date: todayStr,
            estimation: st.estimation,
            tagId: st.tagId || null,
            isBacklog: false,
            createdAt: new Date()
          })),
          ...dueScheduledTasks.map(st => updateDoc(doc(db, 'scheduledTasks', st.id), {
            lastPromptedDate: todayStr
          }))
        ]);
      }
      setShowScheduledPrompt(false);
    } catch (error) {
      console.error("Error adding scheduled tasks", error);
    }
  };

  const handleIgnoreScheduledTasks = async () => {
    const todayStr = getLocalDateString();
    try {
      if (!import.meta.env.VITE_FIREBASE_PROJECT_ID) {
        const updatedScheduledTasks = scheduledTasks.map(st => 
          dueScheduledTasks.some(due => due.id === st.id) 
            ? { ...st, lastPromptedDate: todayStr } 
            : st
        );
        setScheduledTasks(updatedScheduledTasks);
      } else {
        await Promise.all(
          dueScheduledTasks.map(st => updateDoc(doc(db, 'scheduledTasks', st.id), {
            lastPromptedDate: todayStr
          }))
        );
      }
      setShowScheduledPrompt(false);
    } catch (error) {
      console.error("Error ignoring scheduled tasks", error);
    }
  };

  const handleSaveScheduledTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newScheduledTaskTitle.trim() || isSubmittingScheduledTask || isSubmittingRef.current) return;
    
    setIsSubmittingScheduledTask(true);
    isSubmittingRef.current = true;

    const taskData = {
      title: newScheduledTaskTitle.trim(),
      estimation: newScheduledTaskEstimation,
      tagId: newScheduledTaskTagId || null,
      recurrence: newScheduledTaskRecurrence,
      createdAt: new Date()
    };

    try {
      if (!import.meta.env.VITE_FIREBASE_PROJECT_ID) {
        if (editingScheduledTaskId) {
          setScheduledTasks(prev => prev.map(t => t.id === editingScheduledTaskId ? { ...t, ...taskData, id: t.id } : t));
        } else {
          setScheduledTasks([{ ...taskData, id: Date.now().toString() }, ...scheduledTasks]);
        }
      } else {
        if (editingScheduledTaskId) {
          await updateDoc(doc(db, 'scheduledTasks', editingScheduledTaskId), taskData);
        } else {
          await addDoc(collection(db, 'scheduledTasks'), taskData);
        }
      }
      setIsAddingScheduledTask(false);
      setEditingScheduledTaskId(null);
      setNewScheduledTaskTitle('');
      setNewScheduledTaskEstimation(25);
      setNewScheduledTaskTagId('');
      setNewScheduledTaskRecurrence({ type: 'daily' });
    } catch (error) {
      console.error("Error saving scheduled task: ", error);
    } finally {
      setIsSubmittingScheduledTask(false);
      setTimeout(() => { isSubmittingRef.current = false; }, 300);
    }
  };

  const handleDeleteScheduledTask = async (id: string) => {
    if (!import.meta.env.VITE_FIREBASE_PROJECT_ID) {
      setScheduledTasks(prev => prev.filter(t => t.id !== id));
      return;
    }
    try {
      await deleteDoc(doc(db, 'scheduledTasks', id));
    } catch (error) {
      console.error("Error deleting scheduled task: ", error);
    }
  };

  const openEditScheduledTask = (task: any) => {
    setEditingScheduledTaskId(task.id);
    setNewScheduledTaskTitle(task.title);
    setNewScheduledTaskEstimation(task.estimation || 25);
    setNewScheduledTaskTagId(task.tagId || '');
    setNewScheduledTaskRecurrence(task.recurrence);
    setIsAddingScheduledTask(true);
  };

  // Zen Mode State
  const [isZenMode, setIsZenMode] = useState(false);

  // Daily Goal & Streak State
  const [dailyGoalMinutes, setDailyGoalMinutes] = useState(() => {
    const saved = localStorage.getItem('dailyGoalMinutes');
    return saved ? parseInt(saved, 10) : 120;
  });
  const [isEditingGoal, setIsEditingGoal] = useState(false);
  const [tempGoal, setTempGoal] = useState(dailyGoalMinutes.toString());

  const focusedMinutesToday = useMemo(() => {
    const today = getLocalDateString();
    const todayLogs = focusLogs.filter(log => log.date.startsWith(today) && log.status === 'completed');
    const totalSeconds = todayLogs.reduce((acc, log) => acc + log.duration, 0);
    return Math.floor(totalSeconds / 60);
  }, [focusLogs]);

  const [streak, setStreak] = useState(0);
  const [lastActiveDate, setLastActiveDate] = useState<string | null>(null);

  useEffect(() => {
    const savedStreak = localStorage.getItem('pomodoroStreak');
    if (savedStreak) {
      const parsed = JSON.parse(savedStreak);
      setStreak(parsed.streak);
      setLastActiveDate(parsed.lastActiveDate);
    }
  }, []);

  useEffect(() => {
    const today = getLocalDateString();
    if (focusedMinutesToday >= dailyGoalMinutes && lastActiveDate !== today) {
      const newStreak = (lastActiveDate === getLocalDateString(new Date(Date.now() - 86400000))) ? streak + 1 : 1;
      setStreak(newStreak);
      setLastActiveDate(today);
      localStorage.setItem('pomodoroStreak', JSON.stringify({ streak: newStreak, lastActiveDate: today }));
      // Optional: Celebration confetti or sound
    }
  }, [focusedMinutesToday, dailyGoalMinutes, lastActiveDate, streak]);

  // Tasks State
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDate, setNewTaskDate] = useState(getLocalDateString());
  const [newTaskEstimation, setNewTaskEstimation] = useState(25);
  const [newTaskTagId, setNewTaskTagId] = useState<string>('');
  const [newTaskProjectId, setNewTaskProjectId] = useState<string>('');
  const [newTaskIsBacklog, setNewTaskIsBacklog] = useState<boolean>(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [isSubmittingTask, setIsSubmittingTask] = useState(false);
  
  // Tags State
  const [isManagingTags, setIsManagingTags] = useState(false);
  const [isSubmittingTag, setIsSubmittingTag] = useState(false);
  const [newTagName, setNewTagName] = useState('');

  // Projects State
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [isAddingProject, setIsAddingProject] = useState(false);
  const [isSubmittingProject, setIsSubmittingProject] = useState(false);
  const [newProjectTitle, setNewProjectTitle] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');
  const [newProjectColor, setNewProjectColor] = useState(PREDEFINED_COLORS[0]);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [newTaskPhase, setNewTaskPhase] = useState('');

  // Ideas State
  const [isAddingIdea, setIsAddingIdea] = useState(false);
  const [isSubmittingIdea, setIsSubmittingIdea] = useState(false);
  const [newIdeaText, setNewIdeaText] = useState('');
  const [convertingIdeaId, setConvertingIdeaId] = useState<string | null>(null);
  const [convertingToReminderIdeaId, setConvertingToReminderIdeaId] = useState<string | null>(null);

  // Reminders State
  const [activeReminderQueue, setActiveReminderQueue] = useState<Reminder[]>([]);
  const [isAddingReminder, setIsAddingReminder] = useState(false);
  const [isSubmittingReminder, setIsSubmittingReminder] = useState(false);
  const [editingReminderId, setEditingReminderId] = useState<string | null>(null);
  const [newReminderTitle, setNewReminderTitle] = useState('');
  const [newReminderDetail, setNewReminderDetail] = useState('');
  const [newReminderDate, setNewReminderDate] = useState(getLocalDateString());
  const [newReminderTime, setNewReminderTime] = useState('');

  // Medication State
  const triggeredMedicationsRef = useRef<Set<string>>(new Set());
  const [isAddingMedication, setIsAddingMedication] = useState(false);
  const [isSubmittingMedication, setIsSubmittingMedication] = useState(false);
  const isSubmittingRef = useRef(false);
  const [editingMedicationId, setEditingMedicationId] = useState<string | null>(null);
  const [newMedName, setNewMedName] = useState('');
  const [newMedDosage, setNewMedDosage] = useState('');
  const [newMedStock, setNewMedStock] = useState(30);
  const [newMedMinStock, setNewMedMinStock] = useState(5);
  const [newMedSchedule, setNewMedSchedule] = useState<string[]>(['08:00']);
  const [newMedDays, setNewMedDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [newMedNotes, setNewMedNotes] = useState('');
  const [isSkippingMed, setIsSkippingMed] = useState<{ med: Medication, time: string } | null>(null);
  const [skipReason, setSkipReason] = useState('');

  // View State
  const [homeView, setHomeView] = useState<'today' | 'overdue'>('today');
  const [tasksView, setTasksView] = useState<'all' | 'future' | 'scheduled'>('all');
  const [tasksLayout, setTasksLayout] = useState<'list' | 'kanban'>('list');
  const [expandedTags, setExpandedTags] = useState<Record<string, boolean>>({});
  
  // Request Notification Permission
  useEffect(() => {
    if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
      Notification.requestPermission();
    }
  }, []);

  // Reminder Checker
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      const currentDate = getLocalDateString(now);
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const currentDay = now.getDay(); // 0-6

      // Check General Reminders
      reminders.forEach(rem => {
        if (!rem.completed && !activeReminderQueue.find(r => r.id === rem.id)) {
          if (rem.date < currentDate || (rem.date === currentDate && rem.time <= currentTime)) {
            setActiveReminderQueue(prev => [...prev, rem]);
            playAlertSound();
            if ('Notification' in window && Notification.permission === 'granted') {
              new Notification(rem.title, { body: rem.detail });
            }
          }
        }
      });

      // Check Medications
      medications.forEach(med => {
        if (med.days.includes(currentDay)) {
          med.schedule.forEach(time => {
            const uniqueId = `med-${med.id}-${currentDate}-${time}`;

            // Check if already logged for today+time
            const alreadyLogged = medicationLogs.some(l => 
              l.medicationId === med.id && 
              l.date === currentDate && 
              l.time === time
            );

            // Check if already triggered in this session
            const alreadyTriggered = triggeredMedicationsRef.current.has(uniqueId);

            if (!alreadyLogged && !alreadyTriggered && time <= currentTime) {
              // Mark as triggered
              triggeredMedicationsRef.current.add(uniqueId);
              
              // Create temp reminder
              const medReminder: Reminder = {
                id: uniqueId, // Use unique ID
                title: `Hora de tu medicación: ${med.name}`,
                detail: `Dosis: ${med.dosage}. ${med.notes || ''}`,
                date: currentDate,
                time: time,
                completed: false
              };

              setActiveReminderQueue(prev => [...prev, medReminder]);
              playAlertSound();
              if ('Notification' in window && Notification.permission === 'granted') {
                new Notification(medReminder.title, { body: medReminder.detail });
              }
            }
          });
        }
      });

    }, 10000); // Check every 10 seconds

    return () => clearInterval(interval);
  }, [reminders, activeReminderQueue, medications, medicationLogs]);

  const handleAddIdea = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIdeaText.trim() || isSubmittingIdea || isSubmittingRef.current) return;

    isSubmittingRef.current = true;
    setIsSubmittingIdea(true);
    try {
      if (!import.meta.env.VITE_FIREBASE_PROJECT_ID) {
        setIdeas([{ id: Date.now().toString(), text: newIdeaText }, ...ideas]);
        setNewIdeaText('');
        setIsAddingIdea(false);
        return;
      }

      await addDoc(collection(db, 'ideas'), {
        text: newIdeaText,
        createdAt: new Date()
      });
      setNewIdeaText('');
      setIsAddingIdea(false);
    } catch (error) {
      console.error("Error adding idea: ", error);
    } finally {
      setIsSubmittingIdea(false);
      isSubmittingRef.current = false;
    }
  };

  const handleDeleteIdea = async (id: string) => {
    if (!import.meta.env.VITE_FIREBASE_PROJECT_ID) {
      setIdeas(ideas.filter(i => i.id !== id));
      return;
    }
    try {
      await deleteDoc(doc(db, 'ideas', id));
    } catch (error) {
      console.error("Error deleting idea: ", error);
    }
  };

  const handleSaveMedication = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMedName.trim() || isSubmittingMedication || isSubmittingRef.current) return;

    isSubmittingRef.current = true;
    setIsSubmittingMedication(true);
    const medData = {
      name: newMedName,
      dosage: newMedDosage,
      stock: Number(newMedStock),
      minStock: Number(newMedMinStock),
      schedule: newMedSchedule.sort(),
      days: newMedDays,
      notes: newMedNotes,
      createdAt: new Date()
    };

    try {
      if (!import.meta.env.VITE_FIREBASE_PROJECT_ID) {
        if (editingMedicationId) {
          setMedications(meds => meds.map(m => m.id === editingMedicationId ? { ...m, ...medData, id: m.id } : m));
        } else {
          setMedications([...medications, { ...medData, id: Date.now().toString() }]);
        }
      } else {
        if (editingMedicationId) {
          await updateDoc(doc(db, 'medications', editingMedicationId), medData);
        } else {
          await addDoc(collection(db, 'medications'), medData);
        }
      }
      resetMedForm();
    } catch (error) {
      console.error("Error saving medication: ", error);
    } finally {
      setIsSubmittingMedication(false);
      isSubmittingRef.current = false;
    }
  };

  const handleDeleteMedication = async (id: string) => {
    if (!import.meta.env.VITE_FIREBASE_PROJECT_ID) {
      setMedications(meds => meds.filter(m => m.id !== id));
    } else {
      try {
        await deleteDoc(doc(db, 'medications', id));
      } catch (error) {
        console.error("Error deleting medication: ", error);
      }
    }
    resetMedForm();
  };

  const resetMedForm = () => {
    setNewMedName('');
    setNewMedDosage('');
    setNewMedStock(30);
    setNewMedMinStock(5);
    setNewMedSchedule(['08:00']);
    setNewMedDays([0, 1, 2, 3, 4, 5, 6]);
    setNewMedNotes('');
    setIsAddingMedication(false);
    setEditingMedicationId(null);
  };

  const handleTakeMedication = async (med: Medication, scheduledTime: string) => {
    const today = getLocalDateString();
    
    // Calculate tomorrow for reminders
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = getLocalDateString(tomorrow);

    const logData = {
      medicationId: med.id,
      medicationName: med.name,
      date: today,
      time: scheduledTime,
      takenAt: new Date().toISOString(),
      status: 'taken' as const
    };

    // Update Stock
    const newStock = med.stock - 1;
    
    if (!import.meta.env.VITE_FIREBASE_PROJECT_ID) {
      setMedicationLogs([...medicationLogs, { ...logData, id: Date.now().toString() }]);
      setMedications(meds => meds.map(m => m.id === med.id ? { ...m, stock: newStock } : m));
      // Check min stock
      if (newStock <= med.minStock) {
        setReminders([...reminders, {
          id: Date.now().toString() + 'r',
          title: `Comprar ${med.name}`,
          detail: `Stock bajo (${newStock}). Dosis: ${med.dosage}`,
          date: tomorrowStr,
          time: '09:00',
          completed: false
        }]);
      }
    } else {
      try {
        await addDoc(collection(db, 'medicationLogs'), logData);
        await updateDoc(doc(db, 'medications', med.id), { stock: newStock });
        
        if (newStock <= med.minStock) {
          // Check if reminder already exists for today? Maybe not needed, just add it.
          await addDoc(collection(db, 'reminders'), {
            title: `Comprar ${med.name}`,
            detail: `Stock bajo (${newStock}). Dosis: ${med.dosage}`,
            date: tomorrowStr,
            time: '09:00',
            completed: false,
            createdAt: new Date()
          });
        }
      } catch (error) {
        console.error("Error taking medication: ", error);
      }
    }
  };

  const handleSkipMedication = async () => {
    if (!isSkippingMed) return;
    const { med, time } = isSkippingMed;
    const today = getLocalDateString();
    
    const logData = {
      medicationId: med.id,
      medicationName: med.name,
      date: today,
      time: time,
      takenAt: new Date().toISOString(),
      status: 'skipped' as const,
      reason: skipReason
    };

    if (!import.meta.env.VITE_FIREBASE_PROJECT_ID) {
      setMedicationLogs([...medicationLogs, { ...logData, id: Date.now().toString() }]);
    } else {
      try {
        await addDoc(collection(db, 'medicationLogs'), logData);
      } catch (error) {
        console.error("Error skipping medication: ", error);
      }
    }
    setIsSkippingMed(null);
    setSkipReason('');
  };

  const getTodayMedications = () => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const dateStr = getLocalDateString(today);

    const tasks: { med: Medication, time: string, status: 'pending' | 'taken' | 'skipped' }[] = [];

    medications.forEach(med => {
      if (med.days.includes(dayOfWeek)) {
        med.schedule.forEach(time => {
          const log = medicationLogs.find(l => 
            l.medicationId === med.id && 
            l.date === dateStr && 
            l.time === time
          );
          tasks.push({
            med,
            time,
            status: log ? log.status : 'pending'
          });
        });
      }
    });

    return tasks.sort((a, b) => a.time.localeCompare(b.time));
  };

  const initiateConvertToTask = (idea: Idea) => {
    setNewTaskTitle(idea.text);
    setConvertingIdeaId(idea.id);
    setIsAddingTask(true);
  };

  const openEditProject = (project: Project) => {
    setNewProjectTitle(project.title);
    setNewProjectDescription(project.description);
    setNewProjectColor(project.color);
    setEditingProjectId(project.id);
    setIsAddingProject(true);
  };

  const openEditTask = (task: Task) => {
    setNewTaskTitle(task.title);
    setNewTaskDate(task.date);
    setNewTaskEstimation(task.estimation);
    setNewTaskTagId(task.tagId || '');
    setNewTaskProjectId(task.projectId || '');
    setNewTaskPhase(task.phase || '');
    setNewTaskIsBacklog(task.isBacklog || false);
    setEditingTaskId(task.id);
    setIsAddingTask(true);
  };

  const handleAddTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTagName.trim() || tags.length >= 10 || isSubmittingTag || isSubmittingRef.current) return;

    isSubmittingRef.current = true;
    setIsSubmittingTag(true);
    // Find first available color
    const usedColors = tags.map(t => t.color);
    const availableColor = PREDEFINED_COLORS.find(c => !usedColors.includes(c)) || PREDEFINED_COLORS[0];

    try {
      if (!import.meta.env.VITE_FIREBASE_PROJECT_ID) {
        setTags([...tags, { id: Date.now().toString(), name: newTagName, color: availableColor }]);
        setNewTagName('');
        return;
      }

      await addDoc(collection(db, 'tags'), {
        name: newTagName,
        color: availableColor,
        createdAt: new Date()
      });
      setNewTagName('');
    } catch (error) {
      console.error("Error adding tag: ", error);
    } finally {
      setIsSubmittingTag(false);
      isSubmittingRef.current = false;
    }
  };

  const handleDeleteTag = async (id: string) => {
    if (!import.meta.env.VITE_FIREBASE_PROJECT_ID) {
      setTags(tags.filter(t => t.id !== id));
      return;
    }
    try {
      await deleteDoc(doc(db, 'tags', id));
    } catch (error) {
      console.error("Error deleting tag: ", error);
    }
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim() || isSubmittingTask || isSubmittingRef.current) return;
    if (!newTaskProjectId && !newTaskTagId) return; // Require either project or tag

    isSubmittingRef.current = true;
    setIsSubmittingTask(true);
    try {
      const taskData: any = {
        title: newTaskTitle,
        date: newTaskDate,
        estimation: newTaskEstimation,
      };
      if (newTaskTagId) taskData.tagId = newTaskTagId;
      if (newTaskProjectId) {
        taskData.projectId = newTaskProjectId;
        taskData.phase = newTaskPhase;
        taskData.isBacklog = newTaskIsBacklog;
      }

      if (!import.meta.env.VITE_FIREBASE_PROJECT_ID) {
        // Fallback local si Firebase no está configurado
        if (editingTaskId) {
          setTasks(tasks.map(t => t.id === editingTaskId ? { ...t, ...taskData } : t));
        } else {
          setTasks([{ 
            id: Date.now().toString(), 
            completed: false, 
            selected: false,
            ...taskData
          }, ...tasks]);
        }
        resetTaskForm();
        return;
      }

      if (editingTaskId) {
        await updateDoc(doc(db, 'tasks', editingTaskId), taskData);
      } else {
        await addDoc(collection(db, 'tasks'), {
          ...taskData,
          completed: false,
          selected: false,
          createdAt: new Date()
        });
        
        // Si venía de una idea, la eliminamos
        if (convertingIdeaId) {
          await deleteDoc(doc(db, 'ideas', convertingIdeaId));
        }
      }
      
      resetTaskForm();
    } catch (error) {
      console.error("Error saving task: ", error);
      alert("Error al guardar la tarea. Verifica la consola.");
    } finally {
      setIsSubmittingTask(false);
      isSubmittingRef.current = false;
    }
  };

  const resetTaskForm = () => {
    setNewTaskTitle('');
    setNewTaskDate(getLocalDateString());
    setNewTaskEstimation(25);
    setNewTaskTagId('');
    setNewTaskProjectId('');
    setNewTaskPhase('');
    setNewTaskIsBacklog(false);
    setIsAddingTask(false);
    setConvertingIdeaId(null);
    setEditingTaskId(null);
  };

  const resetReminderForm = () => {
    setNewReminderTitle('');
    setNewReminderDetail('');
    setNewReminderDate(getLocalDateString());
    setNewReminderTime('');
    setIsAddingReminder(false);
    setEditingReminderId(null);
    setConvertingToReminderIdeaId(null);
  };

  const handleSaveReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newReminderTitle.trim() || !newReminderDate || !newReminderTime || isSubmittingReminder || isSubmittingRef.current) return;

    const today = getLocalDateString();
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    if (newReminderDate < today || (newReminderDate === today && newReminderTime <= currentTime)) {
      alert("La fecha y hora del recordatorio no pueden estar en el pasado.");
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmittingReminder(true);
    try {
      if (!import.meta.env.VITE_FIREBASE_PROJECT_ID) {
        if (editingReminderId) {
          setReminders(prev => prev.map(r => r.id === editingReminderId ? { ...r, title: newReminderTitle, detail: newReminderDetail, date: newReminderDate, time: newReminderTime } : r));
        } else {
          setReminders(prev => [{
            id: Date.now().toString(),
            title: newReminderTitle,
            detail: newReminderDetail,
            date: newReminderDate,
            time: newReminderTime,
            completed: false,
            createdAt: Date.now()
          }, ...prev]);
        }
      } else {
        if (editingReminderId) {
          await updateDoc(doc(db, 'reminders', editingReminderId), {
            title: newReminderTitle,
            detail: newReminderDetail,
            date: newReminderDate,
            time: newReminderTime
          });
        } else {
          await addDoc(collection(db, 'reminders'), {
            title: newReminderTitle,
            detail: newReminderDetail,
            date: newReminderDate,
            time: newReminderTime,
            completed: false,
            createdAt: new Date()
          });
          
          if (convertingToReminderIdeaId) {
            await deleteDoc(doc(db, 'ideas', convertingToReminderIdeaId));
          }
        }
      }
      resetReminderForm();
    } catch (error) {
      console.error("Error saving reminder: ", error);
      alert("Error al guardar el recordatorio.");
    } finally {
      setIsSubmittingReminder(false);
      isSubmittingRef.current = false;
    }
  };

  const openEditReminder = (reminder: Reminder) => {
    setEditingReminderId(reminder.id);
    setNewReminderTitle(reminder.title);
    setNewReminderDetail(reminder.detail);
    setNewReminderDate(reminder.date);
    setNewReminderTime(reminder.time);
    setIsAddingReminder(true);
  };

  const handleDeleteReminder = async (id: string) => {
    if (!import.meta.env.VITE_FIREBASE_PROJECT_ID) {
      setReminders(prev => prev.filter(r => r.id !== id));
      return;
    }
    try {
      await deleteDoc(doc(db, 'reminders', id));
    } catch (error) {
      console.error("Error deleting reminder: ", error);
    }
  };

  const handleCompleteReminder = async (reminder: Reminder) => {
    // Check if it's a medication reminder (virtual)
    if (reminder.id.startsWith('med-')) {
      // Format: med-{medId}-{date}-{time}
      const parts = reminder.id.split('-');
      if (parts.length >= 4) {
        const medId = parts[1];
        const scheduledTime = parts.slice(3).join(':'); // Rejoin time parts if needed, though usually HH:mm is safe
        
        const med = medications.find(m => m.id === medId);
        if (med) {
          await handleTakeMedication(med, scheduledTime);
        }
      }
      setActiveReminderQueue(prev => prev.filter(r => r.id !== reminder.id));
      return;
    }

    if (!import.meta.env.VITE_FIREBASE_PROJECT_ID) {
      setReminders(prev => prev.map(r => r.id === reminder.id ? { ...r, completed: true } : r));
    } else {
      try {
        await updateDoc(doc(db, 'reminders', reminder.id), { completed: true });
      } catch (error) {
        console.error("Error completing reminder: ", error);
      }
    }
    setActiveReminderQueue(prev => prev.filter(r => r.id !== reminder.id));
  };

  const handleSnoozeReminder = async (reminder: Reminder, minutes: number) => {
    // Check if it's a medication reminder (virtual)
    if (reminder.id.startsWith('med-')) {
      // For virtual meds, we just remove from queue for now. 
      // Ideally we should re-schedule or re-trigger, but since we rely on interval checking "time <= currentTime",
      // removing it from queue AND triggered set would make it trigger again immediately if we don't change the time.
      // So for now, "snooze" just dismisses the popup. The user will see it pending in the list.
      // To implement real snooze, we'd need a "snoozed until" state.
      setActiveReminderQueue(prev => prev.filter(r => r.id !== reminder.id));
      return;
    }

    const now = new Date();
    now.setMinutes(now.getMinutes() + minutes);
    const newDate = getLocalDateString(now);
    const newTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    
    if (!import.meta.env.VITE_FIREBASE_PROJECT_ID) {
      setReminders(prev => prev.map(r => r.id === reminder.id ? { ...r, date: newDate, time: newTime } : r));
    } else {
      try {
        await updateDoc(doc(db, 'reminders', reminder.id), { date: newDate, time: newTime });
      } catch (error) {
        console.error("Error snoozing reminder: ", error);
      }
    }
    setActiveReminderQueue(prev => prev.filter(r => r.id !== reminder.id));
  };

  const initiateConvertToReminder = (idea: Idea) => {
    setConvertingToReminderIdeaId(idea.id);
    setNewReminderTitle(idea.text);
    setNewReminderDetail('');
    setNewReminderDate(getLocalDateString());
    setNewReminderTime('');
    setIsAddingReminder(true);
  };

  const toggleTaskSelection = async (id: string, currentSelected: boolean) => {
    const newTasks = tasks.map(t => t.id === id ? { ...t, selected: !currentSelected } : t);
    
    if (!import.meta.env.VITE_FIREBASE_PROJECT_ID) {
      setTasks(newTasks);
      return;
    }

    try {
      const taskRef = doc(db, 'tasks', id);
      await updateDoc(taskRef, {
        selected: !currentSelected
      });
    } catch (error) {
      console.error("Error updating task selection: ", error);
    }
  };

  // Review State
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [tasksToReview, setTasksToReview] = useState<Task[]>([]);

  const selectedPendingTasks = tasks.filter(t => t.selected && !t.completed);
  const selectedPendingTasksRef = useRef(selectedPendingTasks);
  const pendingTimeUpdates = useRef<Record<string, number>>({});

  const hasSelectedTasks = selectedPendingTasks.length > 0;
  const totalEstimation = useMemo(() => {
    if (!hasSelectedTasks) return 25;
    return selectedPendingTasks.reduce((sum, t) => sum + (t.estimation || 25), 0);
  }, [selectedPendingTasks, hasSelectedTasks]);

  useEffect(() => {
    if (mode === 'work' && !isRunning) {
      setTimeLeft(totalEstimation * 60);
      setTotalTime(totalEstimation * 60);
    }
  }, [totalEstimation]);

  useEffect(() => {
    selectedPendingTasksRef.current = selectedPendingTasks;
  }, [selectedPendingTasks]);

  const flushTimeUpdates = useCallback(async () => {
    const updates = { ...pendingTimeUpdates.current };
    pendingTimeUpdates.current = {};
    
    if (Object.keys(updates).length === 0) return;

    if (!import.meta.env.VITE_FIREBASE_PROJECT_ID) {
      setTasks(prev => prev.map(t => updates[t.id] ? { ...t, timeSpent: (t.timeSpent || 0) + updates[t.id] } : t));
      return;
    }

    try {
      await Promise.all(Object.entries(updates).map(([id, time]) => {
        const taskRef = doc(db, 'tasks', id);
        return updateDoc(taskRef, {
          timeSpent: increment(time as number)
        });
      }));
    } catch (error) {
      console.error("Error flushing time updates", error);
    }
  }, [setTasks]);

  const handleTick = useCallback((elapsedSeconds: number, remaining: number) => {
    selectedPendingTasksRef.current.forEach(t => {
      pendingTimeUpdates.current[t.id] = (pendingTimeUpdates.current[t.id] || 0) + elapsedSeconds;
    });
    if (remaining % 10 === 0 || remaining === 0) {
      flushTimeUpdates();
    }
  }, [flushTimeUpdates]);

  const {
    mode,
    setMode,
    timeLeft,
    setTimeLeft,
    totalTime,
    setTotalTime,
    isRunning,
    setIsRunning,
    pomodorosCompleted,
    resetTimer,
    startBreak,
    skipBreak,
    progress,
    isWork
  } = useTimer({
    hasSelectedTasks,
    totalEstimation,
    onTimerComplete: (completedMode: Mode) => handleTimerComplete(completedMode, totalTime, startBreak, setMode, hasSelectedTasks, totalEstimation, setTimeLeft, setTotalTime),
    onTick: handleTick
  });

  const handleTimerComplete = useCallback((completedMode: Mode, totalTime: number, startBreak: () => void, setMode: (mode: Mode) => void, hasSelectedTasks: boolean, totalEstimation: number, setTimeLeft: (time: number) => void, setTotalTime: (time: number) => void) => {
    if (completedMode === 'work') {
      flushTimeUpdates();
      addFocusLog('completed', totalTime);
      
      if (selectedPendingTasksRef.current.length > 0) {
        setTasksToReview([...selectedPendingTasksRef.current]);
        setIsReviewing(true);
        setReviewIndex(0);
      } else {
        startBreak();
      }
    } else {
      setMode('work');
      const newTime = hasSelectedTasks ? totalEstimation * 60 : 25 * 60;
      setTimeLeft(newTime);
      setTotalTime(newTime);
    }
  }, [flushTimeUpdates]);

  const handleToggleTimer = () => {
    if (isRunning) return;
    if (mode === 'work' && selectedPendingTasks.length === 0) return;
    
    setIsRunning(true);
    if (mode === 'work') {
      setIsZenMode(true);
    }
  };

  const handleReviewAnswer = async (completed: boolean) => {
    const currentTask = tasksToReview[reviewIndex];
    
    if (completed) {
      const todayStr = getLocalDateString();
      if (!import.meta.env.VITE_FIREBASE_PROJECT_ID) {
        setTasks(prevTasks => prevTasks.map(t => t.id === currentTask.id ? { ...t, completed: true, selected: false, completedAt: todayStr } : t));
      } else {
        try {
          const taskRef = doc(db, 'tasks', currentTask.id);
          await updateDoc(taskRef, {
            completed: true,
            selected: false,
            completedAt: todayStr
          });
        } catch (error) {
          console.error("Error updating task on review: ", error);
        }
      }
    }
    
    if (reviewIndex + 1 < tasksToReview.length) {
      setReviewIndex(prev => prev + 1);
    } else {
      setIsReviewing(false);
      setTasksToReview([]);
      startBreak();
    }
  };

  // Controls
  const handlePlus = () => {
    if (!isRunning) {
      setTimeLeft(prev => prev + 5 * 60);
      setTotalTime(prev => prev + 5 * 60);
    }
  };
  
  const handleMinus = () => {
    if (!isRunning && timeLeft > 5 * 60) {
      setTimeLeft(prev => prev - 5 * 60);
      setTotalTime(prev => prev - 5 * 60);
    }
  };

  const [isConfirmingReset, setIsConfirmingReset] = useState(false);

  const handleResetClick = () => {
    if (isRunning && mode === 'work') {
      setIsConfirmingReset(true);
    } else {
      handleResetTimer();
    }
  };

  const confirmReset = (completedTask: boolean = false) => {
    handleResetTimer(completedTask);
    setIsConfirmingReset(false);
  };

  const handleResetTimer = (completedTask: boolean = false) => {
    if (completedTask) {
      const todayStr = getLocalDateString();
      
      if (!import.meta.env.VITE_FIREBASE_PROJECT_ID) {
        setTasks(prevTasks => prevTasks.map(t => 
          selectedPendingTasks.some(spt => spt.id === t.id) 
            ? { ...t, completed: true, selected: false, completedAt: todayStr } 
            : t
        ));
      } else {
        Promise.all(selectedPendingTasks.map(task => {
          const taskRef = doc(db, 'tasks', task.id);
          return updateDoc(taskRef, {
            completed: true,
            selected: false,
            completedAt: todayStr
          });
        })).catch(error => {
          console.error("Error completing tasks on reset: ", error);
        });
      }

      if (isRunning && mode === 'work') {
        addFocusLog('completed', totalTime - timeLeft);
      }
    } else {
      // Penalty for resetting during work
      if (isRunning && mode === 'work') {
        addFocusLog('abandoned', totalTime - timeLeft);
      }
    }

    setIsRunning(false);
    if (mode === 'work') {
      flushTimeUpdates();
    }
    resetTimer();
  };

  const handleStartTimer = async (task: Task) => {
    // Select only this task, deselect others
    const newTasks = tasks.map(t => ({ ...t, selected: t.id === task.id }));
    setTasks(newTasks);
    setActiveTab('inicio');
    
    try {
      // Batch update or sequential update
      const selectedTasks = tasks.filter(t => t.selected);
      for (const t of selectedTasks) {
        if (t.id !== task.id) {
          await updateDoc(doc(db, 'tasks', t.id), { selected: false });
        }
      }
      if (!task.selected) {
        await updateDoc(doc(db, 'tasks', task.id), { selected: true });
      }
    } catch (error) {
      console.error("Error updating task selection for timer: ", error);
    }
  };

  const toggleTaskCompletion = async (id: string, currentCompleted: boolean) => {
    const todayStr = getLocalDateString();
    const updates = { 
      completed: !currentCompleted, 
      completedAt: !currentCompleted ? todayStr : null,
      selected: false // Deselect when completing
    };
    
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
    
    try {
      const taskRef = doc(db, 'tasks', id);
      await updateDoc(taskRef, updates);
    } catch (error) {
      console.error("Error toggling task completion:", error);
    }
  };

  const onDragEnd = async (result: any) => {
    const { destination, source, draggableId } = result;

    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const task = tasks.find(t => t.id === draggableId);
    if (!task) return;

    let updates: any = {};

    if (destination.droppableId === 'TODO') {
      updates = { completed: false, timeSpent: 0 };
    } else if (destination.droppableId === 'IN_PROGRESS') {
      updates = { completed: false, timeSpent: Math.max(1, task.timeSpent || 0) };
    } else if (destination.droppableId === 'COMPLETED') {
      updates = { completed: true, completedAt: getLocalDateString() };
    }

    try {
      const taskRef = doc(db, 'tasks', task.id);
      await updateDoc(taskRef, updates);
    } catch (error) {
      console.error('Error updating task status:', error);
    }
  };

  const getGroupedTasks = () => {
    const filteredTasks = tasks.filter(t => {
      const today = getLocalDateString();
      if (t.completed) return false;
      if (t.isBacklog) return false; // Hide project backlog tasks
      return tasksView === 'all' ? t.date <= today : t.date > today;
    });

    const groups: { tag: { id: string, name: string, color: string }, tasks: Task[], totalMinutes: number }[] = [];

    // Group by existing tags
    tags.forEach(tag => {
      const tagTasks = filteredTasks.filter(t => t.tagId === tag.id);
      if (tagTasks.length > 0) {
        groups.push({ tag, tasks: tagTasks, totalMinutes: 0 });
      }
    });

    // Handle tasks without tags or with deleted tags
    const untaggedTasks = filteredTasks.filter(t => !t.tagId || !tags.find(tag => tag.id === t.tagId));
    if (untaggedTasks.length > 0) {
      groups.push({ 
        tag: { id: 'untagged', name: 'Sin Etiqueta', color: 'bg-neutral-600' }, 
        tasks: untaggedTasks, 
        totalMinutes: 0 
      });
    }

    // Sort and calculate minutes
    groups.forEach(group => {
      group.tasks.sort((a, b) => {
        if (a.date !== b.date) {
          return a.date.localeCompare(b.date);
        }
        return a.estimation - b.estimation;
      });
      group.totalMinutes = group.tasks.reduce((sum, t) => sum + t.estimation, 0);
    });

    return groups;
  };

  const getHistoryData = () => {
    const historyDays = [];
    const today = new Date();
    
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = getLocalDateString(d);
      
      let displayDate = '';
      if (i === 0) displayDate = 'Hoy';
      else if (i === 1) displayDate = 'Ayer';
      else {
        // Use noon to avoid timezone shifts
        const dNoon = new Date(dateStr + 'T12:00:00');
        displayDate = dNoon.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' });
        displayDate = displayDate.charAt(0).toUpperCase() + displayDate.slice(1);
      }

      const dayTasks = tasks.filter(t => t.completed && t.completedAt === dateStr);
      const totalMinutes = dayTasks.reduce((acc, t) => acc + Math.floor((t.timeSpent || 0) / 60), 0);
      
      const groups: { tag: { id: string, name: string, color: string }, tasks: Task[] }[] = [];
      
      tags.forEach(tag => {
        const tagTasks = dayTasks.filter(t => t.tagId === tag.id);
        if (tagTasks.length > 0) {
          groups.push({ tag, tasks: tagTasks });
        }
      });

      const untaggedTasks = dayTasks.filter(t => !t.tagId || !tags.find(tag => tag.id === t.tagId));
      if (untaggedTasks.length > 0) {
        groups.push({ 
          tag: { id: 'untagged', name: 'Sin Etiqueta', color: 'bg-neutral-600' }, 
          tasks: untaggedTasks 
        });
      }

      historyDays.push({
        dateStr,
        displayDate,
        totalMinutes,
        groups
      });
    }
    
    return historyDays;
  };

  const stats = useStatistics(statsPeriod, tasks, tags, medicationLogs, focusLogs);
  const COLORS = CHART_COLORS;

  const groupedTasks = getGroupedTasks();
  const historyData = getHistoryData();

  return (
    <div className="min-h-screen flex flex-col bg-neutral-900 text-neutral-100 font-sans relative">
      
      {/* Triggered Reminder Popup */}
      {activeReminderQueue.length > 0 && (
        <div className="fixed inset-0 z-[60] bg-neutral-950/90 backdrop-blur-sm flex flex-col items-center justify-center p-6">
          <div className="bg-neutral-800 p-8 rounded-3xl w-full max-w-sm text-center shadow-2xl border border-neutral-700">
            <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <BellRing size={32} className="text-emerald-400" />
            </div>
            <h3 className="text-neutral-400 text-sm font-medium uppercase tracking-widest mb-2">Recordatorio</h3>
            <p className="text-xl font-semibold mb-2">{activeReminderQueue[0].title}</p>
            {activeReminderQueue[0].detail && (
              <p className="text-sm text-neutral-400 mb-6">{activeReminderQueue[0].detail}</p>
            )}
            
            <div className="flex flex-col gap-3">
              <button 
                onClick={() => handleCompleteReminder(activeReminderQueue[0])}
                className="w-full py-4 rounded-2xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/50 font-medium transition-colors flex items-center justify-center gap-2"
              >
                <Check size={20} className="text-emerald-400" />
                <span>Completar</span>
              </button>
              
              <div className="grid grid-cols-3 gap-2 mt-2">
                <button 
                  onClick={() => handleSnoozeReminder(activeReminderQueue[0], 10)}
                  className="py-2 rounded-xl bg-neutral-700 hover:bg-neutral-600 font-medium transition-colors text-xs"
                >
                  +10m
                </button>
                <button 
                  onClick={() => handleSnoozeReminder(activeReminderQueue[0], 30)}
                  className="py-2 rounded-xl bg-neutral-700 hover:bg-neutral-600 font-medium transition-colors text-xs"
                >
                  +30m
                </button>
                <button 
                  onClick={() => handleSnoozeReminder(activeReminderQueue[0], 60)}
                  className="py-2 rounded-xl bg-neutral-700 hover:bg-neutral-600 font-medium transition-colors text-xs"
                >
                  +1h
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Review Modal Overlay */}
      {isReviewing && (
        <div className="fixed inset-0 z-50 bg-neutral-950/90 backdrop-blur-sm flex flex-col items-center justify-center p-6">
          <div className="bg-neutral-800 p-8 rounded-3xl w-full max-w-sm text-center shadow-2xl border border-neutral-700">
            <h3 className="text-neutral-400 text-sm font-medium uppercase tracking-widest mb-2">Tiempo terminado</h3>
            <p className="text-xl font-semibold mb-6">¿Terminaste esta tarea?</p>
            
            <div className="bg-neutral-900 p-4 rounded-xl mb-8 border border-neutral-700">
              <p className="text-emerald-400 font-medium">{tasksToReview[reviewIndex]?.title}</p>
            </div>
            
            <div className="flex gap-4">
              <button 
                onClick={() => handleReviewAnswer(false)}
                className="flex-1 py-4 rounded-2xl bg-neutral-700 hover:bg-neutral-600 font-medium transition-colors flex flex-col items-center gap-2"
              >
                <X size={24} className="text-rose-400" />
                <span className="text-xs">Aún no</span>
              </button>
              <button 
                onClick={() => handleReviewAnswer(true)}
                className="flex-1 py-4 rounded-2xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/50 font-medium transition-colors flex flex-col items-center gap-2"
              >
                <Check size={24} className="text-emerald-400" />
                <span className="text-xs">¡Sí, lista!</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manage Tags Modal Overlay */}
      {isManagingTags && (
        <div className="fixed inset-0 z-50 bg-neutral-950/90 backdrop-blur-sm flex flex-col items-center justify-center p-6">
          <div className="bg-neutral-800 p-6 rounded-3xl w-full max-w-sm shadow-2xl border border-neutral-700">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Tags size={20} className="text-emerald-400" />
                Etiquetas ({tags.length}/10)
              </h3>
              <button onClick={() => setIsManagingTags(false)} className="text-neutral-400 hover:text-neutral-200">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleAddTag} className="flex gap-2 mb-6">
              <input
                type="text"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder="Nueva etiqueta..."
                className="flex-1 bg-neutral-900 border border-neutral-700 rounded-xl px-4 py-3 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                disabled={tags.length >= 10}
              />
              <button 
                type="submit"
                disabled={!newTagName.trim() || tags.length >= 10 || isSubmittingTag}
                className="px-4 rounded-xl bg-emerald-500 text-neutral-950 font-semibold hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
              >
                {isSubmittingTag ? <div className="w-5 h-5 border-2 border-neutral-950 border-t-transparent rounded-full animate-spin"></div> : <Plus size={20} />}
              </button>
            </form>

            <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
              {tags.map(tag => (
                <div key={tag.id} className="flex items-center justify-between bg-neutral-900/50 p-3 rounded-xl border border-neutral-800">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${tag.color}`}></div>
                    <span className="text-sm text-neutral-200">{tag.name}</span>
                  </div>
                  <button 
                    onClick={() => handleDeleteTag(tag.id)}
                    className="text-neutral-500 hover:text-rose-400 transition-colors p-1"
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
              {tags.length === 0 && (
                <p className="text-center text-sm text-neutral-500 py-4">No hay etiquetas creadas.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Scheduled Task Modal Overlay */}
      {isAddingScheduledTask && (
        <div className="fixed inset-0 z-50 bg-neutral-950/90 backdrop-blur-sm flex flex-col items-center justify-center p-6">
          <div className="bg-neutral-800 p-6 rounded-3xl w-full max-w-sm shadow-2xl border border-neutral-700">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <RotateCcw size={20} className="text-emerald-400" />
                {editingScheduledTaskId ? 'Editar Tarea Programada' : 'Nueva Tarea Programada'}
              </h3>
              <button onClick={() => { setIsAddingScheduledTask(false); setEditingScheduledTaskId(null); }} className="text-neutral-500 hover:text-neutral-300 transition-colors">
                <X size={24} />
              </button>
            </div>
            
            <form onSubmit={handleSaveScheduledTask} className="flex flex-col gap-4">
              <input
                type="text"
                placeholder="Ej. Leer 10 páginas..."
                value={newScheduledTaskTitle}
                onChange={(e) => setNewScheduledTaskTitle(e.target.value)}
                className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-4 py-3 text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-emerald-500 transition-colors"
                autoFocus
              />
              
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="text-xs text-neutral-500 mb-1.5 block uppercase tracking-wider font-medium">Estimación (min)</label>
                  <div className="flex items-center bg-neutral-900 border border-neutral-700 rounded-xl overflow-hidden">
                    <button type="button" onClick={() => setNewScheduledTaskEstimation(Math.max(5, newScheduledTaskEstimation - 5))} className="p-3 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors">
                      <Minus size={16} />
                    </button>
                    <div className="flex-1 text-center font-mono text-neutral-200">{newScheduledTaskEstimation}</div>
                    <button type="button" onClick={() => setNewScheduledTaskEstimation(newScheduledTaskEstimation + 5)} className="p-3 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors">
                      <Plus size={16} />
                    </button>
                  </div>
                </div>
                
                <div className="flex-1">
                  <label className="text-xs text-neutral-500 mb-1.5 block uppercase tracking-wider font-medium">Etiqueta</label>
                  <select
                    value={newScheduledTaskTagId}
                    onChange={(e) => setNewScheduledTaskTagId(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-3 text-neutral-200 focus:outline-none focus:border-emerald-500 transition-colors appearance-none"
                  >
                    <option value="">Ninguna</option>
                    {tags.map(tag => (
                      <option key={tag.id} value={tag.id}>{tag.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs text-neutral-500 mb-1.5 block uppercase tracking-wider font-medium">Frecuencia</label>
                <select
                  value={newScheduledTaskRecurrence.type}
                  onChange={(e) => setNewScheduledTaskRecurrence({ ...newScheduledTaskRecurrence, type: e.target.value as any })}
                  className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-3 text-neutral-200 focus:outline-none focus:border-emerald-500 transition-colors appearance-none mb-3"
                >
                  <option value="daily">Diaria</option>
                  <option value="weekly">Semanal</option>
                  <option value="monthly">Mensual</option>
                </select>

                {newScheduledTaskRecurrence.type === 'weekly' && (
                  <div className="flex justify-between gap-1 mt-2">
                    {['D', 'L', 'M', 'X', 'J', 'V', 'S'].map((day, index) => (
                      <button
                        key={index}
                        type="button"
                        onClick={() => {
                          const currentDays = newScheduledTaskRecurrence.daysOfWeek || [];
                          const newDays = currentDays.includes(index)
                            ? currentDays.filter(d => d !== index)
                            : [...currentDays, index];
                          setNewScheduledTaskRecurrence({ ...newScheduledTaskRecurrence, daysOfWeek: newDays });
                        }}
                        className={`w-8 h-8 rounded-full text-xs font-medium flex items-center justify-center transition-colors ${
                          (newScheduledTaskRecurrence.daysOfWeek || []).includes(index)
                            ? 'bg-emerald-500 text-neutral-950'
                            : 'bg-neutral-900 text-neutral-400 border border-neutral-700'
                        }`}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                )}

                {newScheduledTaskRecurrence.type === 'monthly' && (
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-sm text-neutral-400">Día del mes:</span>
                    <input
                      type="number"
                      min="1"
                      max="31"
                      value={newScheduledTaskRecurrence.dayOfMonth || 1}
                      onChange={(e) => setNewScheduledTaskRecurrence({ ...newScheduledTaskRecurrence, dayOfMonth: parseInt(e.target.value) })}
                      className="w-16 bg-neutral-900 border border-neutral-700 rounded-xl px-2 py-1 text-center text-neutral-200 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                )}
              </div>
              
              <button 
                type="submit"
                disabled={!newScheduledTaskTitle.trim() || isSubmittingScheduledTask}
                className="w-full py-3 bg-emerald-500 text-neutral-950 font-semibold rounded-xl mt-2 hover:bg-emerald-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSubmittingScheduledTask ? (
                  <div className="w-5 h-5 border-2 border-neutral-950/30 border-t-neutral-950 rounded-full animate-spin"></div>
                ) : (
                  <>
                    <Check size={20} />
                    Guardar
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Scheduled Tasks Prompt Modal Overlay */}
      {showScheduledPrompt && dueScheduledTasks.length > 0 && (
        <div className="fixed inset-0 z-[60] bg-neutral-950/90 backdrop-blur-sm flex flex-col items-center justify-center p-6">
          <div className="bg-neutral-800 p-6 rounded-3xl w-full max-w-md shadow-2xl border border-neutral-700">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Calendar size={20} className="text-emerald-400" />
                Tareas Programadas para Hoy
              </h3>
            </div>
            
            <p className="text-sm text-neutral-400 mb-4">
              Tienes las siguientes tareas programadas para hoy. Selecciona las que deseas agregar a tu lista actual:
            </p>

            <div className="space-y-2 mb-6 max-h-60 overflow-y-auto pr-2">
              {dueScheduledTasks.map(st => (
                <label key={st.id} className="flex items-center gap-3 p-3 bg-neutral-900/50 rounded-xl border border-neutral-700 cursor-pointer hover:bg-neutral-900 transition-colors">
                  <input
                    type="checkbox"
                    checked={selectedScheduledTasksToAdd.includes(st.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedScheduledTasksToAdd([...selectedScheduledTasksToAdd, st.id]);
                      } else {
                        setSelectedScheduledTasksToAdd(selectedScheduledTasksToAdd.filter(id => id !== st.id));
                      }
                    }}
                    className="w-5 h-5 rounded border-neutral-600 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-neutral-900 bg-neutral-800"
                  />
                  <span className="text-neutral-200">{st.title}</span>
                </label>
              ))}
            </div>

            <div className="flex gap-3">
              <button 
                onClick={handleIgnoreScheduledTasks}
                className="flex-1 py-3 bg-neutral-900 text-neutral-400 font-semibold rounded-xl hover:bg-neutral-700 hover:text-neutral-200 transition-colors"
              >
                Ignorar por hoy
              </button>
              <button 
                onClick={handleAddScheduledTasksToToday}
                disabled={selectedScheduledTasksToAdd.length === 0}
                className="flex-1 py-3 bg-emerald-500 text-neutral-950 font-semibold rounded-xl hover:bg-emerald-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Agregar Seleccionadas
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Task Modal Overlay */}
      {isAddingTask && (
        <div className="fixed inset-0 z-50 bg-neutral-950/90 backdrop-blur-sm flex flex-col items-center justify-center p-6">
          <div className="bg-neutral-800 p-6 rounded-3xl w-full max-w-sm shadow-2xl border border-neutral-700">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <CheckSquare size={20} className="text-emerald-400" />
                {editingTaskId ? 'Editar Tarea' : 'Nueva Tarea'}
              </h3>
              <button onClick={resetTaskForm} className="text-neutral-400 hover:text-neutral-200">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleAddTask} className="flex flex-col gap-4">
              <div>
                <label className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-1 block px-1">Título</label>
                <input
                  type="text"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  placeholder="¿Qué necesitas hacer?"
                  className="w-full bg-neutral-900 border border-neutral-700 rounded-xl p-4 text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                  autoFocus
                />
              </div>

              {!newTaskProjectId && (
                <div>
                  <label className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-1 block px-1">Etiqueta *</label>
                  <select
                    value={newTaskTagId}
                    onChange={(e) => setNewTaskTagId(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-xl p-4 text-neutral-100 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all appearance-none"
                    required={!newTaskProjectId}
                  >
                    <option value="" disabled>Selecciona una etiqueta...</option>
                    {tags.map(tag => (
                      <option key={tag.id} value={tag.id}>{tag.name}</option>
                    ))}
                  </select>
                  {tags.length === 0 && (
                    <p className="text-xs text-rose-400 mt-1 px-1">Primero debes crear etiquetas.</p>
                  )}
                </div>
              )}

              {newTaskProjectId && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-1 block px-1">Fase</label>
                    <input
                      type="text"
                      value={newTaskPhase}
                      onChange={(e) => setNewTaskPhase(e.target.value)}
                      placeholder="Ej: Cimientos"
                      className="w-full bg-neutral-900 border border-neutral-700 rounded-xl p-4 text-neutral-100 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-1 block px-1">Estado</label>
                    <button
                      type="button"
                      onClick={() => setNewTaskIsBacklog(!newTaskIsBacklog)}
                      className={`w-full h-[58px] rounded-xl font-medium transition-colors ${newTaskIsBacklog ? 'bg-neutral-800 text-neutral-300 border border-neutral-700' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'}`}
                    >
                      {newTaskIsBacklog ? 'En Backlog' : 'En Hoy'}
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-1 block px-1">Fecha</label>
                  <input
                    type="date"
                    value={newTaskDate}
                    min={getLocalDateString()}
                    onChange={(e) => setNewTaskDate(e.target.value)}
                    disabled={newTaskIsBacklog}
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-xl p-4 text-neutral-100 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all [color-scheme:dark] disabled:opacity-50"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-1 block px-1">Minutos</label>
                  <div className="flex items-center justify-between bg-neutral-900 border border-neutral-700 rounded-xl p-2">
                    <button 
                      type="button"
                      onClick={() => setNewTaskEstimation(prev => Math.max(5, prev - 5))}
                      className="p-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors"
                    >
                      <Minus size={16} />
                    </button>
                    <span className="font-mono font-medium text-emerald-400 w-8 text-center">{newTaskEstimation}</span>
                    <button 
                      type="button"
                      onClick={() => setNewTaskEstimation(prev => prev + 5)}
                      className="p-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </div>
              </div>
              
              <div className="pt-4 flex gap-3">
                {editingTaskId && (
                  <button 
                    type="button"
                    onClick={async () => {
                      const deletedTask = tasks.find(t => t.id === editingTaskId);
                      if (deletedTask && deletedTask.selected && mode === 'work' && !isRunning) {
                        const newTasks = tasks.filter(t => t.id !== editingTaskId);
                        const newSelectedPending = newTasks.filter(t => t.selected && !t.completed);
                        const newHasSelected = newSelectedPending.length > 0;
                        const newMax = newHasSelected ? Math.max(...newSelectedPending.map(t => t.estimation || 25)) : 25;
                        setTimeLeft(newMax * 60);
                        setTotalTime(newMax * 60);
                      }

                      if (!import.meta.env.VITE_FIREBASE_PROJECT_ID) {
                        setTasks(tasks.filter(t => t.id !== editingTaskId));
                      } else {
                        try {
                          await deleteDoc(doc(db, 'tasks', editingTaskId));
                        } catch (error) {
                          console.error("Error deleting task: ", error);
                        }
                      }
                      resetTaskForm();
                    }}
                    className="px-4 py-3 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 rounded-xl font-medium transition-colors border border-rose-500/20"
                  >
                    <Trash2 size={20} />
                  </button>
                )}
                <button 
                  type="submit"
                  disabled={!newTaskTitle.trim() || (!newTaskProjectId && !newTaskTagId) || isSubmittingTask}
                  className="flex-1 py-4 mt-2 rounded-xl bg-emerald-500 text-neutral-950 font-semibold hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isSubmittingTask ? 'Guardando...' : (editingTaskId ? 'Guardar Cambios' : 'Guardar Tarea')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Idea Modal Overlay */}
      {isAddingIdea && (
        <div className="fixed inset-0 z-[60] bg-neutral-950/90 backdrop-blur-sm flex flex-col items-center justify-center p-6">
          <div className="bg-neutral-800 p-6 rounded-3xl w-full max-w-sm shadow-2xl border border-neutral-700">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Lightbulb size={20} className="text-amber-400" />
                Nueva Idea
              </h3>
              <button onClick={() => setIsAddingIdea(false)} className="text-neutral-400 hover:text-neutral-200">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleAddIdea} className="flex flex-col gap-4">
              <textarea
                value={newIdeaText}
                onChange={(e) => setNewIdeaText(e.target.value)}
                placeholder="Escribe tu idea aquí..."
                className="w-full bg-neutral-900 border border-neutral-700 rounded-xl p-4 text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all min-h-[120px] resize-none"
                autoFocus
              />
              
              <button 
                type="submit"
                disabled={!newIdeaText.trim() || isSubmittingIdea}
                className="w-full py-4 mt-2 rounded-xl bg-amber-500 text-neutral-950 font-semibold hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSubmittingIdea ? 'Guardando...' : 'Guardar Idea'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Add/Edit Reminder Modal Overlay */}
      {isAddingReminder && (
        <div className="fixed inset-0 z-50 bg-neutral-950/90 backdrop-blur-sm flex flex-col items-center justify-end sm:justify-center p-0 sm:p-6">
          <div className="bg-neutral-800 p-6 rounded-t-3xl sm:rounded-3xl w-full max-w-md shadow-2xl border border-neutral-700 animate-in slide-in-from-bottom-10 sm:slide-in-from-bottom-0 sm:zoom-in-95">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-semibold">{editingReminderId ? 'Editar Recordatorio' : 'Nuevo Recordatorio'}</h3>
              <button onClick={resetReminderForm} className="p-2 text-neutral-400 hover:text-neutral-200 bg-neutral-700/50 rounded-full">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSaveReminder} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1 ml-1">Título</label>
                <input 
                  type="text" 
                  value={newReminderTitle}
                  onChange={(e) => setNewReminderTitle(e.target.value)}
                  placeholder="Ej: Llamar al médico"
                  className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-4 py-3 text-neutral-100 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                  autoFocus
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1 ml-1">Detalle (Opcional)</label>
                <textarea 
                  value={newReminderDetail}
                  onChange={(e) => setNewReminderDetail(e.target.value)}
                  placeholder="Ej: Preguntar por los resultados de los análisis"
                  className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-4 py-3 text-neutral-100 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all resize-none h-24"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1 ml-1">Fecha</label>
                  <input 
                    type="date" 
                    value={newReminderDate}
                    onChange={(e) => setNewReminderDate(e.target.value)}
                    min={getLocalDateString()}
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-4 py-3 text-neutral-100 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1 ml-1">Hora</label>
                  <input 
                    type="time" 
                    value={newReminderTime}
                    onChange={(e) => setNewReminderTime(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-4 py-3 text-neutral-100 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                    required
                  />
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                {editingReminderId && (
                  <button 
                    type="button"
                    onClick={() => { handleDeleteReminder(editingReminderId); resetReminderForm(); }}
                    className="px-4 py-3 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 rounded-xl font-medium transition-colors border border-rose-500/20"
                  >
                    <Trash2 size={20} />
                  </button>
                )}
                <button 
                  type="submit"
                  disabled={!newReminderTitle.trim() || !newReminderDate || !newReminderTime || isSubmittingReminder}
                  className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-400 text-neutral-950 rounded-xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmittingReminder ? 'Guardando...' : (editingReminderId ? 'Guardar Cambios' : 'Crear Recordatorio')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Medication Modal */}
      {isAddingMedication && (
        <div className="fixed inset-0 z-50 bg-neutral-950/90 backdrop-blur-sm flex flex-col items-center justify-end sm:justify-center p-0 sm:p-6">
          <div className="bg-neutral-800 p-6 rounded-t-3xl sm:rounded-3xl w-full max-w-md shadow-2xl border border-neutral-700 animate-in slide-in-from-bottom-10 sm:slide-in-from-bottom-0 sm:zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-semibold">{editingMedicationId ? 'Editar Medicamento' : 'Nuevo Medicamento'}</h3>
              <button onClick={resetMedForm} className="p-2 text-neutral-400 hover:text-neutral-200 bg-neutral-700/50 rounded-full">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSaveMedication} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1 ml-1">Nombre</label>
                <input 
                  type="text" 
                  value={newMedName}
                  onChange={(e) => setNewMedName(e.target.value)}
                  placeholder="Ej: Ibuprofeno"
                  className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-4 py-3 text-neutral-100 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1 ml-1">Dosis (Info)</label>
                  <input 
                    type="text" 
                    value={newMedDosage}
                    onChange={(e) => setNewMedDosage(e.target.value)}
                    placeholder="Ej: 500mg"
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-4 py-3 text-neutral-100 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                    required
                  />
                </div>
                <div>
                   <label className="block text-xs font-medium text-neutral-400 mb-1 ml-1">Stock Actual</label>
                   <input 
                    type="number" 
                    value={newMedStock}
                    onChange={(e) => setNewMedStock(Number(e.target.value))}
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-4 py-3 text-neutral-100 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                    min="0"
                    required
                  />
                </div>
              </div>

              <div>
                 <label className="block text-xs font-medium text-neutral-400 mb-1 ml-1">Stock Mínimo (Alerta)</label>
                 <input 
                  type="number" 
                  value={newMedMinStock}
                  onChange={(e) => setNewMedMinStock(Number(e.target.value))}
                  className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-4 py-3 text-neutral-100 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                  min="0"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1 ml-1">Horarios (separados por coma)</label>
                <div className="flex gap-2 mb-2 flex-wrap">
                  {newMedSchedule.map((time, idx) => (
                    <span key={idx} className="bg-neutral-700 px-2 py-1 rounded-lg text-sm flex items-center gap-1">
                      {time}
                      <button type="button" onClick={() => setNewMedSchedule(s => s.filter((_, i) => i !== idx))}><X size={12}/></button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input 
                    type="time" 
                    id="scheduleInput"
                    className="flex-1 bg-neutral-900 border border-neutral-700 rounded-xl px-4 py-3 text-neutral-100 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                  />
                  <button 
                    type="button"
                    onClick={() => {
                      const input = document.getElementById('scheduleInput') as HTMLInputElement;
                      if (input.value && !newMedSchedule.includes(input.value)) {
                        setNewMedSchedule([...newMedSchedule, input.value]);
                        input.value = '';
                      }
                    }}
                    className="bg-neutral-700 px-4 rounded-xl hover:bg-neutral-600"
                  >
                    <Plus size={20} />
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1 ml-1">Días de la semana</label>
                <div className="flex justify-between gap-1">
                  {['D', 'L', 'M', 'X', 'J', 'V', 'S'].map((day, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        if (newMedDays.includes(idx)) {
                          setNewMedDays(d => d.filter(d => d !== idx));
                        } else {
                          setNewMedDays(d => [...d, idx]);
                        }
                      }}
                      className={`w-8 h-8 rounded-full text-xs font-bold flex items-center justify-center transition-colors ${newMedDays.includes(idx) ? 'bg-emerald-500 text-neutral-950' : 'bg-neutral-700 text-neutral-400'}`}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1 ml-1">Notas (Opcional)</label>
                <textarea 
                  value={newMedNotes}
                  onChange={(e) => setNewMedNotes(e.target.value)}
                  placeholder="Ej: Tomar con comida"
                  className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-4 py-3 text-neutral-100 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all resize-none h-20"
                />
              </div>
              
              <div className="pt-4 flex gap-3">
                {editingMedicationId && (
                  <button 
                    type="button"
                    onClick={() => handleDeleteMedication(editingMedicationId)}
                    className="px-4 py-3 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 rounded-xl font-medium transition-colors border border-rose-500/20"
                  >
                    <Trash2 size={20} />
                  </button>
                )}
                <button 
                  type="submit"
                  disabled={!newMedName.trim() || newMedSchedule.length === 0 || newMedDays.length === 0 || isSubmittingMedication}
                  className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-400 text-neutral-950 rounded-xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmittingMedication ? 'Guardando...' : (editingMedicationId ? 'Guardar Cambios' : 'Guardar Medicamento')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Skip Medication Modal */}
      {isSkippingMed && (
        <div className="fixed inset-0 z-50 bg-neutral-950/90 backdrop-blur-sm flex flex-col items-center justify-center p-6">
          <div className="bg-neutral-800 p-6 rounded-3xl w-full max-w-sm shadow-2xl border border-neutral-700">
            <h3 className="text-lg font-semibold mb-4 text-neutral-200">¿Por qué no la tomaste?</h3>
            <textarea
              value={skipReason}
              onChange={(e) => setSkipReason(e.target.value)}
              placeholder="Razón (ej: Me sentía mal, Olvidé llevarlas...)"
              className="w-full bg-neutral-900 border border-neutral-700 rounded-xl p-4 text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all min-h-[100px] resize-none mb-4"
              autoFocus
            />
            <div className="flex gap-3">
              <button 
                onClick={() => setIsSkippingMed(null)}
                className="flex-1 py-3 bg-neutral-700 hover:bg-neutral-600 text-neutral-200 rounded-xl font-medium"
              >
                Cancelar
              </button>
              <button 
                onClick={handleSkipMedication}
                disabled={!skipReason.trim()}
                className="flex-1 py-3 bg-amber-500 hover:bg-amber-400 text-neutral-950 rounded-xl font-semibold disabled:opacity-50"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      <main className={`flex-1 p-5 overflow-y-auto flex flex-col items-center mx-auto w-full pb-24 transition-all duration-300 ${activeTab === 'tareas' && tasksLayout === 'kanban' && tasksView !== 'scheduled' ? 'max-w-5xl' : 'max-w-md'}`}>
        
        {/* PWA Install Banner */}
        {deferredPrompt && (
          <div className="w-full bg-emerald-500/20 border border-emerald-500/50 rounded-2xl p-4 mb-6 flex items-center justify-between shadow-lg">
            <div className="flex items-center gap-3">
              <div className="bg-emerald-500/20 p-2 rounded-full">
                <ArrowRight size={20} className="text-emerald-400" />
              </div>
              <div>
                <h4 className="font-semibold text-emerald-400 text-sm">Instalar ZenTask</h4>
                <p className="text-xs text-neutral-400">Añade la app a tu pantalla de inicio</p>
              </div>
            </div>
            <button 
              onClick={handleInstallApp}
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-neutral-950 text-sm font-semibold rounded-xl transition-colors"
            >
              Instalar
            </button>
          </div>
        )}

        {activeTab === 'inicio' && (
          <>
            {/* Zen Mode Overlay - Only active when running and Zen Mode is on */}
            {isZenMode && isRunning && (
              <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center p-8 animate-in fade-in duration-500">
                <div className="flex items-center justify-center gap-12 opacity-30 hover:opacity-100 active:opacity-100 transition-opacity duration-300">
                  {/* Exit Zen Mode */}
                  <button 
                    onClick={() => setIsZenMode(false)}
                    className="p-6 rounded-full bg-neutral-900 hover:bg-neutral-800 text-neutral-500 hover:text-white transition-all transform hover:scale-110 shadow-2xl border border-neutral-800"
                    title="Salir del Modo Zen"
                  >
                    <Maximize2 size={32} />
                  </button>

                  {/* Capture Idea (Minimal) */}
                  <button 
                    onClick={() => setIsAddingIdea(true)}
                    className="p-6 rounded-full bg-neutral-900 hover:bg-neutral-800 text-neutral-500 hover:text-yellow-400 transition-all transform hover:scale-110 shadow-2xl border border-neutral-800"
                    title="Capturar Idea"
                  >
                    <Lightbulb size={32} />
                  </button>
                </div>
              </div>
            )}

            {/* Reloj Pomodoro con Barra de Progreso */}
            <div 
              className="relative w-full rounded-3xl p-1 mb-8 shadow-lg mt-4 transition-all duration-500"
              style={{
                background: `conic-gradient(from 0deg, ${isWork ? '#34d399' : '#60a5fa'} ${progress}%, #262626 ${progress}%)`
              }}
            >
              <div className="w-full bg-neutral-800 rounded-[20px] p-8 flex flex-col items-center justify-center">
                <div className="flex items-center justify-center gap-6 mb-4 w-full">
                  <button 
                    onClick={handleMinus}
                    disabled={isRunning || timeLeft <= 5 * 60}
                    className="p-3 rounded-full bg-neutral-700 hover:bg-neutral-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
                  >
                    <Minus size={24} />
                  </button>
                  
                  <div className={`text-7xl sm:text-8xl font-light tracking-tighter font-mono flex-1 text-center ${!isWork && 'text-blue-400'}`}>
                    {formatTime(timeLeft)}
                  </div>
                  
                  <button 
                    onClick={handlePlus}
                    disabled={isRunning}
                    className="p-3 rounded-full bg-neutral-700 hover:bg-neutral-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
                  >
                    <Plus size={24} />
                  </button>
                </div>
                <p className={`text-sm font-medium uppercase tracking-widest ${isWork ? 'text-neutral-400' : 'text-blue-400'}`}>
                  {mode === 'work' ? 'Enfoque' : mode === 'shortBreak' ? 'Descanso Corto' : 'Descanso Largo'}
                </p>
                {!isWork && (
                  <button
                    onClick={skipBreak}
                    className="mt-4 px-4 py-1.5 bg-neutral-700/50 hover:bg-neutral-600 text-neutral-300 text-xs font-medium rounded-full transition-colors flex items-center gap-1"
                  >
                    Omitir Descanso
                    <ArrowRight size={14} />
                  </button>
                )}
              </div>
            </div>

            {/* Daily Goal & Streak */}
            <div className="w-full flex items-center justify-between mb-6 px-2">
              <div 
                className="flex flex-col gap-1.5 cursor-pointer group flex-1 mr-4"
                onClick={() => {
                  setTempGoal(dailyGoalMinutes.toString());
                  setIsEditingGoal(true);
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-neutral-400 font-medium uppercase tracking-wider">Minutos Enfocados</span>
                  <span className="text-[10px] text-neutral-500 group-hover:text-neutral-300 transition-colors">
                    {focusedMinutesToday} / {dailyGoalMinutes} min
                  </span>
                </div>
                <div className="w-full h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-emerald-500 transition-all duration-500"
                    style={{ width: `${Math.min(100, (focusedMinutesToday / dailyGoalMinutes) * 100)}%` }}
                  ></div>
                </div>
              </div>
              
              <div className="flex items-center gap-2 bg-neutral-800/50 px-3 py-1.5 rounded-full border border-neutral-700/50 shrink-0">
                <span className="text-orange-500">🔥</span>
                <span className="text-sm font-bold text-neutral-200">{streak}</span>
                <span className="text-[10px] text-neutral-500 uppercase tracking-wider">Días</span>
              </div>
            </div>

            {/* Controles Principales */}
            <div className="w-full grid grid-cols-5 gap-2 mb-10">
              <button 
                onClick={() => setIsAddingTask(true)}
                className="col-span-1 flex flex-col items-center justify-center p-2 bg-neutral-800 hover:bg-neutral-700 rounded-2xl transition-colors text-neutral-300"
              >
                <CheckSquare size={18} className="mb-1" />
                <span className="text-[9px] font-medium uppercase">Tarea</span>
              </button>

              <button 
                onClick={() => setIsAddingIdea(true)}
                className="col-span-1 flex flex-col items-center justify-center p-2 bg-neutral-800 hover:bg-neutral-700 rounded-2xl transition-colors text-neutral-300"
              >
                <Lightbulb size={18} className="mb-1" />
                <span className="text-[9px] font-medium uppercase">Idea</span>
              </button>
              
              <button 
                onClick={handleResetClick}
                className="col-span-1 flex flex-col items-center justify-center p-2 bg-neutral-800 hover:bg-neutral-700 rounded-2xl transition-colors text-neutral-300"
              >
                <RotateCcw size={18} className="mb-1" />
                <span className="text-[9px] font-medium uppercase">Reset</span>
              </button>
              
              <button 
                onClick={handleToggleTimer}
                disabled={isRunning || (mode === 'work' && selectedPendingTasks.length === 0)}
                className={`col-span-1 flex flex-col items-center justify-center p-2 rounded-2xl transition-colors shadow-md ${isRunning ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed border border-neutral-700' : 'bg-emerald-500 text-neutral-950 hover:bg-emerald-400'} ${(mode === 'work' && selectedPendingTasks.length === 0 && !isRunning) ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {isRunning ? <Lock size={24} /> : <Play size={24} fill="currentColor" className="ml-1" />}
              </button>
              
              <button 
                onClick={() => setIsZenMode(!isZenMode)}
                className={`col-span-1 flex flex-col items-center justify-center p-2 rounded-2xl transition-colors ${isZenMode ? 'bg-violet-500/20 text-violet-400 border border-violet-500/50' : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'}`}
              >
                <Maximize2 size={18} className="mb-1" />
                <span className="text-[9px] font-medium uppercase">Zen</span>
              </button>
            </div>

            {/* Reset Confirmation Modal */}
            {isConfirmingReset && (
              <div className="fixed inset-0 z-50 bg-neutral-950/90 backdrop-blur-sm flex flex-col items-center justify-center p-6">
                <div className="bg-neutral-800 p-6 rounded-3xl w-full max-w-sm shadow-2xl border border-neutral-700 text-center">
                  <div className="w-16 h-16 bg-rose-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <AlertTriangle size={32} className="text-rose-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-neutral-200 mb-2">¿Detener Sesión?</h3>
                  <p className="text-sm text-neutral-400 mb-6">
                    ¿Por qué quieres detener el temporizador?
                  </p>
                  <div className="flex flex-col gap-3">
                    <button 
                      onClick={() => confirmReset(true)}
                      className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-medium transition-colors flex items-center justify-center gap-2"
                    >
                      <Check size={18} />
                      Ya terminé la tarea
                    </button>
                    <button 
                      onClick={() => confirmReset(false)}
                      className="w-full py-3 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 font-medium transition-colors border border-rose-500/30"
                    >
                      Abandonar (Penalización)
                    </button>
                    <button 
                      onClick={() => setIsConfirmingReset(false)}
                      className="w-full py-3 rounded-xl bg-neutral-700 hover:bg-neutral-600 text-neutral-200 font-medium transition-colors mt-2"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Lista de Tareas Pendientes */}
            <div className="w-full">
              <div className="flex justify-between items-end mb-4 px-1">
                <button 
                  onClick={() => setHomeView(prev => prev === 'today' ? 'overdue' : 'today')}
                  className="flex items-center gap-1 group"
                >
                  <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider group-hover:text-neutral-200 transition-colors">
                    {homeView === 'today' ? 'Tareas de Hoy' : 'Tareas Atrasadas'}
                  </h2>
                  <ChevronRight size={16} className="text-neutral-500 group-hover:text-neutral-300 transition-colors" />
                </button>
                {mode === 'work' && selectedPendingTasks.length === 0 && (
                  <span className="text-xs text-rose-400 font-medium animate-pulse">Selecciona una para empezar</span>
                )}
              </div>
              
              <div className="space-y-2">
                {tasks
                  .filter(t => !t.completed)
                  .filter(t => {
                    const today = getLocalDateString();
                    return homeView === 'today' ? t.date === today : t.date < today;
                  })
                  .sort((a, b) => {
                    if (a.date !== b.date) return a.date.localeCompare(b.date);
                    return a.estimation - b.estimation;
                  })
                  .slice(0, 5) // Max 5 tasks
                  .map(task => {
                    const tag = tags.find(t => t.id === task.tagId);
                    const project = projects.find(p => p.id === task.projectId);
                    const isOverdue = task.date < getLocalDateString();
                    return (
                      <div 
                        key={task.id}
                        onClick={() => toggleTaskSelection(task.id, task.selected)}
                        className={`flex items-center gap-3 p-3 rounded-2xl border transition-colors cursor-pointer group ${task.selected ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-neutral-800/50 border-neutral-800 hover:border-neutral-700'}`}
                      >
                        <div className="flex-1 flex flex-col min-w-0">
                          <span className={`text-sm truncate ${task.selected ? 'text-emerald-100' : 'text-neutral-300'}`}>
                            {task.title}
                          </span>
                          <div className="flex items-center gap-2 mt-1">
                            {project && (
                              <div className="flex items-center gap-1">
                                <Folder size={10} className={project.color.replace('bg-', 'text-')} />
                                <span className="text-[10px] text-neutral-500 truncate max-w-[80px]">{project.title}</span>
                              </div>
                            )}
                            {tag && !project && (
                              <div className="flex items-center gap-1">
                                <div className={`w-2 h-2 rounded-full ${tag.color}`}></div>
                                <span className="text-[10px] text-neutral-500 truncate max-w-[80px]">{tag.name}</span>
                              </div>
                            )}
                            {isOverdue && (
                              <span className="text-[10px] text-rose-400 flex items-center gap-1">
                                <Calendar size={10} /> {getOverdueText(task.date)}
                              </span>
                            )}
                            <span className="text-[10px] text-neutral-600 flex items-center gap-1 ml-auto">
                              <Clock size={10} /> {Math.floor((task.timeSpent || 0) / 60)}m / {task.estimation}m
                            </span>
                          </div>
                        </div>
                        <button 
                          onClick={(e) => { e.stopPropagation(); openEditTask(task); }}
                          className="p-2 text-neutral-500 hover:text-amber-400 hover:bg-amber-400/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                          title="Editar tarea"
                        >
                          <Pencil size={14} />
                        </button>
                      </div>
                    );
                  })}
                
                {tasks.filter(t => !t.completed && (homeView === 'today' ? t.date === getLocalDateString() : t.date < getLocalDateString())).length === 0 && (
                  <div className="text-center p-8 border border-dashed border-neutral-700 rounded-2xl text-neutral-500">
                    {homeView === 'today' ? 'No hay tareas para hoy. ¡A descansar!' : '¡Genial! No tienes tareas atrasadas.'}
                  </div>
                )}
              </div>
            </div>

            {/* Upcoming Reminders on Home Tab */}
            {homeView === 'today' && (
              <div className="w-full mt-8 space-y-6">
                {/* Medications for Today */}
                {getTodayMedications().length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                      <Pill size={16} className="text-blue-400" />
                      Medicación de Hoy
                    </h3>
                    <div className="space-y-3">
                      {getTodayMedications().map((task, idx) => (
                        <div key={`${task.med.id}-${task.time}-${idx}`} className={`flex items-center justify-between p-4 rounded-2xl border ${task.status === 'pending' ? 'bg-neutral-800/50 border-neutral-700' : 'bg-neutral-900/30 border-neutral-800 opacity-60'}`}>
                          <div className="flex-1 min-w-0 pr-4">
                            <h4 className="text-sm font-medium text-neutral-200 truncate">{task.med.name}</h4>
                            <div className="flex items-center gap-2 mt-1 text-xs text-neutral-400">
                              <span className="flex items-center gap-1 bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-md">
                                <Clock size={10} /> {task.time}
                              </span>
                              <span>{task.med.dosage}</span>
                            </div>
                          </div>
                          
                          {task.status === 'pending' ? (
                            <div className="flex gap-2">
                              <button 
                                onClick={() => setIsSkippingMed({ med: task.med, time: task.time })}
                                className="w-8 h-8 rounded-lg bg-neutral-700 flex items-center justify-center hover:bg-neutral-600 transition-colors text-neutral-400"
                                title="Omitir"
                              >
                                <X size={14} />
                              </button>
                              <button 
                                onClick={() => handleTakeMedication(task.med, task.time)}
                                className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center border border-emerald-500/20 hover:bg-emerald-500/30 transition-colors text-emerald-400"
                                title="Tomar"
                              >
                                <Check size={14} />
                              </button>
                            </div>
                          ) : (
                            <span className={`text-xs font-medium px-2 py-1 rounded ${task.status === 'taken' ? 'text-emerald-500 bg-emerald-500/10' : 'text-amber-500 bg-amber-500/10'}`}>
                              {task.status === 'taken' ? 'Tomada' : 'Omitida'}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Other Reminders */}
                {reminders.filter(r => !r.completed && r.date === getLocalDateString()).length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                      <Bell size={16} className="text-emerald-400" />
                      Avisos de Hoy
                    </h3>
                    <div className="space-y-3">
                      {reminders
                        .filter(r => !r.completed && r.date === getLocalDateString())
                        .sort((a, b) => a.time.localeCompare(b.time))
                        .map(reminder => (
                          <div key={reminder.id} className="flex items-center justify-between p-4 bg-neutral-800/30 rounded-2xl border border-neutral-800">
                            <div className="flex-1 min-w-0 pr-4">
                              <h4 className="text-sm font-medium text-neutral-200 truncate">{reminder.title}</h4>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-[10px] text-emerald-400 flex items-center gap-1 bg-emerald-500/10 px-2 py-0.5 rounded-md">
                                  <Clock size={10} /> {reminder.time}
                                </span>
                              </div>
                            </div>
                            <button 
                              onClick={() => handleCompleteReminder(reminder)}
                              className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
                              title="Completar aviso"
                            >
                              <Check size={14} className="text-emerald-400" />
                            </button>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {activeTab === 'tareas' && (
          <div className="w-full flex flex-col mt-4">
            <div className="flex justify-between items-center mb-6">
              <div className="flex bg-neutral-800 rounded-xl p-1">
                <button 
                  onClick={() => setTasksView('all')}
                  className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors ${tasksView === 'all' ? 'bg-neutral-700 text-neutral-100' : 'text-neutral-400 hover:text-neutral-300'}`}
                >
                  Actuales
                </button>
                <button 
                  onClick={() => setTasksView('future')}
                  className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors ${tasksView === 'future' ? 'bg-neutral-700 text-neutral-100' : 'text-neutral-400 hover:text-neutral-300'}`}
                >
                  Futuras
                </button>
                <button 
                  onClick={() => setTasksView('scheduled')}
                  className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors ${tasksView === 'scheduled' ? 'bg-neutral-700 text-neutral-100' : 'text-neutral-400 hover:text-neutral-300'}`}
                >
                  Programadas
                </button>
              </div>
              
              <div className="flex items-center gap-2">
                {tasksView !== 'scheduled' && (
                  <div className="flex bg-neutral-800 rounded-xl p-1 mr-2">
                    <button 
                      onClick={() => setTasksLayout('list')}
                      className={`p-2 rounded-lg transition-colors ${tasksLayout === 'list' ? 'bg-neutral-700 text-neutral-100' : 'text-neutral-400 hover:text-neutral-300'}`}
                      title="Vista de Lista"
                    >
                      <List size={16} />
                    </button>
                    <button 
                      onClick={() => setTasksLayout('kanban')}
                      className={`p-2 rounded-lg transition-colors ${tasksLayout === 'kanban' ? 'bg-neutral-700 text-neutral-100' : 'text-neutral-400 hover:text-neutral-300'}`}
                      title="Vista de Tablero"
                    >
                      <LayoutGrid size={16} />
                    </button>
                  </div>
                )}
                <button 
                  onClick={() => setIsManagingTags(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-xl text-neutral-300 transition-colors text-xs font-medium"
                >
                  <Tags size={14} />
                  Etiquetas
                </button>
              </div>
            </div>

            <div className={tasksLayout === 'kanban' && tasksView !== 'scheduled' ? "" : "space-y-4"}>
              {tasksView === 'scheduled' ? (
                <div className="space-y-4">
                  {scheduledTasks.map(st => {
                    const tag = tags.find(t => t.id === st.tagId);
                    return (
                      <div key={st.id} className="flex items-center justify-between p-4 bg-neutral-800/50 rounded-2xl border border-neutral-800 group">
                        <div className="flex-1 flex flex-col min-w-0 mr-3">
                          <span className="text-sm text-neutral-200 font-medium">{st.title}</span>
                          <div className="flex items-center gap-3 mt-1.5">
                            {tag && (
                              <span className={`text-[10px] px-2 py-0.5 rounded-full bg-neutral-900 border border-neutral-700 ${tag.color.replace('bg-', 'text-')}`}>
                                {tag.name}
                              </span>
                            )}
                            <span className="text-[10px] text-neutral-500 flex items-center gap-1">
                              <Clock size={10} /> {st.estimation}m
                            </span>
                            <span className="text-[10px] text-neutral-500 flex items-center gap-1">
                              <RotateCcw size={10} /> 
                              {st.recurrence.type === 'daily' ? 'Diaria' : 
                               st.recurrence.type === 'weekly' ? 'Semanal' : 'Mensual'}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={() => openEditScheduledTask(st)}
                            className="p-2 text-neutral-500 hover:text-amber-400 hover:bg-amber-400/10 rounded-lg transition-colors"
                            title="Editar"
                          >
                            <Pencil size={16} />
                          </button>
                          <button 
                            onClick={() => handleDeleteScheduledTask(st.id)}
                            className="p-2 text-neutral-500 hover:text-rose-400 hover:bg-rose-400/10 rounded-lg transition-colors"
                            title="Eliminar"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {scheduledTasks.length === 0 && (
                    <div className="text-center p-8 border border-dashed border-neutral-700 rounded-2xl text-neutral-500 mt-8">
                      No tienes tareas programadas.
                    </div>
                  )}
                </div>
              ) : tasksLayout === 'list' ? (
                <div className="space-y-4">
                  {groupedTasks.map(({ tag, tasks, totalMinutes }) => {
                    const isExpanded = expandedTags[tag.id];
                    return (
                      <div key={tag.id} className="bg-neutral-800/30 rounded-2xl border border-neutral-800 overflow-hidden">
                        <button 
                      onClick={() => setExpandedTags(prev => ({ ...prev, [tag.id]: !prev[tag.id] }))}
                      className="w-full flex items-center justify-between p-4 bg-neutral-800/50 hover:bg-neutral-800 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${tag.color}`}></div>
                        <span className="font-medium text-neutral-200">{tag.name}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-neutral-400 bg-neutral-900 px-2 py-1 rounded-md">{tasks.length} tareas</span>
                        <span className="text-xs text-neutral-400 bg-neutral-900 px-2 py-1 rounded-md flex items-center gap-1"><Clock size={10}/> {totalMinutes}m</span>
                        {isExpanded ? <ChevronUp size={16} className="text-neutral-500"/> : <ChevronDown size={16} className="text-neutral-500"/>}
                      </div>
                    </button>
                    
                    {isExpanded && (
                      <div className="p-2 space-y-2 bg-neutral-900/20">
                        {tasks.map(task => {
                          const isOverdue = task.date < getLocalDateString();
                          const isToday = task.date === getLocalDateString();
                          const project = projects.find(p => p.id === task.projectId);
                          return (
                            <div key={task.id} className="flex items-center justify-between p-3 bg-neutral-800/50 rounded-xl border border-neutral-800/50 group">
                              <div className="flex-1 flex flex-col min-w-0 mr-3">
                                <span className={`text-sm truncate ${task.completed ? 'text-neutral-500 line-through' : 'text-neutral-200'}`}>{task.title}</span>
                                <div className="flex items-center gap-3 mt-1">
                                  {project && (
                                    <div className="flex items-center gap-1">
                                      <Folder size={10} className={project.color.replace('bg-', 'text-')} />
                                      <span className="text-[10px] text-neutral-500 truncate max-w-[80px]">{project.title}</span>
                                    </div>
                                  )}
                                  {!task.completed && (
                                    <span className={`text-[10px] flex items-center gap-1 ${isOverdue ? 'text-rose-400' : isToday ? 'text-emerald-400' : 'text-neutral-500'}`}>
                                      <Calendar size={10} /> 
                                      {isToday ? 'Hoy' : isOverdue ? getOverdueText(task.date) : task.date}
                                    </span>
                                  )}
                                  <span className="text-[10px] text-neutral-600 flex items-center gap-1">
                                    <Clock size={10} /> {Math.floor((task.timeSpent || 0) / 60)}m / {task.estimation}m
                                  </span>
                                </div>
                              </div>
                              {!task.completed && (
                                <button 
                                  onClick={() => openEditTask(task)}
                                  className="p-2 text-neutral-500 hover:text-amber-400 hover:bg-amber-400/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                                  title="Editar tarea"
                                >
                                  <Pencil size={14} />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

              {groupedTasks.length === 0 && tasksView !== 'scheduled' && (
                <div className="text-center p-8 border border-dashed border-neutral-700 rounded-2xl text-neutral-500 mt-8">
                  No hay tareas en esta vista.
                </div>
              )}
              </div>
              ) : tasksLayout === 'kanban' ? (
                <DragDropContext onDragEnd={onDragEnd}>
                  <div className="flex gap-4 overflow-x-auto pb-4 min-h-[500px] snap-x snap-mandatory hide-scrollbar -mx-5 px-5 sm:mx-0 sm:px-0">
                    {/* TODO Column */}
                    <div className="w-[85vw] sm:w-[320px] md:flex-1 md:w-auto flex-shrink-0 bg-neutral-800/30 rounded-3xl border border-neutral-700/50 flex flex-col snap-center">
                      <div className="p-4 border-b border-neutral-700/50 flex items-center justify-between">
                        <h3 className="font-semibold text-neutral-300 flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-rose-500"></div>
                          POR HACER
                        </h3>
                        <span className="text-xs font-medium text-neutral-500 bg-neutral-800 px-2 py-1 rounded-lg">
                          {tasks.filter(t => !t.completed && (!t.timeSpent || t.timeSpent === 0)).length}
                        </span>
                      </div>
                      <Droppable droppableId="TODO">
                        {(provided) => (
                          <div 
                            className="p-4 flex-1 flex flex-col gap-3 min-h-[150px]"
                            {...provided.droppableProps}
                            ref={provided.innerRef}
                          >
                            {tasks.filter(t => !t.completed && (!t.timeSpent || t.timeSpent === 0)).map((task, index) => (
                              // @ts-expect-error React 19 typing mismatch for key prop
                              <Draggable key={task.id} draggableId={task.id} index={index}>
                                {(provided, snapshot) => (
                                  <div 
                                    ref={provided.innerRef}
                                    {...provided.draggableProps}
                                    {...provided.dragHandleProps}
                                    onClick={() => { setEditingTaskId(task.id); setIsAddingTask(true); }}
                                    className={`bg-neutral-800 p-4 rounded-2xl border transition-colors cursor-grab active:cursor-grabbing group relative ${snapshot.isDragging ? 'border-emerald-500 shadow-2xl shadow-emerald-500/20 z-50' : 'border-neutral-700 hover:border-emerald-500/50'}`}
                                  >
                                    <h4 className="text-neutral-200 font-medium mb-2 pr-8">{task.title}</h4>
                                    <div className="flex items-center gap-3 text-[10px] text-neutral-500">
                                      <span className="flex items-center gap-1"><Clock size={12} /> {task.estimation}m</span>
                                      {task.tagId && tags.find(t => t.id === task.tagId) && (
                                        <span className="flex items-center gap-1">
                                          <TagIcon size={12} /> {tags.find(t => t.id === task.tagId)?.name}
                                        </span>
                                      )}
                                    </div>
                                    <div className="absolute top-3 right-3 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); handleStartTimer(task); }}
                                        className="w-8 h-8 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center hover:bg-emerald-500 hover:text-neutral-950 transition-colors"
                                        title="Iniciar Pomodoro"
                                      >
                                        <Play size={14} className="ml-0.5" />
                                      </button>
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); toggleTaskCompletion(task.id, task.completed); }}
                                        className="w-8 h-8 bg-neutral-700 text-neutral-400 rounded-full flex items-center justify-center hover:bg-emerald-500 hover:text-neutral-950 transition-colors"
                                        title="Completar"
                                      >
                                        <Check size={14} />
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </Draggable>
                            ))}
                            {provided.placeholder}
                          </div>
                        )}
                      </Droppable>
                    </div>

                    {/* IN PROGRESS Column */}
                    <div className="w-[85vw] sm:w-[320px] md:flex-1 md:w-auto flex-shrink-0 bg-neutral-800/30 rounded-3xl border border-neutral-700/50 flex flex-col snap-center">
                      <div className="p-4 border-b border-neutral-700/50 flex items-center justify-between">
                        <h3 className="font-semibold text-neutral-300 flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                          EN PROGRESO
                        </h3>
                        <span className="text-xs font-medium text-neutral-500 bg-neutral-800 px-2 py-1 rounded-lg">
                          {tasks.filter(t => !t.completed && t.timeSpent && t.timeSpent > 0).length}
                        </span>
                      </div>
                      <Droppable droppableId="IN_PROGRESS">
                        {(provided) => (
                          <div 
                            className="p-4 flex-1 flex flex-col gap-3 min-h-[150px]"
                            {...provided.droppableProps}
                            ref={provided.innerRef}
                          >
                            {tasks.filter(t => !t.completed && t.timeSpent && t.timeSpent > 0).map((task, index) => (
                              // @ts-expect-error React 19 typing mismatch for key prop
                              <Draggable key={task.id} draggableId={task.id} index={index}>
                                {(provided, snapshot) => (
                                  <div 
                                    ref={provided.innerRef}
                                    {...provided.draggableProps}
                                    {...provided.dragHandleProps}
                                    onClick={() => { setEditingTaskId(task.id); setIsAddingTask(true); }}
                                    className={`bg-neutral-800 p-4 rounded-2xl border transition-colors cursor-grab active:cursor-grabbing group relative ${snapshot.isDragging ? 'border-emerald-500 shadow-2xl shadow-emerald-500/20 z-50' : 'border-neutral-700 hover:border-emerald-500/50'}`}
                                  >
                                    <h4 className="text-neutral-200 font-medium mb-2 pr-8">{task.title}</h4>
                                    <div className="flex items-center gap-3 text-[10px] text-neutral-500">
                                      <span className="flex items-center gap-1"><Clock size={12} /> {Math.floor(task.timeSpent! / 60)}m / {task.estimation}m</span>
                                      {task.tagId && tags.find(t => t.id === task.tagId) && (
                                        <span className="flex items-center gap-1">
                                          <TagIcon size={12} /> {tags.find(t => t.id === task.tagId)?.name}
                                        </span>
                                      )}
                                    </div>
                                    <div className="absolute top-3 right-3 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); handleStartTimer(task); }}
                                        className="w-8 h-8 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center hover:bg-emerald-500 hover:text-neutral-950 transition-colors"
                                        title="Continuar"
                                      >
                                        <Play size={14} className="ml-0.5" />
                                      </button>
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); toggleTaskCompletion(task.id, task.completed); }}
                                        className="w-8 h-8 bg-neutral-700 text-neutral-400 rounded-full flex items-center justify-center hover:bg-emerald-500 hover:text-neutral-950 transition-colors"
                                        title="Completar"
                                      >
                                        <Check size={14} />
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </Draggable>
                            ))}
                            {provided.placeholder}
                          </div>
                        )}
                      </Droppable>
                    </div>

                    {/* COMPLETED Column */}
                    <div className="w-[85vw] sm:w-[320px] md:flex-1 md:w-auto flex-shrink-0 bg-neutral-800/30 rounded-3xl border border-neutral-700/50 flex flex-col snap-center">
                      <div className="p-4 border-b border-neutral-700/50 flex items-center justify-between">
                        <h3 className="font-semibold text-neutral-300 flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                          COMPLETADO
                        </h3>
                        <span className="text-xs font-medium text-neutral-500 bg-neutral-800 px-2 py-1 rounded-lg">
                          {tasks.filter(t => t.completed).length}
                        </span>
                      </div>
                      <Droppable droppableId="COMPLETED">
                        {(provided) => (
                          <div 
                            className="p-4 flex-1 flex flex-col gap-3 min-h-[150px]"
                            {...provided.droppableProps}
                            ref={provided.innerRef}
                          >
                            {tasks.filter(t => t.completed).slice(0, 10).map((task, index) => (
                              // @ts-expect-error React 19 typing mismatch for key prop
                              <Draggable key={task.id} draggableId={task.id} index={index}>
                                {(provided, snapshot) => (
                                  <div 
                                    ref={provided.innerRef}
                                    {...provided.draggableProps}
                                    {...provided.dragHandleProps}
                                    onClick={() => { setEditingTaskId(task.id); setIsAddingTask(true); }}
                                    className={`bg-neutral-800/50 p-4 rounded-2xl border transition-colors cursor-grab active:cursor-grabbing group relative ${snapshot.isDragging ? 'border-emerald-500 shadow-2xl shadow-emerald-500/20 z-50 opacity-100' : 'border-neutral-800 opacity-75 hover:opacity-100'}`}
                                  >
                                    <h4 className="text-neutral-400 font-medium mb-2 line-through pr-8">{task.title}</h4>
                                    <div className="flex items-center gap-3 text-[10px] text-neutral-600">
                                      <span className="flex items-center gap-1"><Check size={12} /> Completado</span>
                                    </div>
                                    <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); toggleTaskCompletion(task.id, task.completed); }}
                                        className="w-8 h-8 bg-neutral-700 text-neutral-400 rounded-full flex items-center justify-center hover:bg-neutral-600 hover:text-neutral-200 transition-colors"
                                        title="Deshacer"
                                      >
                                        <RotateCcw size={14} />
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </Draggable>
                            ))}
                            {provided.placeholder}
                          </div>
                        )}
                      </Droppable>
                    </div>
                  </div>
                </DragDropContext>
              ) : null}
            </div>
            
            <button 
              onClick={() => tasksView === 'scheduled' ? setIsAddingScheduledTask(true) : setIsAddingTask(true)}
              className="fixed bottom-24 right-6 w-14 h-14 bg-emerald-500 rounded-full flex items-center justify-center text-neutral-950 shadow-lg hover:bg-emerald-400 transition-colors z-30"
            >
              <Plus size={24} />
            </button>
          </div>
        )}

        {activeTab === 'ideas' && (
          <div className="w-full flex flex-col mt-4">
            <h2 className="text-lg font-semibold text-neutral-100 mb-6 flex items-center gap-2">
              <Lightbulb size={20} className="text-amber-400" />
              Tus Ideas
            </h2>

            <div className="space-y-3">
              {ideas.map(idea => (
                <div key={idea.id} className="flex flex-col gap-3 p-4 bg-neutral-800/50 rounded-2xl border border-neutral-800">
                  <p className="text-sm text-neutral-200 whitespace-pre-wrap">{idea.text}</p>
                  <div className="flex justify-end gap-2 mt-2 pt-3 border-t border-neutral-800/50">
                    <button 
                      onClick={() => handleDeleteIdea(idea.id)}
                      className="p-2 text-neutral-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                      title="Eliminar idea"
                    >
                      <Trash2 size={16} />
                    </button>
                    <button 
                      onClick={() => initiateConvertToReminder(idea)}
                      className="flex items-center gap-2 px-3 py-2 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 rounded-lg transition-colors text-xs font-medium"
                    >
                      Convertir a Aviso
                      <Bell size={14} />
                    </button>
                    <button 
                      onClick={() => initiateConvertToTask(idea)}
                      className="flex items-center gap-2 px-3 py-2 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 rounded-lg transition-colors text-xs font-medium"
                    >
                      Convertir a Tarea
                      <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
              ))}

              {ideas.length === 0 && (
                <div className="text-center p-8 border border-dashed border-neutral-700 rounded-2xl text-neutral-500 mt-8">
                  No tienes ideas guardadas. ¡Anota lo que se te ocurra mientras trabajas!
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'historial' && (
          <div className="w-full flex flex-col mt-4 pb-20">
            <h2 className="text-lg font-semibold text-neutral-100 mb-6 flex items-center gap-2">
              <History size={20} className="text-emerald-400" />
              Historial (Últimos 7 días)
            </h2>

            <div className="space-y-8">
              {historyData.map(day => (
                <div key={day.dateStr} className="flex flex-col">
                  <div className="flex justify-between items-center mb-4 border-b border-neutral-800 pb-2">
                    <h3 className="text-sm font-semibold text-neutral-300">{day.displayDate}</h3>
                    <span className="text-xs font-medium text-neutral-500 bg-neutral-800 px-2 py-1 rounded-md">
                      {day.totalMinutes} min invertidos
                    </span>
                  </div>

                  {day.groups.length === 0 ? (
                    <div className="text-center p-6 border border-dashed border-neutral-800 rounded-2xl text-neutral-600 text-sm">
                      Sin tareas
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {day.groups.map(group => {
                        const groupId = `hist-${day.dateStr}-${group.tag.id}`;
                        const isExpanded = expandedTags[groupId];
                        const groupTotalMinutes = group.tasks.reduce((sum, t) => sum + Math.floor((t.timeSpent || 0) / 60), 0);
                        return (
                          <div key={group.tag.id} className="bg-neutral-800/30 rounded-2xl border border-neutral-800 overflow-hidden">
                            <button 
                              onClick={() => setExpandedTags(prev => ({ ...prev, [groupId]: !prev[groupId] }))}
                              className="w-full flex items-center justify-between p-4 bg-neutral-800/50 hover:bg-neutral-800 transition-colors"
                            >
                              <div className="flex items-center gap-3">
                                <div className={`w-3 h-3 rounded-full ${group.tag.color}`}></div>
                                <span className="font-medium text-neutral-200">{group.tag.name}</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-xs text-neutral-400 bg-neutral-900 px-2 py-1 rounded-md">{group.tasks.length} tareas</span>
                                <span className="text-xs text-neutral-400 bg-neutral-900 px-2 py-1 rounded-md flex items-center gap-1"><Clock size={10}/> {groupTotalMinutes}m</span>
                                {isExpanded ? <ChevronUp size={16} className="text-neutral-500"/> : <ChevronDown size={16} className="text-neutral-500"/>}
                              </div>
                            </button>
                            
                            {isExpanded && (
                              <div className="p-2 space-y-2 bg-neutral-900/20">
                                {group.tasks.map(task => (
                                  <div key={task.id} className="flex items-center justify-between p-3 bg-neutral-800/50 rounded-xl border border-neutral-800/50 group">
                                    <div className="flex-1 flex flex-col min-w-0 mr-3">
                                      <span className="text-sm truncate text-neutral-500 line-through">{task.title}</span>
                                      <div className="flex items-center gap-3 mt-1">
                                        <span className="text-[10px] text-neutral-600 flex items-center gap-1">
                                          <Clock size={10} /> {Math.floor((task.timeSpent || 0) / 60)}m / {task.estimation}m
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'recordatorios' && (
          <div className="w-full flex flex-col mt-4 pb-20">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-semibold text-neutral-100 flex items-center gap-2">
                <Bell size={20} className="text-emerald-400" />
                Avisos
              </h2>
            </div>

            <div className="space-y-4">
              {reminders.filter(r => !r.completed).sort((a, b) => {
                if (a.date !== b.date) return a.date.localeCompare(b.date);
                return a.time.localeCompare(b.time);
              }).map(reminder => (
                <div key={reminder.id} className="flex flex-col p-4 bg-neutral-800/50 rounded-2xl border border-neutral-800 group">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0 pr-4">
                      <h4 className="text-sm font-medium text-neutral-200 truncate">{reminder.title}</h4>
                      {reminder.detail && (
                        <p className="text-xs text-neutral-500 mt-1 line-clamp-2">{reminder.detail}</p>
                      )}
                      <div className="flex items-center gap-3 mt-3">
                        <span className={`text-[10px] flex items-center gap-1 ${reminder.date < getLocalDateString() ? 'text-rose-400' : 'text-emerald-400'}`}>
                          <Calendar size={10} /> 
                          {reminder.date === getLocalDateString() ? 'Hoy' : reminder.date}
                        </span>
                        <span className="text-[10px] text-neutral-400 flex items-center gap-1">
                          <Clock size={10} /> {reminder.time}
                        </span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => openEditReminder(reminder)}
                        className="p-2 text-neutral-500 hover:text-amber-400 hover:bg-amber-400/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                        title="Editar aviso"
                      >
                        <Pencil size={14} />
                      </button>
                      <button 
                        onClick={() => handleCompleteReminder(reminder)}
                        className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
                        title="Completar aviso"
                      >
                        <Check size={14} className="text-emerald-400" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {reminders.filter(r => !r.completed).length === 0 && (
                <div className="text-center p-8 border border-dashed border-neutral-700 rounded-2xl text-neutral-500 mt-8">
                  No tienes avisos pendientes.
                </div>
              )}
            </div>
            
            <button 
              onClick={() => setIsAddingReminder(true)}
              className="fixed bottom-24 right-6 w-14 h-14 bg-emerald-500 rounded-full flex items-center justify-center text-neutral-950 shadow-lg hover:bg-emerald-400 transition-colors z-30"
            >
              <Plus size={24} />
            </button>
          </div>
        )}

        {activeTab === 'medicacion' && (
          <div className="w-full flex flex-col mt-4 pb-20">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-semibold text-neutral-100 flex items-center gap-2">
                <Pill size={20} className="text-blue-400" />
                Mis Medicamentos
              </h2>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {medications.map(med => (
                <div key={med.id} className="bg-neutral-800/50 border border-neutral-700 p-5 rounded-2xl relative overflow-hidden group">
                  {med.stock <= med.minStock && (
                    <div className="absolute top-0 right-0 bg-rose-500/20 text-rose-400 text-[10px] px-2 py-1 rounded-bl-xl flex items-center gap-1 font-medium">
                      <AlertTriangle size={10} /> Stock Bajo
                    </div>
                  )}
                  
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="text-lg font-semibold text-neutral-100">{med.name}</h3>
                      <p className="text-sm text-neutral-400">{med.dosage}</p>
                    </div>
                    <button 
                      onClick={() => {
                        setEditingMedicationId(med.id);
                        setNewMedName(med.name);
                        setNewMedDosage(med.dosage);
                        setNewMedStock(med.stock);
                        setNewMedMinStock(med.minStock);
                        setNewMedSchedule(med.schedule);
                        setNewMedDays(med.days);
                        setNewMedNotes(med.notes || '');
                        setIsAddingMedication(true);
                      }}
                      className="p-2 bg-neutral-700/30 hover:bg-neutral-700 rounded-lg text-neutral-400 hover:text-neutral-200 transition-colors"
                    >
                      <Pencil size={16} />
                    </button>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-neutral-400 mb-4 bg-neutral-900/30 p-3 rounded-xl">
                    <div className="flex items-center gap-2">
                      <Clock size={14} className="text-blue-400" />
                      <span className="font-medium text-neutral-300">{med.schedule.join(', ')}</span>
                    </div>
                    <div className="w-px h-4 bg-neutral-700"></div>
                    <div className="flex items-center gap-2">
                      <Calendar size={14} className="text-emerald-400" />
                      <span className="font-medium text-neutral-300">{med.days.length === 7 ? 'Todos los días' : `${med.days.length} días/sem`}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-xs text-neutral-500">Stock disponible</span>
                    <div className="flex items-center gap-2">
                      <div className={`h-2 w-24 rounded-full bg-neutral-700 overflow-hidden`}>
                        <div 
                          className={`h-full rounded-full ${med.stock <= med.minStock ? 'bg-rose-500' : 'bg-emerald-500'}`} 
                          style={{ width: `${Math.min(100, (med.stock / (med.stock + 10)) * 100)}%` }}
                        ></div>
                      </div>
                      <span className={`text-sm font-mono font-bold ${med.stock <= med.minStock ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {med.stock} u.
                      </span>
                    </div>
                  </div>
                </div>
              ))}

              {medications.length === 0 && (
                <div className="text-center p-10 border border-dashed border-neutral-700 rounded-3xl text-neutral-500 mt-4">
                  <Pill size={48} className="mx-auto mb-4 opacity-20" />
                  <p>No has agregado medicamentos aún.</p>
                  <p className="text-xs mt-2 text-neutral-600">Toca el botón + para empezar</p>
                </div>
              )}
            </div>
            
            {medicationLogs.length > 0 && (
              <div className="mt-8">
                <h3 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <History size={16} />
                  Historial Reciente
                </h3>
                <div className="space-y-2">
                  {medicationLogs.slice(0, 5).map(log => (
                    <div key={log.id} className="flex items-center justify-between p-3 bg-neutral-800/30 rounded-xl border border-neutral-800/50 text-xs">
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${log.status === 'taken' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                        <div>
                          <span className="text-neutral-300 font-medium block">{log.medicationName}</span>
                          <span className="text-neutral-500">{log.date} - {log.time}</span>
                        </div>
                      </div>
                      {log.status === 'skipped' ? (
                        <span className="text-amber-500/80 italic max-w-[100px] truncate">"{log.reason}"</span>
                      ) : (
                        <span className="text-emerald-500/80 font-medium">Tomada</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button 
              onClick={() => setIsAddingMedication(true)}
              className="fixed bottom-24 right-6 w-14 h-14 bg-blue-500 rounded-full flex items-center justify-center text-neutral-950 shadow-lg hover:bg-blue-400 transition-colors z-30"
            >
              <Plus size={24} />
            </button>
          </div>
        )}

        {activeTab === 'estadisticas' && (
          <div className="w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
              <BarChart2 className="text-emerald-400" />
              Estadísticas
            </h2>

            {/* Period Selector */}
            <div className="flex bg-neutral-800 p-1 rounded-xl mb-6">
              {(['today', 'week', 'month', 'year'] as const).map((period) => (
                <button
                  key={period}
                  onClick={() => setStatsPeriod(period)}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
                    statsPeriod === period 
                      ? 'bg-neutral-700 text-emerald-400 shadow-sm' 
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  {period === 'today' ? 'Hoy' : period === 'week' ? '7 Días' : period === 'month' ? 'Mes' : 'Año'}
                </button>
              ))}
            </div>

            {/* Productivity Chart */}
            <div className="bg-neutral-800 p-6 rounded-3xl border border-neutral-700 mb-6">
              <h3 className="text-sm font-semibold text-neutral-300 mb-4">Tiempo de Enfoque (min)</h3>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.productivityData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#404040" vertical={false} />
                    <XAxis dataKey="name" stroke="#a3a3a3" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis stroke="#a3a3a3" fontSize={10} tickLine={false} axisLine={false} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#262626', border: '1px solid #404040', borderRadius: '8px' }}
                      itemStyle={{ color: '#e5e5e5' }}
                      cursor={{ fill: '#404040', opacity: 0.4 }}
                    />
                    <Bar dataKey="minutos" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Heatmap (Productive Hours) */}
            <div className="bg-neutral-800 p-4 sm:p-6 rounded-3xl border border-neutral-700 mb-6">
              <h3 className="text-sm font-semibold text-neutral-300 mb-2 sm:mb-4">Mapa de Calor (Horas Productivas)</h3>
              <p className="text-xs text-neutral-400 mb-4 sm:mb-6">
                Intensidad de trabajo por hora y día de la semana (minutos enfocados).
              </p>
              
              <div className="w-full">
                {/* Header: Hours */}
                <div className="flex mb-1 sm:mb-2 ml-8 sm:ml-10">
                  {Array(24).fill(0).map((_, i) => (
                    <div key={i} className="flex-1 text-[8px] sm:text-[10px] text-neutral-500 text-center">
                      <span className="block sm:hidden">{i % 6 === 0 ? i : ''}</span>
                      <span className="hidden sm:block">{i % 2 === 0 ? i : ''}</span>
                    </div>
                  ))}
                </div>
                
                {/* Grid */}
                <div className="flex flex-col gap-1 sm:gap-1.5">
                  {[1, 2, 3, 4, 5, 6, 0].map((dayIndex, i) => {
                    const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
                    return (
                      <div key={dayIndex} className="flex items-center gap-1 sm:gap-2">
                        <div className="w-7 sm:w-8 text-[8px] sm:text-[10px] font-medium text-neutral-400 text-right">
                          {dayNames[dayIndex]}
                        </div>
                        <div className="flex flex-1 gap-[2px] sm:gap-1">
                          {stats.heatmapGrid[dayIndex].map((minutes, hour) => {
                            // Calculate opacity based on max value (min 0.1 for visibility if > 0)
                            const intensity = minutes > 0 
                              ? Math.max(0.2, minutes / (stats.maxHeatmapValue || 1)) 
                              : 0;
                            
                            return (
                              <div 
                                key={hour} 
                                className="flex-1 aspect-square rounded-[2px] sm:rounded-[4px] transition-colors relative group"
                                style={{ 
                                  backgroundColor: minutes > 0 ? `rgba(16, 185, 129, ${intensity})` : '#262626'
                                }}
                              >
                                {/* Tooltip */}
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10 bg-neutral-900 text-neutral-200 text-[10px] py-1 px-2 rounded border border-neutral-700 whitespace-nowrap shadow-xl">
                                  {dayNames[dayIndex]} {hour}:00 - {Math.round(minutes)} min
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
                
                {/* Legend and Most Productive Hours */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-6 pt-6 border-t border-neutral-700/50">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-neutral-400">Tus horas más productivas:</span>
                    <div className="flex flex-wrap gap-2">
                      {stats.mostProductiveHours && stats.mostProductiveHours.length > 0 ? (
                        stats.mostProductiveHours.map((h, i) => (
                          <div key={i} className="flex items-center gap-1.5 bg-neutral-900/50 border border-emerald-500/20 px-2.5 py-1 rounded-lg">
                            <Clock size={12} className="text-emerald-500" />
                            <span className="text-xs text-neutral-300 font-medium">{h.hour}:00</span>
                            <span className="text-[10px] text-neutral-500">({Math.round(h.minutes)}m)</span>
                          </div>
                        ))
                      ) : (
                        <span className="text-xs text-neutral-500">Aún no hay suficientes datos.</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-[8px] sm:text-[10px] text-neutral-500 self-end sm:self-auto">
                    <span>Menos</span>
                    <div className="flex gap-0.5 sm:gap-1">
                      <div className="w-2 h-2 sm:w-3 sm:h-3 rounded-[2px] bg-[#262626]"></div>
                      <div className="w-2 h-2 sm:w-3 sm:h-3 rounded-[2px]" style={{ backgroundColor: 'rgba(16, 185, 129, 0.2)' }}></div>
                      <div className="w-2 h-2 sm:w-3 sm:h-3 rounded-[2px]" style={{ backgroundColor: 'rgba(16, 185, 129, 0.5)' }}></div>
                      <div className="w-2 h-2 sm:w-3 sm:h-3 rounded-[2px]" style={{ backgroundColor: 'rgba(16, 185, 129, 0.8)' }}></div>
                      <div className="w-2 h-2 sm:w-3 sm:h-3 rounded-[2px]" style={{ backgroundColor: 'rgba(16, 185, 129, 1)' }}></div>
                    </div>
                    <span>Más</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Tags Distribution */}
            <div className="bg-neutral-800 p-6 rounded-3xl border border-neutral-700 mb-6">
              <h3 className="text-sm font-semibold text-neutral-300 mb-4">Tareas Completadas por Etiqueta</h3>
              <div className="flex flex-col sm:flex-row items-center gap-6">
                <div className="h-56 w-full sm:w-1/2 flex items-center justify-center relative">
                  {stats.pieData.length > 0 ? (
                    <>
                      <ResponsiveContainer width="100%" height="100%">
                        <RePieChart>
                          <Pie
                            data={stats.pieData}
                            cx="50%"
                            cy="50%"
                            innerRadius={55}
                            outerRadius={75}
                            paddingAngle={4}
                            dataKey="value"
                            stroke="none"
                          >
                            {stats.pieData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#262626', border: '1px solid #404040', borderRadius: '8px', fontSize: '12px' }}
                            itemStyle={{ color: '#e5e5e5' }}
                            formatter={(value: number) => [`${value} tareas`, 'Cantidad']}
                          />
                        </RePieChart>
                      </ResponsiveContainer>
                      {/* Total Center Label */}
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <span className="text-3xl font-bold text-white">
                          {stats.pieData.reduce((acc, curr) => acc + curr.value, 0)}
                        </span>
                        <span className="text-[10px] text-neutral-500 uppercase tracking-wider font-medium">Total</span>
                      </div>
                    </>
                  ) : (
                    <p className="text-neutral-500 text-sm">No hay datos suficientes.</p>
                  )}
                </div>

                {/* Detailed List */}
                <div className="w-full sm:w-1/2 flex flex-col gap-2 max-h-56 overflow-y-auto pr-1">
                  {stats.pieData.map((entry, index) => {
                    const total = stats.pieData.reduce((acc, curr) => acc + curr.value, 0);
                    const percentage = Math.round((entry.value / total) * 100);
                    return (
                      <div key={index} className="flex items-center justify-between p-2.5 rounded-xl bg-neutral-900/30 border border-neutral-800/50 hover:bg-neutral-700/30 transition-colors">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                          <span className="text-xs text-neutral-300 font-medium truncate">{entry.name}</span>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <span className="text-xs text-neutral-500">{entry.value}</span>
                          <span className="text-xs font-bold text-neutral-200 bg-neutral-800 px-1.5 py-0.5 rounded-md min-w-[36px] text-center">{percentage}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Estimation Accuracy */}
            <div className="bg-neutral-800 p-6 rounded-3xl border border-neutral-700 mb-6">
              <h3 className="text-sm font-semibold text-neutral-300 mb-2">Precisión de Estimaciones</h3>
              <p className="text-xs text-neutral-400 mb-4">
                Promedio de tiempo estimado vs. real, agrupado por duración de tarea.
              </p>
              
              <div className="bg-neutral-900/50 p-4 rounded-xl mb-4 border border-neutral-700/50">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-full ${Math.abs(stats.avgError) <= 5 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                    <Lightbulb size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-neutral-200">{stats.estimationFeedback}</p>
                    <p className="text-xs text-neutral-500">Basado en {stats.totalTasks} tareas completadas</p>
                  </div>
                </div>
              </div>

              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.estimationChartData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#404040" vertical={false} />
                    <XAxis dataKey="name" stroke="#a3a3a3" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis stroke="#a3a3a3" fontSize={10} tickLine={false} axisLine={false} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#262626', border: '1px solid #404040', borderRadius: '8px' }}
                      itemStyle={{ color: '#e5e5e5' }}
                      cursor={{ fill: '#404040', opacity: 0.4 }}
                      formatter={(value: number, name: string) => [`${value} min`, name === 'estimado' ? 'Prom. Estimado' : 'Prom. Real']}
                    />
                    <Legend wrapperStyle={{ fontSize: '12px', color: '#a3a3a3' }} />
                    <Bar dataKey="estimado" name="Estimado" fill="#60a5fa" radius={[4, 4, 0, 0]} barSize={20} />
                    <Bar dataKey="real" name="Real" fill="#f43f5e" radius={[4, 4, 0, 0]} barSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Discipline Metric */}
            <div className="bg-neutral-800 p-6 rounded-3xl border border-neutral-700 mb-6">
              <h3 className="text-sm font-semibold text-neutral-300 mb-4">Disciplina de Enfoque</h3>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
                <div className="flex items-center gap-4 w-full sm:w-auto">
                  <div className="relative w-20 h-20 flex items-center justify-center shrink-0">
                    <svg className="w-full h-full transform -rotate-90">
                      <circle
                        cx="40"
                        cy="40"
                        r="36"
                        stroke="#404040"
                        strokeWidth="8"
                        fill="transparent"
                      />
                      <circle
                        cx="40"
                        cy="40"
                        r="36"
                        stroke={stats.disciplineRate >= 80 ? '#10b981' : stats.disciplineRate >= 50 ? '#f59e0b' : '#f43f5e'}
                        strokeWidth="8"
                        fill="transparent"
                        strokeDasharray={226.2}
                        strokeDashoffset={226.2 - (226.2 * stats.disciplineRate) / 100}
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-xl font-bold text-white">{stats.disciplineRate}%</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-neutral-200">Tasa de Finalización</p>
                    <p className="text-xs text-neutral-500">Sesiones completadas vs. iniciadas</p>
                  </div>
                </div>
                <div className="flex flex-row sm:flex-col justify-around sm:justify-end items-center sm:items-end w-full sm:w-auto gap-4 sm:gap-1 bg-neutral-900/50 sm:bg-transparent p-3 sm:p-0 rounded-xl">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                    <span className="text-xs text-neutral-400">{stats.completedSessions} Completadas</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-rose-500"></div>
                    <span className="text-xs text-neutral-400">{stats.abandonedSessions} Abandonadas</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Medication Adherence */}
            <div className="bg-neutral-800 p-6 rounded-3xl border border-neutral-700 mb-6">
              <h3 className="text-sm font-semibold text-neutral-300 mb-4">Adherencia a Medicación</h3>
              <div className="flex items-center justify-center gap-8">
                <div className="relative w-32 h-32 flex items-center justify-center">
                   <svg className="w-full h-full" viewBox="0 0 36 36">
                      <path
                        className="text-neutral-700"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                      />
                      <path
                        className={`${stats.adherenceRate >= 80 ? 'text-emerald-500' : stats.adherenceRate >= 50 ? 'text-amber-500' : 'text-rose-500'}`}
                        strokeDasharray={`${stats.adherenceRate}, 100`}
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                      />
                   </svg>
                   <div className="absolute flex flex-col items-center">
                     <span className="text-2xl font-bold text-neutral-100">{stats.adherenceRate}%</span>
                   </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                    <span className="text-sm text-neutral-300">Tomadas</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-rose-500"></div>
                    <span className="text-sm text-neutral-300">Omitidas</span>
                  </div>
                </div>
              </div>
            </div>

          </div>
        )}

        {activeTab === 'proyectos' && (
          <div className="w-full animate-in fade-in slide-in-from-bottom-4 duration-500 pb-24">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <Folder className="text-emerald-500" />
                Proyectos
              </h2>
              <button 
                onClick={() => setIsAddingProject(true)}
                className="bg-emerald-500 hover:bg-emerald-400 text-neutral-950 p-2 rounded-xl transition-colors"
              >
                <Plus size={24} />
              </button>
            </div>

            {selectedProjectId ? (
              // Project Detail View
              <div className="space-y-6">
                {/* Back button and Header */}
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <button onClick={() => setSelectedProjectId(null)} className="p-2 bg-neutral-800 rounded-xl hover:bg-neutral-700">
                      <ArrowRight className="rotate-180" size={20} />
                    </button>
                    <div>
                      <h3 className="text-xl font-bold">{projects.find(p => p.id === selectedProjectId)?.title}</h3>
                      <p className="text-sm text-neutral-400">{projects.find(p => p.id === selectedProjectId)?.description}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      const proj = projects.find(p => p.id === selectedProjectId);
                      if (proj) openEditProject(proj);
                    }}
                    className="p-2 bg-neutral-800 text-neutral-400 hover:text-amber-400 hover:bg-amber-400/10 rounded-xl transition-colors"
                  >
                    <Pencil size={20} />
                  </button>
                </div>

                {/* Progress Bar */}
                {(() => {
                  const projectTasks = tasks.filter(t => t.projectId === selectedProjectId);
                  const completed = projectTasks.filter(t => t.completed).length;
                  const total = projectTasks.length;
                  const progress = total === 0 ? 0 : Math.round((completed / total) * 100);
                  const totalTime = projectTasks.reduce((acc, t) => acc + (t.timeSpent || 0), 0);
                  const m = Math.floor(totalTime / 60);
                  const h = Math.floor(m / 60);
                  const remainingM = m % 60;

                  return (
                    <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-2xl space-y-4">
                      <div className="flex justify-between text-sm">
                        <span className="text-neutral-400">Progreso ({completed}/{total})</span>
                        <span className="font-bold text-emerald-400">{progress}%</span>
                      </div>
                      <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${progress}%` }}></div>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-neutral-400">
                        <Clock size={16} />
                        <span>Tiempo invertido: {h}h {remainingM}m</span>
                      </div>
                    </div>
                  );
                })()}

                {/* Add Task to Project */}
                <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-2xl">
                  <h4 className="font-semibold mb-4 text-sm text-neutral-400 uppercase tracking-wider">Añadir Tarea al Proyecto</h4>
                  <form onSubmit={async (e) => {
                    e.preventDefault();
                    if (!newTaskTitle.trim() || isSubmittingTask || isSubmittingRef.current) return;
                    
                    isSubmittingRef.current = true;
                    setIsSubmittingTask(true);
                    try {
                      if (!import.meta.env.VITE_FIREBASE_PROJECT_ID) {
                        setTasks([{ 
                          id: Date.now().toString(), 
                          title: newTaskTitle, 
                          completed: false, 
                          selected: false,
                          date: '', // Empty date means backlog
                          estimation: newTaskEstimation,
                          projectId: selectedProjectId,
                          phase: newTaskPhase,
                          isBacklog: true
                        }, ...tasks]);
                      } else {
                        await addDoc(collection(db, 'tasks'), {
                          title: newTaskTitle,
                          completed: false,
                          selected: false,
                          date: '',
                          estimation: newTaskEstimation,
                          projectId: selectedProjectId,
                          phase: newTaskPhase,
                          isBacklog: true,
                          createdAt: new Date()
                        });
                      }
                      setNewTaskTitle('');
                      setNewTaskEstimation(25);
                      setNewTaskPhase('');
                    } catch (error) {
                      console.error("Error adding project task: ", error);
                    } finally {
                      setIsSubmittingTask(false);
                      isSubmittingRef.current = false;
                    }
                  }} className="space-y-3">
                    <input 
                      type="text" 
                      placeholder="Nombre de la tarea..." 
                      value={newTaskTitle}
                      onChange={e => setNewTaskTitle(e.target.value)}
                      className="w-full bg-neutral-800 text-neutral-100 px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <div className="flex gap-3">
                      <input 
                        type="text" 
                        placeholder="Fase (ej. Cimientos)" 
                        value={newTaskPhase}
                        onChange={e => setNewTaskPhase(e.target.value)}
                        className="flex-1 bg-neutral-800 text-neutral-100 px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      <input 
                        type="number" 
                        placeholder="Minutos" 
                        value={newTaskEstimation}
                        onChange={e => setNewTaskEstimation(Number(e.target.value))}
                        className="w-24 bg-neutral-800 text-neutral-100 px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      <button 
                        type="submit" 
                        disabled={!newTaskTitle.trim() || isSubmittingTask}
                        className="bg-emerald-500 text-neutral-950 px-4 py-3 rounded-xl font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isSubmittingTask ? '...' : <Plus size={20} />}
                      </button>
                    </div>
                  </form>
                </div>

                {/* Project Tasks List */}
                <div className="space-y-6">
                  {(() => {
                    const projectTasks = tasks.filter(t => t.projectId === selectedProjectId);
                    const phases = Array.from(new Set(projectTasks.map(t => t.phase || 'Sin Fase')));
                    
                    if (projectTasks.length === 0) {
                      return (
                        <div className="text-center py-12 bg-neutral-900/50 rounded-3xl border border-neutral-800/50 border-dashed">
                          <Folder size={48} className="mx-auto text-neutral-700 mb-4" />
                          <p className="text-neutral-400">Aún no hay tareas en este proyecto.</p>
                        </div>
                      );
                    }

                    return phases.map(phase => {
                      const phaseTasks = projectTasks.filter(t => (t.phase || 'Sin Fase') === phase);
                      return (
                        <div key={phase} className="space-y-3">
                          <h4 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-emerald-500/50"></div>
                            {phase}
                            <span className="text-xs text-neutral-600 normal-case font-normal ml-2">({phaseTasks.length})</span>
                          </h4>
                          <div className="space-y-2">
                            {phaseTasks.map(task => (
                              <div key={task.id} className={`p-4 rounded-2xl border transition-colors group ${task.completed ? 'bg-neutral-900/50 border-neutral-800/50 opacity-50' : 'bg-neutral-900 border-neutral-800 hover:border-neutral-700'}`}>
                                <div className="flex justify-between items-start">
                                  <div className="flex-1 pr-4">
                                    <h5 className={`font-medium mb-1 ${task.completed ? 'line-through text-neutral-500' : 'text-neutral-200'}`}>{task.title}</h5>
                                    <div className="flex flex-wrap items-center gap-3">
                                      <span className="text-[10px] text-neutral-500 flex items-center gap-1 bg-neutral-800 px-2 py-1 rounded-md">
                                        <Clock size={10} /> {task.estimation}m
                                      </span>
                                      {task.timeSpent !== undefined && task.timeSpent > 0 && (
                                        <span className="text-[10px] text-neutral-500 flex items-center gap-1 bg-neutral-800 px-2 py-1 rounded-md">
                                          <Play size={10} /> {Math.floor(task.timeSpent / 60)}m invertidos
                                        </span>
                                      )}
                                      {task.completed && (
                                        <span className="text-[10px] text-emerald-500/80 flex items-center gap-1 bg-emerald-500/10 px-2 py-1 rounded-md">
                                          <Check size={10} /> Completada
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {!task.completed && (
                                      <button 
                                        onClick={() => openEditTask(task)}
                                        className="p-2 text-neutral-500 hover:text-amber-400 hover:bg-amber-400/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                                        title="Editar tarea"
                                      >
                                        <Pencil size={16} />
                                      </button>
                                    )}
                                    {!task.completed && task.isBacklog && (
                                      <button 
                                        onClick={async () => {
                                          const today = getLocalDateString();
                                          if (!import.meta.env.VITE_FIREBASE_PROJECT_ID) {
                                            setTasks(tasks.map(t => t.id === task.id ? { ...t, isBacklog: false, date: today } : t));
                                          } else {
                                            await updateDoc(doc(db, 'tasks', task.id), { isBacklog: false, date: today });
                                          }
                                        }}
                                        className="text-xs bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 px-3 py-2 rounded-lg transition-colors font-medium flex items-center gap-1"
                                      >
                                        <Calendar size={12} /> Mover a Hoy
                                      </button>
                                    )}
                                    {!task.completed && !task.isBacklog && (
                                      <span className="text-xs bg-blue-500/20 text-blue-400 px-3 py-2 rounded-lg font-medium flex items-center gap-1">
                                        <Check size={12} /> En Hoy
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            ) : (
              // Projects List
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {projects.map(project => {
                  const projectTasks = tasks.filter(t => t.projectId === project.id);
                  const completed = projectTasks.filter(t => t.completed).length;
                  const total = projectTasks.length;
                  const progress = total === 0 ? 0 : Math.round((completed / total) * 100);

                  return (
                    <div 
                      key={project.id} 
                      onClick={() => setSelectedProjectId(project.id)}
                      className="bg-neutral-900 border border-neutral-800 p-5 rounded-2xl cursor-pointer hover:border-neutral-700 transition-colors group"
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-4 h-4 rounded-full ${project.color}`}></div>
                          <h3 className="font-bold text-lg group-hover:text-emerald-400 transition-colors">{project.title}</h3>
                        </div>
                        <ChevronRight className="text-neutral-600 group-hover:text-neutral-400" />
                      </div>
                      <p className="text-sm text-neutral-400 mb-6 line-clamp-2">{project.description}</p>
                      
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs text-neutral-500">
                          <span>Progreso</span>
                          <span>{progress}%</span>
                        </div>
                        <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                          <div className={`h-full ${project.color} transition-all duration-500`} style={{ width: `${progress}%` }}></div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {projects.length === 0 && (
                  <div className="col-span-full text-center py-12 bg-neutral-900/50 rounded-3xl border border-neutral-800 border-dashed">
                    <Folder size={48} className="mx-auto text-neutral-700 mb-4" />
                    <p className="text-neutral-400 font-medium">No hay proyectos activos</p>
                    <p className="text-sm text-neutral-500 mt-1">Crea uno para organizar tareas complejas</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

      </main>

      {/* Modal: Edit Daily Goal */}
      {isEditingGoal && (
        <div className="fixed inset-0 z-50 bg-neutral-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-lg font-semibold text-neutral-100 mb-4">Meta Diaria (Minutos)</h3>
            <input
              type="number"
              value={tempGoal}
              onChange={(e) => setTempGoal(e.target.value)}
              className="w-full bg-neutral-800 text-neutral-100 px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 mb-6"
              placeholder="Ej: 120"
              autoFocus
            />
            <div className="flex gap-3">
              <button
                onClick={() => setIsEditingGoal(false)}
                className="flex-1 py-3 rounded-xl font-medium text-neutral-400 bg-neutral-800 hover:bg-neutral-700 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  const val = parseInt(tempGoal, 10);
                  if (!isNaN(val) && val > 0) {
                    setDailyGoalMinutes(val);
                    localStorage.setItem('dailyGoalMinutes', val.toString());
                  }
                  setIsEditingGoal(false);
                }}
                className="flex-1 py-3 rounded-xl font-medium text-neutral-950 bg-emerald-500 hover:bg-emerald-400 transition-colors"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Add/Edit Project */}
      {isAddingProject && (
        <div className="fixed inset-0 z-50 bg-neutral-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-lg font-semibold text-neutral-100 mb-4">{editingProjectId ? 'Editar Proyecto' : 'Nuevo Proyecto'}</h3>
            <form onSubmit={async (e) => {
              e.preventDefault();
              if (!newProjectTitle.trim() || isSubmittingProject || isSubmittingRef.current) return;
              
              isSubmittingRef.current = true;
              setIsSubmittingProject(true);
              try {
                if (!import.meta.env.VITE_FIREBASE_PROJECT_ID) {
                  if (editingProjectId) {
                    setProjects(projects.map(p => p.id === editingProjectId ? { ...p, title: newProjectTitle, description: newProjectDescription, color: newProjectColor } : p));
                  } else {
                    setProjects([{
                      id: Date.now().toString(),
                      title: newProjectTitle,
                      description: newProjectDescription,
                      color: newProjectColor
                    }, ...projects]);
                  }
                } else {
                  if (editingProjectId) {
                    await updateDoc(doc(db, 'projects', editingProjectId), {
                      title: newProjectTitle,
                      description: newProjectDescription,
                      color: newProjectColor
                    });
                  } else {
                    await addDoc(collection(db, 'projects'), {
                      title: newProjectTitle,
                      description: newProjectDescription,
                      color: newProjectColor,
                      createdAt: new Date()
                    });
                  }
                }
                setNewProjectTitle('');
                setNewProjectDescription('');
                setNewProjectColor(PREDEFINED_COLORS[0]);
                setEditingProjectId(null);
                setIsAddingProject(false);
              } catch (error) {
                console.error("Error saving project: ", error);
              } finally {
                setIsSubmittingProject(false);
                isSubmittingRef.current = false;
              }
            }} className="space-y-4">
              <input
                type="text"
                value={newProjectTitle}
                onChange={(e) => setNewProjectTitle(e.target.value)}
                className="w-full bg-neutral-800 text-neutral-100 px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="Nombre del proyecto"
                autoFocus
              />
              <textarea
                value={newProjectDescription}
                onChange={(e) => setNewProjectDescription(e.target.value)}
                className="w-full bg-neutral-800 text-neutral-100 px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none h-24"
                placeholder="Descripción (opcional)"
              />
              <div>
                <label className="block text-sm font-medium text-neutral-400 mb-2">Color</label>
                <div className="flex flex-wrap gap-2">
                  {PREDEFINED_COLORS.map(color => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setNewProjectColor(color)}
                      className={`w-8 h-8 rounded-full ${color} ${newProjectColor === color ? 'ring-2 ring-white ring-offset-2 ring-offset-neutral-900' : ''}`}
                    />
                  ))}
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                {editingProjectId && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (!import.meta.env.VITE_FIREBASE_PROJECT_ID) {
                        setProjects(projects.filter(p => p.id !== editingProjectId));
                        // Also delete associated tasks? Let's just delete the project for now
                      } else {
                        try {
                          await deleteDoc(doc(db, 'projects', editingProjectId));
                        } catch (error) {
                          console.error("Error deleting project: ", error);
                        }
                      }
                      setEditingProjectId(null);
                      setIsAddingProject(false);
                      setSelectedProjectId(null);
                    }}
                    className="px-4 py-3 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 rounded-xl font-medium transition-colors border border-rose-500/20"
                    title="Eliminar proyecto"
                  >
                    <Trash2 size={20} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingProject(false);
                    setEditingProjectId(null);
                    setNewProjectTitle('');
                    setNewProjectDescription('');
                    setNewProjectColor(PREDEFINED_COLORS[0]);
                  }}
                  className="flex-1 py-3 rounded-xl font-medium text-neutral-400 bg-neutral-800 hover:bg-neutral-700 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!newProjectTitle.trim() || isSubmittingProject}
                  className="flex-1 py-3 rounded-xl font-medium text-neutral-950 bg-emerald-500 hover:bg-emerald-400 transition-colors disabled:opacity-50"
                >
                  {isSubmittingProject ? 'Guardando...' : (editingProjectId ? 'Guardar' : 'Crear')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Navegación Inferior */}
      <nav className="fixed bottom-0 w-full flex border-t border-neutral-800 bg-neutral-950/80 backdrop-blur-md pb-safe z-40">
        <button 
          onClick={() => setActiveTab('inicio')} 
          className={`flex-1 py-4 flex flex-col items-center gap-1 transition-colors ${activeTab === 'inicio' ? 'text-emerald-400' : 'text-neutral-500 hover:text-neutral-300'}`}
        >
          <Play size={20} />
          <span className="text-[10px] font-medium uppercase tracking-wider">Inicio</span>
        </button>
        <button 
          onClick={() => setActiveTab('tareas')} 
          className={`flex-1 py-4 flex flex-col items-center gap-1 transition-colors ${activeTab === 'tareas' ? 'text-emerald-400' : 'text-neutral-500 hover:text-neutral-300'}`}
        >
          <CheckSquare size={20} />
          <span className="text-[10px] font-medium uppercase tracking-wider">Tareas</span>
        </button>
        <button 
          onClick={() => setActiveTab('ideas')} 
          className={`flex-1 py-4 flex flex-col items-center gap-1 transition-colors ${activeTab === 'ideas' ? 'text-emerald-400' : 'text-neutral-500 hover:text-neutral-300'}`}
        >
          <Lightbulb size={20} />
          <span className="text-[10px] font-medium uppercase tracking-wider">Ideas</span>
        </button>
        <button 
          onClick={() => setActiveTab('historial')} 
          className={`flex-1 py-4 flex flex-col items-center gap-1 transition-colors ${activeTab === 'historial' ? 'text-emerald-400' : 'text-neutral-500 hover:text-neutral-300'}`}
        >
          <History size={20} />
          <span className="text-[10px] font-medium uppercase tracking-wider">Historial</span>
        </button>
        <button 
          onClick={() => setActiveTab('recordatorios')} 
          className={`flex-1 py-4 flex flex-col items-center gap-1 transition-colors ${activeTab === 'recordatorios' ? 'text-emerald-400' : 'text-neutral-500 hover:text-neutral-300'}`}
        >
          <Bell size={20} />
          <span className="text-[10px] font-medium uppercase tracking-wider">Avisos</span>
        </button>
        <button 
          onClick={() => setActiveTab('medicacion')} 
          className={`flex-1 py-4 flex flex-col items-center gap-1 transition-colors ${activeTab === 'medicacion' ? 'text-emerald-400' : 'text-neutral-500 hover:text-neutral-300'}`}
        >
          <Pill size={20} />
          <span className="text-[10px] font-medium uppercase tracking-wider">Meds</span>
        </button>
        <button 
          onClick={() => setActiveTab('estadisticas')} 
          className={`flex-1 py-4 flex flex-col items-center gap-1 transition-colors ${activeTab === 'estadisticas' ? 'text-emerald-400' : 'text-neutral-500 hover:text-neutral-300'}`}
        >
          <BarChart2 size={20} />
          <span className="text-[10px] font-medium uppercase tracking-wider">Stats</span>
        </button>
        <button 
          onClick={() => setActiveTab('proyectos')} 
          className={`flex-1 py-4 flex flex-col items-center gap-1 transition-colors ${activeTab === 'proyectos' ? 'text-emerald-400' : 'text-neutral-500 hover:text-neutral-300'}`}
        >
          <Folder size={20} />
          <span className="text-[10px] font-medium uppercase tracking-wider">Proyectos</span>
        </button>
      </nav>
    </div>
  );
}
