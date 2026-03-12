export type Tag = { id: string; name: string; color: string };
export type Idea = { id: string; text: string; createdAt?: any };
export type Project = {
  id: string;
  title: string;
  description: string;
  color: string;
  createdAt?: any;
};

export type Task = { 
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
  projectId?: string;
  phase?: string;
  isBacklog?: boolean;
};

export type Reminder = {
  id: string;
  title: string;
  detail: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  completed: boolean;
  createdAt?: any;
};

export type Medication = {
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

export type MedicationLog = {
  id: string;
  medicationId: string;
  medicationName: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm (scheduled time)
  takenAt: string; // ISO string
  status: 'taken' | 'skipped';
  reason?: string;
};

export type FocusLog = {
  id: string;
  date: string; // ISO string
  status: 'completed' | 'abandoned';
  duration: number; // seconds
};

export type ScheduledTask = {
  id: string;
  title: string;
  estimation: number; // Minutos
  tagId?: string;
  projectId?: string;
  recurrence: {
    type: 'daily' | 'weekly' | 'monthly';
    daysOfWeek?: number[]; // [0, 1, 2, 3, 4, 5, 6] (0 = Sunday)
    dayOfMonth?: number; // 1-31
  };
  lastPromptedDate?: string; // YYYY-MM-DD
  createdAt?: any;
};

export type Mode = 'work' | 'shortBreak' | 'longBreak';
