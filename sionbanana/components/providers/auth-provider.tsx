"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { User } from "firebase/auth";
import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile
} from "firebase/auth";
import { enableFirebaseEmulators, firebaseAuth } from "@/lib/firebase/client";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  register: (params: { email: string; password: string; displayName?: string }) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    enableFirebaseEmulators();
    const auth = firebaseAuth();
    const unsubscribe = auth.onAuthStateChanged(async currentUser => {
      setUser(currentUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      register: async ({ email, password, displayName }) => {
        const auth = firebaseAuth();
        const result = await createUserWithEmailAndPassword(auth, email, password);

        if (displayName) {
          await updateProfile(result.user, { displayName });
        }
      },
      login: async (email, password) => {
        const auth = firebaseAuth();
        await signInWithEmailAndPassword(auth, email, password);
      },
      logout: async () => {
        const auth = firebaseAuth();
        await signOut(auth);
      },
      resetPassword: async email => {
        const auth = firebaseAuth();
        await sendPasswordResetEmail(auth, email);
      }
    }),
    [loading, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}
