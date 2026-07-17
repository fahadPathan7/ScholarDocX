import { FormEvent, MouseEvent, ReactNode, useEffect, useState, Fragment } from "react";
import {
  Bell,
  CalendarDays,
  CheckCircle2,
  Crown,
  FileText,
  FolderOpen,
  Leaf,
  PencilLine,
  GraduationCap,
  Info,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Sparkles,
  Star,
  StickyNote,
  User,
  Zap,
  Upload,
  Edit,
  Trash2,
  X,
  Pin,
  Square,
  Settings,
  Shield,
  Compass,
  Lock,
  Map,
  Award,
  BookOpen,
  Briefcase,
  Users,
  Plus
} from "lucide-react";
import DeepSpaceBanner from "./components/DeepSpaceBanner";
import { ScholarDocXMark } from "./components/ScholarDocXMark";

function getCategoryIcon(slug: string) {
  const c = slug.toLowerCase();
  if (c.includes("cv") || c.includes("resume")) {
    return <FileText size={20} />;
  } else if (c.includes("sop") || c.includes("statement")) {
    return <PencilLine size={20} />;
  } else if (c.includes("lor") || c.includes("recommendation")) {
    return <Users size={20} />;
  } else if (c.includes("proposal")) {
    return <Briefcase size={20} />;
  } else if (c.includes("transcript")) {
    return <GraduationCap size={20} />;
  } else if (c.includes("certif")) {
    return <Award size={20} />;
  } else if (c.includes("score")) {
    return <BookOpen size={20} />;
  } else if (c.includes("passport") || c.includes("id")) {
    return <Shield size={20} />;
  }
  return <FileText size={20} />;
}
import { FloatingAssistant } from "./components/FloatingAssistant";
import { FloatingNotifications } from "./components/FloatingNotifications";

import { AboutView } from "./components/AboutView";
import { AiTokenUsageButton } from "./components/AiTokenUsageButton";
import { ProfileView } from "./components/ProfileView";
import { AdminView } from "./components/AdminView";
import { PlanComparisonView } from "./components/PlanComparisonView";
import { BuyTokensView } from "./components/BuyTokensView";
import { GlobalErrorAlerts } from "./components/GlobalErrorAlerts";
import { hasActiveUserPlan, hasAdminRole, isAdmin, isUser } from "./lib/auth";
import { ProjectNavigationTarget, ProjectWorkspace } from "./components/ProjectWorkspace";
import { StickyNotesView } from "./components/StickyNotesView";
import { WhiteboardView } from "./components/WhiteboardView";
import { ScholarshipNewsView } from "./components/ScholarshipNewsView";
import { AdvisorAtlasView } from "./components/AdvisorAtlasView";
import { CalendarMonthView } from "./components/CalendarMonthView";
import { Field } from "./components/Field";
import { Section } from "./components/Section";
import { SplashScreen } from "./components/SplashScreen";
import { useDialog } from "./components/DialogProvider";
import { useAuth } from "./contexts/AuthContext";
import { useUsage } from "./contexts/UsageContext";
import { applicationStatuses, degreeTypes, mediaCategories } from "./data/options";
import { api, createRecord, listRecords, deleteRecord, RecordMap, API_BASE } from "./lib/api";
import { formatLongDate, formatShortDate, parseLocalDate, startOfLocalDay } from "./lib/date";
import { getToken, decodeToken } from "./lib/auth";
import "./components/splash-screen.css";

type Dashboard = {
  counts: Record<string, number>;
  status_counts: { status: string; count: number }[];
  upcoming_deadlines: RecordMap[];
  reminders: RecordMap[];
  notifications: RecordMap[];
  recent_applications: RecordMap[];
  recent_projects: RecordMap[];
  pinned_projects: RecordMap[];
  pinned_sheets: RecordMap[];
  pinned_docs: RecordMap[];
  calendar_items: RecordMap[];
};

const emptyDashboard: Dashboard = {
  counts: {},
  status_counts: [],
  upcoming_deadlines: [],
  reminders: [],
  notifications: [],
  recent_applications: [],
  recent_projects: [],
  pinned_projects: [],
  pinned_sheets: [],
  pinned_docs: [],
  calendar_items: []
};



export function App() {
  const { showAlert, showConfirm } = useDialog();
  const { user } = useAuth();
  const { usageData } = useUsage();
  const [dashboard, setDashboard] = useState<Dashboard>(emptyDashboard);
  const [workspace, setWorkspace] = useState<RecordMap | null>(null);
  const [degreeWorkspaces, setDegreeWorkspaces] = useState<RecordMap[]>([]);
  const [universities, setUniversities] = useState<RecordMap[]>([]);
  const [programs, setPrograms] = useState<RecordMap[]>([]);
  const [professors, setProfessors] = useState<RecordMap[]>([]);
  const [applications, setApplications] = useState<RecordMap[]>([]);
  const [files, setFiles] = useState<RecordMap[]>([]);
  const [documentCategories, setDocumentCategories] = useState<RecordMap[]>([]);
  const [notifications, setNotifications] = useState<RecordMap[]>([]);
  const [message, setMessage] = useState("Loading ScholarDocX...");
  const defaultTab = isUser() ? "dashboard" : (isAdmin() ? "admin" : "profile");
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [toast, setToast] = useState("");
  const [notificationPanelOpen, setNotificationPanelOpen] = useState(false);
  const [projectNavigationTarget, setProjectNavigationTarget] = useState<ProjectNavigationTarget | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refresh = async () => {
    setIsRefreshing(true);
    const startTime = Date.now();
    try {
      const [
        workspaceStatus,
        summary,
        degreeRows,
        universityRows,
        programRows,
        professorRows,
        applicationRows,
        fileRows,
        categoryRows,
        notificationRows
      ] = await Promise.all([
        api.get<RecordMap>("/workspace/status"),
        api.get<Dashboard>("/dashboard/summary"),
        listRecords<RecordMap>("degree_workspaces"),
        listRecords<RecordMap>("universities"),
        listRecords<RecordMap>("programs"),
        listRecords<RecordMap>("professors"),
        listRecords<RecordMap>("applications"),
        listRecords<RecordMap>("static_files"),
        api.get<RecordMap[]>("/document_categories"),
        listRecords<RecordMap>("notifications")
      ]);
      setWorkspace(workspaceStatus);
      setDashboard(summary);
      setDegreeWorkspaces(degreeRows);
      setUniversities(universityRows);
      setPrograms(programRows);
      setProfessors(professorRows);
      setApplications(applicationRows);
      setFiles(fileRows);
      setDocumentCategories(categoryRows);
      setNotifications(notificationRows);
      setMessage("Ready.");
    } finally {
      const elapsed = Date.now() - startTime;
      if (elapsed < 1000) {
        await new Promise(r => setTimeout(r, 1000 - elapsed));
      }
      setIsRefreshing(false);
    }
  };

  // Context-aware refresh - only refreshes the active tab
  const refreshActiveTab = async () => {
    setIsRefreshing(true);
    const startTime = Date.now();
    try {
      setRefreshTrigger((v) => v + 1);
      switch (activeTab) {
        case "dashboard":
          // Refresh dashboard data
          const [summary, notificationRows] = await Promise.all([
            api.get<Dashboard>("/dashboard/summary"),
            listRecords<RecordMap>("notifications")
          ]);
          setDashboard(summary);
          setNotifications(notificationRows);
          break;

        case "projects":
          break;

        case "documents":
          // Refresh documents data
          const [fileRows, categoryRows] = await Promise.all([
            listRecords<RecordMap>("static_files"),
            api.get<RecordMap[]>("/document_categories")
          ]);
          setFiles(fileRows);
          setDocumentCategories(categoryRows);
          break;

        case "sticky":
          break;

        case "whiteboard":
          break;

        case "profile":
          // Profile doesn't need refresh (form-based)
          break;

        case "about":
          // About is static, no refresh needed
          break;
      }
      setMessage("Ready.");
    } finally {
      const elapsed = Date.now() - startTime;
      if (elapsed < 500) {
        await new Promise(r => setTimeout(r, 500 - elapsed));
      }
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    api
      .post<RecordMap>("/workspace/init", {})
      .then(refresh)
      .catch((error) => setMessage(error.message));

    // Global instant custom tooltips replacing browser-native title delay
    const handleMouseOver = (e: any) => {
      const target = e.target.closest('[title]');
      if (!target) return;
      
      if (e.relatedTarget && target.contains(e.relatedTarget)) {
        return;
      }

      const titleText = target.getAttribute('title');
      if (!titleText) return;

      target.setAttribute('data-tooltip', titleText);
      target.removeAttribute('title');

      let tooltipEl = document.getElementById('global-custom-tooltip');
      if (!tooltipEl) {
        tooltipEl = document.createElement('div');
        tooltipEl.id = 'global-custom-tooltip';
        tooltipEl.className = 'global-custom-tooltip';
        document.body.appendChild(tooltipEl);
      }
      
      tooltipEl.textContent = titleText;
      tooltipEl.style.display = 'block';

      const rect = target.getBoundingClientRect();
      const tooltipHeight = tooltipEl.offsetHeight;
      const tooltipWidth = tooltipEl.offsetWidth;

      // Position above target by default, fallback to below if no space
      let top = rect.top + window.scrollY - tooltipHeight - 6;
      if (rect.top < tooltipHeight + 20) {
        top = rect.bottom + window.scrollY + 6;
      }

      let left = rect.left + window.scrollX + (rect.width - tooltipWidth) / 2;
      // Constrain inside window bounds
      left = Math.max(10, Math.min(left, window.innerWidth - tooltipWidth - 10));

      tooltipEl.style.top = `${top}px`;
      tooltipEl.style.left = `${left}px`;
    };

    const handleMouseOut = (e: any) => {
      const target = e.target.closest('[data-tooltip]');
      if (!target) return;

      if (e.relatedTarget && target.contains(e.relatedTarget)) {
        return;
      }

      const tooltipText = target.getAttribute('data-tooltip');
      if (tooltipText) {
        target.setAttribute('title', tooltipText);
        target.removeAttribute('data-tooltip');
      }

      const tooltipEl = document.getElementById('global-custom-tooltip');
      if (tooltipEl) {
        tooltipEl.style.display = 'none';
      }
    };

    const handleHide = () => {
      const tooltipEl = document.getElementById('global-custom-tooltip');
      if (tooltipEl) {
        tooltipEl.style.display = 'none';
      }
    };

    document.addEventListener('mouseover', handleMouseOver);
    document.addEventListener('mouseout', handleMouseOut);
    document.addEventListener('mousedown', handleHide);
    document.addEventListener('scroll', handleHide, true);

    return () => {
      document.removeEventListener('mouseover', handleMouseOver);
      document.removeEventListener('mouseout', handleMouseOut);
      document.removeEventListener('mousedown', handleHide);
      document.removeEventListener('scroll', handleHide, true);
      const tooltipEl = document.getElementById('global-custom-tooltip');
      if (tooltipEl) tooltipEl.remove();
    };
  }, []);

  const baseNavItems = [
    ["dashboard", "Dashboard", LayoutDashboard],
    ["projects", "Projects", FolderOpen],
    ["documents", "Documents", FileText],
    ["sticky", "Sticky Notes", StickyNote],
    ["whiteboard", "Whiteboard", Square],
    ["atlas", "Advisor Atlas", Map],
    ["news", "Scholarship Hunt", Compass],
    ["profile", "Profile", User],
    ["about", "About", Info]
  ] as const;

  const adminItem = ["admin", "Admin", Shield] as const;

  const currentIdentity = workspace?.user ?? user;
  const currentHasUserPlan = currentIdentity ? hasActiveUserPlan(currentIdentity) : isUser();
  const currentIsAdmin = currentIdentity?.roles ? hasAdminRole(currentIdentity.roles) : isAdmin();

  // Advisor Atlas is plan-gated (Pro/Max). Derive from the role immediately to
  // avoid a locked-flash on load, then refine from usage limits once fetched.
  const atlasRoles = currentIdentity?.roles ?? user?.roles ?? [];
  const isProOrMaxRole =
    Array.isArray(atlasRoles) && (atlasRoles.includes("pro_user") || atlasRoles.includes("max_user"));
  const canUseAdvisorAtlas = usageData
    ? (usageData.limits?.can_use_advisor_atlas ?? 0) === 1
    : isProOrMaxRole;

  const planTier = (Array.isArray(atlasRoles) ? atlasRoles.find(r => ["max_user", "pro_user", "general_user", "free_user"].includes(r)) : "free_user") || "free_user";
  const PLAN_LABELS: Record<string, string> = {
    free_user: "Free",
    general_user: "General",
    pro_user: "Pro",
    max_user: "Max",
  };
  const tierLabel = PLAN_LABELS[planTier] || "Member";
  const isTopTier = planTier === "max_user" || planTier === "pro_user";

  const canUseScholarshipHunt = usageData
    ? (usageData.limits?.can_use_scholarship_hunt ?? 0) === 1
    : isProOrMaxRole;

  useEffect(() => {
    if (workspace && !currentHasUserPlan && ["dashboard", "projects", "documents", "sticky", "whiteboard", "atlas", "news"].includes(activeTab)) {
      setActiveTab(currentIsAdmin ? "admin" : "profile");
    }
  }, [workspace, currentHasUserPlan, currentIsAdmin, activeTab]);

  // Cross-component navigation requests via the window event bus
  // (e.g. BuyTokensView upsell → "plans" when a plan can't buy token packs;
  //  openBuyTokens → "buy-credits").
  useEffect(() => {
    const handler = (event: Event) => {
      const tab = (event as CustomEvent<{ tab?: string }>).detail?.tab;
      if (tab) setActiveTab(tab);
    };
    window.addEventListener("scholardocx:navigate", handler as EventListener);
    return () => window.removeEventListener("scholardocx:navigate", handler as EventListener);
  }, []);

  let navItems: any[] = [];
  if (currentHasUserPlan) {
    navItems.push(...baseNavItems.slice(0, 7));
  }
  if (currentIsAdmin) {
    navItems.push(adminItem);
  }
  navItems.push(...baseNavItems.slice(7));

  const handleSidebarNav = (key: string) => {
    if (key === "atlas" && !canUseAdvisorAtlas) {
      const phrase = usageData?.advisor_atlas_plan_phrase || "a higher plan";
      setActiveTab("plans");
      showToast(`Advisor Atlas is available on ${phrase}.`);
      return;
    }
    if (key === "news" && !canUseScholarshipHunt) {
      const phrase = usageData?.advisor_atlas_plan_phrase || "a higher plan"; // Scholarship Hunt is also typically on pro/max
      setActiveTab("plans");
      showToast(`Scholarship Hunt is available on ${phrase}.`);
      return;
    }
    if (key === "projects") {
      setProjectNavigationTarget(null);
      setRefreshTrigger((value) => value + 1);
    }
    setActiveTab(key);
  };

  const navigateToCalendarEvent = (event: RecordMap) => {
    setProjectNavigationTarget({
      token: Date.now(),
      projectId: event.project_id,
      sheetId: event.sheet_id,
      pageId: event.page_id,
      rowIndex: typeof event.row_index === "number" ? event.row_index : Number(event.row_index)
    });
    setActiveTab("projects");
  };

  const navigateToProject = (projectId: string) => {
    setProjectNavigationTarget({ token: Date.now(), projectId });
    setActiveTab("projects");
  };

  const showToast = (text: string) => {
    setToast(text);
    window.setTimeout(() => setToast(""), 2600);
  };

  // Show splash screen while loading
  if (message !== "Ready.") {
    return <SplashScreen message={message} />;
  }

  return (
    <div className={navCollapsed ? "app-shell nav-collapsed" : "app-shell"}>
      <GlobalErrorAlerts />
      <aside className="sidebar">
        <div className="brand logoCardPremium">
          <ScholarDocXMark />
          <div className="logoContent">
            <strong className="logoText">ScholarDocX</strong>
            <div className="logoUnderline" />
            <span className="logoTagline">Chase Your Dream</span>
          </div>
        </div>
        <nav>
          {navItems.map((item, i) => {
            const [key, label, Icon] = item;
            const atlasLocked = key === "atlas" && !canUseAdvisorAtlas;
            const newsLocked = key === "news" && !canUseScholarshipHunt;
            const isLocked = atlasLocked || newsLocked;
            return (
              <Fragment key={key}>
                {currentHasUserPlan && i === 7 && <div className="nav-spacer" />}
                <button
                  aria-label={label}
                  className={activeTab === key || (key === "profile" && (activeTab === "plans" || activeTab === "buy-credits")) ? "active" : ""}
                  onClick={() => handleSidebarNav(key)}
                  title={atlasLocked ? `Advisor Atlas — available on ${usageData?.advisor_atlas_plan_phrase || "a higher plan"}` : newsLocked ? `Scholarship Hunt — available on ${usageData?.advisor_atlas_plan_phrase || "a higher plan"}` : navCollapsed ? label : undefined}
                  style={isLocked ? { opacity: 0.55 } : undefined}
                >
                  <Icon size={18} />
                  <span>{label}</span>
                  {isLocked && !navCollapsed && (
                    <Lock size={14} style={{ marginLeft: 'auto', opacity: 0.7 }} />
                  )}
                </button>
              </Fragment>
            );
          })}
        </nav>
      </aside>

      <main>
        <div className="main-head" style={{ position: 'relative', zIndex: 1000 }}>
          <DeepSpaceBanner />
          <header className="topbar" style={{ position: 'relative', zIndex: 1001 }}>
            <div className="banner-content">
              <p className="eyebrow" style={{ color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '8px' }}>
                Your Academic Journey Companion
                {currentHasUserPlan && (
                  <span className={`profile-plan-badge tier-${planTier}`} style={{ transform: 'scale(0.85)', transformOrigin: 'left center', padding: '2px 10px', marginTop: 0 }}>
                    {planTier === "max_user" ? <Crown size={12} /> : 
                     planTier === "pro_user" ? <Zap size={12} /> : 
                     planTier === "general_user" ? <Star size={12} /> : 
                     <Leaf size={12} />}
                    <span>{tierLabel}</span>
                  </span>
                )}
              </p>
              <h1 style={{ color: '#f8fafc' }}>Built for the scholars who refuse to settle.</h1>
            </div>
            <div className="top-actions">
              <button className="icon-button" onClick={() => setNavCollapsed((value) => !value)} title="Collapse navigation">
                {navCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
              </button>
              <button className={`icon-button ${isRefreshing ? "refreshing" : ""}`} onClick={refreshActiveTab} title="Refresh data" disabled={isRefreshing}>
                <RefreshCw size={18} className={isRefreshing ? "icon-spin" : ""} />
              </button>
              <button
                className="icon-button notification-header-button"
                onClick={() => setNotificationPanelOpen(!notificationPanelOpen)}
                title="Notifications"
              >
                <Bell size={18} />
                {notifications.filter((item) => !item.read_at).length > 0 && (
                  <span className="notification-badge-header">{notifications.filter((item) => !item.read_at).length}</span>
                )}
              </button>
              <AiTokenUsageButton />

              <FloatingAssistant
                onWorkspaceChanged={async () => {
                  await refresh();
                  setRefreshTrigger((value) => value + 1);
                  showToast("Workspace updated by Lumi.");
                }}
              />
            </div>
          </header>

        </div>

        <div className="main-content">
          <div className={`tab-container ${activeTab === "dashboard" ? "" : "hidden-tab"}`}>
            <DashboardView
              dashboard={dashboard}
              notificationCount={notifications.filter((item) => !item.read_at).length}
              onCalendarEventClick={navigateToCalendarEvent}
              onProjectClick={navigateToProject}
            />
          </div>

          <div className={`tab-container ${activeTab === "projects" ? "" : "hidden-tab"}`}>
            <ProjectWorkspace
              refreshTrigger={refreshTrigger}
              files={files}
              onChanged={refresh}
              onFilesChanged={refresh}
              navigationTarget={projectNavigationTarget}
              onToast={showToast}
            />
          </div>

          <div className={`tab-container ${activeTab === "documents" ? "" : "hidden-tab"}`}>
            <DocumentView
              refreshTrigger={refreshTrigger}
              categories={documentCategories}
              files={files}
              onChanged={refresh}
              onToast={showToast}
              showAlert={showAlert}
              showConfirm={showConfirm}
            />
          </div>

          <div className={`tab-container ${activeTab === "sticky" ? "" : "hidden-tab"}`}>
            <StickyNotesView refreshTrigger={refreshTrigger} onToast={showToast} />
          </div>

          <div className={`tab-container ${activeTab === "whiteboard" ? "" : "hidden-tab"}`}>
            <WhiteboardView refreshTrigger={refreshTrigger} onToast={showToast} />
          </div>

          {canUseAdvisorAtlas && (
            <div className={`tab-container ${activeTab === "atlas" ? "" : "hidden-tab"}`}>
              <AdvisorAtlasView refreshTrigger={refreshTrigger} onToast={showToast} />
            </div>
          )}

          {canUseScholarshipHunt && (
            <div className={`tab-container ${activeTab === "news" ? "" : "hidden-tab"}`}>
              <ScholarshipNewsView refreshTrigger={refreshTrigger} onToast={showToast} />
            </div>
          )}

          <div className={`tab-container ${activeTab === "profile" ? "" : "hidden-tab"}`}>
            <ProfileView workspace={workspace} onToast={showToast} onViewPlans={() => setActiveTab("plans")} onBuyCredits={() => setActiveTab("buy-credits")} onViewAdmin={() => setActiveTab("admin")} />
          </div>

          <div className={`tab-container ${activeTab === "about" ? "" : "hidden-tab"}`} style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
            <AboutView />
          </div>

          {activeTab === "plans" && (
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", background: "#f8fafc" }}>
              <PlanComparisonView onBack={() => setActiveTab("profile")} refreshTrigger={refreshTrigger} />
            </div>
          )}

          {activeTab === "buy-credits" && (
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", background: "#f8fafc" }}>
              <BuyTokensView onBack={() => setActiveTab("profile")} onToast={showToast} refreshTrigger={refreshTrigger} />
            </div>
          )}

          {activeTab === "admin" && currentIsAdmin && (
            <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: "#f8fafc" }}>
              <AdminView refreshTrigger={refreshTrigger} />
            </div>
          )}
        </div>
      </main>

      <FloatingNotifications
        calendarItems={dashboard.calendar_items || []}
        notifications={notifications}
        projects={dashboard.recent_projects || []}
        isOpen={notificationPanelOpen}
        onClose={() => setNotificationPanelOpen(false)}
        onChanged={refresh}
        onNavigateToEvent={navigateToCalendarEvent}
        onNavigateToProject={navigateToProject}
        onToast={showToast}
      />

      {toast ? <div className="toast-message">{toast}</div> : null}
    </div>
  );
}

function DashboardView({
  dashboard,
  notificationCount,
  onCalendarEventClick,
  onProjectClick
}: {
  dashboard: Dashboard;
  notificationCount: number;
  onCalendarEventClick: (event: RecordMap) => void;
  onProjectClick?: (projectId: string) => void;
}) {
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const cards = [
    ["Projects", dashboard.counts.projects ?? 0],
    ["Sheets", dashboard.counts.project_sheets ?? 0],
    ["Documents", dashboard.counts.documents ?? 0],
    ["Sticky notes", dashboard.counts.sticky_notes ?? 0],
    ["White boards", dashboard.counts.whiteboards ?? 0],
    ["Calendar dates", futureCalendarCount(dashboard.calendar_items || [])]
  ];
  const nextEvents = upcomingEvents(dashboard.calendar_items || [], 10);
  const nextCalendarEvent = nextFeaturedEvent(dashboard.calendar_items || []);
  const pinnedProjects = dashboard.pinned_projects || [];
  const pinnedSheets = dashboard.pinned_sheets || [];
  const pinnedDocs = dashboard.pinned_docs || [];

  return (
    <div className="page-grid dashboard-grid">
      <Section title="Workspace Snapshot" eyebrow="Overview" className="dashboard-snapshot">
        <div className="metric-grid">
          {cards.map(([label, value]) => (
            <article className="metric-card" key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </article>
          ))}
        </div>
      </Section>

      <Section title="Project Calendar" eyebrow="Upcoming row dates" className="dashboard-calendar">
        <button className="project-calendar-summary" type="button" onClick={() => setIsCalendarOpen(true)}>
          <CalendarDays size={22} />
          <div>
            <strong>{futureCalendarCount(dashboard.calendar_items || [])}</strong>
            <span>upcoming row date{futureCalendarCount(dashboard.calendar_items || []) === 1 ? "" : "s"}</span>
          </div>
          <small>
            {nextCalendarEvent
              ? `Next: ${formatShortDate(nextCalendarEvent.date_key || nextCalendarEvent.date)} · ${nextCalendarEvent.title || "Untitled row"}`
              : "Open full calendar"}
          </small>
        </button>

        {isCalendarOpen ? (
          <div className="modal-backdrop" onClick={() => setIsCalendarOpen(false)}>
            <div className="modal-panel calendar-modal-panel" onClick={(event) => event.stopPropagation()}>
              <div className="modal-header">
                <h2>Project Calendar</h2>
                <button className="icon-button" type="button" onClick={() => setIsCalendarOpen(false)} title="Close calendar">
                  <X size={20} />
                </button>
              </div>
              <div className="modal-content">
                <CalendarMonthView
                  events={dashboard.calendar_items || []}
                  empty="Add dates in project sheet rows to build the central calendar."
                  focusDate={nextCalendarEvent?.date_key || nextCalendarEvent?.date || null}
                  scopeLabel="All projects"
                  onEventClick={(event) => {
                    setIsCalendarOpen(false);
                    onCalendarEventClick(event);
                  }}
                />
              </div>
            </div>
          </div>
        ) : null}
      </Section>

      {/* formatDegreeType helper ensures 'phd' is properly capitalized */}
      <Section title="Pinned Projects" eyebrow="Dashboard" className="dashboard-pinned-projects">
        <List
          items={pinnedProjects}
          empty="Pin projects to dashboard."
          onClick={(item) => onProjectClick?.(item.id)}
          render={(item) => (
            <>
              <FolderOpen size={16} />
              <div>
                <strong>{item.name}</strong>
                <span>{item.degree_type ? (item.degree_type.toLowerCase() === 'phd' ? 'PhD' : item.degree_type.charAt(0).toUpperCase() + item.degree_type.slice(1)) : "Degree TBD"} · {item.sheet_count} sheets</span>
              </div>
            </>
          )}
        />
      </Section>

      <Section title="Next 10 Days" eyebrow="Upcoming row dates" className="dashboard-upcoming">
        {nextEvents.length ? (
          <div className="upcoming-event-list">
            {nextEvents.map((event, index) => (
              <button
                className="upcoming-event"
                key={`${event.page_id}-${event.row_index}-${event.date_field}-${index}`}
                type="button"
                onClick={() => onCalendarEventClick(event)}
              >
                <span>{formatShortDate(event.date_key || event.date)}</span>
                <div>
                  <strong>{event.title || "Untitled row"}</strong>
                  <small>{event.date_field || "Date"} · {event.source || "Sheet"} · {event.project_name || "Project"}</small>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <p className="empty">No row dates in the next 10 days.</p>
        )}
      </Section>

      <Section title="Pinned Sheets" eyebrow="Dashboard" className="dashboard-pinned-sheets">
        <List
          items={pinnedSheets}
          empty="Pin sheets to dashboard."
          onClick={(item) => onCalendarEventClick({ project_id: item.project_id, sheet_id: item.sheet_id, page_id: item.id })}
          render={(item) => (
            <>
              <FileText size={16} />
              <div>
                <strong>{item.name}</strong>
                <span>{item.project_name || "Project"} · Created {formatLongDate(item.created_at)}</span>
              </div>
            </>
          )}
        />
      </Section>

      <Section title="Pinned Docs" eyebrow="Dashboard" className="dashboard-pinned-docs">
        <List
          items={pinnedDocs}
          empty="Pin docs to dashboard."
          onClick={(item) => {
            const token = getToken();
            const url = `${API_BASE}/files/${item.id}/content${token ? `?token=${encodeURIComponent(token)}` : ""}`;
            window.open(url, "_blank", "noopener,noreferrer");
          }}
          render={(item) => (
            <>
              <FileText size={16} />
              <div>
                <strong>{item.display_name}</strong>
                <span>{item.file_type || "Document"} · {formatLongDate(item.created_at)}</span>
              </div>
            </>
          )}
        />
      </Section>
    </div>
  );
}

function futureCalendarCount(events: RecordMap[]) {
  const today = startOfLocalDay(new Date());
  return events.filter((event) => {
    const date = parseLocalDate(event.date_key || event.date);
    return date ? date >= today : false;
  }).length;
}

function nextFeaturedEvent(events: RecordMap[]) {
  const today = startOfLocalDay(new Date());
  return [...events]
    .filter((event) => {
      const date = parseLocalDate(event.date_key || event.date);
      return date ? date >= today : false;
    })
    .sort((first, second) => {
      const firstDate = parseLocalDate(first.date_key || first.date)?.getTime() || 0;
      const secondDate = parseLocalDate(second.date_key || second.date)?.getTime() || 0;
      return firstDate - secondDate;
    })[0];
}

function upcomingEvents(events: RecordMap[], dayWindow: number) {
  const today = startOfLocalDay(new Date());
  const end = new Date(today);
  end.setDate(today.getDate() + dayWindow);
  return events
    .filter((event) => {
      const date = parseLocalDate(event.date_key || event.date);
      return date ? date >= today && date <= end : false;
    })
    .sort((first, second) => {
      const firstDate = parseLocalDate(first.date_key || first.date)?.getTime() || 0;
      const secondDate = parseLocalDate(second.date_key || second.date)?.getTime() || 0;
      return firstDate - secondDate;
    });
}

function HierarchyView(props: {
  degreeWorkspaces: RecordMap[];
  universities: RecordMap[];
  programs: RecordMap[];
  professors: RecordMap[];
  onChanged: () => Promise<void>;
}) {
  const [university, setUniversity] = useForm({ name: "", country: "", region: "", website_url: "", notes: "" });
  const [program, setProgram] = useForm({ university_id: "", name: "", degree_type: "", department: "", application_url: "", funding_url: "", notes: "" });
  const [professor, setProfessor] = useForm({ university_id: "", program_id: "", name: "", title: "", email: "", profile_url: "", research_interests: "", notes: "" });
  const [application, setApplication] = useForm({ degree_workspace_id: "", university_id: "", program_id: "", professor_id: "", status: "Researching", intake_term: "", application_url: "", priority: "Medium", notes: "" });
  const [deadline, setDeadline] = useForm({ application_id: "", deadline_type: "Application", title: "", due_at: "", notes: "" });

  const universityOptions = props.universities.map((item) => ({ value: String(item.id), label: item.name }));
  const programOptions = props.programs.map((item) => ({ value: String(item.id), label: item.name }));
  const professorOptions = props.professors.map((item) => ({ value: String(item.id), label: item.name }));
  const degreeOptions = props.degreeWorkspaces.map((item) => ({ value: String(item.id), label: item.display_name }));

  return (
    <div className="page-grid">
      <Section title="University" eyebrow="Institution">
        <DataForm fields={[
          ["name", "Name", true],
          ["country", "Country", true],
          ["region", "State / Region"],
          ["website_url", "Website"],
          ["notes", "Notes", false, 3]
        ]} form={university} setForm={setUniversity} onSubmit={() => submit("universities", university, setUniversity, props.onChanged)} />
      </Section>

      <Section title="Program" eyebrow="Academic target">
        <DataForm fields={[
          ["university_id", "University", true, 0, universityOptions],
          ["name", "Program name", true],
          ["degree_type", "Degree type", false, 0, degreeTypes],
          ["department", "Department"],
          ["application_url", "Application URL"],
          ["funding_url", "Funding URL"],
          ["notes", "Notes", false, 3]
        ]} form={program} setForm={setProgram} onSubmit={() => submit("programs", program, setProgram, props.onChanged)} />
      </Section>

      <Section title="Professor" eyebrow="Advisor research">
        <DataForm fields={[
          ["university_id", "University", false, 0, universityOptions],
          ["program_id", "Program", false, 0, programOptions],
          ["name", "Name", true],
          ["title", "Title"],
          ["email", "Email"],
          ["profile_url", "Profile URL"],
          ["research_interests", "Research interests", false, 3],
          ["notes", "Notes", false, 3]
        ]} form={professor} setForm={setProfessor} onSubmit={() => submit("professors", professor, setProfessor, props.onChanged)} />
      </Section>

      <Section title="Application" eyebrow="Pipeline item">
        <DataForm fields={[
          ["degree_workspace_id", "Degree", false, 0, degreeOptions],
          ["university_id", "University", false, 0, universityOptions],
          ["program_id", "Program", false, 0, programOptions],
          ["professor_id", "Professor", false, 0, professorOptions],
          ["status", "Status", true, 0, applicationStatuses],
          ["intake_term", "Intake term"],
          ["application_url", "Application URL"],
          ["priority", "Priority", false, 0, ["Low", "Medium", "High"]],
          ["notes", "Notes", false, 3]
        ]} form={application} setForm={setApplication} onSubmit={() => submit("applications", application, setApplication, props.onChanged)} />
      </Section>

      <Section title="Deadline" eyebrow="Timeline">
        <DataForm fields={[
          ["application_id", "Application id", false],
          ["deadline_type", "Type", true, 0, ["Application", "Scholarship", "Test", "Interview"]],
          ["title", "Title", true],
          ["due_at", "Due date", true],
          ["notes", "Notes", false, 3]
        ]} form={deadline} setForm={setDeadline} onSubmit={() => submit("deadlines", deadline, setDeadline, props.onChanged)} />
      </Section>
    </div>
  );
}

type DocCategoryEntry = {
  category: RecordMap;
  slug: string;
  title: string;
  files: RecordMap[];
};

function DocumentView(props: {
  categories: RecordMap[];
  files: RecordMap[];
  onChanged: () => Promise<void>;
  onToast: (msg: string) => void;
  showAlert: (msg: string, title?: string) => Promise<void>;
  showConfirm: (msg: string, title?: string) => Promise<boolean>;
  refreshTrigger?: number;
}) {
  const [editingFile, setEditingFile] = useState<RecordMap | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [defaultCategorySlug, setDefaultCategorySlug] = useState("");
  const [selectedDocCategory, setSelectedDocCategory] = useState<string | null>(null);
  const [selectedUploadFileName, setSelectedUploadFileName] = useState("");
  const [categoryEditor, setCategoryEditor] = useState<{ mode: "create" | "rename"; category?: RecordMap } | null>(null);
  const [categoryName, setCategoryName] = useState("");
  const [editFileForm, setEditFileForm] = useState({ display_name: "", file_type: "", notes: "" });
  const [pinningFileKey, setPinningFileKey] = useState<string | null>(null);

  const openUploadModalForCategory = (categorySlug: string) => {
    setDefaultCategorySlug(categorySlug);
    setIsUploadOpen(true);
  };

  const closeUploadModal = () => {
    setIsUploadOpen(false);
    setSelectedUploadFileName("");
    setDefaultCategorySlug("");
  };

  const uploadFile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    if (!form.get("file_type") || form.get("file_type") === "") {
      form.set("file_type", form.get("category") as string);
    }
    await api.upload<RecordMap>("/files/upload", form);
    props.onToast("Document uploaded.");
    formEl.reset();
    closeUploadModal();
    await props.onChanged();
  };

  const deleteDocument = async (fileId: string) => {
    const confirmed = await props.showConfirm("Are you sure you want to delete this document?", "Delete Document");
    if (!confirmed) return;
    await deleteRecord("static_files", fileId);
    props.onToast("Document deleted.");
    await props.onChanged();
  };

  const updateDocPin = async (file: RecordMap, data: RecordMap, label: string) => {
    const pinKey = `${file.id}-${Object.keys(data)[0]}`;
    setPinningFileKey(pinKey);
    try {
      await api.patch(`/static_files/${file.id}`, { data });
      props.onToast(label);
      await props.onChanged();
    } catch (e: any) {
      props.onToast(`Error: ${e.message}`);
    } finally { setPinningFileKey(null); }
  };

  const startEditFile = (file: RecordMap) => {
    setEditingFile(file);
    setEditFileForm({
      display_name: file.display_name || "",
      file_type: file.file_type || "other",
      notes: file.notes || ""
    });
  };

  const saveFileEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingFile) return;
    try {
      await api.patch(`/static_files/${editingFile.id}`, { data: editFileForm });
      props.onToast("Document updated.");
      setEditingFile(null);
      await props.onChanged();
    } catch (err: any) {
      await props.showAlert(err.message || "Failed to update document.", "Error");
    }
  };

  const openCategoryEditor = (mode: "create" | "rename", category?: RecordMap) => {
    setCategoryEditor({ mode, category });
    setCategoryName(category?.display_name || "");
  };

  const saveCategory = async (event: FormEvent) => {
    event.preventDefault();
    const cleanName = categoryName.trim();
    if (!cleanName) return;
    try {
      if (categoryEditor?.mode === "rename" && categoryEditor.category) {
        await api.patch(`/document_categories/${categoryEditor.category.id}`, { name: cleanName });
        props.onToast("Category renamed.");
      } else {
        await api.post("/document_categories", { name: cleanName });
        props.onToast("Category created.");
      }
      setCategoryEditor(null);
      setCategoryName("");
      await props.onChanged();
    } catch (err: any) {
      props.onToast(err.message || "Failed to save category.");
    }
  };

  const deleteCategory = async (event: React.MouseEvent, category: any, fileCount: number) => {
    event.stopPropagation();
    const detail = fileCount > 0 ? `\n\nThis will also un-categorize ${fileCount} document(s).` : "";
    const confirmed = await props.showConfirm(`Delete "${category.display_name}" category?${detail}`, "Delete Category");
    if (!confirmed) return;
    try {
      await api.delete(`/document_categories/${category.id}`);
      if (selectedDocCategory === category.slug) setSelectedDocCategory(null);
      props.onToast("Category deleted.");
      await props.onChanged();
    } catch (err: any) {
      props.showAlert(err.message || "Failed to delete category.", "Error");
    }
  };

  const groupedFiles = props.files.reduce((acc, file) => {
    const category = file.file_type || "other";
    if (!acc[category]) acc[category] = [];
    acc[category].push(file);
    return acc;
  }, {} as Record<string, RecordMap[]>);

  Object.keys(groupedFiles).forEach((category) => {
    groupedFiles[category].sort((a: RecordMap, b: RecordMap) => {
      if (a.is_pinned !== b.is_pinned) {
        return a.is_pinned ? -1 : 1;
      }
      const dateA = new Date(a.created_at || 0).getTime();
      const dateB = new Date(b.created_at || 0).getTime();
      return dateB - dateA;
    });
  });

  const formatUploadedTime = (utcString?: string) => {
    if (!utcString) return "";
    try {
      const clean = utcString.replace(" ", "T") + (utcString.endsWith("Z") ? "" : "Z");
      const date = new Date(clean);
      if (isNaN(date.getTime())) return utcString;

      const pad = (num: number) => String(num).padStart(2, '0');
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    } catch (e) {
      return utcString;
    }
  };

  const fallbackCategories: RecordMap[] = mediaCategories.map((slug) => ({ slug, display_name: formatCategoryTitle(slug) }));
  const categoryOptions = props.categories.length ? props.categories : fallbackCategories;

  function formatCategoryTitle(category: string) {
    const labels: Record<string, string> = {
      cvs: "CVs",
      sop: "SOPs",
      lor: "LORs",
      proposals: "Research Proposals",
      other: "Others",
      "test-scores": "Test Scores"
    };
    return labels[category] || category
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  const categoryEntries: DocCategoryEntry[] = [
    ...categoryOptions.map((category) => ({
      category,
      slug: category.slug,
      title: category.display_name || formatCategoryTitle(category.slug),
      files: groupedFiles[category.slug] || []
    })),
    ...Object.entries(groupedFiles)
      .filter(([slug]) => !categoryOptions.some((category) => category.slug === slug))
      .map(([slug, files]) => ({
        category: { slug, display_name: formatCategoryTitle(slug) },
        slug,
        title: formatCategoryTitle(slug),
        files
      }))
  ];

  const selectedCategoryFiles = selectedDocCategory ? groupedFiles[selectedDocCategory] || [] : [];
  const selectedCategoryEntry = categoryEntries.find((entry) => entry.slug === selectedDocCategory);

  const renderDocumentFile = (file: RecordMap) => (
    <div key={file.id} className="doc-file-row">
      <FileText size={15} className="doc-file-icon" />
      <div className="doc-file-info">
        <a
          href={`${API_BASE}/files/${file.id}/content${getToken() ? `?token=${encodeURIComponent(getToken()!)}` : ""}`}
          target="_blank"
          rel="noreferrer"
          className="doc-file-name"
        >
          {file.display_name}
        </a>
        <span className="doc-file-path">{formatUploadedTime(file.created_at)}</span>
        {file.notes ? <p className="doc-file-notes">{file.notes}</p> : null}
      </div>
      <div className="doc-file-actions" style={{ display: "flex", gap: "6px" }}>
        <button
          type="button"
          className={`icon-button compact doc-pin-action ${file.is_pinned ? "active" : ""}`}
          disabled={pinningFileKey === `${file.id}-is_pinned`}
          onClick={() => updateDocPin(file, { is_pinned: !file.is_pinned }, file.is_pinned ? "Document unpinned." : "Document pinned.")}
          title={file.is_pinned ? "Unpin from this view" : "Pin to this view"} aria-label={file.is_pinned ? `Unpin ${file.display_name} from documents` : `Pin ${file.display_name} in documents`}
        >
          <Pin size={15} />
        </button>
        <button
          type="button"
          className={`icon-button compact doc-pin-action dashboard-pin-action ${file.pinned_to_dashboard ? "active" : ""}`}
          disabled={pinningFileKey === `${file.id}-pinned_to_dashboard`}
          onClick={() => updateDocPin(file, { pinned_to_dashboard: !file.pinned_to_dashboard }, file.pinned_to_dashboard ? "Removed from dashboard." : "Pinned to dashboard.")}
          title={file.pinned_to_dashboard ? "Remove from dashboard" : "Pin to dashboard"} aria-label={file.pinned_to_dashboard ? `Remove ${file.display_name} from dashboard` : `Pin ${file.display_name} to dashboard`}
        >
          <LayoutDashboard size={15} />
        </button>
        <button
          type="button"
          className="icon-button compact"
          onClick={() => startEditFile(file)}
          title="Edit document info"
        >
          <Edit size={15} />
        </button>
        <button
          type="button"
          className="icon-button compact danger"
          onClick={() => deleteDocument(file.id)}
          title="Delete document"
        >
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );

  return (
    <div className="page-grid doc-grid">
      {isUploadOpen ? (
        <div className="modal-backdrop" onClick={closeUploadModal}>
          <form className="modal-panel small-modal-panel doc-upload-panel" onClick={(event) => event.stopPropagation()} onSubmit={uploadFile}>
            <div className="modal-header">
              <div className="doc-upload-title">
                <span className="doc-upload-title-icon">
                  <Upload size={18} />
                </span>
                <div>
                  <p className="eyebrow">Workspace file</p>
                  <h2>Upload Document</h2>
                </div>
              </div>
              <button className="icon-button" type="button" onClick={closeUploadModal} title="Close form">
                <X size={20} />
              </button>
            </div>
            <div className="modal-content doc-upload-content">
              <label className="field full">
                <span>Category</span>
                <select
                  name="category"
                  value={defaultCategorySlug || (categoryOptions[0]?.slug || "")}
                  onChange={(e) => setDefaultCategorySlug(e.target.value)}
                >
                  {categoryOptions.map((item) => <option key={item.slug} value={item.slug}>{item.display_name}</option>)}
                </select>
              </label>
              <label className="field full doc-upload-file-field">
                <span>File</span>
                <div className="doc-upload-dropzone">
                  <input
                    className="doc-upload-file-input"
                    name="file"
                    type="file"
                    required
                    onChange={(event) => setSelectedUploadFileName(event.target.files?.[0]?.name || "")}
                  />
                  <span className="doc-upload-file-icon">
                    <FileText size={20} />
                  </span>
                  <div>
                    <strong>{selectedUploadFileName || "Choose a document"}</strong>
                    <small>{selectedUploadFileName ? "Ready to upload" : "PDF, image, or prepared document"}</small>
                  </div>
                </div>
              </label>
              <label className="field full">
                <span>Notes <small>(optional)</small></span>
                <textarea name="notes" rows={3} placeholder="Add a short note for this file..." />
              </label>
            </div>
            <div className="modal-footer doc-upload-footer">
              <button className="secondary" type="button" onClick={closeUploadModal}>Cancel</button>
              <button className="primary full" type="submit">
                <Upload size={16} /> Upload file
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <div className="doc-list-sections">
        <div className="doc-action-row">
          <button className="secondary" type="button" onClick={() => openCategoryEditor("create")}>
            <Plus size={16} /> New category
          </button>
        </div>
        {categoryEntries.length ? (
          <div className="doc-category-grid">
            {categoryEntries.map(({ category, slug, title, files: catFiles }) => (
              <article
                className={`doc-category-card doc-category-${slug}`}
                key={slug}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedDocCategory(slug)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedDocCategory(slug);
                  }
                }}
              >
                <div className="doc-category-card-header">
                  <div className="doc-category-icon-wrapper">
                    {getCategoryIcon(slug)}
                  </div>
                  <div className="doc-category-card-title-group">
                    <strong>{title}</strong>
                    {catFiles.length ? (
                      <span className="doc-category-card-meta">
                        Latest {formatUploadedTime(catFiles[0]?.created_at)}
                      </span>
                    ) : null}
                  </div>
                  <span className="doc-category-card-actions">
                    <button
                      className="icon-button compact"
                      type="button"
                      title="Rename category"
                      onClick={(event) => {
                        event.stopPropagation();
                        if (category.id) openCategoryEditor("rename", category);
                      }}
                    >
                      <Edit size={14} />
                    </button>
                    <button
                      className="icon-button compact danger"
                      type="button"
                      title="Delete category"
                      onClick={(event) => deleteCategory(event, category, catFiles.length)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </span>
                </div>

                <div className="doc-category-card-footer">
                  <span className="doc-category-card-count">
                    {catFiles.length} file{catFiles.length === 1 ? "" : "s"}
                  </span>
                  <div className="doc-category-card-footer-actions">
                    <button
                      className="card-action-link"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        openUploadModalForCategory(slug);
                      }}
                    >
                      <Upload size={12} /> Upload
                    </button>
                    <span className="doc-category-card-action">Open &rarr;</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <Section title="Uploaded Documents" eyebrow="0 files" className="doc-list-section">
            <p className="empty">Upload SOPs, proposals, certificates, transcripts, CVs, and other prepared files here. Link them from sheet records.</p>
          </Section>
        )}
      </div>

      {selectedDocCategory ? (
        <div className="modal-backdrop" onClick={() => setSelectedDocCategory(null)}>
          <div className="modal-panel doc-category-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <p className="eyebrow">{selectedCategoryFiles.length} document{selectedCategoryFiles.length === 1 ? "" : "s"}</p>
                <h2>{selectedCategoryEntry?.title || formatCategoryTitle(selectedDocCategory)}</h2>
              </div>
              <button className="icon-button" type="button" onClick={() => setSelectedDocCategory(null)} title="Close files">
                <X size={20} />
              </button>
            </div>
            <div className="modal-content doc-category-modal-content">
              <div className="doc-file-list">
                {selectedCategoryFiles.map(renderDocumentFile)}
                {!selectedCategoryFiles.length ? <p className="empty">No documents in this category yet.</p> : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {categoryEditor ? (
        <div className="modal-backdrop" onClick={() => setCategoryEditor(null)}>
          <form className="modal-panel small-modal-panel doc-category-editor" onClick={(event) => event.stopPropagation()} onSubmit={saveCategory}>
            <div className="modal-header">
              <h2>{categoryEditor.mode === "rename" ? "Rename Category" : "Create Category"}</h2>
              <button className="icon-button" type="button" onClick={() => setCategoryEditor(null)} title="Close category form">
                <X size={20} />
              </button>
            </div>
            <div className="modal-content">
              <label className="field">
                <span>Category name</span>
                <input
                  autoFocus
                  value={categoryName}
                  onChange={(event) => setCategoryName(event.target.value)}
                  placeholder="Recommendation letters"
                  required
                />
              </label>
            </div>
            <div className="modal-footer">
              <button className="secondary" type="button" onClick={() => setCategoryEditor(null)}>Cancel</button>
              <button className="primary" type="submit">{categoryEditor.mode === "rename" ? "Save category" : "Create category"}</button>
            </div>
          </form>
        </div>
      ) : null}

      {editingFile ? (
        <div className="modal-backdrop" onClick={() => setEditingFile(null)}>
          <form className="modal-panel small-modal-panel" onClick={(event) => event.stopPropagation()} onSubmit={saveFileEdit}>
            <div className="modal-header">
              <h2>Edit Document</h2>
              <button className="icon-button" type="button" onClick={() => setEditingFile(null)} title="Close form">
                <X size={20} />
              </button>
            </div>
            <div className="modal-content" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <label className="field">
                <span>Document title</span>
                <input
                  value={editFileForm.display_name}
                  onChange={(e) => setEditFileForm(prev => ({ ...prev, display_name: e.target.value }))}
                  required
                />
              </label>
              <label className="field">
                <span>Category</span>
                <select
                  value={editFileForm.file_type}
                  onChange={(e) => setEditFileForm(prev => ({ ...prev, file_type: e.target.value }))}
                >
                  {categoryOptions.some((item) => item.slug === editFileForm.file_type) ? null : (
                    <option value={editFileForm.file_type}>{formatCategoryTitle(editFileForm.file_type)}</option>
                  )}
                  {categoryOptions.map((item) => <option key={item.slug} value={item.slug}>{item.display_name}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Notes (optional)</span>
                <textarea
                  value={editFileForm.notes}
                  onChange={(e) => setEditFileForm(prev => ({ ...prev, notes: e.target.value }))}
                  rows={3}
                />
              </label>
            </div>
            <div className="modal-footer" style={{ padding: "16px 24px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", gap: "12px" }}>
              <button className="secondary" type="button" onClick={() => setEditingFile(null)}>Cancel</button>
              <button className="primary" type="submit">Save changes</button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

type SelectOption = string | { value: string; label: string };
type FieldConfig = [string, string, boolean?, number?, SelectOption[]?];

function DataForm({
  fields,
  form,
  setForm,
  onSubmit
}: {
  fields: FieldConfig[];
  form: Record<string, string>;
  setForm: (name: string, value: string) => void;
  onSubmit: () => Promise<void>;
}) {
  const submitForm = async (event: FormEvent) => {
    event.preventDefault();
    await onSubmit();
  };
  return (
    <form className="form-grid" onSubmit={submitForm}>
      {fields.map(([name, label, required, rows, options]) => (
        <Field
          key={name}
          label={label}
          name={name}
          value={form[name] ?? ""}
          required={required}
          rows={rows || undefined}
          options={options}
          onChange={setForm}
        />
      ))}
      <button className="primary full" type="submit">
        Save
      </button>
    </form>
  );
}

function List({ items, empty, onClick, render }: { items: RecordMap[]; empty: string; onClick?: (item: RecordMap) => void; render: (item: RecordMap) => ReactNode }) {
  if (!items.length) {
    return <p className="empty">{empty}</p>;
  }
  return (
    <div className="list">
      {items.map((item) => (
        <article
          key={item.id}
          onClick={onClick ? () => onClick(item) : undefined}
          style={onClick ? { cursor: 'pointer' } : undefined}
        >
          {render(item)}
        </article>
      ))}
    </div>
  );
}

function useForm(initial: Record<string, string>): [Record<string, string>, (name: string, value: string) => void] {
  const [form, setForm] = useState(initial);
  const update = (name: string, value: string) => setForm((current) => ({ ...current, [name]: value }));
  return [form, update];
}

async function submit(
  table: string,
  form: Record<string, string>,
  setForm: (name: string, value: string) => void,
  onChanged: () => Promise<void>
) {
  await createRecord(table, cleanData(form));
  await onChanged();
}

function cleanData(data: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(data)
      .filter(([, value]) => value !== "")
      .map(([key, value]) => {
        const numericKeys = new Set(["id", "university_id", "program_id", "professor_id", "degree_workspace_id", "application_id", "template_id", "document_id", "email_draft_id", "owner_id"]);
        return [key, numericKeys.has(key) ? Number(value) : value];
      })
  );
}

function findName(rows: RecordMap[], id: string | null | undefined) {
  return rows.find((item) => String(item.id) === String(id))?.name ?? "";
}
