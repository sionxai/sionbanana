import { useEffect, useState } from "react";
import { getDoc } from "firebase/firestore";
import { useAuth } from "@/components/providers/auth-provider";
import { toDateString, userDocRef } from "@/lib/firebase/firestore";
import type { UserProfileDocument } from "@/lib/types";

interface UseUserProfileResult {
  profile: UserProfileDocument | null;
  loading: boolean;
}

export function useUserProfile(): UseUserProfileResult {
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<UserProfileDocument | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }

    const loadProfile = async () => {
      try {
        const snapshot = await getDoc(userDocRef(user.uid));

        if (!snapshot.exists()) {
          setProfile(null);
          setLoading(false);
          return;
        }

        const data = snapshot.data();
        setProfile({
          id: snapshot.id,
          email: data.email,
          displayName: data.displayName,
          photoURL: data.photoURL,
          plan: data.plan,
          credits: data.credits,
          createdAt: toDateString(data.createdAt),
          updatedAt: toDateString(data.updatedAt ?? data.createdAt)
        });
        setLoading(false);
      } catch (err) {
        console.error("Failed to load user profile:", err);
        setProfile(null);
        setLoading(false);
      }
    };

    loadProfile();

    // Poll for updates every 3 seconds
    const interval = setInterval(loadProfile, 3000);
    return () => clearInterval(interval);
  }, [authLoading, user]);

  return { profile, loading };
}
