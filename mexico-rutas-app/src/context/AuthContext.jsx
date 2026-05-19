import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  const [profile, setProfile] = useState(null);

  const fetchProfile = async (userId) => {
    try {
      console.log("Fetching profile for user:", userId);
      const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
      
      if (error) {
        console.error("Supabase Error fetching profile:", error);
        throw error;
      }
      
      console.log("Profile data received:", data);
      
      // Si el usuario está desactivado, lo sacamos inmediatamente
      if (data && data.is_active === false) {
        alert("Tu cuenta ha sido desactivada por un administrador.");
        await supabase.auth.signOut();
        return;
      }
      setProfile(data);
    } catch (err) {
      console.error("Error fetching profile:", err);
    }
  };

  useEffect(() => {
    // 1. Cargar sesión inicial
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    // 2. Escuchar cambios de estado (Login, Logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id).finally(() => setLoading(false));
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const value = {
    session,
    user,
    profile,
    signOut,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading ? children : (
        <div style={{ height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#f8fafc' }}>
          <div className="loader-dots"></div>
        </div>
      )}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  return useContext(AuthContext);
};
