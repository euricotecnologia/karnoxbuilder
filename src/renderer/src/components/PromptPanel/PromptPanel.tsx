import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Paperclip, Sparkles, FileImage, FileText, X, Loader2, OctagonX, RotateCcw, Search, Star, BrainCircuit, Upload, FilePenLine, PanelRightClose } from 'lucide-react'
import { useAppStore } from '@renderer/state/store'
import type { AiFixRequest } from '@renderer/state/store'
import { ChangeReview, type ChangeSetPreview } from '../ChangeReview/ChangeReview'
import './PromptPanel.css'

interface Attachment {
  name: string
  mimeType: string
  dataBase64: string
  sizeBytes: number
}

interface ProjectSkillStatus {
  exists: boolean
  path: string
  updatedAt: string | null
}

const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024
const MAX_AUTO_FIX_ATTEMPTS = 3
const FAVORITES_KEY = 'kx.favoriteSuggestions'

function searchable(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

function loadFavoriteSuggestions(): Set<string> {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(FAVORITES_KEY) ?? '[]')
    return new Set(Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [])
  } catch {
    return new Set()
  }
}

function buildCompilationFixPrompt(request: AiFixRequest): string {
  const diagnostics = request.diagnostics
    .filter((item) => item.severity === 'error' || item.severity === 'fatal')
    .slice(0, 40)
    .map((item) => {
      const location = item.file ? `${item.file}${item.line ? `(${item.line}${item.column ? `,${item.column}` : ''})` : ''}` : 'Projeto'
      return `- ${location}: ${item.code ?? item.severity.toUpperCase()} - ${item.message}`
    })
    .join('\n')
  const output = request.buildOutput.slice(-28_000)
  return `CORREÇÃO DE COMPILAÇÃO DELPHI.

Analise os erros reais abaixo e faça somente as alterações necessárias para o projeto compilar, preservando o comportamento e a interface existentes. Não remova units, formulários, componentes ou funcionalidades para contornar erros.

Diagnósticos estruturados:
${diagnostics || '- O compilador não informou uma localização estruturada; analise a saída completa.'}

Saída final do MSBuild/Delphi:
${output}

Retorne o projeto completo no formato obrigatório da IDE.`
}

function formatUsage(t: (key: string, options?: Record<string, unknown>) => string, usage?: {
  promptTokens: number | null
  completionTokens: number | null
  totalTokens: number | null
}): string | null {
  if (!usage) return null
  const { promptTokens, completionTokens, totalTokens } = usage
  if (promptTokens == null && completionTokens == null && totalTokens == null) return null
  const total = totalTokens ?? (promptTokens ?? 0) + (completionTokens ?? 0)
  return t('promptPanel.tokensUsage', { input: promptTokens ?? '?', output: completionTokens ?? '?', total })
}

function AttachmentIcon({ mimeType }: { mimeType: string }): JSX.Element {
  if (mimeType.startsWith('image/')) return <FileImage size={13} color="#f472b6" />
  if (mimeType === 'application/pdf') return <FileText size={13} color="#f14c4c" />
  return <Paperclip size={13} color="#9099a8" />
}

export function PromptPanel(): JSX.Element {
  const { t } = useTranslation()
  const {
    suggestions,
    workspaceVersion,
    aiProviders,
    activeProviderId,
    setActiveProviderId,
    isGenerating,
    setGenerating,
    liveProgress,
    setLiveProgress,
    projectDir,
    projectId,
    delphiProfile,
    activeTabPath,
    lastBuildResult,
    buildPlatform,
    buildConfig,
    setProject,
    setDprojPath,
    setFileTree,
    appendAiLine,
    saveAllTabs,
    refreshOpenTabs,
    openTab,
    setShowSettings,
    promptPanelWidth,
    setConsoleActiveTab,
    setCompiling,
    clearConsole,
    appendConsoleLine,
    setLastBuildResult,
    aiFixRequest,
    clearAiFixRequest,
    requestAiFix,
    aiGenerationRequest,
    clearAiGenerationRequest,
    togglePromptPanel
  } = useAppStore()

  const [prompt, setPrompt] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [attaching, setAttaching] = useState(false)
  const [pendingReview, setPendingReview] = useState<ChangeSetPreview | null>(null)
  const [applyingChanges, setApplyingChanges] = useState(false)
  const [lastCheckpoint, setLastCheckpoint] = useState<{ id: string; newProject: boolean } | null>(null)
  const [reviewReason, setReviewReason] = useState<'generation' | 'compile-fix' | 'migration'>('generation')
  const [suggestionSearch, setSuggestionSearch] = useState('')
  const [suggestionCategory, setSuggestionCategory] = useState('Contexto')
  const [favoriteSuggestionIds, setFavoriteSuggestionIds] = useState<Set<string>>(loadFavoriteSuggestions)
  const [skillStatus, setSkillStatus] = useState<ProjectSkillStatus | null>(null)
  const [skillBusy, setSkillBusy] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const [fixAttempt, setFixAttempt] = useState(0)

  const enabledProviders = aiProviders.filter((p) => p.enabled && p.hasApiKey)
  const activeExtension = activeTabPath?.match(/\.[^.\\/]+$/)?.[0].toLowerCase() ?? ''
  const fileContextualCategories = activeExtension === '.dfm'
    ? ['Interface', 'CRUD', 'Geral', 'Dados', 'Qualidade']
    : activeExtension === '.pas'
      ? ['Qualidade', 'Manutenção', 'Dados', 'Integração', 'Segurança']
      : ['.dpr', '.dproj'].includes(activeExtension)
        ? ['Projeto', 'Migração', 'Manutenção', 'Geral']
        : []
  const contextualCategories = lastBuildResult && !lastBuildResult.success
    ? Array.from(new Set(['Manutenção', ...fileContextualCategories]))
    : fileContextualCategories
  const categories = Array.from(new Set(suggestions.map((item) => item.category ?? 'Outros')))
    .sort((a, b) => a.localeCompare(b))
  const visibleSuggestions = suggestions
    .filter((item) => {
      const category = item.category ?? 'Outros'
      if (suggestionCategory === 'Favoritos' && !favoriteSuggestionIds.has(item.id)) return false
      if (suggestionCategory === 'Contexto' && contextualCategories.length > 0 && !contextualCategories.includes(category)) return false
      if (!['Contexto', 'Todos', 'Favoritos'].includes(suggestionCategory) && category !== suggestionCategory) return false
      const query = searchable(suggestionSearch.trim())
      return !query || searchable(`${item.label} ${item.promptText} ${category}`).includes(query)
    })
    .sort((a, b) => {
      const favoriteOrder = Number(favoriteSuggestionIds.has(b.id)) - Number(favoriteSuggestionIds.has(a.id))
      if (favoriteOrder) return favoriteOrder
      const aContext = contextualCategories.indexOf(a.category ?? 'Outros')
      const bContext = contextualCategories.indexOf(b.category ?? 'Outros')
      if (aContext !== bContext) return (aContext < 0 ? 999 : aContext) - (bContext < 0 ? 999 : bContext)
      return a.label.localeCompare(b.label)
    })

  function toggleSuggestionFavorite(id: string): void {
    const next = new Set(favoriteSuggestionIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setFavoriteSuggestionIds(next)
    window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(Array.from(next)))
  }

  useEffect(() => {
    const off = window.api.ai.onProgress((text) => setLiveProgress(text))
    return (): void => {
      off()
    }
  }, [setLiveProgress])

  useEffect(() => {
    if (pendingReview) void window.api.ai.discardChangeSet(pendingReview.id)
    setPendingReview(null)
    setApplyingChanges(false)
    setLastCheckpoint(null)
    setReviewReason('generation')
    setPrompt('')
    setAttachments([])
    setLiveProgress(null)
  }, [workspaceVersion])

  useEffect(() => {
    if (!projectDir) {
      setSkillStatus(null)
      return
    }
    void window.api.skill.status(projectDir).then(setSkillStatus)
  }, [projectDir, workspaceVersion])

  async function openProjectSkill(status: ProjectSkillStatus): Promise<void> {
    const content = await window.api.fs.readFile(status.path)
    openTab(status.path, 'SKILL.md', content)
  }

  async function handleCreateSkill(): Promise<void> {
    if (!projectDir) {
      window.alert(t('promptPanel.errorOpenProjectFirstSkill'))
      return
    }
    setSkillBusy(true)
    try {
      await saveAllTabs()
      const status = await window.api.skill.create({ projectDir, profile: delphiProfile })
      setSkillStatus(status)
      setFileTree(await window.api.fs.readProjectTree(projectDir))
      await openProjectSkill(status)
      appendAiLine(t('promptPanel.skillCreatedLog'))
    } catch (error) {
      window.alert(t('promptPanel.errorCreateSkill', { message: (error as Error).message }))
    } finally {
      setSkillBusy(false)
    }
  }

  async function handleLoadSkill(): Promise<void> {
    if (!projectDir) {
      window.alert(t('promptPanel.errorOpenProjectFirstLoadSkill'))
      return
    }
    if (skillStatus?.exists && !window.confirm(t('promptPanel.loadSkillConfirm'))) return
    setSkillBusy(true)
    try {
      await saveAllTabs()
      const status = await window.api.skill.load({ projectDir, profile: delphiProfile })
      if (!status) return
      setSkillStatus(status)
      setFileTree(await window.api.fs.readProjectTree(projectDir))
      await openProjectSkill(status)
      appendAiLine(t('promptPanel.skillLoadedLog'))
    } catch (error) {
      window.alert(t('promptPanel.errorLoadSkill', { message: (error as Error).message }))
    } finally {
      setSkillBusy(false)
    }
  }

  async function handleAttach(): Promise<void> {
    const paths = await window.api.fs.selectFiles()
    if (!paths || paths.length === 0) return

    setAttaching(true)
    try {
      const loaded: Attachment[] = []
      for (const path of paths) {
        const file = await window.api.fs.readFileBase64(path)
        if (file.sizeBytes > MAX_ATTACHMENT_BYTES) {
          window.alert(t('promptPanel.attachmentTooLarge', { name: file.name }))
          continue
        }
        loaded.push(file)
      }
      setAttachments((prev) => [...prev, ...loaded])
    } finally {
      setAttaching(false)
    }
  }

  function removeAttachment(index: number): void {
    setAttachments((prev) => prev.filter((_, i) => i !== index))
  }

  async function runGeneration(
    requestPrompt: string,
    reason: 'generation' | 'compile-fix' | 'migration',
    providerIdOverride?: string
  ): Promise<void> {
    if (!requestPrompt.trim()) return
    if (!projectDir) {
      window.alert(t('promptPanel.errorCreateOrOpenProject'))
      return
    }
    const providerId = providerIdOverride ?? activeProviderId
    if (!providerId) {
      window.alert(t('promptPanel.errorConfigureProvider'))
      setShowSettings(true)
      return
    }

    setGenerating(true)
    setIsCancelling(false)
    setLiveProgress(null)
    setConsoleActiveTab('ai')
    appendAiLine(
      reason === 'compile-fix'
        ? t('promptPanel.logFixLastBuild')
        : t('promptPanel.logPromptWithAttachments', { prompt: requestPrompt, attachmentsSuffix: attachments.length > 0 ? t('promptPanel.attachmentsCountSuffix', { count: attachments.length }) : '' })
    )

    try {
      await saveAllTabs()
      const response = await window.api.ai.generateProject({
        providerId,
        prompt: requestPrompt,
        projectDir,
        projectId,
        profile: delphiProfile,
        attachments:
          reason === 'generation'
            ? attachments.map(({ name, mimeType, dataBase64 }) => ({ name, mimeType, dataBase64 }))
            : []
      })
      if (skillStatus?.exists) await refreshOpenTabs([skillStatus.path])

      if (response.success) {
        appendAiLine(response.result.explanation || t('promptPanel.projectGeneratedSuccess'))
        const usageLine = formatUsage(t, response.result.usage)
        if (usageLine) appendAiLine(usageLine)
        const context = response.changeSet.contextSummary
        if (context.includedFiles.length > 0) {
          appendAiLine(t('promptPanel.contextAnalyzed', { files: context.includedFiles.join(', ') }))
        }
        if (context.omittedFiles.length > 0) {
          appendAiLine(t('promptPanel.contextLimitReached', { files: context.omittedFiles.join(', ') }))
        }
        if (context.preservedUnitCount > 0) {
          appendAiLine(t('promptPanel.unitsPreserved', { count: context.preservedUnitCount }))
        }
        if (context.secretsRedacted > 0) {
          appendAiLine(t('promptPanel.secretsRedacted', { count: context.secretsRedacted }))
        }
        if (response.changeSet.files.length === 0) {
          await window.api.ai.discardChangeSet(response.changeSet.id)
          appendAiLine(t('promptPanel.noChangesProduced'))
        } else {
          setReviewReason(reason)
          setPendingReview(response.changeSet)
          appendAiLine(t('promptPanel.filesAwaitingReview', { count: response.changeSet.files.length }))
        }
      } else if (response.cancelled) {
        appendAiLine(t('promptPanel.generationCancelled'))
      } else {
        appendAiLine(t('promptPanel.errorLog', { message: response.error }))
      }
    } catch (err) {
      appendAiLine(t('promptPanel.errorLog', { message: (err as Error).message }))
    } finally {
      setIsCancelling(false)
      setGenerating(false)
      setLiveProgress(null)
    }
  }

  async function handleGenerate(): Promise<void> {
    await runGeneration(prompt, 'generation')
  }

  useEffect(() => {
    if (!aiGenerationRequest) return
    const request = aiGenerationRequest
    clearAiGenerationRequest()
    setPrompt(request.prompt)
    if (request.providerId) setActiveProviderId(request.providerId)
    void runGeneration(request.prompt, request.reason ?? 'generation', request.providerId)
  }, [aiGenerationRequest?.id])

  useEffect(() => {
    if (!aiFixRequest) return
    clearAiFixRequest()
    if (pendingReview) {
      window.alert(t('promptPanel.finishOrCancelReviewFirst'))
      return
    }
    setFixAttempt(aiFixRequest.attempt ?? 1)
    void runGeneration(buildCompilationFixPrompt(aiFixRequest), 'compile-fix')
  }, [aiFixRequest?.id])

  async function handleCancel(): Promise<void> {
    if (isCancelling) return
    setIsCancelling(true)
    setLiveProgress(t('promptPanel.cancellingGeneration'))
    try {
      await window.api.ai.cancelGeneration()
    } catch (error) {
      setIsCancelling(false)
      appendAiLine(t('promptPanel.errorCancel', { message: (error as Error).message }))
    }
  }

  async function handleApplyChanges(selectedPaths: string[]): Promise<void> {
    if (!pendingReview || !projectDir) return
    setApplyingChanges(true)
    try {
      const response = await window.api.ai.applyChangeSet({
        changeSetId: pendingReview.id,
        selectedPaths
      })
      if (!response.success) {
        window.alert(response.error)
        return
      }
      setProject(projectDir, pendingReview.projectName, projectId ?? '', delphiProfile)
      setDprojPath(response.dprojPath)
      let refreshedSkill = skillStatus
      if (skillStatus?.exists) {
        refreshedSkill = await window.api.skill.create({ projectDir, profile: delphiProfile })
        setSkillStatus(refreshedSkill)
      }
      setFileTree(await window.api.fs.readProjectTree(projectDir))
      await refreshOpenTabs([
        ...response.changedPaths,
        ...(refreshedSkill?.exists ? [refreshedSkill.path] : [])
      ])
      setLastCheckpoint({ id: response.checkpointId, newProject: pendingReview.isNewProject })
      appendAiLine(t('promptPanel.changesAppliedSafely', { checkpointId: response.checkpointId }))
      const shouldRecompile = reviewReason === 'compile-fix' || reviewReason === 'migration'
      const wasCompileFix = reviewReason === 'compile-fix'
      if (reviewReason === 'generation' || reviewReason === 'migration') {
        setPrompt('')
        setAttachments([])
      }
      setPendingReview(null)
      setReviewReason('generation')

      if (shouldRecompile) {
        setConsoleActiveTab('build')
        clearConsole()
        setLastBuildResult(null)
        appendConsoleLine(
          reviewReason === 'migration'
            ? t('promptPanel.logMigrationApplied')
            : t('promptPanel.logFixApplied')
        )
        setCompiling(true)
        let compileResult: import('@renderer/state/store').CompileResult | null = null
        try {
          compileResult = await window.api.compiler.build({
            dprojPath: response.dprojPath,
            projectDir,
            projectName: pendingReview.projectName,
            platform: buildPlatform,
            config: buildConfig,
            profile: delphiProfile
          })
        } finally {
          setCompiling(false)
        }
        if (wasCompileFix && compileResult && !compileResult.success) {
          if (fixAttempt < MAX_AUTO_FIX_ATTEMPTS) {
            appendAiLine(t('promptPanel.compileStillFailedRetrying', { attempt: fixAttempt + 1, max: MAX_AUTO_FIX_ATTEMPTS }))
            requestAiFix(compileResult, fixAttempt + 1)
          } else {
            appendAiLine(t('promptPanel.compileFailedAfterAttempts', { max: MAX_AUTO_FIX_ATTEMPTS }))
            setFixAttempt(0)
          }
        } else if (wasCompileFix) {
          setFixAttempt(0)
        }
      }
    } finally {
      setApplyingChanges(false)
    }
  }

  async function handleDiscardChanges(): Promise<void> {
    if (!pendingReview || applyingChanges) return
    await window.api.ai.discardChangeSet(pendingReview.id)
    appendAiLine(t('promptPanel.aiChangesCancelledLog'))
    setPendingReview(null)
    setReviewReason('generation')
  }

  async function handleRestore(): Promise<void> {
    if (!lastCheckpoint || !projectDir) return
    if (!window.confirm(t('promptPanel.undoLastChangeConfirm'))) return
    const response = await window.api.ai.restoreCheckpoint({
      checkpointId: lastCheckpoint.id,
      projectDir
    })
    if (!response.success) {
      window.alert(response.error)
      return
    }
    setFileTree(await window.api.fs.readProjectTree(projectDir))
    await refreshOpenTabs(response.changedPaths)
    if (lastCheckpoint.newProject) setDprojPath(null)
    appendAiLine(t('promptPanel.lastChangeUndoneLog'))
    setLastCheckpoint(null)
  }

  return (
    <div className="prompt-panel" style={{ width: promptPanelWidth }}>
      <div className="prompt-header">
        <span>{t('promptPanel.aiAssistant')}</span>
        <button onClick={togglePromptPanel} title={t('promptPanel.collapseAssistant')}><PanelRightClose size={14} /></button>
      </div>

      {aiProviders.length === 0 ? (
        <div className="prompt-no-provider">
          {t('promptPanel.noProviderConfigured')}
        </div>
      ) : (
        <select
          className="prompt-provider-select"
          value={activeProviderId ?? ''}
          onChange={(e) => setActiveProviderId(e.target.value || null)}
        >
          <option value="" disabled>
            {t('promptPanel.selectProvider')}
          </option>
          {aiProviders.map((p) => (
            <option key={p.id} value={p.id} disabled={!p.hasApiKey}>
              {p.name} {p.hasApiKey ? '' : t('promptPanel.noKeySuffix')}
            </option>
          ))}
        </select>
      )}

      <div className={`prompt-skill-bar ${skillStatus?.exists ? 'active' : ''}`}>
        <div className="prompt-skill-status" title={skillStatus?.path ?? t('promptPanel.noSkillCreated')}>
          <BrainCircuit size={14} />
          <span>{skillStatus?.exists ? t('promptPanel.skillConnected') : t('promptPanel.projectSkill')}</span>
        </div>
        <div className="prompt-skill-actions">
          {skillStatus?.exists ? (
            <button onClick={() => void openProjectSkill(skillStatus)} disabled={skillBusy} title={t('promptPanel.openAndEditSkill')}>
              <FilePenLine size={12} /> {t('promptPanel.edit')}
            </button>
          ) : (
            <button onClick={handleCreateSkill} disabled={skillBusy || !projectDir} title={t('promptPanel.createSkillHint')}>
              <BrainCircuit size={12} /> {t('promptPanel.createSkill')}
            </button>
          )}
          <button onClick={handleLoadSkill} disabled={skillBusy || !projectDir} title={t('promptPanel.loadSkillHint')}>
            <Upload size={12} /> {t('promptPanel.load')}
          </button>
        </div>
      </div>

      <div className="prompt-hint">{t('promptPanel.smartSuggestions')}</div>
      <div className="prompt-suggestion-search">
        <Search size={13} />
        <input
          value={suggestionSearch}
          onChange={(event) => setSuggestionSearch(event.target.value)}
          placeholder={t('promptPanel.searchSuggestionsPlaceholder')}
        />
      </div>
      <div className="prompt-suggestion-categories">
        {['Contexto', 'Todos', 'Favoritos', ...categories].map((category) => (
          <button
            key={category}
            className={suggestionCategory === category ? 'active' : ''}
            onClick={() => setSuggestionCategory(category)}
          >
            {category}
          </button>
        ))}
      </div>
      <div className="prompt-suggestions">
        {visibleSuggestions.map((s) => (
          <div key={s.id} className="prompt-suggestion-item">
            <button className="prompt-chip" title={s.promptText} onClick={() => setPrompt(s.promptText)}>
              <span>{s.label}</span>
              <small>{s.category ?? 'Outros'}</small>
            </button>
            <button
              className={`prompt-favorite-btn ${favoriteSuggestionIds.has(s.id) ? 'active' : ''}`}
              title={favoriteSuggestionIds.has(s.id) ? t('promptPanel.removeFromFavorites') : t('promptPanel.addToFavorites')}
              onClick={() => toggleSuggestionFavorite(s.id)}
            >
              <Star size={12} fill={favoriteSuggestionIds.has(s.id) ? 'currentColor' : 'none'} />
            </button>
          </div>
        ))}
        {visibleSuggestions.length === 0 && <div className="prompt-suggestion-empty">{t('promptPanel.noSuggestionsFound')}</div>}
      </div>

      <div className="prompt-input-area">
        {lastCheckpoint && !isGenerating && (
          <button className="prompt-restore-btn" onClick={handleRestore}>
            <RotateCcw size={13} /> {t('promptPanel.undoLastAiChange')}
          </button>
        )}
        {attachments.length > 0 && (
          <div className="prompt-attachments">
            {attachments.map((a, i) => (
              <div key={`${a.name}-${i}`} className="prompt-attachment-chip" title={a.name}>
                <AttachmentIcon mimeType={a.mimeType} />
                <span className="prompt-attachment-name">{a.name}</span>
                <span className="prompt-attachment-remove" onClick={() => removeAttachment(i)}>
                  <X size={11} />
                </span>
              </div>
            ))}
          </div>
        )}
        <textarea
          className="prompt-textarea"
          placeholder={t('promptPanel.describeScreenPlaceholder')}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        {isGenerating && liveProgress && (
          <div className="prompt-live-progress">
            <Loader2 size={12} className="spin" />
            {liveProgress}
          </div>
        )}
        <div className="prompt-actions-row">
          <button className="prompt-attach-btn" onClick={handleAttach} disabled={attaching || isGenerating} title={t('promptPanel.attachImagesOrPdf')}>
            {attaching ? <Loader2 size={14} className="spin" /> : <Paperclip size={14} color="#9099a8" />} {t('promptPanel.attach')}
          </button>
          {isGenerating ? (
            <button className="prompt-generate-btn prompt-cancel-btn" onClick={handleCancel} disabled={isCancelling}>
              {isCancelling ? <Loader2 size={14} color="#fff" className="spin" /> : <OctagonX size={14} color="#fff" />}
              {isCancelling ? t('promptPanel.cancelling') : t('common.cancel')}
            </button>
          ) : (
            <button
              className="prompt-generate-btn"
              onClick={handleGenerate}
              disabled={!prompt.trim() || enabledProviders.length === 0}
            >
              <Sparkles size={14} color="#fff" /> {t('promptPanel.generateWithAi')}
            </button>
          )}
        </div>
      </div>
      {pendingReview && (
        <ChangeReview
          changeSet={pendingReview}
          applying={applyingChanges}
          onApply={handleApplyChanges}
          onDiscard={handleDiscardChanges}
        />
      )}
    </div>
  )
}
