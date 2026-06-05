import { Check, CheckCircle2, Database, FolderOpen, Globe, Mail, Save, Sparkles, ShieldCheck, User, Zap, Bot, ExternalLink, X } from "lucide-react";
import { api, RecordMap } from "../lib/api";
import { AVATAR_OPTIONS, avatarImageSrc, getAvatarById } from "../data/avatars";
import { useAuth } from "../contexts/AuthContext";
import { UsageModal } from "./UsageModal";

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
  onViewAdmin,
}: {
  workspace: RecordMap | null;
  onToast?: (msg: string) => void;
  onViewPlans?: () => void;
  onViewAdmin?: () => void;
}) {
  const { logout, user } = useAuth();
  const [draft, setDraft] = useState<ProfileData>(empty);
  const [saved, setSaved] = useState<ProfileData>(empty);
  const [justSaved, setJustSaved] = useState(false);
  const [avatarJustSaved, setAvatarJustSaved] = useState(false);
  const [showUsageModal, setShowUsageModal] = useState(false);
  const [showModelsModal, setShowModelsModal] = useState(false);
  const [showIdentityModal, setShowIdentityModal] = useState(false);
  const [showAvatarModal, setShowAvatarModal] = useState(false);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [profileId, setProfileId] = useState<number | null>(null);

  useEffect(() => {
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
      }
    });
  }, []);

  const update = (name: string, value: string) =>
    setDraft((current) => ({ ...current, [name]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!profileId) return;
    const identity = {
      display_name: draft.display_name,
      preferred_email_provider: draft.preferred_email_provider,
      timezone: draft.timezone,
      notes: draft.notes,
    };
    await api.patch(`/local_profiles/${profileId}`, { data: identity });
    setSaved((current) => ({ ...current, ...identity }));
    onToast?.("Profile saved locally.");
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2000);
    setShowIdentityModal(false);
  };

  const saveAvatar = async () => {
    if (!profileId) return;
    await api.patch(`/local_profiles/${profileId}`, { data: { avatar: draft.avatar } });
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
    setIsChangingPassword(true);
    
    try {
      await api.post("/auth/me/password", {
        current_password: currentPassword,
        new_password: newPassword
      });
      onToast?.("Password changed successfully. You will be logged out.");
      setCurrentPassword("");
      setNewPassword("");
      
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

      {/* Hero — reflects saved state only */}
      <div className="profile-hero">
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
          <span>{saved.email || "No email set"}</span>
          {user?.roles && user.roles.length > 0 && (
            <div className="flex gap-2 mt-2">
              {user.roles.map(role => (
                <span key={role} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-white/20 text-white capitalize shadow-sm border border-white/30">
                  {role.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="profile-layout" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}>
        {/* Left Column */}
        <div className="profile-meta-col">
          <div className="profile-system-card">
            <div className="profile-system-header">
              <User size={16} />
              <strong>Personal Information</strong>
            </div>
            <p className="profile-system-hint" style={{ marginTop: 0, marginBottom: "12px" }}>
              Update your name, timezone, email preferences, and profile avatar.
            </p>
            <div className="profile-actions-stack" style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "12px" }}>
              <button
                onClick={() => setShowIdentityModal(true)}
                className="profile-secondary-button"
                type="button"
              >
                <User size={14} className="text-blue-500" /> Edit Identity
              </button>
              
              <button
                onClick={() => setShowAvatarModal(true)}
                className="profile-secondary-button"
                type="button"
              >
                <User size={14} className="text-purple-500" /> Change Avatar
              </button>
            </div>
          </div>

          <div className="profile-system-card profile-workspace-card">
            <div className="profile-system-header">
              <Database size={16} />
              <strong>Workspace</strong>
            </div>
            <div className="profile-path-list">
              <div className="profile-path-item">
                <FolderOpen size={14} />
                <div>
                  <span>Workspace</span>
                  <code title={workspace?.workspace_path || ""}>{shortPath(workspace?.workspace_path)}</code>
                </div>
              </div>
              <div className="profile-path-item">
                <Database size={14} />
                <div>
                  <span>Database</span>
                  <code title={workspace?.database_path || ""}>{shortPath(workspace?.database_path)}</code>
                </div>
              </div>
              <div className="profile-path-item">
                <Globe size={14} />
                <div>
                  <span>Email provider</span>
                  <code>{saved.preferred_email_provider || "gmail"}</code>
                </div>
              </div>
              <div className="profile-path-item">
                <Mail size={14} />
                <div>
                  <span>Contact email</span>
                  <code>{saved.email || "—"}</code>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="profile-meta-col">
          {onViewPlans && (
            <div className="profile-system-card" style={{ 
              background: "linear-gradient(145deg, rgba(236, 253, 245, 0.9), rgba(209, 250, 229, 0.5))", 
              borderColor: "rgba(16, 185, 129, 0.2)",
              boxShadow: "0 4px 12px rgba(16, 185, 129, 0.08)"
            }}>
              <div className="profile-system-header" style={{ color: "#065f46" }}>
                <Sparkles size={16} className="text-emerald-500" />
                <strong style={{ color: "#065f46" }}>Subscription & Plans</strong>
              </div>
              <p className="profile-system-hint" style={{ marginTop: 0, marginBottom: "12px", color: "#047857" }}>
                Upgrade to unlock premium features, higher AI limits, and dedicated support.
              </p>
              <button
                onClick={onViewPlans}
                className="profile-secondary-button"
                style={{ 
                  backgroundColor: "#10b981", 
                  color: "white", 
                  borderColor: "transparent",
                  boxShadow: "0 2px 6px rgba(16, 185, 129, 0.3)"
                }}
                type="button"
              >
                <Sparkles size={14} className="text-white" /> View Subscription Plans
              </button>
            </div>
          )}

          {user?.roles?.some(r => ['super_admin', 'general_admin'].includes(r)) && onViewAdmin && (
            <div className="profile-system-card" style={{ 
              background: "linear-gradient(145deg, rgba(239, 246, 255, 0.9), rgba(219, 234, 254, 0.5))", 
              borderColor: "rgba(59, 130, 246, 0.2)",
              boxShadow: "0 4px 12px rgba(59, 130, 246, 0.08)"
            }}>
              <div className="profile-system-header" style={{ color: "#1e40af" }}>
                <ShieldCheck size={16} className="text-blue-500" />
                <strong style={{ color: "#1e40af" }}>Admin Panel</strong>
              </div>
              <p className="profile-system-hint" style={{ marginTop: 0, marginBottom: "12px", color: "#1e3a8a" }}>
                You have administrative privileges. Access the Admin Panel to manage users, roles, and platform settings.
              </p>
              <button
                onClick={onViewAdmin}
                className="profile-secondary-button"
                style={{ 
                  backgroundColor: "#3b82f6", 
                  color: "white", 
                  borderColor: "transparent",
                  boxShadow: "0 2px 6px rgba(59, 130, 246, 0.3)"
                }}
                type="button"
              >
                <ShieldCheck size={14} className="text-white" /> Go to Admin Panel
              </button>
            </div>
          )}

          <div className="profile-system-card">
            <div className="profile-system-header">
              <Zap size={16} />
              <strong>Usage & AI Models</strong>
            </div>
            <p className="profile-system-hint" style={{ marginTop: 0, marginBottom: "0" }}>
              Monitor your workspace resource usage and explore available AI models.
            </p>
            <div className="profile-actions-stack" style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "12px" }}>
              <button
                onClick={() => setShowUsageModal(true)}
                className="profile-secondary-button"
                type="button"
              >
                <Zap size={14} className="text-amber-500" /> View Usage & Limits
              </button>
              
              <button
                onClick={() => setShowModelsModal(true)}
                className="profile-secondary-button"
                type="button"
              >
                <Bot size={14} className="text-indigo-500" /> Explore AI Models
              </button>
            </div>
          </div>

          <div className="profile-system-card">
            <div className="profile-system-header">
              <ShieldCheck size={16} />
              <strong>Change Password</strong>
            </div>
            <p className="profile-system-hint" style={{ marginTop: 0, marginBottom: "12px" }}>
              Changing your password will log you out of all devices.
            </p>
            <button
              onClick={() => setShowPasswordModal(true)}
              className="profile-secondary-button w-full justify-center"
              type="button"
            >
              <ShieldCheck size={14} className="text-slate-500" /> Change Password
            </button>
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
                    disabled={isChangingPassword || !currentPassword || !newPassword}
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

      {showModelsModal && (
        <div className="modal-backdrop models-modal-backdrop" onClick={() => setShowModelsModal(false)}>
          <div className="modal-panel models-modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header models-modal-header">
              <div>
                <p className="eyebrow">AI Assistant</p>
                <h2>AI Models Comparison</h2>
              </div>
              <button className="icon-button close-btn" type="button" onClick={() => setShowModelsModal(false)} title="Close form">
                <X size={20} />
              </button>
            </div>
            <div className="modal-content models-modal-content">
              <table className="about-models-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Provider</th>
                    <th>Model</th>
                    <th>Context</th>
                    <th>Reasoning</th>
                    <th>Speed</th>
                    <th>Performance</th>
                    <th>Tool Use</th>
                    <th>Score</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="rank-gold"><td><span className="rank-badge">1</span></td><td><span className="provider-glm">GLM</span></td><td><strong>GLM-5.1</strong></td><td>203K</td><td>Excellent</td><td>Medium</td><td>Excellent</td><td>Excellent</td><td><span className="score-excellent">92</span></td></tr>
                  <tr className="rank-silver"><td><span className="rank-badge">2</span></td><td><span className="provider-groq">Groq</span></td><td><strong>GPT OSS 120B</strong></td><td>131K</td><td>Excellent</td><td>Very fast</td><td>Excellent</td><td>Very good</td><td><span className="score-excellent">90</span></td></tr>
                  <tr className="rank-bronze"><td><span className="rank-badge">3</span></td><td><span className="provider-glm">GLM</span></td><td><strong>GLM-5</strong></td><td>203K</td><td>Excellent</td><td>Medium</td><td>Excellent</td><td>Excellent</td><td><span className="score-excellent">89</span></td></tr>
                  <tr><td>4</td><td><span className="provider-google">Google AI Studio</span></td><td><strong>Gemini 2.5 Flash</strong></td><td>1M</td><td>Very good</td><td>Fast</td><td>Very good</td><td>Very good</td><td><span className="score-good">87</span></td></tr>
                  <tr><td>5</td><td><span className="provider-mistral">Mistral</span></td><td><strong>Mistral Large</strong></td><td>256K</td><td>Excellent</td><td>Medium</td><td>Excellent</td><td>Excellent</td><td><span className="score-good">86</span></td></tr>
                  <tr><td>6</td><td><span className="provider-glm">GLM</span></td><td><strong>GLM-5-Turbo</strong></td><td>203K</td><td>Very good</td><td>Fast</td><td>Very good</td><td>Excellent</td><td><span className="score-good">85</span></td></tr>
                  <tr><td>7</td><td><span className="provider-mistral">Mistral</span></td><td><strong>Mistral Medium 3.5</strong></td><td>256K</td><td>Very good</td><td>Fast</td><td>Very good</td><td>Excellent</td><td><span className="score-good">85</span></td></tr>
                  <tr><td>8</td><td><span className="provider-groq">Groq</span></td><td><strong>Groq Compound</strong></td><td>131K</td><td>Very good</td><td>Fast</td><td>Very good</td><td>Excellent</td><td><span className="score-good">84</span></td></tr>
                  <tr><td>9</td><td><span className="provider-glm">GLM</span></td><td><strong>GLM-4.7</strong></td><td>203K</td><td>Very good</td><td>Medium</td><td>Very good</td><td>Excellent</td><td><span className="score-good">83</span></td></tr>
                  <tr><td>10</td><td><span className="provider-groq">Groq</span></td><td><strong>Qwen 3 32B</strong></td><td>131K</td><td>Very good</td><td>Fast</td><td>Very good</td><td>Good</td><td><span className="score-good">80</span></td></tr>
                  <tr><td>11</td><td><span className="provider-groq">Groq</span></td><td><strong>Llama 3.3 70B Versatile</strong></td><td>131K</td><td>Good</td><td>Fast</td><td>Very good</td><td>Good</td><td><span className="score-good">78</span></td></tr>
                  <tr><td>12</td><td><span className="provider-glm">GLM</span></td><td><strong>GLM-4.6 Vision</strong></td><td>131K</td><td>Good</td><td>Medium</td><td>Good</td><td>Very good</td><td><span className="score-fair">76</span></td></tr>
                  <tr><td>13</td><td><span className="provider-google">Google AI Studio</span></td><td><strong>Gemini 2.5 Flash-Lite</strong></td><td>1M</td><td>Good</td><td>Very fast</td><td>Good</td><td>Good</td><td><span className="score-fair">75</span></td></tr>
                  <tr><td>14</td><td><span className="provider-mistral">Mistral</span></td><td><strong>Devstral 2512</strong></td><td>256K</td><td>Good</td><td>Medium</td><td>Good</td><td>Very good</td><td><span className="score-fair">75</span></td></tr>
                  <tr><td>15</td><td><span className="provider-groq">Groq</span></td><td><strong>GPT OSS 20B</strong></td><td>131K</td><td>Good</td><td>Very fast</td><td>Good</td><td>Good</td><td><span className="score-fair">74</span></td></tr>
                  <tr className="rank-lowest"><td>16</td><td><span className="provider-groq">Groq</span></td><td><strong>Llama 4 Scout 17B Instruct</strong></td><td>131K</td><td>Good</td><td>Very fast</td><td>Good</td><td>Good</td><td><span className="score-fair">72</span></td></tr>
                </tbody>
              </table>
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
                      value={draft.email}
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
            <div className="p-6">
              <div className="profile-avatar-preview" style={{ marginBottom: '20px' }}>
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

              <div className="avatar-picker-section avatar-picker-compact">
                <div className="avatar-picker-grid">
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
              
              <div className="profile-form-actions mt-6" style={{ display: 'flex', gap: '10px' }}>
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
    </div>
  );
}
