import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { api, RecordMap } from "../lib/api";
import {
  defaultNotificationSettings,
  getNotificationSettingLabel,
  isNotificationSettingLocked,
  notificationSettingsIntro,
  notificationPreferenceTabs,
  normalizeNotificationSettings
} from "../config/notificationLabels";
import {
  Bell,
  Route,
  FileText,
  Database,
  PencilLine,
  MessageCircle,
  BellRing,
  Settings,
  X
} from "lucide-react";

function SettingsPortal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return null;
  const root = document.getElementById("settings-view-root");
  if (!root) return null;
  return createPortal(children, root);
}

export function SettingsView() {
  const [profileId, setProfileId] = useState<number | null>(null);
  const [notificationSettings, setNotificationSettings] = useState<Record<string, boolean>>(defaultNotificationSettings);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [activeNotificationTab, setActiveNotificationTab] = useState<"workspace" | "admin">("workspace");

  useEffect(() => {
    api.get<RecordMap[]>("/local_profiles").then((rows) => {
      const first = rows[0];
      if (first) {
        setProfileId(first.id);
        if (first.notification_settings) {
          try {
            setNotificationSettings(
              normalizeNotificationSettings(JSON.parse(first.notification_settings))
            );
          } catch (e) {
            console.error("Failed to parse notification settings", e);
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
      console.error("Failed to save notification settings", e);
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

  return (
    <div id="settings-view-root" className="w-full h-full flex-1 min-h-0 flex flex-col relative overflow-hidden">
      <div className="w-full h-full p-6 md:p-8 flex flex-col gap-8">
        <div className="flex items-center gap-3 border-b border-slate-200 pb-4">
          <div className="bg-slate-100 p-2 rounded-lg">
            <Settings className="w-6 h-6 text-slate-700" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
            <p className="text-slate-500 text-sm">Manage your workspace preferences and notifications.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setShowNotificationsModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm font-semibold hover:bg-slate-50 hover:border-slate-400 transition-colors"
          >
            <Bell className="w-4 h-4 text-indigo-500" />
            Notification Settings
          </button>
        </div>
      </div>

      {showNotificationsModal && (
        <SettingsPortal>
          <div
            className="absolute inset-0 z-[60] flex items-start justify-center pt-20 pb-16 backdrop-blur-[10px]"
            style={{ background: "rgba(30, 41, 37, 0.22)" }}
            onClick={() => setShowNotificationsModal(false)}
          >
            <div
              className="bg-white rounded-2xl shadow-2xl flex flex-col w-full mx-4"
              style={{ width: "960px", maxWidth: "94vw", maxHeight: "calc(100vh - 14rem)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-6 py-5 border-b border-slate-200 shrink-0 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Bell className="w-5 h-5 text-indigo-500" />
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Settings</p>
                    <h2 className="text-xl font-bold text-slate-800">Notification Settings</h2>
                    <p className="text-sm text-slate-500">{notificationSettingsIntro}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleAllNotifications(true)}
                    className="text-xs font-medium px-3 py-1.5 bg-white border border-slate-200 rounded-md hover:bg-slate-50 text-slate-700 transition-colors"
                  >
                    Select Tab
                  </button>
                  <button
                    onClick={() => toggleAllNotifications(false)}
                    className="text-xs font-medium px-3 py-1.5 bg-white border border-slate-200 rounded-md hover:bg-slate-50 text-slate-700 transition-colors"
                  >
                    Unselect Tab
                  </button>
                  <button
                    onClick={() => setShowNotificationsModal(false)}
                    className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                    title="Close"
                  >
                    <X size={20} className="text-slate-500" />
                  </button>
                </div>
              </div>

              <div className="overflow-y-auto flex-1 p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {notificationPreferenceTabs.map((tab) => {
                    const isActive = activeNotificationTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveNotificationTab(tab.id)}
                        className={`text-left rounded-2xl border px-4 py-3 transition-all ${isActive
                          ? "border-indigo-200 bg-indigo-50/70 shadow-sm"
                          : "border-slate-200 bg-white hover:bg-slate-50"
                          }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className={`text-sm font-semibold ${isActive ? "text-indigo-800" : "text-slate-800"}`}>{tab.label}</p>
                            <p className="text-xs text-slate-500 mt-1">{tab.description}</p>
                          </div>
                          {tab.id === "workspace" ? (
                            <Bell className={`w-4 h-4 ${isActive ? "text-indigo-600" : "text-slate-400"}`} />
                          ) : (
                            <BellRing className={`w-4 h-4 ${isActive ? "text-indigo-600" : "text-slate-400"}`} />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {(notificationPreferenceTabs.find((tab) => tab.id === activeNotificationTab)?.categories || []).map((category) => {
                  const iconMap: Record<string, any> = {
                    Route,
                    FileText,
                    Database,
                    PencilLine,
                    MessageCircle,
                    Bell,
                  };
                  const IconComponent = iconMap[category.icon] || FileText;

                  const selectableKeys = category.settings.filter((setting) => !isNotificationSettingLocked(setting.key));
                  const allSelected = selectableKeys.length > 0 && selectableKeys.every((s) => notificationSettings[s.key]);
                  const noneSelected = selectableKeys.every((s) => !notificationSettings[s.key]);

                  return (
                    <div key={category.title} className="pb-6 border-b border-slate-100 last:border-0 last:pb-0">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-md font-semibold text-slate-800 flex items-center gap-2">
                          <IconComponent className="w-4 h-4 text-slate-500" />
                          {category.title}
                        </h3>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="text-[11px] font-medium text-indigo-600 hover:text-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wider"
                            onClick={() => toggleAllInCategory(category.settings, true)}
                            disabled={selectableKeys.length === 0 || allSelected}
                          >
                            Select All
                          </button>
                          <button
                            type="button"
                            className="text-[11px] font-medium text-slate-500 hover:text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wider"
                            onClick={() => toggleAllInCategory(category.settings, false)}
                            disabled={selectableKeys.length === 0 || noneSelected}
                          >
                            Unselect All
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {category.settings.map((setting) => (
                          <label
                            key={setting.key}
                            className={`flex items-start gap-3 p-3 rounded-lg border transition-colors group ${isNotificationSettingLocked(setting.key)
                              ? "border-amber-100 bg-amber-50/70 cursor-not-allowed"
                              : "border-slate-100 bg-slate-50/50 hover:bg-slate-50 cursor-pointer"
                              }`}
                          >
                            <div className="flex items-center h-5">
                              <input
                                type="checkbox"
                                className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                                checked={!!notificationSettings[setting.key]}
                                disabled={isNotificationSettingLocked(setting.key)}
                                onChange={() => toggleNotificationSetting(setting.key)}
                              />
                            </div>
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-slate-700 group-hover:text-slate-900 leading-tight">{getNotificationSettingLabel(setting.key)}</span>
                                {isNotificationSettingLocked(setting.key) && (
                                  <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                                    Always on
                                  </span>
                                )}
                              </div>
                              {setting.description && (
                                <p className="text-xs text-slate-500">{setting.description}</p>
                              )}
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="px-6 py-4 border-t border-slate-200 shrink-0 flex justify-end">
                <button
                  onClick={() => setShowNotificationsModal(false)}
                  className="px-5 py-2.5 text-sm font-medium text-white bg-slate-600 rounded-lg hover:bg-slate-700 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </SettingsPortal>
      )}
    </div>
  );
}
