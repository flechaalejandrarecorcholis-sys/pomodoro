/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { Play, Square, Plus, Minus, RotateCcw, Bell, CheckSquare, Lightbulb, Check, X, Tags, Calendar, Clock, ChevronRight, ChevronDown, ChevronUp, Trash2, ArrowRight, Pencil, History, BellRing, AlignLeft, Pill, AlertTriangle, BarChart2, PieChart, Lock, Maximize2, Headphones, Volume2, Volume1 } from 'lucide-react';
import { collection, addDoc, onSnapshot, query, orderBy, doc, updateDoc, deleteDoc, increment, where } from 'firebase/firestore';
import { db } from './firebase';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart as RePieChart, Pie, Cell, LineChart, Line } from 'recharts';

type Tag = { id: string; name: string; color: string };
type Idea = { id: string; text: string; createdAt?: any };
type Task = { 
  id: string; 
  title: string; 
  completed: boolean; 
  selected: boolean; 
  createdAt?: any;
  date: string; // YYYY-MM-DD
  estimation: number; // Minutos
  timeSpent?: number; // Segundos
  completedAt?: string; // YYYY-MM-DD
  tagId?: string;
};

type Reminder = {
  id: string;
  title: string;
  detail: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  completed: boolean;
  createdAt?: any;
};

type Medication = {
  id: string;
  name: string;
  dosage: string;
  stock: number;
  minStock: number;
  schedule: string[]; // ["08:00", "20:00"]
  days: number[]; // [0, 1, 2, 3, 4, 5, 6] (0 = Sunday)
  notes?: string;
  createdAt?: any;
};

type MedicationLog = {
  id: string;
  medicationId: string;
  medicationName: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm (scheduled time)
  takenAt: string; // ISO string
  status: 'taken' | 'skipped';
  reason?: string;
};

type Mode = 'work' | 'shortBreak' | 'longBreak';

const PREDEFINED_COLORS = [
  'bg-emerald-500', 'bg-blue-500', 'bg-violet-500', 'bg-amber-500', 'bg-rose-500',
  'bg-cyan-500', 'bg-fuchsia-500', 'bg-lime-500', 'bg-orange-500', 'bg-indigo-500'
];

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

  const [activeTab, setActiveTab] = useState<'inicio' | 'tareas' | 'ideas' | 'historial' | 'recordatorios' | 'medicacion' | 'estadisticas'>('inicio');
  const [statsPeriod, setStatsPeriod] = useState<'today' | 'week' | 'month' | 'year'>('week');
  
  // Timer State
  const [mode, setMode] = useState<Mode>(() => {
    const saved = localStorage.getItem('pomodoroState');
    return saved ? JSON.parse(saved).mode : 'work';
  });
  const [timeLeft, setTimeLeft] = useState(() => {
    const saved = localStorage.getItem('pomodoroState');
    if (saved) {
      const state = JSON.parse(saved);
      if (state.isRunning) {
        const elapsed = Math.round((Date.now() - state.lastUpdated) / 1000);
        const newTime = state.timeLeft - elapsed;
        return newTime > 0 ? newTime : 0;
      }
      return state.timeLeft;
    }
    return 25 * 60;
  });
  const [totalTime, setTotalTime] = useState(() => {
    const saved = localStorage.getItem('pomodoroState');
    return saved ? JSON.parse(saved).totalTime : 25 * 60;
  });
  const [isRunning, setIsRunning] = useState(() => {
    const saved = localStorage.getItem('pomodoroState');
    if (saved) {
      const state = JSON.parse(saved);
      if (state.isRunning) {
        const elapsed = Math.round((Date.now() - state.lastUpdated) / 1000);
        return state.timeLeft - elapsed > 0;
      }
    }
    return false;
  });
  const [pomodorosCompleted, setPomodorosCompleted] = useState(() => {
    const saved = localStorage.getItem('pomodoroState');
    return saved ? JSON.parse(saved).pomodorosCompleted : 0;
  });

  // Persist Timer State
  useEffect(() => {
    localStorage.setItem('pomodoroState', JSON.stringify({
      mode,
      timeLeft,
      totalTime,
      isRunning,
      pomodorosCompleted,
      lastUpdated: Date.now()
    }));
  }, [mode, timeLeft, totalTime, isRunning, pomodorosCompleted]);

  // Focus Logs State (for Discipline Metric)
  type FocusLog = {
    id: string;
    date: string; // ISO string
    status: 'completed' | 'abandoned';
    duration: number; // seconds
  };
  const [focusLogs, setFocusLogs] = useState<FocusLog[]>([]);

  useEffect(() => {
    if (!import.meta.env.VITE_FIREBASE_PROJECT_ID) {
      // Local storage fallback
      const savedLogs = localStorage.getItem('focusLogs');
      if (savedLogs) setFocusLogs(JSON.parse(savedLogs));
    } else {
      const q = query(collection(db, 'focusLogs'), orderBy('date', 'desc'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const logsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FocusLog));
        setFocusLogs(logsData);
      });
      return () => unsubscribe();
    }
  }, []);

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
    const today = new Date().toISOString().split('T')[0];
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
    const today = new Date().toISOString().split('T')[0];
    if (focusedMinutesToday >= dailyGoalMinutes && lastActiveDate !== today) {
      const newStreak = (lastActiveDate === new Date(Date.now() - 86400000).toISOString().split('T')[0]) ? streak + 1 : 1;
      setStreak(newStreak);
      setLastActiveDate(today);
      localStorage.setItem('pomodoroStreak', JSON.stringify({ streak: newStreak, lastActiveDate: today }));
      // Optional: Celebration confetti or sound
    }
  }, [focusedMinutesToday, dailyGoalMinutes, lastActiveDate, streak]);

  // Tasks State
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDate, setNewTaskDate] = useState(new Date().toISOString().split('T')[0]);
  const [newTaskEstimation, setNewTaskEstimation] = useState(25);
  const [newTaskTagId, setNewTaskTagId] = useState<string>('');
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  
  // Tags State
  const [tags, setTags] = useState<Tag[]>([]);
  const [isManagingTags, setIsManagingTags] = useState(false);
  const [newTagName, setNewTagName] = useState('');

  // Ideas State
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [isAddingIdea, setIsAddingIdea] = useState(false);
  const [newIdeaText, setNewIdeaText] = useState('');
  const [convertingIdeaId, setConvertingIdeaId] = useState<string | null>(null);
  const [convertingToReminderIdeaId, setConvertingToReminderIdeaId] = useState<string | null>(null);

  // Reminders State
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [activeReminderQueue, setActiveReminderQueue] = useState<Reminder[]>([]);
  const [isAddingReminder, setIsAddingReminder] = useState(false);
  const [editingReminderId, setEditingReminderId] = useState<string | null>(null);
  const [newReminderTitle, setNewReminderTitle] = useState('');
  const [newReminderDetail, setNewReminderDetail] = useState('');
  const [newReminderDate, setNewReminderDate] = useState(new Date().toISOString().split('T')[0]);
  const [newReminderTime, setNewReminderTime] = useState('');

  // Medication State
  const [medications, setMedications] = useState<Medication[]>([]);
  const [medicationLogs, setMedicationLogs] = useState<MedicationLog[]>([]);
  const triggeredMedicationsRef = useRef<Set<string>>(new Set());
  const [isAddingMedication, setIsAddingMedication] = useState(false);
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
  const [tasksView, setTasksView] = useState<'all' | 'future'>('all');
  const [expandedTags, setExpandedTags] = useState<Record<string, boolean>>({});
  
  // Fetch Tasks and Tags from Firestore
  useEffect(() => {
    if (!import.meta.env.VITE_FIREBASE_PROJECT_ID) {
      console.warn("Firebase no está configurado. Usando datos locales.");
      const today = new Date().toISOString().split('T')[0];
      setTasks([
        { id: '1', title: 'Configurar Firebase Firestore (Local)', completed: false, selected: true, date: today, estimation: 1, tagId: 't1' },
        { id: '2', title: 'Implementar lógica del temporizador (Local)', completed: false, selected: false, date: today, estimation: 2, tagId: 't2' }
      ]);
      setTags([
        { id: 't1', name: 'Desarrollo', color: PREDEFINED_COLORS[0] },
        { id: 't2', name: 'Diseño', color: PREDEFINED_COLORS[1] }
      ]);
      return;
    }

    // Fetch Tasks
    const qTasks = query(collection(db, 'tasks'), orderBy('createdAt', 'desc'));
    const unsubscribeTasks = onSnapshot(qTasks, (snapshot) => {
      const tasksData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Task[];
      setTasks(tasksData);
    });

    // Fetch Tags
    const qTags = query(collection(db, 'tags'));
    const unsubscribeTags = onSnapshot(qTags, (snapshot) => {
      const tagsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Tag[];
      setTags(tagsData);
    });

    // Fetch Ideas
    const qIdeas = query(collection(db, 'ideas'), orderBy('createdAt', 'desc'));
    const unsubscribeIdeas = onSnapshot(qIdeas, (snapshot) => {
      const ideasData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Idea[];
      setIdeas(ideasData);
    });

    // Fetch Reminders
    const qReminders = query(collection(db, 'reminders'), orderBy('createdAt', 'desc'));
    const unsubscribeReminders = onSnapshot(qReminders, (snapshot) => {
      const remindersData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Reminder[];
      setReminders(remindersData);
    });

    // Fetch Medications
    const qMeds = query(collection(db, 'medications'), orderBy('name', 'asc'));
    const unsubscribeMeds = onSnapshot(qMeds, (snapshot) => {
      const medsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Medication[];
      setMedications(medsData);
    });

    // Fetch Medication Logs (Last 30 days ideally, but all for now)
    const qMedLogs = query(collection(db, 'medicationLogs'), orderBy('date', 'desc'));
    const unsubscribeMedLogs = onSnapshot(qMedLogs, (snapshot) => {
      const logsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as MedicationLog[];
      setMedicationLogs(logsData);
    });

    return () => {
      unsubscribeTasks();
      unsubscribeTags();
      unsubscribeIdeas();
      unsubscribeReminders();
      unsubscribeMeds();
      unsubscribeMedLogs();
    };
  }, []);

  // Request Notification Permission
  useEffect(() => {
    if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
      Notification.requestPermission();
    }
  }, []);

  const playAlertSound = () => {
    // Usar un sonido de sistema simple usando la API de Audio
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // Nota A5
      oscillator.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.5); // Baja a A4
      
      gainNode.gain.setValueAtTime(1, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
      
      oscillator.start(audioCtx.currentTime);
      oscillator.stop(audioCtx.currentTime + 0.5);
    } catch (e) {
      console.error("Audio API not supported", e);
    }
  };

  // Reminder Checker
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      const currentDate = now.toISOString().split('T')[0];
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
    if (!newIdeaText.trim()) return;

    if (!import.meta.env.VITE_FIREBASE_PROJECT_ID) {
      setIdeas([{ id: Date.now().toString(), text: newIdeaText }, ...ideas]);
      setNewIdeaText('');
      setIsAddingIdea(false);
      return;
    }

    try {
      await addDoc(collection(db, 'ideas'), {
        text: newIdeaText,
        createdAt: new Date()
      });
      setNewIdeaText('');
      setIsAddingIdea(false);
    } catch (error) {
      console.error("Error adding idea: ", error);
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
    if (!newMedName.trim()) return;

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

    if (!import.meta.env.VITE_FIREBASE_PROJECT_ID) {
      if (editingMedicationId) {
        setMedications(meds => meds.map(m => m.id === editingMedicationId ? { ...m, ...medData, id: m.id } : m));
      } else {
        setMedications([...medications, { ...medData, id: Date.now().toString() }]);
      }
    } else {
      try {
        if (editingMedicationId) {
          await updateDoc(doc(db, 'medications', editingMedicationId), medData);
        } else {
          await addDoc(collection(db, 'medications'), medData);
        }
      } catch (error) {
        console.error("Error saving medication: ", error);
      }
    }
    resetMedForm();
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
    const today = new Date().toISOString().split('T')[0];
    
    // Calculate tomorrow for reminders
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

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
    const today = new Date().toISOString().split('T')[0];
    
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
    const dateStr = today.toISOString().split('T')[0];

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

  const getOverdueText = (taskDate: string) => {
    const todayStr = new Date().toISOString().split('T')[0];
    if (taskDate >= todayStr) return '';
    const today = new Date(todayStr);
    const tDate = new Date(taskDate);
    const diffTime = today.getTime() - tDate.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    return diffDays === 1 ? 'Atrasada 1 día' : `Atrasada ${diffDays} días`;
  };

  const openEditTask = (task: Task) => {
    setNewTaskTitle(task.title);
    setNewTaskDate(task.date);
    setNewTaskEstimation(task.estimation);
    setNewTaskTagId(task.tagId || '');
    setEditingTaskId(task.id);
    setIsAddingTask(true);
  };

  const handleAddTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTagName.trim() || tags.length >= 10) return;

    // Find first available color
    const usedColors = tags.map(t => t.color);
    const availableColor = PREDEFINED_COLORS.find(c => !usedColors.includes(c)) || PREDEFINED_COLORS[0];

    if (!import.meta.env.VITE_FIREBASE_PROJECT_ID) {
      setTags([...tags, { id: Date.now().toString(), name: newTagName, color: availableColor }]);
      setNewTagName('');
      return;
    }

    try {
      await addDoc(collection(db, 'tags'), {
        name: newTagName,
        color: availableColor,
        createdAt: new Date()
      });
      setNewTagName('');
    } catch (error) {
      console.error("Error adding tag: ", error);
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
    if (!newTaskTitle.trim() || !newTaskTagId) return;

    if (!import.meta.env.VITE_FIREBASE_PROJECT_ID) {
      // Fallback local si Firebase no está configurado
      if (editingTaskId) {
        setTasks(tasks.map(t => t.id === editingTaskId ? { ...t, title: newTaskTitle, date: newTaskDate, estimation: newTaskEstimation, tagId: newTaskTagId } : t));
      } else {
        setTasks([{ 
          id: Date.now().toString(), 
          title: newTaskTitle, 
          completed: false, 
          selected: false,
          date: newTaskDate,
          estimation: newTaskEstimation,
          tagId: newTaskTagId
        }, ...tasks]);
      }
      resetTaskForm();
      return;
    }

    try {
      if (editingTaskId) {
        await updateDoc(doc(db, 'tasks', editingTaskId), {
          title: newTaskTitle,
          date: newTaskDate,
          estimation: newTaskEstimation,
          tagId: newTaskTagId
        });
      } else {
        await addDoc(collection(db, 'tasks'), {
          title: newTaskTitle,
          completed: false,
          selected: false,
          date: newTaskDate,
          estimation: newTaskEstimation,
          tagId: newTaskTagId,
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
    }
  };

  const resetTaskForm = () => {
    setNewTaskTitle('');
    setNewTaskDate(new Date().toISOString().split('T')[0]);
    setNewTaskEstimation(25);
    setNewTaskTagId('');
    setIsAddingTask(false);
    setConvertingIdeaId(null);
    setEditingTaskId(null);
  };

  const resetReminderForm = () => {
    setNewReminderTitle('');
    setNewReminderDetail('');
    setNewReminderDate(new Date().toISOString().split('T')[0]);
    setNewReminderTime('');
    setIsAddingReminder(false);
    setEditingReminderId(null);
    setConvertingToReminderIdeaId(null);
  };

  const handleSaveReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newReminderTitle.trim() || !newReminderDate || !newReminderTime) return;

    const today = new Date().toISOString().split('T')[0];
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    if (newReminderDate < today || (newReminderDate === today && newReminderTime <= currentTime)) {
      alert("La fecha y hora del recordatorio no pueden estar en el pasado.");
      return;
    }

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
    const newDate = now.toISOString().split('T')[0];
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
    setNewReminderDate(new Date().toISOString().split('T')[0]);
    setNewReminderTime('');
    setIsAddingReminder(true);
  };

  const toggleTaskSelection = async (id: string, currentSelected: boolean) => {
    if (!import.meta.env.VITE_FIREBASE_PROJECT_ID) {
      setTasks(tasks.map(t => t.id === id ? { ...t, selected: !t.selected } : t));
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

  useEffect(() => {
    selectedPendingTasksRef.current = selectedPendingTasks;
  }, [selectedPendingTasks]);

  const flushTimeUpdates = async () => {
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
          timeSpent: increment(time)
        });
      }));
    } catch (error) {
      console.error("Error flushing time updates", error);
    }
  };

  // Timer Logic
  const expectedEndTimeRef = useRef<number | null>(null);
  const workerRef = useRef<Worker | null>(null);

  const sendNotification = async (title: string, body: string) => {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready;
        if (registration && 'showNotification' in registration) {
          await registration.showNotification(title, {
            body,
            icon: '/icon.svg',
            vibrate: [200, 100, 200],
            tag: 'zentask-timer',
            renotify: true
          });
          return;
        }
      }
      new Notification(title, { body, icon: '/icon.svg' });
    } catch (e) {
      new Notification(title, { body, icon: '/icon.svg' });
    }
  };

  useEffect(() => {
    // Create Web Worker for background timer
    const workerCode = `
      let intervalId = null;
      let expectedEndTime = null;

      self.onmessage = function(e) {
        if (e.data.command === 'start') {
          expectedEndTime = e.data.expectedEndTime;
          if (intervalId) clearInterval(intervalId);
          intervalId = setInterval(() => {
            const now = Date.now();
            const remaining = Math.max(0, Math.round((expectedEndTime - now) / 1000));
            self.postMessage({ remaining });
            if (remaining === 0) {
              clearInterval(intervalId);
            }
          }, 1000);
        } else if (e.data.command === 'stop') {
          if (intervalId) clearInterval(intervalId);
        }
      };
    `;
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(blob);
    workerRef.current = new Worker(workerUrl);

    return () => {
      workerRef.current?.terminate();
      URL.revokeObjectURL(workerUrl);
    };
  }, []);

  useEffect(() => {
    if (isRunning && timeLeft > 0) {
      if (!expectedEndTimeRef.current) {
        expectedEndTimeRef.current = Date.now() + timeLeft * 1000;
      }

      if (workerRef.current) {
        workerRef.current.onmessage = (e) => {
          const remaining = e.data.remaining;
          
          setTimeLeft((prev) => {
            const secondsPassed = prev - remaining;
            
            if (secondsPassed > 0 && mode === 'work') {
              selectedPendingTasksRef.current.forEach(t => {
                pendingTimeUpdates.current[t.id] = (pendingTimeUpdates.current[t.id] || 0) + secondsPassed;
              });
              // Flush every 10 seconds
              if (remaining % 10 === 0 || remaining === 0) {
                flushTimeUpdates();
              }
            }

            if (remaining === 0) {
              workerRef.current?.postMessage({ command: 'stop' });
              setIsRunning(false);
              expectedEndTimeRef.current = null;
              if (mode === 'work') flushTimeUpdates();
              playAlertSound();
              sendNotification(
                mode === 'work' ? '¡Enfoque Terminado!' : '¡Descanso Terminado!',
                mode === 'work' ? 'Es hora de tomar un descanso.' : 'Es hora de volver al trabajo.'
              );
              handleTimerComplete();
            }

            return remaining;
          });
        };

        workerRef.current.postMessage({ 
          command: 'start', 
          expectedEndTime: expectedEndTimeRef.current 
        });
      }
    } else {
      expectedEndTimeRef.current = null;
      workerRef.current?.postMessage({ command: 'stop' });
    }

    return () => {
      workerRef.current?.postMessage({ command: 'stop' });
    };
  }, [isRunning, mode]);

  const toggleTimer = () => {
    if (isRunning) return; // Prevent pausing/stopping via this button

    if (mode === 'work' && selectedPendingTasks.length === 0) {
      // No inicia si no hay tareas seleccionadas
      return;
    }
    
    setIsRunning(true);
    if (mode === 'work') {
      setIsZenMode(true);
    }
  };



  const handleTimerComplete = () => {
    if (mode === 'work') {
      // Log completed session
      addFocusLog('completed', totalTime);
      
      if (selectedPendingTasksRef.current.length > 0) {
        setTasksToReview([...selectedPendingTasksRef.current]);
        setIsReviewing(true);
        setReviewIndex(0);
      } else {
        startBreak();
      }
    } else {
      // Break finished, back to work
      setMode('work');
      setTimeLeft(25 * 60);
      setTotalTime(25 * 60);
      // setIsRunning(true); // NO iniciar automáticamente el trabajo
    }
  };

  const startBreak = () => {
    const newCount = pomodorosCompleted + 1;
    setPomodorosCompleted(newCount);
    
    if (newCount % 4 === 0) {
      setMode('longBreak');
      setTimeLeft(15 * 60);
      setTotalTime(15 * 60);
    } else {
      setMode('shortBreak');
      setTimeLeft(5 * 60);
      setTotalTime(5 * 60);
    }
    // setIsRunning(true); // NO iniciar automáticamente el descanso
  };

  const handleReviewAnswer = async (completed: boolean) => {
    const currentTask = tasksToReview[reviewIndex];
    
    if (completed) {
      const todayStr = new Date().toISOString().split('T')[0];
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
      resetTimer();
    }
  };

  const confirmReset = (completedTask: boolean = false) => {
    resetTimer(completedTask);
    setIsConfirmingReset(false);
  };

  const resetTimer = (completedTask: boolean = false) => {
    if (completedTask) {
      const todayStr = new Date().toISOString().split('T')[0];
      
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
      setTimeLeft(25 * 60);
      setTotalTime(25 * 60);
    } else if (mode === 'shortBreak') {
      setTimeLeft(5 * 60);
      setTotalTime(5 * 60);
    } else {
      setTimeLeft(15 * 60);
      setTotalTime(15 * 60);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const progress = (timeLeft / totalTime) * 100;
  const isWork = mode === 'work';

  const getGroupedTasks = () => {
    const filteredTasks = tasks.filter(t => {
      const today = new Date().toISOString().split('T')[0];
      if (t.completed) return false;
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
      const dateStr = d.toISOString().split('T')[0];
      
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

  const getStatisticsData = () => {
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

    const startDateStr = startDate.toISOString().split('T')[0];

    // Filter tasks based on period
    const periodTasks = tasks.filter(t => {
      if (!t.completed || !t.completedAt) return false;
      return t.completedAt >= startDateStr;
    });

    // 1. Productivity (Minutes per day/month)
    const productivityData = [];
    if (statsPeriod === 'today') {
       // Hourly breakdown? Or just total for today
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
        const dateStr = currentDate.toISOString().split('T')[0];
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
      totalTasks: periodTasks.length,
      completionRate: periodTasks.length > 0 ? 100 : 0 // Simplified for completed tasks only
    };
  };

  const stats = getStatisticsData();
  const COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#f43f5e', '#06b6d4'];

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
                disabled={!newTagName.trim() || tags.length >= 10}
                className="px-4 rounded-xl bg-emerald-500 text-neutral-950 font-semibold hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
              >
                <Plus size={20} />
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

              <div>
                <label className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-1 block px-1">Etiqueta *</label>
                <select
                  value={newTaskTagId}
                  onChange={(e) => setNewTaskTagId(e.target.value)}
                  className="w-full bg-neutral-900 border border-neutral-700 rounded-xl p-4 text-neutral-100 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all appearance-none"
                  required
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

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-1 block px-1">Fecha</label>
                  <input
                    type="date"
                    value={newTaskDate}
                    min={new Date().toISOString().split('T')[0]}
                    onChange={(e) => setNewTaskDate(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-xl p-4 text-neutral-100 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all [color-scheme:dark]"
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
                  disabled={!newTaskTitle.trim() || !newTaskTagId}
                  className="flex-1 py-4 mt-2 rounded-xl bg-emerald-500 text-neutral-950 font-semibold hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {editingTaskId ? 'Guardar Cambios' : 'Guardar Tarea'}
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
                disabled={!newIdeaText.trim()}
                className="w-full py-4 mt-2 rounded-xl bg-amber-500 text-neutral-950 font-semibold hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Guardar Idea
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
                    min={new Date().toISOString().split('T')[0]}
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
                  disabled={!newReminderTitle.trim() || !newReminderDate || !newReminderTime}
                  className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-400 text-neutral-950 rounded-xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {editingReminderId ? 'Guardar Cambios' : 'Crear Recordatorio'}
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
                  disabled={!newMedName.trim() || newMedSchedule.length === 0 || newMedDays.length === 0}
                  className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-400 text-neutral-950 rounded-xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {editingMedicationId ? 'Guardar Cambios' : 'Guardar Medicamento'}
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

      <main className="flex-1 p-5 overflow-y-auto flex flex-col items-center max-w-md mx-auto w-full pb-24">
        
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
                onClick={toggleTimer}
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
                    const today = new Date().toISOString().split('T')[0];
                    return homeView === 'today' ? t.date === today : t.date < today;
                  })
                  .sort((a, b) => {
                    if (a.date !== b.date) return a.date.localeCompare(b.date);
                    return a.estimation - b.estimation;
                  })
                  .slice(0, 5) // Max 5 tasks
                  .map(task => {
                    const tag = tags.find(t => t.id === task.tagId);
                    const isOverdue = task.date < new Date().toISOString().split('T')[0];
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
                            {tag && (
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
                
                {tasks.filter(t => !t.completed && (homeView === 'today' ? t.date === new Date().toISOString().split('T')[0] : t.date < new Date().toISOString().split('T')[0])).length === 0 && (
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
                {reminders.filter(r => !r.completed && r.date === new Date().toISOString().split('T')[0]).length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                      <Bell size={16} className="text-emerald-400" />
                      Avisos de Hoy
                    </h3>
                    <div className="space-y-3">
                      {reminders
                        .filter(r => !r.completed && r.date === new Date().toISOString().split('T')[0])
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
              </div>
              
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setIsManagingTags(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-xl text-neutral-300 transition-colors text-xs font-medium"
                >
                  <Tags size={14} />
                  Etiquetas
                </button>
              </div>
            </div>

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
                          const isOverdue = task.date < new Date().toISOString().split('T')[0];
                          const isToday = task.date === new Date().toISOString().split('T')[0];
                          return (
                            <div key={task.id} className="flex items-center justify-between p-3 bg-neutral-800/50 rounded-xl border border-neutral-800/50 group">
                              <div className="flex-1 flex flex-col min-w-0 mr-3">
                                <span className={`text-sm truncate ${task.completed ? 'text-neutral-500 line-through' : 'text-neutral-200'}`}>{task.title}</span>
                                <div className="flex items-center gap-3 mt-1">
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

              {groupedTasks.length === 0 && (
                <div className="text-center p-8 border border-dashed border-neutral-700 rounded-2xl text-neutral-500 mt-8">
                  No hay tareas en esta vista.
                </div>
              )}
            </div>
            
            <button 
              onClick={() => setIsAddingTask(true)}
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
                        <span className={`text-[10px] flex items-center gap-1 ${reminder.date < new Date().toISOString().split('T')[0] ? 'text-rose-400' : 'text-emerald-400'}`}>
                          <Calendar size={10} /> 
                          {reminder.date === new Date().toISOString().split('T')[0] ? 'Hoy' : reminder.date}
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
                    <Bar dataKey="minutos" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
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
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="relative w-20 h-20 flex items-center justify-center">
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
                <div className="text-right space-y-1">
                  <div className="flex items-center justify-end gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                    <span className="text-xs text-neutral-400">{stats.completedSessions} Completadas</span>
                  </div>
                  <div className="flex items-center justify-end gap-2">
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
      </nav>
    </div>
  );
}
