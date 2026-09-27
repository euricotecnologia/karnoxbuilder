import i18n from '@renderer/i18n'

export type DelphiProfileId =
  | 'delphi7_2007'
  | 'delphi2009_xe'
  | 'delphi_xe2_xe8'
  | 'delphi10_13'

export interface DelphiProfileOption {
  id: DelphiProfileId
  label: string
  description: string
  supportsWin64: boolean
}

const BASE_PROFILES: Array<{ id: DelphiProfileId; label: string; supportsWin64: boolean }> = [
  { id: 'delphi7_2007', label: 'Delphi 7 / 2007', supportsWin64: false },
  { id: 'delphi2009_xe', label: 'Delphi 2009 / XE', supportsWin64: false },
  { id: 'delphi_xe2_xe8', label: 'Delphi XE2 / XE8', supportsWin64: true },
  { id: 'delphi10_13', label: 'Delphi 10 / 13', supportsWin64: true }
]

function description(id: DelphiProfileId): string {
  return i18n.t(`delphiProfiles.${id}`)
}

export const DELPHI_PROFILE_OPTIONS: DelphiProfileOption[] = BASE_PROFILES.map((profile) => ({
  ...profile,
  get description(): string {
    return description(profile.id)
  }
}))

export function isDelphiProfileId(value: unknown): value is DelphiProfileId {
  return DELPHI_PROFILE_OPTIONS.some((profile) => profile.id === value)
}
