import { useCallback, useEffect, useState } from 'react';
import type { Dataset } from '@shared/schema.ts';
import { getSnapshot } from './api.ts';
import { Workspace } from './Workspace.tsx';

type State = { s: 'loading' } | { s: 'data'; dataset: Dataset } | { s: 'error'; message: string };

/** Open access: no sign-in step — the map loads straight away. */
export function App() {
  const [state, setState] = useState<State>({ s: 'loading' });

  const load = useCallback(async () => {
    setState({ s: 'loading' });
    try {
      setState({ s: 'data', dataset: await getSnapshot() });
    } catch (e) {
      setState({ s: 'error', message: (e as Error).message });
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (state.s === 'loading') return <div className="center-state" aria-busy="true"><div><div className="spinner" />جارٍ التحميل…</div></div>;
  if (state.s === 'error') {
    return (
      <div className="center-state"><div className="card" role="alert">
        <h1>تعذّر فتح الخريطة</h1><p className="err">{state.message}</p>
        <button className="btn dark" onClick={() => void load()}>إعادة المحاولة</button>
      </div></div>
    );
  }
  return <Workspace dataset={state.dataset} />;
}
