import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { Perfil } from './tipos'

type Contexto = {
  sessao: Session | null
  perfil: Perfil | null
  carregando: boolean
  ehPersonal: boolean
  sair: () => Promise<void>
}

const AuthCtx = createContext<Contexto | null>(null)

export function ProvedorAuth({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<Session | null>(null)
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSessao(data.session)
      if (!data.session) setCarregando(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, s) => {
      setSessao(s)
      if (!s) {
        setPerfil(null)
        setCarregando(false)
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!sessao) return
    let ativo = true
    supabase
      .from('perfis')
      .select('*')
      .eq('id', sessao.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!ativo) return
        setPerfil((data as Perfil) ?? null)
        setCarregando(false)
      })
    return () => {
      ativo = false
    }
  }, [sessao])

  const sair = async () => {
    await supabase.auth.signOut()
    localStorage.removeItem('treino:sessao-ativa')
  }

  return (
    <AuthCtx.Provider
      value={{ sessao, perfil, carregando, ehPersonal: perfil?.papel === 'personal', sair }}
    >
      {children}
    </AuthCtx.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthCtx)
  if (!ctx) throw new Error('useAuth precisa estar dentro de <ProvedorAuth>')
  return ctx
}
