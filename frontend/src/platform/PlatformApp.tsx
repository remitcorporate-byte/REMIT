import { useEffect, useState } from "react";
import { platformApi, platformStore, type PlatformUser } from "../platform-api";
import { PlatformLogin } from "./PlatformLogin";
import { SupportConsole } from "./SupportConsole";
import "./platform-base.css";

export function PlatformApp() {
  const [user, setUser] = useState<PlatformUser | null>(() =>
    platformStore.user(),
  );
  const [booting, setBooting] = useState(Boolean(platformStore.token()));

  useEffect(() => {
    if (!platformStore.token()) {
      setBooting(false);
      return;
    }

    platformApi
      .me()
      .then((currentUser) => {
        platformStore.saveUser(currentUser);
        setUser(currentUser);
      })
      .catch(() => {
        platformStore.clear();
        setUser(null);
      })
      .finally(() => setBooting(false));
  }, []);

  if (booting)
    return <div className="platform-centred">Checking platform session…</div>;
  if (!user) return <PlatformLogin onLogin={setUser} />;

  return (
    <SupportConsole
      user={user}
      onLogout={() => {
        platformStore.clear();
        setUser(null);
      }}
    />
  );
}
