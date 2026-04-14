import type { SettingsTab } from '../../store/app-store';
import { useAppStore } from '../../store/app-store';
import { CLIProfileSetup } from './CLIProfileSetup';
import { ScheduleManager } from '../schedules/ScheduleManager';
import { WebhookManager } from '../webhooks/WebhookManager';
import { PostActionManager } from '../post-actions/PostActionManager';
import { TemplateManager } from '../templates/TemplateManager';
import { ModeAnalytics } from '../analytics/ModeAnalytics';
import { useEscapeToClose } from '../../hooks/useEscapeToClose';
import { ModalCloseButton } from '../ui/ModalCloseButton';

const TAB_GROUPS: Array<{ key: 'groupCore' | 'groupWorkspace' | 'groupAutomation'; tabs: SettingsTab[] }> = [
  { key: 'groupCore', tabs: ['general', 'agents', 'planner'] },
  { key: 'groupWorkspace', tabs: ['templates', 'insights'] },
  { key: 'groupAutomation', tabs: ['schedules', 'webhooks', 'callbacks'] },
];

export function SettingsPanel() {
  const { t, settingsTab, setSettingsTab, setShowSettings } = useAppStore();
  const close = () => setShowSettings(false);
  useEscapeToClose(close);

  const tabLabel = (tab: SettingsTab): string => {
    switch (tab) {
      case 'general':
        return t.settings.tabGeneral;
      case 'agents':
        return t.settings.tabAgents;
      case 'planner':
        return t.settings.tabPlanner;
      case 'templates':
        return t.settings.tabTemplates;
      case 'insights':
        return t.settings.tabInsights;
      case 'schedules':
        return t.settings.tabSchedules;
      case 'webhooks':
        return t.settings.tabWebhooks;
      case 'callbacks':
        return t.settings.tabCallbacks;
      default:
        return tab;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center theme-backdrop backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-6xl h-[82dvh] glass-panel-strong shadow-2xl overflow-hidden flex">
        <aside className="w-56 shrink-0 p-4 space-y-2" style={{ borderRight: '1px solid var(--color-border)' }}>
          <div className="px-2 pt-1 pb-3">
            <h2 className="text-base font-semibold theme-text text-balance">{t.settings.title}</h2>
            <p className="text-xs theme-text-secondary mt-1 text-pretty">{t.settings.subtitle}</p>
          </div>
          {TAB_GROUPS.map((group) => (
            <div key={group.key} className="space-y-1">
              <div className="px-2 pt-2 pb-1 text-xs font-medium theme-text-tertiary">{t.settings[group.key]}</div>
              {group.tabs.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setSettingsTab(tab)}
                  className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-colors ${
                    settingsTab === tab ? 'theme-active-bg theme-text' : 'theme-text-secondary theme-hover'
                  }`}
                >
                  {tabLabel(tab)}
                </button>
              ))}
            </div>
          ))}
        </aside>
        <main className="relative flex-1 min-w-0 overflow-y-auto p-6">
          <div className="absolute right-4 top-4 z-10">
            <ModalCloseButton onClick={close} label={t.stepDetail.close} />
          </div>
          {settingsTab === 'general' ? <CLIProfileSetup embedded section="general" /> : null}
          {settingsTab === 'agents' ? <CLIProfileSetup embedded section="agents" /> : null}
          {settingsTab === 'planner' ? <CLIProfileSetup embedded section="planner" /> : null}
          {settingsTab === 'templates' ? <TemplateManager embedded /> : null}
          {settingsTab === 'insights' ? <ModeAnalytics embedded /> : null}
          {settingsTab === 'schedules' ? <ScheduleManager embedded /> : null}
          {settingsTab === 'webhooks' ? <WebhookManager embedded /> : null}
          {settingsTab === 'callbacks' ? <PostActionManager embedded /> : null}
        </main>
      </div>
    </div>
  );
}
