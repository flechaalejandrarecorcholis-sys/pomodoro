import { useState, useEffect, useRef, useCallback } from 'react';
import { Mode } from '../types';
import { playAlertSound } from '../utils/audioUtils';
import { sendNotification } from '../utils/notifUtils';

interface UseTimerProps {
  hasSelectedTasks: boolean;
  totalEstimation: number;
  onTimerComplete: (mode: Mode) => void;
  onTick: (elapsedSeconds: number, remaining: number) => void;
}

export const useTimer = ({ hasSelectedTasks, totalEstimation, onTimerComplete, onTick }: UseTimerProps) => {
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

  const expectedEndTimeRef = useRef<number | null>(null);
  const workerRef = useRef<Worker | null>(null);

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
    workerRef.current = new Worker(URL.createObjectURL(blob));

    workerRef.current.onmessage = (e) => {
      const remaining = e.data.remaining;
      setTimeLeft(remaining);
      
      // Notify parent of tick (for time tracking)
      if (mode === 'work') {
        onTick(1, remaining);
      }

      if (remaining === 0) {
        setIsRunning(false);
        playAlertSound();
        
        if (mode === 'work') {
          sendNotification('¡Tiempo de Enfoque Terminado!', 'Es hora de tomar un descanso.');
          onTimerComplete('work');
        } else {
          sendNotification('¡Descanso Terminado!', 'Es hora de volver al trabajo.');
          onTimerComplete(mode);
        }
      }
    };

    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
      }
    };
  }, [mode, pomodorosCompleted, hasSelectedTasks, totalEstimation, onTimerComplete, onTick]);

  // Sync worker when isRunning changes
  useEffect(() => {
    if (isRunning) {
      expectedEndTimeRef.current = Date.now() + timeLeft * 1000;
      workerRef.current?.postMessage({ 
        command: 'start', 
        expectedEndTime: expectedEndTimeRef.current 
      });
    } else {
      workerRef.current?.postMessage({ command: 'stop' });
    }
  }, [isRunning]);

  const toggleTimer = () => {
    setIsRunning(!isRunning);
  };

  const resetTimer = () => {
    setIsRunning(false);
    if (mode === 'work') {
      const newTime = hasSelectedTasks ? totalEstimation * 60 : 25 * 60;
      setTimeLeft(newTime);
      setTotalTime(newTime);
    } else if (mode === 'shortBreak') {
      setTimeLeft(5 * 60);
      setTotalTime(5 * 60);
    } else {
      setTimeLeft(15 * 60);
      setTotalTime(15 * 60);
    }
  };

  const startBreak = useCallback(() => {
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
  }, [pomodorosCompleted, setPomodorosCompleted, setMode, setTimeLeft, setTotalTime]);

  const skipBreak = () => {
    setIsRunning(false);
    setMode('work');
    const newTime = hasSelectedTasks ? totalEstimation * 60 : 25 * 60;
    setTimeLeft(newTime);
    setTotalTime(newTime);
  };

  const progress = totalTime > 0 ? (timeLeft / totalTime) * 100 : 0;
  const isWork = mode === 'work';

  return {
    mode,
    setMode,
    timeLeft,
    setTimeLeft,
    totalTime,
    setTotalTime,
    isRunning,
    setIsRunning,
    pomodorosCompleted,
    setPomodorosCompleted,
    toggleTimer,
    resetTimer,
    startBreak,
    skipBreak,
    progress,
    isWork
  };
};
