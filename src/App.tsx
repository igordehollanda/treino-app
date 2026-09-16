import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './lib/auth'
import { configurado } from './lib/supabase'
import Layout from './componentes/Layout'
import Login from './paginas/Login'
import Hoje from './paginas/Hoje'
import Execucao from './paginas/Execucao'
import Treinos from './paginas/Treinos'
import EditorTreino from './paginas/EditorTreino'
import Historico from './paginas/Historico'

export default function App() {
  const { sessao, perfil, carregando } = useAuth()

  if (!configurado) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-3 p-8">
        <h1 className="text-xl font-bold">Falta conectar o Supabase</h1>
        <p className="text-sm text-slate-400">
          Copie <code className="text-slate-200">.env.example</code> para{' '}
          <code className="text-slate-200">.env</code> e preencha{' '}
          <code className="text-slate-200">VITE_SUPABASE_URL</code> e{' '}
          <code className="text-slate-200">VITE_SUPABASE_ANON_KEY</code>.
        </p>
        <p className="text-sm text-slate-400">
          O passo a passo completo está em{' '}
          <code className="text-slate-200">supabase/SETUP.md</code>.
        </p>
      </div>
    )
  }

  if (carregando) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-slate-400">
        carregando...
      </div>
    )
  }

  if (!sessao) return <Login />

  // Autenticado no Supabase mas fora da allowlist: o app e fechado.
  // Na pratica so acontece se alguem criar um usuario sem criar o perfil.
  if (!perfil) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-lg font-semibold">Esta conta não tem acesso.</p>
        <p className="text-sm text-slate-400">
          O app é de uso privado. Crie o perfil no Supabase (veja supabase/SETUP.md).
        </p>
        <BotaoSair />
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/executar/:sessaoId" element={<Execucao />} />
      <Route element={<Layout />}>
        <Route path="/" element={<Hoje />} />
        <Route path="/treinos" element={<Treinos />} />
        <Route path="/treinos/:treinoId" element={<EditorTreino />} />
        <Route path="/historico" element={<Historico />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function BotaoSair() {
  const { sair } = useAuth()
  return (
    <button onClick={() => void sair()} className="rounded-lg bg-slate-700 px-4 py-2 text-sm">
      Sair
    </button>
  )
}
