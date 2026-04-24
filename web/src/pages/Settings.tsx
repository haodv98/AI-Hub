import { useState } from 'react';
import { Mail, Webhook, Save, Server, Shield, Bell, Send, Check, AlertCircle } from 'lucide-react';

export default function Settings() {
  const [smtpConfig, setSmtpConfig] = useState({
    server: 'smtp.relay.internal',
    port: '587',
    user: 'sys-notify@aihub.internal',
    password: '••••••••••••••••',
    encryption: 'TLS'
  });

  const [webhookConfig, setWebhookConfig] = useState({
    url: 'https://hr.internal.corp/webhooks/personnel-sync',
    secret: 'hr_sync_v2_f8a2...',
    events: ['MEMBER_ADD', 'MEMBER_REMOVE', 'TIER_CHANGE']
  });

  const [isSaved, setIsSaved] = useState(false);

  const handleSave = () => {
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  return (
    <div className="space-y-8 pb-12">
        <div className="flex justify-between items-end mb-4">
          <div>
            <h2 className="text-4xl font-black tracking-tighter text-on-surface uppercase">System Settings</h2>
            <p className="text-[10px] font-bold text-primary uppercase tracking-[0.2em] mt-1">Configure Infrastructure & Integrations</p>
          </div>
          <button 
            onClick={handleSave}
            className="w-full md:w-auto bg-primary hover:bg-primary-dim text-on-primary px-8 py-3.5 text-[10px] font-black uppercase tracking-[0.2em] transition-all active:scale-95 shadow-xl rounded-xl status-glow flex items-center gap-3"
          >
            {isSaved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {isSaved ? 'Synchronized' : 'Save Configuration'}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* SMTP Server Config */}
          <section className="glass-panel p-10 rounded-3xl space-y-8 relative overflow-hidden bg-[#0a0a0a]/40">
            <div className="flex items-center gap-4 border-b border-white/5 pb-6">
              <div className="p-3 bg-primary/10 rounded-2xl border border-primary/20">
                <Mail className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3 className="text-xl font-black uppercase tracking-tight">SMTP Configuration</h3>
                <p className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest opacity-60">Outbound Relay for System Notifications</p>
              </div>
            </div>

            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">SMTP Server</label>
                  <div className="relative">
                    <Server className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-primary opacity-40" />
                    <input 
                      type="text" 
                      value={smtpConfig.server}
                      onChange={(e) => setSmtpConfig({...smtpConfig, server: e.target.value})}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-12 py-3.5 text-xs font-bold text-on-surface focus:border-primary/40 focus:ring-0 transition-all font-mono"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Port</label>
                  <input 
                    type="text" 
                    value={smtpConfig.port}
                    onChange={(e) => setSmtpConfig({...smtpConfig, port: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-3.5 text-xs font-bold text-on-surface focus:border-primary/40 focus:ring-0 transition-all font-mono"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Username</label>
                <input 
                  type="text" 
                  value={smtpConfig.user}
                  onChange={(e) => setSmtpConfig({...smtpConfig, user: e.target.value})}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-3.5 text-xs font-bold text-on-surface focus:border-primary/40 focus:ring-0 transition-all font-mono"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Password</label>
                <input 
                  type="password" 
                  value={smtpConfig.password}
                  onChange={(e) => setSmtpConfig({...smtpConfig, password: e.target.value})}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-3.5 text-xs font-bold text-on-surface focus:border-primary/40 focus:ring-0 transition-all font-mono"
                />
              </div>

              <div className="flex items-center gap-6 pt-2">
                {['SSL', 'TLS', 'None'].map((enc) => (
                  <button 
                    key={enc}
                    onClick={() => setSmtpConfig({...smtpConfig, encryption: enc})}
                    className={`
                      px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border
                      ${smtpConfig.encryption === enc ? 'bg-primary/20 border-primary/40 text-primary' : 'bg-white/5 border-white/5 text-on-surface-variant hover:border-white/20'}
                    `}
                  >
                    {enc}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-6 border-t border-white/5">
              <button className="flex items-center gap-2 text-[10px] font-black text-primary uppercase tracking-[0.2em] hover:text-white transition-all">
                <Send className="w-3 h-3" /> Execute Relay Test
              </button>
            </div>
          </section>

          {/* HR Webhooks config */}
          <section className="glass-panel p-10 rounded-3xl space-y-8 relative overflow-hidden bg-[#0a0a0a]/40">
            <div className="flex items-center gap-4 border-b border-white/5 pb-6">
              <div className="p-3 bg-primary/10 rounded-2xl border border-primary/20">
                <Webhook className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3 className="text-xl font-black uppercase tracking-tight">HR Webhooks</h3>
                <p className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest opacity-60">Synchronize Personnel Metadata</p>
              </div>
            </div>

            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Webhook URL</label>
                <input 
                  type="text" 
                  value={webhookConfig.url}
                  onChange={(e) => setWebhookConfig({...webhookConfig, url: e.target.value})}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-3.5 text-xs font-bold text-on-surface focus:border-primary/40 focus:ring-0 transition-all font-mono"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Secret Key</label>
                <div className="relative">
                  <Shield className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-primary opacity-40" />
                  <input 
                    type="password" 
                    value={webhookConfig.secret}
                    onChange={(e) => setWebhookConfig({...webhookConfig, secret: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-12 py-3.5 text-xs font-bold text-on-surface focus:border-primary/40 focus:ring-0 transition-all font-mono"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">Event Ingress</label>
                <div className="flex flex-wrap gap-2">
                  {['MEMBER_ADD', 'MEMBER_REMOVE', 'TIER_CHANGE', 'QUOTA_EXCEEDED'].map((e) => (
                    <button 
                      key={e}
                      onClick={() => {
                        const newEvents = webhookConfig.events.includes(e) 
                          ? webhookConfig.events.filter(ev => ev !== e)
                          : [...webhookConfig.events, e];
                        setWebhookConfig({...webhookConfig, events: newEvents});
                      }}
                      className={`
                        px-4 py-2 rounded-xl text-[9px] font-bold uppercase tracking-widest transition-all border
                        ${webhookConfig.events.includes(e) ? 'bg-primary/20 border-primary/40 text-primary' : 'bg-white/5 border-white/5 text-on-surface-variant opacity-60'}
                      `}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-white/5 space-y-4">
              <div className="flex items-center gap-3 p-4 bg-primary/5 rounded-2xl border border-primary/10">
                <AlertCircle className="w-5 h-5 text-primary flex-shrink-0" />
                <p className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest leading-relaxed opacity-80">
                  Webhooks are signed using HMAC-SHA256 with the secret key provided above.
                </p>
              </div>
            </div>
          </section>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <section className="lg:col-span-12 glass-panel p-10 rounded-3xl bg-[#0a0a0a]/40 border border-white/5">
            <div className="flex items-center gap-4 mb-8">
              <Bell className="w-6 h-6 text-primary" />
              <h3 className="text-xl font-black uppercase tracking-tight">Audit Stream Configuration</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <button className="p-6 bg-white/5 border border-white/10 rounded-[2rem] text-center hover:bg-white/10 transition-all border-l-4 border-primary">
                <p className="text-[10px] font-black text-on-surface uppercase tracking-widest mb-1">Logging Verbosity</p>
                <p className="text-xl font-black text-primary uppercase">CRITICAL</p>
              </button>
              <button className="p-6 bg-white/5 border border-white/10 rounded-[2rem] text-center hover:bg-white/10 transition-all border-l-4 border-primary">
                <p className="text-[10px] font-black text-on-surface uppercase tracking-widest mb-1">Retention Policy</p>
                <p className="text-xl font-black text-primary uppercase">90 DAYS</p>
              </button>
              <button className="p-6 bg-white/5 border border-white/10 rounded-[2rem] text-center hover:bg-white/10 transition-all border-l-4 border-primary">
                <p className="text-[10px] font-black text-on-surface uppercase tracking-widest mb-1">Mirroring</p>
                <p className="text-xl font-black text-error uppercase">OFFLINE</p>
              </button>
              <button className="p-6 bg-white/5 border border-white/10 rounded-[2rem] text-center hover:bg-white/10 transition-all border-l-4 border-primary">
                <p className="text-[10px] font-black text-on-surface uppercase tracking-widest mb-1">Global Alerting</p>
                <p className="text-xl font-black text-primary uppercase">ENABLED</p>
              </button>
            </div>
          </section>
        </div>
      </div>
  );
}
