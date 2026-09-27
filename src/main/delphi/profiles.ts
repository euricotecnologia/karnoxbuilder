export const DELPHI_PROFILE_IDS = [
  'delphi7_2007',
  'delphi2009_xe',
  'delphi_xe2_xe8',
  'delphi10_13'
] as const

export type DelphiProfileId = (typeof DELPHI_PROFILE_IDS)[number]

export interface DelphiProfile {
  id: DelphiProfileId
  label: string
  description: string
  namespacedUnits: boolean
  unicode: boolean
  supportsWin64: boolean
  buildSystem: 'dcc' | 'msbuild'
  // FireDAC só é garantido em todas as versões cobertas pelo Delphi 10-13. As
  // demais faixas agrupam versões onde o FireDAC não existe (Delphi 7-XE) ou
  // não é garantido em toda a faixa (XE2 ainda não tinha FireDAC estável), por
  // isso ficam desabilitadas por segurança em vez de arriscar código que não compila.
  firedacAllowed: boolean
}

export const DELPHI_PROFILES: Record<DelphiProfileId, DelphiProfile> = {
  delphi7_2007: {
    id: 'delphi7_2007',
    label: 'Delphi 7 / 2007',
    description: 'VCL clássica ANSI, Win32 e compilação direta com DCC32.',
    namespacedUnits: false,
    unicode: false,
    supportsWin64: false,
    buildSystem: 'dcc',
    firedacAllowed: false
  },
  delphi2009_xe: {
    id: 'delphi2009_xe',
    label: 'Delphi 2009 até XE',
    description: 'VCL Unicode sem namespaces qualificados, somente Win32.',
    namespacedUnits: false,
    unicode: true,
    supportsWin64: false,
    buildSystem: 'dcc',
    firedacAllowed: false
  },
  delphi_xe2_xe8: {
    id: 'delphi_xe2_xe8',
    label: 'Delphi XE2 até XE8',
    description: 'VCL com namespaces modernos e suporte Win32/Win64.',
    namespacedUnits: true,
    unicode: true,
    supportsWin64: true,
    buildSystem: 'dcc',
    firedacAllowed: false
  },
  delphi10_13: {
    id: 'delphi10_13',
    label: 'Delphi 10 até 13',
    description: 'Perfil moderno completo com MSBuild, VCL, FireDAC e LSP.',
    namespacedUnits: true,
    unicode: true,
    supportsWin64: true,
    buildSystem: 'msbuild',
    firedacAllowed: true
  }
}

export function normalizeDelphiProfile(value: unknown): DelphiProfileId {
  return DELPHI_PROFILE_IDS.includes(value as DelphiProfileId) ? (value as DelphiProfileId) : 'delphi10_13'
}

export function buildDelphiProfilePrompt(profileId: DelphiProfileId): string {
  const profile = DELPHI_PROFILES[profileId]
  const common = `\n\n## PERFIL DELPHI OBRIGATÓRIO\nVersão-alvo: ${profile.label}. Todo o código retornado deve compilar nesse perfil.`
  if (profileId === 'delphi7_2007') {
    return `${common}
- Use units sem namespace: Windows, Messages, SysUtils, Classes, Graphics, Controls, Forms, Dialogs, StdCtrls, ExtCtrls, ComCtrls, Menus, DB.
- Nunca use Vcl., System., Winapi., FireDAC, generics, métodos anônimos, UnicodeString, TTask ou Application.MainFormOnTaskbar.
- Gere somente Win32 e código compatível com strings ANSI.
- Para banco de dados, use ADO, dbExpress, IBX ou componentes disponíveis na versão; não use FireDAC.`
  }
  if (profileId === 'delphi2009_xe') {
    return `${common}
- Use units sem namespace: Windows, Messages, SysUtils, Classes, Graphics, Controls, Forms, Dialogs, StdCtrls, ExtCtrls, ComCtrls, Menus, DB.
- Pode usar UnicodeString e strings Unicode nativas (novidade desta faixa), mas nunca use prefixos Vcl., System. ou Winapi., nem FireDAC, generics avançados, métodos anônimos complexos ou TTask.
- Gere somente Win32 e código compatível com string Unicode nativa (WideString/UnicodeString).
- Para banco de dados, use ADO, dbExpress, IBX ou componentes disponíveis na versão; nunca use FireDAC (só existe a partir do Delphi XE3).`
  }
  if (profileId === 'delphi_xe2_xe8') {
    return `${common}
- Use namespaces Vcl., System. e Winapi. normalmente (ex.: Vcl.Controls, Vcl.Forms, System.SysUtils, System.Classes).
- Pode gerar código Win32 ou Win64; evite APIs exclusivas de plataforma sem guardas de compilação ({$IFDEF}).
- Nunca use FireDAC: esta faixa cobre desde o Delphi XE2, que ainda não tinha FireDAC estável. Use dbExpress, IBX ou ADO para acesso a dados.
- Evite recursos introduzidos só a partir do Delphi 10 (ex.: LSP, atributos de RTTI muito recentes); prefira APIs VCL/RTL já consolidadas até o XE8.
- Nunca use generics, métodos anônimos ou UnicodeString de forma incompatível com versões anteriores ao XE2 dentro desta faixa; prefira a sintaxe mais amplamente compatível.`
  }
  return `${common}
- Use namespaces modernos Vcl., System. e Winapi.; FireDAC é permitido.
- Gere código compatível com Delphi 10 até Delphi 13.`
}
