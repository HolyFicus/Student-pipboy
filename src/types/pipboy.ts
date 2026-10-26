/**
 * Pip-Boy Student Edition Type Definitions
 * Professional Student Workstation (Content & Diff Analysis)
 */

export interface CustomCategory {
  id: string;
  name: string;
  icon?: string;
  isDefault?: boolean;
}

export type LinkCategory = string;

export type LinkStatus = 'ONLINE' | 'CHANGED' | 'SYNCING' | 'ALERT' | 'ERROR';

export interface ContentChangeRecord {
  id: string;
  timestamp: number;
  section: string;
  summary: string;
  previousText?: string;
  newText: string;
  changeType?: 'ADDED' | 'MODIFIED' | 'REMOVED' | 'UPDATE';
  diffSnippet?: string;
  isRead: boolean;
}

export type DiffEntry = ContentChangeRecord;

export interface SiteWrittenSection {
  title: string;
  summary: string;
  itemsCount?: number;
}

export interface SiteWrittenContent {
  fullTitle: string;
  overview: string;
  detectedSections: SiteWrittenSection[];
  keyTopics: string[];
  lastPublishedText: string;
  wordCount: number;
  readingTimeMin: number;
  authorOrSource?: string;
  contentStatus: 'АКТУАЛЬНО' | 'ОБНОВЛЕНО' | 'ТРЕБУЕТ ВНИМАНИЯ';
}

export interface SiteTelemetry {
  latencyMs?: number;
  latencyHistory?: { timestamp: number; ping: number }[];
  uptimePercent?: number;
  httpStatus?: number;
  protocol?: string;
  sslValid?: boolean;
  sslIssuer?: string;
  serverType?: string;
  pageSizeKb?: number;
  contentBreakdown?: {
    html: number;
    scripts: number;
    media: number;
    text: number;
  };
  metaTitle?: string;
  metaDescription?: string;
  detectedSections?: string[];
  wordCount?: number;
  lastDnsLookupMs?: number;
}

export interface SiteCheckHistoryPoint {
  id: string;
  timestamp: number;
  hasChanged: boolean;
  reachable: boolean;
  wordCount: number;
  wordDelta: number;
  sectionsCount: number;
  latencyMs?: number;
  changeType?: 'BASELINE' | 'UNCHANGED' | 'ADDED' | 'MODIFIED' | 'REMOVED';
  summary?: string;
}

export interface MonitoredLink {
  id: string;
  title: string;
  url: string;
  category: string;
  tags: string[];
  checkIntervalSec: number;
  lastChecked: number;
  lastUpdated: number;
  status: LinkStatus;
  currentHash: string;
  contentSnippet: string;
  diffHistory: DiffEntry[];
  checkHistory?: SiteCheckHistoryPoint[];
  writtenContent?: SiteWrittenContent;
  autoRefresh: boolean;
  notificationEnabled: boolean;
  telemetry?: SiteTelemetry;
  isScientific?: boolean;
  scientificMeta?: {
    query?: string;
    source?: string;
    paperCount?: number;
    latestTitle?: string;
    author?: string;
    discipline?: string;
    journal?: string;
  };
}

export type AIDataMode = 'local' | 'web';

export interface WebGroundingSource {
  title: string;
  uri: string;
}

export interface SiteQAMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: number;
  siteIds?: string[];
  siteTitles?: string[];
  aiMode?: AIDataMode;
  suggestSwitchToWeb?: boolean;
  originalQuestion?: string;
  webSources?: WebGroundingSource[];
}

export interface StudentProfile {
  fullName: string;
  studentId: string;
  university: string;
  faculty: string;
  group: string;
  course: number;
  email: string;
  notes: string;
}

export interface PipBoyNotification {
  id: string;
  timestamp: number;
  title: string;
  message: string;
  type: 'INFO' | 'ALERT' | 'UPDATE' | 'SCIENCE';
  linkId?: string;
  read: boolean;
  sourceUrl?: string;
}

export type ThemeColor = 'green' | 'amber' | 'cyan' | 'lilac';

export interface PipBoySettings {
  colorTheme: ThemeColor;
  audioEnabled: boolean;
  scanlines: boolean;
  crtFlicker: boolean;
  autoCheckGlobal: boolean;
  globalInterval: number; // in seconds
  pushNotificationsAllowed: boolean;
  aiDataMode?: AIDataMode; // 'local' (Only App & Attached Sites) or 'web' (Global Internet + App)
}

