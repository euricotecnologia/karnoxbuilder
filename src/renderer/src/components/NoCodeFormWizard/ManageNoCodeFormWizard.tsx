import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, CircleX, Database, Loader2, Plus, Save, Settings2, Trash2, X } from 'lucide-react'
import { useAppStore } from '@renderer/state/store'
import './NoCodeFormWizard.css'

type FieldType = 'text' | 'longText' | 'integer' | 'decimal' | 'date' | 'dateTime' | 'boolean' | 'email' | 'phone'

interface ManagedField {
  id: number
  originalName: string
  name: string
  label: string
  type: FieldType
  required: boolean
  length: number
}

interface ManagedForm {
  unitName: string
  formClass: string
  caption: string
  tableName: string
  pasPath: string
  dfmPath: string
  databasePath: string
  databaseKind: 'firebird' | 'sqlite' | 'mysql' | 'postgresql' | 'sqlserver' | 'oracle'
  fields: Array<Omit<ManagedField, 'id'>>
}

function getTypes(t: (key: string) => string): Array<{ value: FieldType; label: string }> {
  return [
    { value: 'text', label: t('manageForm.types.text') },
    { value: 'longText', label: t('manageForm.types.longText') },
    { value: 'integer', label: t('manageForm.types.integer') },
    { value: 'decimal', label: t('manageForm.types.decimal') },
    { value: 'date', label: t('manageForm.types.date') },
    { value: 'dateTime', label: t('manageForm.types.dateTime') },
    { value: 'boolean', label: t('manageForm.types.boolean') },
    { value: 'email', label: t('manageForm.types.email') },
    { value: 'phone', label: t('manageForm.types.phone') }
  ]
}

function identifier(value: string): string {
  const clean = value.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  if (!clean) return ''
  return (/^[A-Za-z]/.test(clean) ? clean : `f_${clean}`).toLowerCase()
}

function inferType(label: string): FieldType {
  const value = label.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
  if (/e-?mail/.test(value)) return 'email'
  if (/telefone|celular|whatsapp|fone/.test(value)) return 'phone'
  if (/data.*hora|criado em|atualizado em/.test(value)) return 'dateTime'
  if (/^data|nascimento|vencimento|emissao/.test(value)) return 'date'
  if (/valor|preco|saldo|total|desconto|percentual/.test(value)) return 'decimal'
  if (/quantidade|idade|numero|codigo/.test(value)) return 'integer'
  if (/ativo|bloqueado|habilitado/.test(value)) return 'boolean'
  if (/observacao|descricao|comentario/.test(value)) return 'longText'
  return 'text'
}

export function ManageNoCodeFormWizard({ onClose }: { onClose: () => void }): JSX.Element {
  const { t } = useTranslation()
  const TYPES = getTypes(t)
  const { projectDir, dprojPath, delphiProfile, openTabs, saveAllTabs, setFileTree, refreshOpenTabs, openTab, appendAiLine } = useAppStore()
  const [forms, setForms] = useState<ManagedForm[]>([])
  const [unitName, setUnitName] = useState('')
  const [fields, setFields] = useState<ManagedField[]>([])
  const [nextId, setNextId] = useState(1)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const selected = forms.find((form) => form.unitName === unitName) ?? null

  useEffect(() => {
    if (!projectDir) return
    void window.api.nocode.managedForms(projectDir).then((items: ManagedForm[]) => {
      setForms(items)
      if (items[0]) selectForm(items[0])
    }).catch((reason: Error) => setError(reason.message)).finally(() => setLoading(false))
  }, [projectDir])

  function selectForm(form: ManagedForm): void {
    setUnitName(form.unitName)
    setFields(form.fields.map((field, index) => ({ ...field, id: index + 1 })))
    setNextId(form.fields.length + 1)
    setError('')
    setSuccess('')
  }

  function updateField(id: number, patch: Partial<ManagedField>): void {
    setFields((current) => current.map((field) => field.id === id ? { ...field, ...patch } : field))
  }

  function addField(): void {
    setFields((current) => [...current, { id: nextId, originalName: '', name: '', label: '', type: 'text', required: false, length: 120 }])
    setNextId((value) => value + 1)
  }

  const changes = useMemo(() => {
    if (!selected) return { added: 0, removed: 0, changed: 0 }
    const original = new Map(selected.fields.map((field) => [field.originalName, field]))
    const currentOriginals = new Set(fields.map((field) => field.originalName).filter(Boolean))
    const added = fields.filter((field) => !field.originalName).length
    const removed = selected.fields.filter((field) => !currentOriginals.has(field.originalName)).length
    const changed = fields.filter((field) => {
      if (!field.originalName) return false
      const before = original.get(field.originalName)
      return !!before && (before.name !== field.name || before.label !== field.label || before.type !== field.type || before.required !== field.required)
    }).length
    return { added, removed, changed }
  }, [selected, fields])

  async function apply(): Promise<void> {
    if (!projectDir || !dprojPath || !selected) return
    setError('')
    setSuccess('')
    if (!fields.length || fields.some((field) => !field.name || !field.label)) {
      setError(t('manageForm.errorFillFields'))
      return
    }
    const names = fields.map((field) => field.name.toLowerCase())
    if (new Set(names).size !== names.length) {
      setError(t('manageForm.errorDuplicateNames'))
      return
    }
    if (changes.removed > 0 && !window.confirm(t('manageForm.removeFieldsConfirm', { count: changes.removed }))) return
    const managedOpen = openTabs.some((tab) => [selected.pasPath.toLowerCase(), selected.dfmPath.toLowerCase()].includes(tab.path.toLowerCase()) && tab.dirty)
    if (managedOpen && !window.confirm(t('manageForm.unsavedChangesConfirm'))) return
    setBusy(true)
    try {
      await saveAllTabs()
      const updated = await window.api.nocode.updateForm({
        projectDir,
        dprojPath,
        profile: delphiProfile,
        unitName: selected.unitName,
        fields: fields.map(({ originalName, name, label, type, required, length }) => ({ originalName: originalName || undefined, name, label, type, required, length }))
      }) as ManagedForm
      setFileTree(await window.api.fs.readProjectTree(projectDir))
      await refreshOpenTabs([updated.pasPath, updated.dfmPath])
      if (!openTabs.some((tab) => tab.path.toLowerCase() === updated.dfmPath.toLowerCase())) {
        openTab(updated.dfmPath, updated.dfmPath.split(/[\\/]/).pop() ?? `${updated.unitName}.dfm`, await window.api.fs.readFile(updated.dfmPath))
      }
      appendAiLine(t('manageForm.syncLogLine', { caption: updated.caption, table: updated.tableName }))
      const refreshed = await window.api.nocode.managedForms(projectDir) as ManagedForm[]
      setForms(refreshed)
      const current = refreshed.find((item) => item.unitName === updated.unitName)
      if (current) selectForm(current)
      setSuccess(t('manageForm.updateSuccess'))
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return <div className="nocode-wizard-backdrop">
    <section className="nocode-wizard nocode-manager" role="dialog" aria-modal="true" aria-label={t('manageForm.dialogLabel')}>
      <header>
        <div><Settings2 size={20} /><div><h2>{t('manageForm.title')}</h2><p>{t('manageForm.description')}</p></div></div>
        <button onClick={onClose} disabled={busy} title={t('common.close')}><X size={18} /></button>
      </header>
      <main>
        {loading ? <div className="nocode-manager-empty"><Loader2 className="spin" /> {t('manageForm.locatingForms')}</div> : forms.length === 0 ? <div className="nocode-manager-empty"><Settings2 size={36} /><h3>{t('manageForm.noFormsFound')}</h3><p>{t('manageForm.createFirstFormHint')}</p></div> : <>
          <div className="nocode-manager-select">
            <label>{t('manageForm.formToEdit')}<select value={unitName} onChange={(event) => { const form = forms.find((item) => item.unitName === event.target.value); if (form) selectForm(form) }}>{forms.map((form) => <option key={form.unitName} value={form.unitName}>{form.caption} · {form.tableName}</option>)}</select></label>
            <div><Database size={16} /><span><strong>{selected?.tableName}</strong><small>{selected?.databasePath}</small></span></div>
          </div>
          <div className="nocode-fields nocode-manager-fields">
            <div className="nocode-field-head"><span>{t('manageForm.screenLabel')}</span><span>{t('manageForm.databaseName')}</span><span>{t('manageForm.type')}</span><span>{t('manageForm.required')}</span><span /></div>
            {fields.map((field) => <div className="nocode-field-row" key={field.id}>
              <input value={field.label} placeholder={t('manageForm.labelPlaceholder')} onChange={(event) => { const label = event.target.value; updateField(field.id, { label, ...(!field.originalName ? { name: identifier(label), type: inferType(label) } : {}) }) }} />
              <input value={field.name} placeholder="nome_fantasia" onChange={(event) => updateField(field.id, { name: identifier(event.target.value) })} />
              <select value={field.type} onChange={(event) => updateField(field.id, { type: event.target.value as FieldType })}>{TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select>
              <label className="nocode-required"><input type="checkbox" checked={field.required} onChange={(event) => updateField(field.id, { required: event.target.checked })} /> {t('manageForm.yes')}</label>
              <button onClick={() => setFields((current) => current.filter((item) => item.id !== field.id))} title={t('manageForm.removeField')}><Trash2 size={15} /></button>
            </div>)}
            <button className="nocode-add-field" onClick={addField}><Plus size={15} /> {t('manageForm.addField')}</button>
          </div>
          <div className="nocode-change-summary"><span>{t('manageForm.added')}: {changes.added}</span><span>{t('manageForm.changed')}: {changes.changed}</span><span>{t('manageForm.removed')}: {changes.removed}</span><small>{t('manageForm.typesHint')}</small></div>
        </>}
        {error && <div className="nocode-error">{error}</div>}
        {success && <div className="nocode-manager-success"><CheckCircle2 size={16} /> {success}</div>}
      </main>
      <footer><button onClick={onClose} disabled={busy}><CircleX size={15} /> {t('common.cancel')}</button><button className="primary" onClick={() => void apply()} disabled={busy || !selected}>{busy ? <><Loader2 className="spin" size={15} /> {t('manageForm.updating')}</> : <><Save size={15} /> {changes.added + changes.changed + changes.removed === 0 ? t('manageForm.reapplyFormatting') : t('manageForm.applyChanges')}</>}</button></footer>
    </section>
  </div>
}
