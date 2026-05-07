import dynamic from "next/dynamic";

const AuthView = dynamic(() => import("./auth-view").then(mod => mod.AuthView), {
  ssr: false,
  loading: () => null
});

export default function AuthPage() {
  return <AuthView />;
}
