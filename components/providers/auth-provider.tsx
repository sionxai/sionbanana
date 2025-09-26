"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { User } from "firebase/auth";
import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInAnonymously,
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

    if (!auth) {
      // Firebase가 설정되지 않은 경우 로그인 안된 상태로 작동
      console.warn("Firebase Auth가 설정되지 않았습니다.");
      setUser(null);
      setLoading(false);
      return;
    }

    const unsubscribe = auth.onAuthStateChanged(async currentUser => {
      if (!currentUser) {
        // 익명 로그인 자동 실행
        try {
          await signInAnonymously(auth);
        } catch (error) {
          console.warn("익명 로그인 실패:", error);
          setUser(null);
          setLoading(false);
        }
      } else {
        setUser(currentUser);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      register: async ({ email, password, displayName }) => {
        const auth = firebaseAuth();
        if (!auth) {
          throw new Error("Firebase Auth가 설정되지 않았습니다.");
        }
        const result = await createUserWithEmailAndPassword(auth, email, password);

        if (displayName) {
          await updateProfile(result.user, { displayName });
        }
      },
      login: async (email, password) => {
        const auth = firebaseAuth();
        if (!auth) {
          throw new Error("Firebase Auth가 설정되지 않았습니다.");
        }
        await signInWithEmailAndPassword(auth, email, password);
      },
      logout: async () => {
        const auth = firebaseAuth();
        if (!auth) {
          throw new Error("Firebase Auth가 설정되지 않았습니다.");
        }
        await signOut(auth);
      },
      resetPassword: async email => {
        const auth = firebaseAuth();
        if (!auth) {
          throw new Error("Firebase Auth가 설정되지 않았습니다.");
        }
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
