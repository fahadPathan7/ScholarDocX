import {
  defaultNotificationSettings,
  getNotificationSettingLabel,
  isNotificationSettingLocked,
  notificationSettingsIntro,
  notificationPreferenceTabs,
  normalizeNotificationSettings
} from "../config/notificationLabels";
import { Bell, Route, FileText, Database, PencilLine, MessageCircle, BellRing, Settings, ShieldCheck, User, Zap, Bot, ExternalLink, X, ChevronRight, LogOut, Edit2, Plus, Image as ImageIcon, Check, CheckCircle2, FolderOpen, Globe, Mail, Save, Sparkles } from "lucide-react";
import { AiTokenWidget } from "./AiTokenWidget";
import { api, RecordMap } from "../lib/api";
import { AVATAR_OPTIONS, avatarImageSrc, getAvatarById } from "../data/avatars";
import { useAuth } from "../contexts/AuthContext";
import { UsageModal } from "./UsageModal";
import { getPlanDaysRemaining, getUserPlanStatus } from "../lib/auth";

type ProfileData = {
  display_name: string;
  email: string;
  preferred_email_provider: string;
  timezone: string;
  notes: string;
  avatar: string;
};

const empty: ProfileData = {
  display_name: "",
  email: "",
  preferred_email_provider: "gmail",
  timezone: "",
  notes: "",
  avatar: "",
};

const TIMEZONE_OPTIONS = [
  { value: "Asia/Dhaka", label: "GMT+06:00 - Asia/Dhaka" },
  { value: "Asia/Kolkata", label: "GMT+05:30 - Asia/Kolkata" },
  { value: "Asia/Karachi", label: "GMT+05:00 - Asia/Karachi" },
  { value: "Asia/Dubai", label: "GMT+04:00 - Asia/Dubai" },
  { value: "Europe/London", label: "GMT+00:00 - Europe/London" },
  { value: "Europe/Berlin", label: "GMT+01:00 - Europe/Berlin" },
  { value: "America/New_York", label: "GMT-05:00 - America/New_York" },
  { value: "America/Chicago", label: "GMT-06:00 - America/Chicago" },
  { value: "America/Denver", label: "GMT-07:00 - America/Denver" },
  { value: "America/Los_Angeles", label: "GMT-08:00 - America/Los_Angeles" },
  { value: "UTC", label: "GMT+00:00 - UTC" }
];

import { FormEvent, useEffect, useState } from "react";

export function ProfileView({
  workspace,
  onToast,
  onViewPlans,
  onBuyCredits,
  onViewAdmin,
}: {
  workspace: RecordMap | null;
  onToast?: (msg: string) => void;
  onViewPlans?: () => void;
  onBuyCredits?: () => void;
  onViewAdmin?: () => void;
}) {
  const { logout, user, refreshUser } = useAuth();
  const [draft, setDraft] = useState<ProfileData>(empty);
  const [saved, setSaved] = useState<ProfileData>(empty);
  const [justSaved, setJustSaved] = useState(false);
  const [avatarJustSaved, setAvatarJustSaved] = useState(false);
  const [showUsageModal, setShowUsageModal] = useState(false);
  const [showIdentityModal, setShowIdentityModal] = useState(false);
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [showWorkspaceModal, setShowWorkspaceModal] = useState(false);
  const [notificationSettings, setNotificationSettings] = useState<Record<string, boolean>>(defaultNotificationSettings);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [activeNotificationTab, setActiveNotificationTab] = useState<"workspace" | "admin">("workspace");

  // Password change state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [profileId, setProfileId] = useState<number | null>(null);

  const planStatus = getUserPlanStatus(user?.plan_ends_at);
  const planDaysRemaining = getPlanDaysRemaining(user?.plan_ends_at);
  const planCardTone = planStatus === "expired"
    ? {
        headerClass: "text-rose-800",
        iconClass: "text-rose-600",
        hintClass: "text-rose-900",
        panelClass: "bg-rose-50/80 border border-rose-200 text-rose-900",
        actionsStyle: { borderColor: "rgba(244, 63, 94, 0.35)", background: "rgba(255, 255, 255, 0.78)" },
        badgeClass: "bg-rose-100 text-rose-700",
      }
    : planStatus === "warning"
      ? {
          headerClass: "text-amber-800",
          iconClass: "text-amber-600",
          hintClass: "text-amber-900",
          panelClass: "bg-amber-50/80 border border-amber-200 text-amber-900",
          actionsStyle: { borderColor: "rgba(245, 158, 11, 0.35)", background: "rgba(255, 255, 255, 0.78)" },
          badgeClass: "bg-amber-100 text-amber-700",
        }
      : {
          headerClass: "text-emerald-700",
          iconClass: "text-emerald-500",
          hintClass: "text-emerald-800",
          panelClass: "bg-emerald-50/50 border border-emerald-100/50 text-emerald-800",
          actionsStyle: { borderColor: "rgba(16, 185, 129, 0.3)", background: "rgba(255, 255, 255, 0.6)" },
          badgeClass: "bg-emerald-100 text-emerald-700",
        };

  const planHintText = planStatus === "expired"
    ? "Your plan has expired. Renew or change your plan to restore full workspace access."
    : planStatus === "warning"
      ? `Your plan ends ${planDaysRemaining === 0 ? "today" : `in ${planDaysRemaining} day${planDaysRemaining === 1 ? "" : "s"}`}. Renew or change your plan to avoid interruption.`
      : "Upgrade to unlock premium features, higher AI limits, and dedicated support.";

  useEffect(() => {
    // Refresh user context to ensure latest roles from database
    refreshUser().catch(console.error);

    api.get<RecordMap[]>("/local_profiles").then((rows) => {
      const first = rows[0];
      if (first) {
        setProfileId(first.id as number);
        const loaded: ProfileData = {
          display_name: first.display_name ?? "",
          email: first.email ?? "",
          preferred_email_provider: first.preferred_email_provider ?? "gmail",
          timezone: first.timezone ?? "",
          notes: first.notes ?? "",
          avatar: first.avatar ?? "",
        };
        setDraft(loaded);
        setSaved(loaded);
        if (first.notification_settings) {
          try {
            setNotificationSettings(normalizeNotificationSettings(JSON.parse(first.notification_settings as string)));
          } catch (e) {
            setNotificationSettings({ ...defaultNotificationSettings });
          }
        } else {
          setNotificationSettings({ ...defaultNotificationSettings });
        }
      }
    });
  }, []);

  const saveNotificationSettings = async (newSettings: Record<string, boolean>) => {
    if (!profileId) return;
    setNotificationSettings(newSettings);
    try {
      await api.patch(`/local_profiles/${profileId}`, {
        data: { notification_settings: JSON.stringify(newSettings) }
      });
    } catch (e) {
      setNotificationSettings(notificationSettings);
    }
  };

  const toggleNotificationSetting = async (key: string) => {
    if (isNotificationSettingLocked(key)) return;
    const newSettings = { ...notificationSettings, [key]: !notificationSettings[key] };
    await saveNotificationSettings(newSettings);
  };

  const toggleAllInCategory = async (categorySettings: { key: string }[], selectAll: boolean) => {
    const newSettings = { ...notificationSettings };
    categorySettings.forEach((setting) => {
      if (isNotificationSettingLocked(setting.key)) return;
      newSettings[setting.key] = selectAll;
    });
    await saveNotificationSettings(newSettings);
  };

  const toggleAllNotifications = async (selectAll: boolean, categories = notificationPreferenceTabs.find((tab) => tab.id === activeNotificationTab)?.categories || []) => {
    const newSettings: Record<string, boolean> = { ...notificationSettings };
    categories.forEach((category) => {
      category.settings.forEach((setting) => {
        if (isNotificationSettingLocked(setting.key)) return;
        newSettings[setting.key] = selectAll;
      });
    });
    await saveNotificationSettings(newSettings);
  };

  const update = (name: string, value: string) =>
    setDraft((current) => ({ ...current, [name]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const identity = {
      display_name: draft.display_name,
      preferred_email_provider: draft.preferred_email_provider,
      timezone: draft.timezone,
      notes: draft.notes,
    };
    if (!profileId) {
      const res = await api.post<RecordMap>("/local_profiles", { data: { ...identity, email: user?.email || "" } });
      setProfileId(res.id as number);
    } else {
      await api.patch(`/local_profiles/${profileId}`, { data: identity });
    }
    setSaved((current) => ({ ...current, ...identity }));
    onToast?.("Profile saved locally.");
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2000);
    setShowIdentityModal(false);
  };

  const saveAvatar = async () => {
    if (!profileId) {
      const res = await api.post<RecordMap>("/local_profiles", { data: { avatar: draft.avatar, email: user?.email || "" } });
      setProfileId(res.id as number);
    } else {
      await api.patch(`/local_profiles/${profileId}`, { data: { avatar: draft.avatar } });
    }
    setSaved((current) => ({ ...current, avatar: draft.avatar }));
    onToast?.("Avatar saved locally.");
    setAvatarJustSaved(true);
    setTimeout(() => setAvatarJustSaved(false), 2000);
    setShowAvatarModal(false);
  };

  const handleLogout = async () => {
    try {
      await api.post("/auth/logout", {});
    } catch (error) {
      // Backend logout is best-effort; local logout must always complete.
    }
    logout();
  };

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    setPasswordError("");
    
    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match.");
      return;
    }
    
    setIsChangingPassword(true);
    
    try {
      await api.post("/auth/me/password", {
        current_password: currentPassword,
        new_password: newPassword
      });
      onToast?.("Password changed successfully. You will be logged out.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      
      // Since all old sessions are invalidated, we need to log out the user locally too
      setTimeout(() => logout(), 1500);
    } catch (err: any) {
      setPasswordError(err.message || "Failed to change password");
    } finally {
      setIsChangingPassword(false);
    }
  };

  const selectedAvatar = getAvatarById(draft.avatar);
  const savedAvatar = getAvatarById(saved.avatar);

  const initials = saved.display_name
    ? saved.display_name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()
    : "?";

  const draftInitials = draft.display_name
    ? draft.display_name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()
    : "?";

  const aiConfigured = workspace?.ai?.fully_configured;

  const shortPath = (full: string | undefined) => {
    if (!full) return "Not initialized";
    const parts = full.replace(/\\/g, "/").split("/").filter(Boolean);
    return parts.length > 2 ? "…/" + parts.slice(-2).join("/") : full;
  };

  return (
    <div className="profile-page">
      {user?.is_active === false && (
        <div className="mx-8 mt-6 mb-2 rounded-lg bg-red-500/10 p-4 border border-red-500/20 flex items-center gap-3">
          <ShieldCheck size={20} className="text-red-500 shrink-0" />
          <div className="text-red-500 font-medium">
            Your account is currently suspended. Please contact the admin to restore access.
          </div>
        </div>
      )}

      {/* Hero — reflects saved state only */}
      <div className="profile-hero-wrapper">
        <div className="profile-hero-bg-anim">
          <div className="gradient-blob shape-1"></div>
          <div className="gradient-blob shape-2"></div>
          <div className="gradient-blob shape-3"></div>
        </div>
        <div className="profile-hero glass-panel">
          {savedAvatar ? (
            <img
              className="profile-avatar profile-avatar-img"
              src={avatarImageSrc(savedAvatar)}
              alt={savedAvatar.label}
            />
          ) : (
            <div className="profile-avatar">{initials}</div>
          )}
          <div className="profile-hero-text">
            <h2>{saved.display_name || "Your Profile"}</h2>
            <span>{saved.email || user?.email || "No email set"}</span>
            {user?.roles && user.roles.length > 0 && (
              <div className="flex gap-2 mt-2 profile-role-tags">
                {user.roles.map(role => (
                  <span key={role} className="role-tag">
                    {role.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="profile-layout" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}>
        {/* Left Column */}
        <div className="profile-meta-col">
          <div className="profile-system-card glass-panel">
            <div className="profile-system-header">
              <User size={16} className="text-indigo-500" />
              <strong>Personal Information</strong>
            </div>
            <p className="profile-system-hint" style={{ marginTop: 0, marginBottom: "12px" }}>
              Update your name, timezone, email preferences, and profile avatar.
            </p>
            <div className="profile-actions-stack">
              <button onClick={() => setShowIdentityModal(true)} className="profile-action-row" type="button">
                <div className="profile-action-content"><User size={16} className="text-slate-500" /> Edit Identity</div>
                <ChevronRight size={16} className="profile-action-chevron" />
              </button>

              <button onClick={() => setShowAvatarModal(true)} className="profile-action-row" type="button">
                <div className="profile-action-content"><User size={16} className="text-slate-500" /> Change Avatar</div>
                <ChevronRight size={16} className="profile-action-chevron" />
              </button>
            </div>
          </div>

          <div className="profile-system-card glass-panel">
            <div className="profile-system-header">
              <Bell size={16} className="text-amber-500" />
              <strong>Notification Preferences</strong>
            </div>
            <p className="profile-system-hint" style={{ marginTop: 0, marginBottom: "12px" }}>
              Control what email alerts and system notifications you receive.
            </p>
            <div className="profile-actions-stack">
              <button onClick={() => setShowNotificationsModal(true)} className="profile-action-row" type="button" style={{ borderBottom: "none" }}>
                <div className="profile-action-content"><Bell size={16} className="text-amber-500" /> Notification Settings</div>
                <ChevronRight size={16} className="profile-action-chevron" />
              </button>
            </div>
          </div>

          <div className="profile-system-card glass-panel">
            <div className="profile-system-header">
              <ShieldCheck size={16} className="text-rose-500" />
              <strong>Change Password</strong>
            </div>
            <p className="profile-system-hint" style={{ marginTop: 0, marginBottom: "12px" }}>
              Changing your password will log you out of all devices.
            </p>
            <div className="profile-actions-stack">
              <button onClick={() => setShowPasswordModal(true)} className="profile-action-row" type="button" style={{ borderBottom: "none" }}>
                <div className="profile-action-content"><ShieldCheck size={16} className="text-rose-500" /> Change Password</div>
                <ChevronRight size={16} className="profile-action-chevron" />
              </button>
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="profile-meta-col">
          {onViewPlans && (
            <div className="profile-system-card glass-panel plan-card">
              <div className={`profile-system-header ${planCardTone.headerClass}`}>
                <Sparkles size={16} className={planCardTone.iconClass} />
                <strong>Subscription & Plans</strong>
              </div>
              <p className={`profile-system-hint ${planCardTone.hintClass}`} style={{ marginTop: 0, marginBottom: "8px" }}>
                {planHintText}
              </p>
              {(user?.plan_started_at || user?.plan_ends_at) && (
                <div className={`rounded-lg p-3 mb-3 text-[13px] ${planCardTone.panelClass}`}>
                  {planStatus !== "active" && planStatus !== "no_plan" && (
                    <div className="mb-2">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${planCardTone.badgeClass}`}>
                        {planStatus === "expired" ? "Plan expired" : "Plan ending soon"}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between items-center mb-1">
                    <span className="opacity-70 font-medium">Plan Started:</span>
                    <span className="font-semibold">{user.plan_started_at ? new Date(user.plan_started_at).toLocaleDateString("en-GB") : 'N/A'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="opacity-70 font-medium">Plan Ends:</span>
                    <span className="font-semibold">{user.plan_ends_at ? new Date(user.plan_ends_at).toLocaleDateString("en-GB") : 'N/A'}</span>
                  </div>
                  {planStatus === "warning" && planDaysRemaining !== null && (
                    <p className="mt-2 text-xs font-medium">
                      {planDaysRemaining === 0 ? "This plan ends today." : `${planDaysRemaining} day${planDaysRemaining === 1 ? "" : "s"} remaining.`}
                    </p>
                  )}
                  {planStatus === "expired" && (
                    <p className="mt-2 text-xs font-medium">
                      Full workspace access is paused until you renew or change your plan.
                    </p>
                  )}
                </div>
              )}
              <div className="profile-actions-stack" style={planCardTone.actionsStyle}>
                <button onClick={onBuyCredits} className="profile-action-row" type="button">
                  <div className="profile-action-content">
                    <Zap size={16} className={planCardTone.iconClass} />
                    Buy More AI Credits
                  </div>
                  <AiTokenWidget interactive={false} />
                </button>
                <button onClick={onViewPlans} className="profile-action-row" type="button">
                  <div className="profile-action-content">
                    <Sparkles size={16} className={planCardTone.iconClass} />
                    {planStatus === "expired" ? "Renew or Change Plan" : planStatus === "warning" ? "Review Renewal Options" : "View Subscription Plans"}
                  </div>
                  <ChevronRight size={16} className={`profile-action-chevron ${planCardTone.iconClass}`} />
                </button>
              </div>
            </div>
          )}

          <div className="profile-system-card glass-panel">
            <div className="profile-system-header">
              <Zap size={16} className="text-violet-500" />
              <strong>Usage & AI Models</strong>
            </div>
            <p className="profile-system-hint" style={{ marginTop: 0, marginBottom: "0" }}>
              Monitor workspace resource usage and explore available AI models.
            </p>
            <div className="profile-actions-stack">
              <button onClick={() => setShowUsageModal(true)} className="profile-action-row" type="button" style={{ borderBottom: "none" }}>
                <div className="profile-action-content"><Zap size={16} className="text-slate-500" /> View Usage & Limits</div>
                <ChevronRight size={16} className="profile-action-chevron" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="profile-page-logout-row">
        <button className="profile-save-button profile-logout-button" type="button" onClick={handleLogout}>
          Logout
        </button>
      </div>

      {showUsageModal && (
        <UsageModal onClose={() => setShowUsageModal(false)} />
      )}

      {showPasswordModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center backdrop-blur-sm" style={{ background: 'rgba(30, 41, 37, 0.4)' }} onClick={() => setShowPasswordModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200/60" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2 text-slate-800 font-semibold">
                <ShieldCheck size={18} className="text-indigo-600" />
                <h3>Change Password</h3>
              </div>
              <button onClick={() => setShowPasswordModal(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-100 transition-colors">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>
            
            <div className="p-6">
              <p className="text-sm text-slate-500 mb-6 leading-relaxed">
                Choose a strong password. Note that changing your password will immediately sign you out of all devices to protect your account.
              </p>
              
              <form onSubmit={handleChangePassword} className="space-y-4">
                {passwordError && (
                  <div className="p-3 bg-rose-50 border border-rose-100 text-rose-600 text-sm rounded-lg flex items-start gap-2">
                    <span className="mt-0.5">⚠️</span>
                    <span>{passwordError}</span>
                  </div>
                )}
                
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5 uppercase tracking-wide">Current Password</label>
                  <input
                    type="password"
                    placeholder="Enter your current password"
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all placeholder:text-slate-400"
                  />
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5 uppercase tracking-wide">New Password</label>
                  <input
                    type="password"
                    placeholder="Enter a strong new password"
                    required
                    minLength={3}
                    maxLength={10}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all placeholder:text-slate-400"
                  />
                  <p className="text-[11px] text-slate-400 mt-1.5">Between 3 and 10 characters.</p>
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5 uppercase tracking-wide">Confirm New Password</label>
                  <input
                    type="password"
                    placeholder="Retype your new password"
                    required
                    minLength={3}
                    maxLength={10}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all placeholder:text-slate-400"
                  />
                </div>

                <div className="pt-4 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowPasswordModal(false)}
                    className="px-4 py-2.5 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isChangingPassword || !currentPassword || !newPassword || !confirmPassword}
                    className="px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-xl hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm shadow-indigo-600/20"
                  >
                    {isChangingPassword ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        Updating...
                      </>
                    ) : "Update Password"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}


      {showIdentityModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center backdrop-blur-sm" style={{ background: 'rgba(30, 41, 37, 0.4)' }} onClick={() => setShowIdentityModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-200/60" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2 text-slate-800 font-semibold">
                <User size={18} className="text-indigo-600" />
                <h3>Edit Identity</h3>
              </div>
              <button onClick={() => setShowIdentityModal(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-100 transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="p-0">
              <form className="profile-form-fields" onSubmit={submit} style={{ margin: 0, padding: '24px', background: 'transparent' }}>
                <div className="profile-field-row">
                  <label className="field">
                    <span>Display name</span>
                    <input
                      value={draft.display_name}
                      onChange={(e) => update("display_name", e.target.value)}
                      placeholder="Your full name"
                      required
                    />
                  </label>
                  <label className="field">
                    <span>Email</span>
                    <input
                      className="profile-readonly-input"
                      value={draft.email || user?.email || ""}
                      placeholder="you@example.com"
                      type="email"
                      readOnly
                      disabled
                      title="Email cannot be changed from profile"
                    />
                  </label>
                </div>
                <div className="profile-field-row">
                  <label className="field">
                    <span>Timezone</span>
                    <select
                      value={draft.timezone}
                      onChange={(e) => update("timezone", e.target.value)}
                    >
                      <option value="">Select timezone</option>
                      {draft.timezone && !TIMEZONE_OPTIONS.some((option) => option.value === draft.timezone) ? (
                        <option value={draft.timezone}>{draft.timezone}</option>
                      ) : null}
                      {TIMEZONE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Preferred email provider</span>
                    <select
                      value={draft.preferred_email_provider}
                      onChange={(e) => update("preferred_email_provider", e.target.value)}
                    >
                      <option value="gmail">Gmail (web)</option>
                      <option value="outlook">Outlook (web)</option>
                    </select>
                  </label>
                </div>
                <label className="field field-profile-notes">
                  <span>Notes <small>(optional)</small></span>
                  <textarea
                    value={draft.notes}
                    onChange={(e) => update("notes", e.target.value)}
                    rows={3}
                    placeholder="Any personal notes about your application journey…"
                  />
                </label>

                <div className="profile-form-actions mt-4" style={{ display: 'flex', gap: '10px' }}>
                  <button type="button" onClick={() => setShowIdentityModal(false)} className="profile-secondary-button" style={{ width: 'auto' }}>
                    Cancel
                  </button>
                  <button className={justSaved ? "profile-save-button saved" : "profile-save-button"} type="submit" style={{ flex: 1, marginTop: 0 }}>
                    {justSaved ? <><CheckCircle2 size={16} /> Saved</> : <><Save size={16} /> Save profile</>}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {showAvatarModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center backdrop-blur-sm" style={{ background: 'rgba(30, 41, 37, 0.4)' }} onClick={() => setShowAvatarModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-200/60" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2 text-slate-800 font-semibold">
                <User size={18} className="text-purple-600" />
                <h3>Change Avatar</h3>
              </div>
              <button onClick={() => setShowAvatarModal(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-100 transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="p-6 pb-4">
              <div className="profile-avatar-preview" style={{ marginBottom: '16px' }}>
                {selectedAvatar ? (
                  <img className="profile-avatar profile-avatar-img profile-avatar-xl" src={avatarImageSrc(selectedAvatar)} alt={selectedAvatar.label} />
                ) : (
                  <div className="profile-avatar profile-avatar-xl">{draftInitials}</div>
                )}
                <div className="profile-avatar-preview-meta">
                  <strong>{selectedAvatar?.label ?? "Initials"}</strong>
                  <span>Shows after you save</span>
                </div>
              </div>

              <div className="avatar-picker-section avatar-picker-compact" style={{ marginBottom: '16px' }}>
                <div className="avatar-picker-grid" style={{ paddingBottom: '8px' }}>
                  {AVATAR_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={`avatar-option ${draft.avatar === option.id ? "selected" : ""}`}
                      onClick={() => update("avatar", option.id)}
                      title={option.label}
                    >
                      <img src={avatarImageSrc(option)} alt={option.label} width={44} height={44} />
                      {draft.avatar === option.id && <span className="avatar-check">✓</span>}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={`avatar-option avatar-option-none ${draft.avatar === "" ? "selected" : ""}`}
                    onClick={() => update("avatar", "")}
                    title="Use initials"
                  >
                    <span className="avatar-initials-preview">{draftInitials}</span>
                    {draft.avatar === "" && <span className="avatar-check">✓</span>}
                  </button>
                </div>
              </div>

              <div className="profile-form-actions" style={{ display: 'flex', gap: '10px' }}>
                <button type="button" onClick={() => setShowAvatarModal(false)} className="profile-secondary-button" style={{ width: 'auto' }}>
                  Cancel
                </button>
                <button
                  className={avatarJustSaved ? "profile-save-button saved" : "profile-save-button"}
                  type="button"
                  onClick={saveAvatar}
                  style={{ flex: 1, marginTop: 0 }}
                >
                  {avatarJustSaved ? <><CheckCircle2 size={16} /> Saved</> : <><Save size={16} /> Save avatar</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showNotificationsModal && (
        <div className="absolute inset-0 z-50 flex items-start justify-center pt-20 pb-16 backdrop-blur-sm" style={{ background: 'rgba(30, 41, 37, 0.4)' }} onClick={() => setShowNotificationsModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl flex flex-col w-full mx-4" style={{ width: "960px", maxWidth: "94vw", maxHeight: "calc(100vh - 14rem)" }} onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-slate-200 shrink-0 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Bell className="w-5 h-5 text-indigo-500" />
                <div>
                  <h2 className="text-xl font-bold text-slate-800">Notification Settings</h2>
                  <p className="text-sm text-slate-500">{notificationSettingsIntro}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => toggleAllNotifications(true)} className="text-xs font-medium px-3 py-1.5 bg-white border border-slate-200 rounded-md hover:bg-slate-50 text-slate-700 transition-colors">Select Tab</button>
                <button onClick={() => toggleAllNotifications(false)} className="text-xs font-medium px-3 py-1.5 bg-white border border-slate-200 rounded-md hover:bg-slate-50 text-slate-700 transition-colors">Unselect Tab</button>
                <button onClick={() => setShowNotificationsModal(false)} className="p-2 hover:bg-slate-100 rounded-lg transition-colors"><X size={20} className="text-slate-500" /></button>
              </div>
            </div>
            <div className="overflow-y-auto flex-1 p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {notificationPreferenceTabs.map((tab) => {
                  const isActive = activeNotificationTab === tab.id;
                  return (
                    <button key={tab.id} type="button" onClick={() => setActiveNotificationTab(tab.id as any)} className={`text-left rounded-2xl border px-4 py-3 transition-all ${isActive ? "border-indigo-200 bg-indigo-50/70 shadow-sm" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className={`text-sm font-semibold ${isActive ? "text-indigo-800" : "text-slate-800"}`}>{tab.label}</p>
                          <p className="text-xs text-slate-500 mt-1">{tab.description}</p>
                        </div>
                        {tab.id === "workspace" ? <Bell className={`w-4 h-4 ${isActive ? "text-indigo-600" : "text-slate-400"}`} /> : <BellRing className={`w-4 h-4 ${isActive ? "text-indigo-600" : "text-slate-400"}`} />}
                      </div>
                    </button>
                  );
                })}
              </div>
              {(notificationPreferenceTabs.find((tab) => tab.id === activeNotificationTab)?.categories || []).map((category) => {
                const iconMap: Record<string, any> = { Route, FileText, Database, PencilLine, MessageCircle, Bell };
                const IconComponent = iconMap[category.icon] || FileText;
                const selectableKeys = category.settings.filter((setting) => !isNotificationSettingLocked(setting.key));
                const allSelected = selectableKeys.length > 0 && selectableKeys.every((s) => notificationSettings[s.key]);
                const noneSelected = selectableKeys.every((s) => !notificationSettings[s.key]);
                return (
                  <div key={category.title} className="pb-6 border-b border-slate-100 last:border-0 last:pb-0">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-md font-semibold text-slate-800 flex items-center gap-2"><IconComponent className="w-4 h-4 text-slate-500" />{category.title}</h3>
                      <div className="flex gap-2">
                        <button type="button" className="text-[11px] font-medium text-indigo-600 hover:text-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wider" onClick={() => toggleAllInCategory(category.settings, true)} disabled={selectableKeys.length === 0 || allSelected}>Select All</button>
                        <button type="button" className="text-[11px] font-medium text-slate-500 hover:text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wider" onClick={() => toggleAllInCategory(category.settings, false)} disabled={selectableKeys.length === 0 || noneSelected}>Unselect All</button>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {category.settings.map((setting) => (
                        <label key={setting.key} className={`flex items-start gap-3 p-3 rounded-lg border transition-colors group ${isNotificationSettingLocked(setting.key) ? "border-amber-100 bg-amber-50/70 cursor-not-allowed" : "border-slate-100 bg-slate-50/50 hover:bg-slate-50 cursor-pointer"}`}>
                          <div className="flex items-center h-5">
                            <input type="checkbox" className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer" checked={!!notificationSettings[setting.key]} disabled={isNotificationSettingLocked(setting.key)} onChange={() => toggleNotificationSetting(setting.key)} />
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-slate-700 group-hover:text-slate-900 leading-tight">{getNotificationSettingLabel(setting.key)}</span>
                              {isNotificationSettingLocked(setting.key) && <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">Always on</span>}
                            </div>
                            {setting.description && <p className="text-xs text-slate-500">{setting.description}</p>}
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="px-6 py-4 border-t border-slate-200 shrink-0 flex justify-end">
              <button onClick={() => setShowNotificationsModal(false)} className="px-5 py-2.5 text-sm font-medium text-white bg-slate-600 rounded-lg hover:bg-slate-700 transition-colors">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
