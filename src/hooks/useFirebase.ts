import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { Task, Tag, Idea, Reminder, Medication, MedicationLog, Project, FocusLog, ScheduledTask } from '../types';
import { getLocalDateString } from '../utils/dateUtils';
import { PREDEFINED_COLORS } from '../constants';

export const useFirebase = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [medicationLogs, setMedicationLogs] = useState<MedicationLog[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [focusLogs, setFocusLogs] = useState<FocusLog[]>([]);
  const [scheduledTasks, setScheduledTasks] = useState<ScheduledTask[]>([]);

  // Fetch Focus Logs
  useEffect(() => {
    if (!import.meta.env.VITE_FIREBASE_PROJECT_ID) {
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

  // Fetch Tasks, Tags, Ideas, Reminders, Medications, Projects
  useEffect(() => {
    if (!import.meta.env.VITE_FIREBASE_PROJECT_ID) {
      console.warn("Firebase no está configurado. Usando datos locales.");
      const today = getLocalDateString();
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

    // Fetch Medication Logs
    const qMedLogs = query(collection(db, 'medicationLogs'), orderBy('date', 'desc'));
    const unsubscribeMedLogs = onSnapshot(qMedLogs, (snapshot) => {
      const logsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as MedicationLog[];
      setMedicationLogs(logsData);
    });

    // Fetch Projects
    const qProjects = query(collection(db, 'projects'), orderBy('createdAt', 'desc'));
    const unsubscribeProjects = onSnapshot(qProjects, (snapshot) => {
      const projectsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Project[];
      setProjects(projectsData);
    });

    // Fetch Scheduled Tasks
    const qScheduledTasks = query(collection(db, 'scheduledTasks'), orderBy('createdAt', 'desc'));
    const unsubscribeScheduledTasks = onSnapshot(qScheduledTasks, (snapshot) => {
      const scheduledTasksData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ScheduledTask[];
      setScheduledTasks(scheduledTasksData);
    });

    return () => {
      unsubscribeTasks();
      unsubscribeTags();
      unsubscribeIdeas();
      unsubscribeReminders();
      unsubscribeMeds();
      unsubscribeMedLogs();
      unsubscribeProjects();
      unsubscribeScheduledTasks();
    };
  }, []);

  return {
    tasks, setTasks,
    tags, setTags,
    ideas, setIdeas,
    reminders, setReminders,
    medications, setMedications,
    medicationLogs, setMedicationLogs,
    projects, setProjects,
    focusLogs, setFocusLogs,
    scheduledTasks, setScheduledTasks
  };
};
