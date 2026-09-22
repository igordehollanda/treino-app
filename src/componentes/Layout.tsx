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
    <div className="min-h-dvh pb-20 md:pb-10">
      {(!online || naFila > 0) && (
        <div className="sticky top-0 z-10 bg-alerta px-4 py-1.5 text-center text-xs font-medium text-fundo">
          {online
            ? `Sincronizando ${naFila} registro${naFila > 1 ? 's' : ''}...`
            : 'Sem conexão — seus registros estão salvos e sobem depois'}
        </div>
      )}

      {/* No celular a navegacao mora embaixo, ao alcance do polegar. No
          desktop ela vira um seletor compacto no topo: esticada de ponta
          a ponta numa tela larga, os tres itens ficam a meio metro um do
          outro e a barra parece quebrada. */}
      <nav
        className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-3 border-t border-borda bg-superficie/95 backdrop-blur
                   md:static md:mx-auto md:mt-5 md:flex md:w-fit md:gap-1 md:rounded-xl md:border md:border-borda md:p-1"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <Aba para="/" rotulo="Hoje" />
        <Aba para="/treinos" rotulo="Treinos" />
        <Aba para="/historico" rotulo="Histórico" />
      </nav>

      <Outlet />
    </div>
  )
}

function Aba({ para, rotulo }: { para: string; rotulo: string }) {
  return (
    <NavLink
      to={para}
      end={para === '/'}
      className={({ isActive }) =>
        `py-3.5 text-center text-sm font-medium transition-colors md:rounded-lg md:px-7 md:py-2 ${
          isActive
            ? 'text-acento-texto md:bg-acento md:text-white'
            : 'text-suave md:hover:text-texto'
        }`
      }
    >
      {rotulo}
    </NavLink>
  )
}
