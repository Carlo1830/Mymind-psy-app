"use client";
import { useEffect,useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BrandLogo } from '@/components/brand-logo';
export function PatientAccountForm(){
 const router=useRouter();const [mode,setMode]=useState<'login'|'activate'|'reset'|'forgot'>('login');const [token,setToken]=useState('');
 const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [notice,setNotice]=useState('');
 useEffect(()=>{const timer=window.setTimeout(()=>{const values=new URLSearchParams(window.location.hash.slice(1));const link=values.get('token');if(link){setToken(link);setMode(values.get('tipo')==='recuperacion'?'reset':'activate');}},0);return()=>window.clearTimeout(timer);},[]);
 async function submit(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy)return;const form=event.currentTarget;const values=Object.fromEntries(new FormData(form));
  if((mode==='activate'||mode==='reset')&&values.password!==values.confirmar){setError('As senhas não coincidem.');return;}
  setBusy(true);setError('');setNotice('');try{
   const response=await fetch('/api/paciente/auth/'+mode,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...values,token,consentimiento:values.consentimiento==='on'})});
   const result=await response.json();if(!response.ok)throw Error(result.error);
   if(mode==='login'){router.replace('/paciente');router.refresh();return;}
   if(mode==='forgot')setNotice(result.mensaje);else{
    window.history.replaceState(null,'','/paciente/acceso');setToken('');setMode('login');form.reset();setNotice(mode==='activate'?'Conta ativada. Entre com seu e-mail e sua senha.':'Senha redefinida. Entre com sua nova senha.');
   }
  }catch(error){setError(error instanceof Error?error.message:'Não foi possível continuar.');}finally{setBusy(false);}
 }
 return <div lang="pt-BR" className="mx-auto my-8 max-w-md rounded-3xl border border-teal-100 bg-white p-6 shadow-sm sm:my-14 sm:p-9">
  <Link href="/" className="inline-flex items-center gap-2 font-serif text-2xl text-teal-900"><BrandLogo/>EmNós</Link>
  <p className="mt-7 text-xs font-medium uppercase tracking-widest text-teal-700">Portal do paciente</p>
  <h1 className="mt-3 font-serif text-3xl text-teal-900">{mode==='activate'?'Seu espaço começa aqui':mode==='reset'?'Crie uma nova senha':mode==='forgot'?'Recupere seu acesso':'Um espaço para você'}</h1>
  <p className="mt-3 text-sm leading-6 text-slate-600">{mode==='activate'?'Ative a conta que sua profissional preparou para você. Este portal é destinado a adultos.':mode==='forgot'?'Informe o e-mail cadastrado com sua profissional.':'Consulte sua ficha, seus documentos e seus agendamentos.'}</p>
  <form key={mode} onSubmit={submit} className="mt-6 space-y-4"><fieldset disabled={busy} className="space-y-4">
   <label className="block text-sm">E-mail<input name="email" type="email" required maxLength={254} autoComplete="email" className="field mt-1"/></label>
   {mode!=='forgot'&&<label className="block text-sm">Senha<input name="password" type="password" required minLength={12} maxLength={128} autoComplete={mode==='login'?'current-password':'new-password'} className="field mt-1"/><span className="mt-1 block text-xs text-slate-500">Entre 12 e 128 caracteres.</span></label>}
   {(mode==='activate'||mode==='reset')&&<label className="block text-sm">Confirme a senha<input name="confirmar" type="password" required minLength={12} maxLength={128} autoComplete="new-password" className="field mt-1"/></label>}
   {mode==='activate'&&<label className="flex gap-3 text-xs leading-5 text-slate-600"><input type="checkbox" required name="consentimiento" className="mt-1"/>Confirmo que sou a pessoa convidada, tenho 18 anos ou mais e desejo ativar minha conta pessoal para gerenciar meus dados, documentos e consultas.</label>}
   {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
   {notice&&<p role="status" className="rounded-xl bg-teal-50 p-3 text-sm text-teal-900">{notice}</p>}
   <button className="action w-full">{busy?'Aguarde…':mode==='login'?'Entrar':mode==='forgot'?'Enviar instruções':mode==='activate'?'Ativar minha conta':'Salvar nova senha'}</button>
  </fieldset></form>
  {mode==='login'?<button className="mt-5 text-sm text-teal-800 underline" onClick={()=>{setMode('forgot');setNotice('');setError('');}}>Esqueci minha senha</button>:<button className="mt-5 text-sm text-teal-800 underline" onClick={()=>{setMode('login');setError('');setNotice('');}}>Voltar para entrar</button>}
  <p className="mt-6 border-t border-teal-100 pt-5 text-xs leading-5 text-slate-500">Primeiro acesso? Peça um convite à sua profissional. Cada conta é pessoal. Não compartilhe sua senha.</p>
  <Link href="/acceso" className="mt-3 inline-block text-xs text-teal-800 underline">Acesso profissional</Link>
 </div>;
}
