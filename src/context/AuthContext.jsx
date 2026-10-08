import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext();
const VIEWER_KEY = 'nkfms_viewer_mode';

// ============================================================================
//  লগইন এখন Supabase Auth দিয়ে হয়।
//
//  আগে পাসওয়ার্ড সরাসরি কোডে লেখা ছিল, যা ব্রাউজারে যে কেউ দেখতে পেত। এখন
//  পাসওয়ার্ড কেবল Supabase-এ থাকে, আর হিসাব বদলানোর অনুমতিও ডাটাবেজেই যাচাই
//  হয় (Row Level Security) — ব্রাউজারের কোড বদলে কেউ ফাঁকি দিতে পারবে না।
//
//  ভিউ মোড (viewer) পাসওয়ার্ড ছাড়াই চলে — শুধু দেখা যায়, বদলানো যায় না।
// ============================================================================

const VIEWER_USER = {
  id: 'u-viewer',
  username: 'viewer',
  name: 'ভিউয়ার (শুধুমাত্র প্রদর্শন)',
  role: 'viewer'
};

const VIEWER_NAMES = new Set(['viewer', 'view', 'guest', 'ভিউয়ার']);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [viewerMode, setViewerMode] = useState(() => {
    try {
      // ছাপা রিপোর্টের QR স্ক্যান করে এলে (#/reports?rt=…) লগইন পর্দায় না
      // আটকে সোজা ভিউ মোডে ঢুকিয়ে দেওয়া হয় — ভিউ মোড এমনিতেই পাসওয়ার্ডহীন,
      // তাই এতে নিরাপত্তা কমে না। অ্যাডমিন সেশন থাকলে সেটিই প্রাধান্য পায়
      // (নিচে user হিসাবের সময় session আগে দেখা হয়), কেউ অ্যাডমিন থেকে
      // নেমে যান না।
      if (/^#\/?reports\?/.test(window.location.hash || '')) {
        localStorage.setItem(VIEWER_KEY, '1');
        return true;
      }
      return localStorage.getItem(VIEWER_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const login = async (identifier, password) => {
    const id = (identifier || '').trim();
    const pass = (password || '').trim();

    // ১. ভিউ মোড — পাসওয়ার্ড লাগে না
    if (VIEWER_NAMES.has(id.toLowerCase())) {
      try {
        localStorage.setItem(VIEWER_KEY, '1');
      } catch {
        /* ব্রাউজার স্টোরেজ বন্ধ থাকলেও ভিউ মোড চলবে */
      }
      setViewerMode(true);
      return { ok: true };
    }

    // ২. অ্যাডমিন — Supabase Auth
    if (!id.includes('@')) {
      return {
        ok: false,
        error: 'অ্যাডমিন হিসেবে ঢুকতে আপনার ইমেইল দিন। শুধু দেখতে চাইলে "viewer" লিখুন।'
      };
    }
    if (!pass) {
      return { ok: false, error: 'পাসওয়ার্ড দিন।' };
    }

    const { error } = await supabase.auth.signInWithPassword({ email: id, password: pass });
    if (error) {
      const msg = /invalid login credentials/i.test(error.message || '')
        ? 'ইমেইল বা পাসওয়ার্ড ঠিক নেই।'
        : error.message;
      return { ok: false, error: msg };
    }

    try {
      localStorage.removeItem(VIEWER_KEY);
    } catch {
      /* উপেক্ষা */
    }
    setViewerMode(false);
    return { ok: true };
  };

  const logout = async () => {
    try {
      localStorage.removeItem(VIEWER_KEY);
    } catch {
      /* উপেক্ষা */
    }
    setViewerMode(false);
    await supabase.auth.signOut();
  };

  const user = session
    ? {
        id: session.user.id,
        username: session.user.email,
        name: session.user.user_metadata?.name || session.user.email,
        role: 'admin'
      }
    : viewerMode
      ? VIEWER_USER
      : null;

  const isReadOnly = !session;

  return (
    <AuthContext.Provider
      value={{
        user,
        ready,
        login,
        logout,
        isAuthenticated: !!user,
        isReadOnly,
        isAdmin: !isReadOnly
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
