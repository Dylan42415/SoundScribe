import React, { createContext, useContext, useState } from 'react';

const translations: Record<string, Record<string, string>> = {
  en: {
    "sidebar.dashboard": "Dashboard",
    "sidebar.recordings": "Recordings",
    "sidebar.settings": "Settings",
    "sidebar.logout": "Log Out",
    "sidebar.language": "Language",
    "dashboard.hello": "Hello, Learner! 👋",
    "dashboard.subtitle": "Ready to turn some audio into knowledge today?",
    "dashboard.viewAll": "View All Recordings",
    "dashboard.studyTime": "Study Time Saved",
    "dashboard.totalRecordings": "Total Recordings",
    "dashboard.recentActivity": "Recent Activity",
    "dashboard.noRecordings": "No recordings yet",
    "dashboard.startRecording": "Start recording to see your content here.",
    "dashboard.weeklyActivity": "Weekly Activity",
    "dashboard.didYouKnow": "Did you know?",
    "dashboard.didYouKnowText": "Using the \"Dyslexia Friendly\" font in settings can increase reading speed by up to 20% for some users.",
  },
  es: {
    "sidebar.dashboard": "Panel",
    "sidebar.recordings": "Grabaciones",
    "sidebar.settings": "Ajustes",
    "sidebar.logout": "Cerrar sesión",
    "sidebar.language": "Idioma",
    "dashboard.hello": "¡Hola, Estudiante! 👋",
    "dashboard.subtitle": "¿Listo para convertir audio en conocimiento hoy?",
    "dashboard.viewAll": "Ver Todas las Grabaciones",
    "dashboard.studyTime": "Tiempo Ahorrado",
    "dashboard.totalRecordings": "Grabaciones Totales",
    "dashboard.recentActivity": "Actividad Reciente",
    "dashboard.noRecordings": "Aún no hay grabaciones",
    "dashboard.startRecording": "Comienza a grabar para ver tu contenido aquí.",
    "dashboard.weeklyActivity": "Actividad Semanal",
    "dashboard.didYouKnow": "¿Sabías que?",
    "dashboard.didYouKnowText": "Usar la fuente \"Amigable para Dislexia\" en los ajustes puede aumentar la velocidad de lectura hasta en un 20% para algunos usuarios.",
  },
  fr: {
    "sidebar.dashboard": "Tableau de bord",
    "sidebar.recordings": "Enregistrements",
    "sidebar.settings": "Paramètres",
    "sidebar.logout": "Se déconnecter",
    "sidebar.language": "Langue",
    "dashboard.hello": "Bonjour, Apprenant! 👋",
    "dashboard.subtitle": "Prêt à transformer de l'audio en connaissances aujourd'hui?",
    "dashboard.viewAll": "Voir tous les enregistrements",
    "dashboard.studyTime": "Temps d'étude économisé",
    "dashboard.totalRecordings": "Enregistrements Totaux",
    "dashboard.recentActivity": "Activité récente",
    "dashboard.noRecordings": "Pas d'enregistrements",
    "dashboard.startRecording": "Commencez à enregistrer pour voir votre contenu ici.",
    "dashboard.weeklyActivity": "Activité Hebdomadaire",
    "dashboard.didYouKnow": "Le saviez-vous ?",
    "dashboard.didYouKnowText": "L'utilisation de la police \"Dyslexie\" dans les paramètres peut augmenter la vitesse de lecture jusqu'à 20% pour certains utilisateurs.",
  },
  de: {
    "sidebar.dashboard": "Dashboard",
    "sidebar.recordings": "Aufnahmen",
    "sidebar.settings": "Einstellungen",
    "sidebar.logout": "Abmelden",
    "sidebar.language": "Sprache",
    "dashboard.hello": "Hallo, Lernender! 👋",
    "dashboard.subtitle": "Bereit, heute Audio in Wissen zu verwandeln?",
    "dashboard.viewAll": "Alle Aufnahmen anzeigen",
    "dashboard.studyTime": "Gesparte Lernzeit",
    "dashboard.totalRecordings": "Gesamte Aufnahmen",
    "dashboard.recentActivity": "Letzte Aktivität",
    "dashboard.noRecordings": "Noch keine Aufnahmen",
    "dashboard.startRecording": "Starten Sie eine Aufnahme, um Ihren Inhalt hier zu sehen.",
    "dashboard.weeklyActivity": "Wöchentliche Aktivität",
    "dashboard.didYouKnow": "Wussten Sie schon?",
    "dashboard.didYouKnowText": "Die Verwendung der Schriftart \"Legasthenie-freundlich\" in den Einstellungen kann die Lesegeschwindigkeit für einige Benutzer um bis zu 20% erhöhen.",
  },
  zh: {
    "sidebar.dashboard": "仪表板",
    "sidebar.recordings": "录音",
    "sidebar.settings": "设置",
    "sidebar.logout": "登出",
    "sidebar.language": "语言",
    "dashboard.hello": "你好，学习者！👋",
    "dashboard.subtitle": "准备好将音频转化为知识了吗？",
    "dashboard.viewAll": "查看所有录音",
    "dashboard.studyTime": "节省的学习时间",
    "dashboard.totalRecordings": "录音总数",
    "dashboard.recentActivity": "最近活动",
    "dashboard.noRecordings": "暂无录音",
    "dashboard.startRecording": "开始录音以在此处查看您的内容。",
    "dashboard.weeklyActivity": "每周活动",
    "dashboard.didYouKnow": "你知道吗？",
    "dashboard.didYouKnowText": "在设置中使用“阅读障碍友好”字体可以将某些用户的阅读速度提高多达 20%。",
  }
};

type LanguageContextType = {
  language: string;
  setLanguage: (lang: string) => void;
  t: (key: string) => string;
};

const LanguageContext = createContext<LanguageContextType>({
  language: 'en',
  setLanguage: () => {},
  t: (key) => key,
});

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState(localStorage.getItem('app_language') || 'en');

  const setLanguage = (lang: string) => {
    localStorage.setItem('app_language', lang);
    setLanguageState(lang);
  };

  const t = (key: string) => {
    return translations[language]?.[key] || translations['en']?.[key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useTranslation = () => useContext(LanguageContext);
