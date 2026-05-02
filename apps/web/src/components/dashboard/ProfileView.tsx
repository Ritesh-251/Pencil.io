"use client";
import { useState, useEffect } from "react";
import { useAuthStore } from "@/store/auth.store";
import { api } from "@/lib/api";
import { User, Camera, Mail, AtSign, Check, Loader2 } from "lucide-react";

export const ProfileView = () => {
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  
  const [name, setName] = useState(user?.name || "");
  const [bio, setBio] = useState(user?.bio || "");
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (user) {
      setName(user.name || "");
      setBio(user.bio || "");
      setAvatarUrl(user.avatarUrl || "");
    }
  }, [user]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      const res = await api.patch("/api/v1/auth/me", { name, bio, avatarUrl });
      updateUser({
        name: res.user.name,
        bio: res.user.bio,
        avatarUrl: res.user.avatarUrl,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error("Failed to update profile:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-4">
      <header className="mb-8">
        <h1 className="ink-title m-0 text-[2.1rem]">My Profile</h1>
        <p className="soft-copy mt-1">
          Manage your identity and how others see you in the workspace.
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[200px_1fr]">
        {/* Avatar Section */}
        <div className="flex flex-col items-center gap-4">
          <div className="relative group">
            <div 
              className="w-40 h-40 rounded-full border-4 border-white shadow-xl overflow-hidden flex items-center justify-center transition-all duration-300 group-hover:shadow-2xl"
              style={{ 
                background: mounted && user ? `linear-gradient(135deg, ${stringToColor(user.email)}, ${stringToColor(user.email + 'salt')})` : '#eee'
              }}
            >
              {mounted && avatarUrl && avatarUrl.trim() !== "" ? (
                <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <span className="text-[3.5rem] font-black text-white uppercase tracking-tighter">
                  {mounted && user ? (user.name?.slice(0, 2) || user.email.slice(0, 2) || "??") : "??"}
                </span>
              )}
            </div>
            
            {/* Action Badge */}
            <button 
              type="button"
              className="absolute bottom-1 right-1 w-10 h-10 bg-indigo-600 text-white rounded-full flex items-center justify-center border-4 border-white shadow-lg hover:bg-indigo-700 hover:scale-110 transition-all cursor-pointer z-10"
              onClick={() => {
                const url = window.prompt("Enter image URL (Upload coming soon):", avatarUrl);
                if (url !== null) setAvatarUrl(url);
              }}
              title="Update photo"
            >
              <Camera className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Info Section */}
        <form onSubmit={handleSave} className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-black uppercase tracking-widest text-[var(--ink-soft)]">
              Full Name
            </label>
            <div className="relative">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="How should we call you?"
                className="input pl-10"
              />
              <AtSign className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--ink-soft)] opacity-40" />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-black uppercase tracking-widest text-[var(--ink-soft)]">
              Email Address
            </label>
            <div className="relative opacity-60">
              <input
                type="text"
                value={user?.email || ""}
                readOnly
                className="input pl-10 cursor-not-allowed bg-[rgba(0,0,0,0.02)]"
              />
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--ink-soft)] opacity-40" />
            </div>
            <p className="text-[10px] font-medium text-[var(--ink-soft)] italic">
              Email is managed by your account provider.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-black uppercase tracking-widest text-[var(--ink-soft)]">
              A brief about you
            </label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell your team about yourself..."
              rows={4}
              className="input min-h-[120px] resize-none py-3"
            />
          </div>

          <div className="pt-4 flex items-center gap-4">
            <button 
              type="submit" 
              disabled={saving}
              className={`btn btn-primary min-w-[140px] flex items-center justify-center gap-2 ${saving ? 'opacity-70 cursor-wait' : ''}`}
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : saved ? (
                <>
                  <Check className="w-4 h-4" />
                  Saved!
                </>
              ) : (
                "Save Changes"
              )}
            </button>
            {saved && (
              <span className="text-[11px] font-bold text-emerald-600 animate-in fade-in slide-in-from-left-2">
                Your profile has been updated.
              </span>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

const stringToColor = (str: string) => {
  if (!str) return "#6366f1";
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 65%, 55%)`;
};
