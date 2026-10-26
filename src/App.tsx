/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  MonitoredLink,
  CustomCategory,
  StudentProfile,
  PipBoySettings,
  PipBoyNotification
} from './types/pipboy';
import {
  INITIAL_STUDENT_LINKS,
  INITIAL_CATEGORIES,
  checkMonitoredLink,
  generateInitialWrittenContent
} from './utils/siteChecker';
import { pipAudio } from './utils/audio';
import { sendNativeNotification } from './utils/notifications';
import { PipBoyShell, ActiveTab } from './components/PipBoyShell';
import { TabMonitor } from './components/TabMonitor';
import { TabSchedule } from './components/TabSchedule';
import { TabScience } from './components/TabScience';
import { TabGrades } from './components/TabGrades';
import { TabLibrary } from './components/TabLibrary';
import { TabProfile } from './components/TabProfile';
import { TabGuide } from './components/TabGuide';
import { clearAllLibraryData } from './utils/libraryStore';

const STORAGE_KEYS = {
  LINKS: 'pipboy_clean_links_v4',
  CATEGORIES: 'pipboy_clean_categories_v4',
  PROFILE: 'pipboy_clean_profile_v4',
  SETTINGS: 'pipboy_clean_settings_v4',
  NOTIFS: 'pipboy_clean_notifs_v4'
};

const EMPTY_PROFILE: StudentProfile = {
  fullName: '',
  studentId: '',
  university: '',
  faculty: 'Гуманитарный факультет',
  group: '',
  course: 1,
  email: '',
  notes: ''
};

// Default theme is now lilac with full color switcher available
const DEFAULT_SETTINGS: PipBoySettings = {
  colorTheme: 'lilac',
  audioEnabled: true,
  scanlines: true,
  crtFlicker: false,
  autoCheckGlobal: true,
  globalInterval: 45,
  pushNotificationsAllowed: true,
  aiDataMode: 'local'
};

export default function App() {
  const initialTab: ActiveTab = (() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('import_schedule') || window.location.hash.includes('import_schedule=')) {
        return 'SCHEDULE';
      }
      const view = params.get('view');
      if (view === 'schedule') return 'SCHEDULE';
      if (view === 'grades') return 'GRADES';
      if (view === 'library') return 'LIBRARY';
      if (view === 'science') return 'SCIENCE';
      if (view === 'profile') return 'PROFILE';
      if (view === 'guide') return 'GUIDE';
    }
    return 'MONITOR';
  })();

  const [activeTab, setActiveTab] = useState<ActiveTab>(initialTab);
  const [isScanningAll, setIsScanningAll] = useState(false);

  // Clean initial states: empty links so user inputs their own data!
  const [links, setLinks] = useState<MonitoredLink[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.LINKS);
      if (saved) return JSON.parse(saved);
    } catch {}
    return INITIAL_STUDENT_LINKS; // []
  });

  const [categories, setCategories] = useState<CustomCategory[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.CATEGORIES);
      if (saved) return JSON.parse(saved);
    } catch {}
    return INITIAL_CATEGORIES;
  });

  const [profile, setProfile] = useState<StudentProfile>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.PROFILE);
      if (saved) return JSON.parse(saved);
    } catch {}
    return EMPTY_PROFILE;
  });

  const [settings, setSettings] = useState<PipBoySettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (saved) {
        const parsed = JSON.parse(saved);
        return { ...DEFAULT_SETTINGS, ...parsed, aiDataMode: parsed.aiDataMode || 'local' };
      }
    } catch {}
    return DEFAULT_SETTINGS;
  });

  const [notifications, setNotifications] = useState<PipBoyNotification[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.NOTIFS);
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });

  // Save changes to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.LINKS, JSON.stringify(links));
    } catch {}
  }, [links]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(categories));
    } catch {}
  }, [categories]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(profile));
    } catch {}
  }, [profile]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
      if (settings.aiDataMode) {
        localStorage.setItem('pipboy_ai_data_mode_v1', settings.aiDataMode);
      }
    } catch {}
  }, [settings]);

  useEffect(() => {
    const handler = (e: Event) => {
      const custom = e as CustomEvent<'local' | 'web'>;
      if (custom.detail === 'local' || custom.detail === 'web') {
        setSettings((prev) => (prev.aiDataMode === custom.detail ? prev : { ...prev, aiDataMode: custom.detail }));
      }
    };
    window.addEventListener('pipboy-ai-mode-change', handler);
    return () => window.removeEventListener('pipboy-ai-mode-change', handler);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.NOTIFS, JSON.stringify(notifications));
    } catch {}
  }, [notifications]);

  // Audio mute state sync
  useEffect(() => {
    pipAudio.isMuted = !settings.audioEnabled;
  }, [settings.audioEnabled]);

  // Handle Notifications Dispatch
  const addNotification = useCallback((notif: Omit<PipBoyNotification, 'id' | 'timestamp' | 'read'>) => {
    const newEntry: PipBoyNotification = {
      ...notif,
      id: 'notif-' + Date.now() + Math.random().toString(36).substring(2, 6),
      timestamp: Date.now(),
      read: false
    };

    setNotifications((prev) => [newEntry, ...prev].slice(0, 30));

    // Send native OS push notification
    sendNativeNotification({
      title: `⚡ ${notif.title}`,
      body: notif.message,
      icon: '/icon-192.svg'
    });
  }, []);

  // Scan single link (real HTML written data verification without hallucinations)
  const handleScanSingle = useCallback(
    async (linkId: string): Promise<{ hasChanged: boolean; message: string } | undefined> => {
      const target = links.find((l) => l.id === linkId);
      if (!target) return undefined;

      // Set syncing status
      setLinks((prev) =>
        prev.map((l) => (l.id === linkId ? { ...l, status: 'SYNCING' } : l))
      );

      const { updatedLink, hasChanged, diffSummary, checkReportMessage } = await checkMonitoredLink(target);

      setLinks((prev) => prev.map((l) => (l.id === linkId ? updatedLink : l)));

      if (hasChanged && diffSummary) {
        if (target.notificationEnabled) {
          addNotification({
            title: `ОБНОВЛЕНИЕ: ${target.title}`,
            message: diffSummary,
            type: 'UPDATE',
            linkId: target.id,
            sourceUrl: target.url
          });
        }
        pipAudio.playAlert();
      } else {
        pipAudio.playSuccess();
      }

      return {
        hasChanged,
        message: checkReportMessage
      };
    },
    [links, addNotification]
  );

  // Scan all links
  const handleScanAll = useCallback(async () => {
    if (isScanningAll || links.length === 0) return;
    setIsScanningAll(true);

    const activeLinks = links.filter((l) => l.autoRefresh);

    for (const link of activeLinks) {
      await handleScanSingle(link.id);
    }

    pipAudio.playSuccess();
    setIsScanningAll(false);
  }, [isScanningAll, links, handleScanSingle]);

  // Background Auto-polling loop
  useEffect(() => {
    if (!settings.autoCheckGlobal || links.length === 0) return;

    const intervalMs = Math.max(15, settings.globalInterval) * 1000;
    const intervalTimer = setInterval(() => {
      const refreshable = links.filter((l) => l.autoRefresh);
      if (refreshable.length === 0) return;

      const oldest = [...refreshable].sort((a, b) => (a.lastChecked || 0) - (b.lastChecked || 0))[0];
      if (oldest) {
        handleScanSingle(oldest.id);
      }
    }, intervalMs);

    return () => clearInterval(intervalTimer);
  }, [settings.autoCheckGlobal, settings.globalInterval, links, handleScanSingle]);

  // Add Link & immediately index real baseline written content from URL
  const handleAddLink = (
    newLinkData: Omit<MonitoredLink, 'id' | 'lastChecked' | 'lastUpdated' | 'status' | 'currentHash' | 'diffHistory'>
  ) => {
    const id = 'link-' + Date.now();
    const createdLink: MonitoredLink = {
      ...newLinkData,
      id,
      lastChecked: Date.now(),
      lastUpdated: Date.now(),
      status: 'SYNCING',
      currentHash: 'init-hash',
      diffHistory: [],
      writtenContent:
        newLinkData.writtenContent ||
        generateInitialWrittenContent(newLinkData.url, newLinkData.title, newLinkData.category)
    };

    setLinks((prev) => [createdLink, ...prev]);

    addNotification({
      title: 'РЕСУРС ПОДКЛЮЧЕН К МОНИТОРИНГУ',
      message: `Ссылка «${createdLink.title}» добавлена в систему отслеживания письменных данных.`,
      type: 'INFO',
      linkId: id,
      sourceUrl: createdLink.url
    });

    // Perform initial non-hallucinating baseline snapshot of the site's written content
    checkMonitoredLink(createdLink).then(({ updatedLink }) => {
      setLinks((prev) => prev.map((l) => (l.id === id ? updatedLink : l)));
    });
  };

  // Delete Link
  const handleDeleteLink = (id: string) => {
    setLinks((prev) => prev.filter((l) => l.id !== id));
  };

  // Toggle notification
  const handleToggleNotification = (id: string) => {
    setLinks((prev) =>
      prev.map((l) => (l.id === id ? { ...l, notificationEnabled: !l.notificationEnabled } : l))
    );
  };

  // Update Link Tags
  const handleUpdateLinkTags = (id: string, tags: string[]) => {
    setLinks((prev) =>
      prev.map((l) => (l.id === id ? { ...l, tags } : l))
    );
  };

  // Update Link Category
  const handleUpdateLinkCategory = (id: string, category: string) => {
    setLinks((prev) =>
      prev.map((l) => (l.id === id ? { ...l, category } : l))
    );
  };

  // Update Link Polling Interval
  const handleUpdateLinkInterval = (id: string, intervalSec: number) => {
    setLinks((prev) =>
      prev.map((l) => (l.id === id ? { ...l, checkIntervalSec: intervalSec } : l))
    );
  };

  // Category management
  const handleAddCategory = (cat: CustomCategory) => {
    setCategories((prev) => [...prev, cat]);
  };

  const handleRenameCategory = (id: string, newName: string) => {
    setCategories((prev) =>
      prev.map((c) => (c.id === id ? { ...c, name: newName } : c))
    );
  };

  const handleDeleteCategory = (id: string) => {
    setLinks((prev) =>
      prev.map((l) => (l.category === id ? { ...l, category: 'GENERAL' } : l))
    );
    setCategories((prev) => prev.filter((c) => c.id !== id));
  };

  const handleClearNotifications = () => {
    pipAudio.playClick();
    setNotifications([]);
  };

  // Complete reset to clean state
  const handleResetAllData = () => {
    pipAudio.playClick();
    localStorage.removeItem(STORAGE_KEYS.LINKS);
    localStorage.removeItem(STORAGE_KEYS.CATEGORIES);
    localStorage.removeItem(STORAGE_KEYS.PROFILE);
    localStorage.removeItem(STORAGE_KEYS.NOTIFS);
    localStorage.removeItem('pipboy_schedule_classes_v1');
    localStorage.removeItem('pipboy_grades_subjects_v1');
    clearAllLibraryData();
    setLinks([]);
    setCategories(INITIAL_CATEGORIES);
    setProfile(EMPTY_PROFILE);
    setNotifications([]);
  };

  const changedCount = links.filter((l) => l.status === 'CHANGED').length;

  return (
    <PipBoyShell
      activeTab={activeTab}
      onSelectTab={setActiveTab}
      settings={settings}
      onUpdateSettings={(partial) => setSettings((prev) => ({ ...prev, ...partial }))}
      profile={profile}
      linksCount={links.length}
      changedCount={changedCount}
      notifications={notifications}
      onClearNotifications={handleClearNotifications}
      onResetAllData={handleResetAllData}
    >
      {activeTab === 'MONITOR' && (
        <TabMonitor
          links={links}
          categories={categories}
          isScanningAll={isScanningAll}
          onScanAll={handleScanAll}
          onScanSingle={handleScanSingle}
          onAddLink={handleAddLink}
          onDeleteLink={handleDeleteLink}
          onToggleNotification={handleToggleNotification}
          onUpdateLinkTags={handleUpdateLinkTags}
          onUpdateLinkCategory={handleUpdateLinkCategory}
          onUpdateLinkInterval={handleUpdateLinkInterval}
          onAddCategory={handleAddCategory}
          onRenameCategory={handleRenameCategory}
          onDeleteCategory={handleDeleteCategory}
        />
      )}

      {activeTab === 'SCHEDULE' && (
        <TabSchedule
          onSendNotification={(title, message) => {
            addNotification({
              title,
              message,
              type: 'INFO'
            });
          }}
        />
      )}

      {activeTab === 'GRADES' && <TabGrades links={links} />}

      {activeTab === 'LIBRARY' && (
        <TabLibrary
          onSendNotification={(title, message) => {
            addNotification({
              title,
              message,
              type: 'INFO'
            });
          }}
        />
      )}

      {activeTab === 'SCIENCE' && (
        <TabScience
          links={links}
          categories={categories}
          onAddCategory={handleAddCategory}
          onAddScientificLink={handleAddLink}
        />
      )}

      {activeTab === 'PROFILE' && (
        <TabProfile
          profile={profile}
          onUpdateProfile={setProfile}
        />
      )}

      {activeTab === 'GUIDE' && (
        <TabGuide
          onGoToMonitor={() => setActiveTab('MONITOR')}
          onGoToScience={() => setActiveTab('SCIENCE')}
        />
      )}
    </PipBoyShell>
  );
}
