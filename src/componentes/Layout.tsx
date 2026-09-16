import { NavLink, Outlet } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { observarFila } from '../lib/fila'

export default function Layout() {
  const [naFila, setNaFila] = useState(0)
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => observarFila(setNaFila), [])
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  return (
    <div className="min-h-dvh pb-20">
      {(!online || naFila > 0) && (
        <div className="sticky top-0 z-10 bg-amber-500/90 px-4 py-1.5 text-center text-xs font-medium text-amber-950">
          {online
            ? `Sincronizando ${naFila} registro${naFila > 1 ? 's' : ''}...`
            : 'Sem conexao - seus registros estao salvos e sobem depois'}
        </div>
      )}

      <Outlet />

      <nav
        className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-3 border-t border-borda bg-cartao/95 backdrop-blur"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <Aba para="/" rotulo="Hoje" />
        <Aba para="/treinos" rotulo="Treinos" />
        <Aba para="/historico" rotulo="Historico" />
      </nav>
    </div>
  )
}

function Aba({ para, rotulo }: { para: string; rotulo: string }) {
  return (
    <NavLink
      to={para}
      end={para === '/'}
      className={({ isActive }) =>
        `py-3.5 text-center text-sm font-medium transition-colors ${
          isActive ? 'text-blue-400' : 'text-slate-400'
        }`
      }
    >
      {rotulo}
    </NavLink>
  )
}
