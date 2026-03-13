import { useState, useEffect } from 'react';
import type { VaultStatus } from '../shared/types';
import Login from './pages/Login';
import Unlock from './pages/Unlock';
import VaultList from './pages/VaultList';
import ItemDetail from './pages/ItemDetail';
import Generator from './pages/Generator';

type Screen = 'login' | 'unlock' | 'vault-list' | 'item-detail' | 'generator';

export default function App() {
  const [screen, setScreen] = useState<Screen>('login');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check vault status on popup open
    chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (response: VaultStatus) => {
      setLoading(false);
      if (!response) {
        setScreen('login');
        return;
      }
      if (!response.isAuthenticated) {
        setScreen('login');
      } else if (!response.isUnlocked) {
        setScreen('unlock');
      } else {
        setScreen('vault-list');
      }
    });
  }, []);

  function handleLoginSuccess() {
    setScreen('unlock');
  }

  function handleUnlockSuccess() {
    setScreen('vault-list');
  }

  function handleSelectItem(id: string) {
    setSelectedItemId(id);
    setScreen('item-detail');
  }

  function handleBack() {
    setSelectedItemId(null);
    setScreen('vault-list');
  }

  function handleLock() {
    chrome.runtime.sendMessage({ type: 'LOCK' });
    setScreen('unlock');
  }

  function handleLogout() {
    chrome.runtime.sendMessage({ type: 'LOGOUT' });
    setScreen('login');
  }

  if (loading) {
    return (
      <div className="flex h-[580px] w-[380px] items-center justify-center bg-sand">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-seafoam border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-[580px] w-[380px] flex-col overflow-hidden bg-sand">
      {screen === 'login' && <Login onSuccess={handleLoginSuccess} />}
      {screen === 'unlock' && (
        <Unlock onSuccess={handleUnlockSuccess} onLogout={handleLogout} />
      )}
      {screen === 'vault-list' && (
        <VaultList
          onSelectItem={handleSelectItem}
          onLock={handleLock}
          onGenerator={() => setScreen('generator')}
        />
      )}
      {screen === 'item-detail' && selectedItemId && (
        <ItemDetail itemId={selectedItemId} onBack={handleBack} />
      )}
      {screen === 'generator' && (
        <Generator onBack={() => setScreen('vault-list')} />
      )}
    </div>
  );
}
