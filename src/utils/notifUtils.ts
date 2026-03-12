export const sendNotification = async (title: string, body: string) => {
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
        } as any);
        return;
      }
    }
    new Notification(title, { body, icon: '/icon.svg' });
  } catch (e) {
    new Notification(title, { body, icon: '/icon.svg' });
  }
};
