import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, ArrowLeft, ArrowRight, Bot, ShieldCheck, Sparkles, X } from 'lucide-react'
import { useAppStore } from '@renderer/state/store'
import type { ProjectAnalysisView } from './ProjectAnalysisModal'
import './MigrationPlanner.css'

export interface MigrationComponentView {
  className: string
  occurrences: number
  family: string
  strategy: 'keep-update' | 'native-candidate' | 'keep-required' | 'manual-review'
  risk: 'low' | 'medium' | 'high'
  nativeCandidates: string[]
  rationale: string
}

export interface ProjectMigrationView {
  available: boolean
  sourceLabel: string
  targetLabel: string
  targetStudioPath?: string
  targetCompilerVersion?: string
  components: MigrationComponentView[]
  notes: string[]
}

const riskLabels = { low: 'Baixo', medium: 'Médio', high: 'Alto' } as const

function buildPrompt(
  analysis: ProjectAnalysisView,
  migration: ProjectMigrationView,
  providerName: string,
  choices: Record<string, string>
): string {
  const decisions = migration.components.map((item) => {
    const choice = choices[item.className] ?? 'keep'
    const decision = item.strategy === 'keep-update'
      ? 'MANTER o ACBr e somente adaptar/atualizar para a instalação disponível; nunca substituir por componente nativo.'
      : item.strategy === 'keep-required'
        ? 'MANTER o componente de terceiros; não existe equivalente nativo seguro aprovado.'
        : item.strategy === 'manual-review'
          ? 'NÃO ALTERAR automaticamente; documentar a dependência e os riscos.'
          : choice === 'keep'
            ? 'MANTER o componente de terceiros.'
            : choice === 'analyze'
              ? `ANALISAR no PAS/DFM e substituir somente com equivalência comprovada. Candidatos: ${item.nativeCandidates.join(', ') || 'nenhum'}.`
              : `SUBSTITUIR por ${choice}, somente após confirmar compatibilidade no código real.`
    return `- ${item.className} (${item.occurrences} ocorrência(s), família ${item.family}, risco ${riskLabels[item.risk]}): ${decision} Evidência inicial: ${item.rationale}`
  }).join('\n')

  return `MIGRAÇÃO ASSISTIDA E CONSERVADORA DE PROJETO DELPHI.

Projeto: ${analysis.projectName}
Versão de origem: ${migration.sourceLabel}
Versão de destino instalada: ${migration.targetLabel}
Compilador: ${migration.targetCompilerVersion ?? 'detectado pela IDE'}
RAD Studio: ${migration.targetStudioPath ?? 'instalação detectada pela IDE'}
Provedor/modelo escolhido: ${providerName}

DECISÕES AUTORIZADAS:
${decisions || '- Nenhuma substituição de componente foi autorizada.'}

REGRAS OBRIGATÓRIAS:
1. Analise PAS, DFM, DPR, DPK, DPROJ e configurações reais antes de alterar qualquer arquivo.
2. Não adivinhe equivalências. Sem evidência suficiente, preserve o componente e explique.
3. ACBr deve ser mantido; adapte somente units, paths ou APIs quando a versão instalada exigir.
4. Preserve nomes, eventos, regras de negócio, SQL, transações, campos persistentes e comportamento visual.
5. PAS e DFM devem permanecer sincronizados; nunca grave propriedades incompatíveis no DFM.
6. Não remova units, packages, BPLs ou Library Paths enquanto houver referência ativa.
7. Não exponha nem altere credenciais do banco e preserve a arquitetura de conexão.
8. Não reformate nem refatore código não relacionado.
9. Para cada substituição, descreva origem, destino, evidência, risco e teste necessário.
10. Entregue arquivos completos no protocolo da KarnoX Builder. Nada será gravado sem revisão.
11. O projeto será recompilado após aprovação; não considere a migração concluída sem compilação válida.

Gere um conjunto de alterações revisável e conservador.`
}

export function MigrationPlanner({
  analysis,
  migration,
  onClose,
  onStarted
}: {
  analysis: ProjectAnalysisView
  migration: ProjectMigrationView
  onClose: () => void
  onStarted: () => void
}): JSX.Element {
  const { t } = useTranslation()
  const { aiProviders, activeProviderId, setActiveProviderId, requestAiGeneration } = useAppStore()
  const uiStrategyLabels = {
    'keep-update': t('migration.strategyKeepUpdate'),
    'native-candidate': t('migration.strategyNativeCandidate'),
    'keep-required': t('migration.strategyKeepRequired'),
    'manual-review': t('migration.strategyManualReview')
  } as const
  const uiRiskLabels = { low: t('migration.riskLow'), medium: t('migration.riskMedium'), high: t('migration.riskHigh') } as const
  const providers = aiProviders.filter((provider) => provider.enabled && provider.hasApiKey)
  const [providerId, setProviderId] = useState(
    providers.some((provider) => provider.id === activeProviderId) ? activeProviderId ?? '' : providers[0]?.id ?? ''
  )
  const [choices, setChoices] = useState<Record<string, string>>(() =>
    Object.fromEntries(migration.components.map((item) => [
      item.className,
      item.strategy === 'native-candidate' ? 'analyze' : 'keep'
    ]))
  )

  function start(): void {
    const provider = providers.find((item) => item.id === providerId)
    if (!provider) return
    const label = `${provider.name} · ${provider.defaultModel || t('migration.configuredModel')}`
    setActiveProviderId(provider.id)
    requestAiGeneration(buildPrompt(analysis, migration, label, choices), {
      providerId: provider.id,
      reason: 'migration'
    })
    onStarted()
  }

  return <div className="migration-planner-overlay">
    <section className="migration-planner" role="dialog" aria-modal="true" aria-label={t('migration.title')}>
      <header>
        <div className="migration-planner-icon"><Bot size={23} /></div>
        <div><h2>{t('migration.title')}</h2><p>{migration.sourceLabel} <ArrowRight size={12} /> {migration.targetLabel}</p></div>
        <button onClick={onClose} title={t('common.close')}><X size={20} /></button>
      </header>
      <div className="migration-planner-body">
        <section className="migration-safety">
          <ShieldCheck size={22} />
          <div><strong>{t('migration.controlledMigration')}</strong><span>{t('migration.controlledDescription')}</span></div>
        </section>
        <section className="migration-target">
          <div><span>{t('migration.source')}</span><strong>{migration.sourceLabel}</strong></div>
          <ArrowRight size={18} />
          <div><span>{t('migration.installedTarget')}</span><strong>{migration.targetLabel}</strong><small>{migration.targetStudioPath}</small></div>
        </section>
        <section className="migration-provider">
          <label htmlFor="migration-provider">{t('migration.aiForAnalysis')}</label>
          <select id="migration-provider" value={providerId} onChange={(event) => setProviderId(event.target.value)}>
            <option value="">{t('migration.selectConfiguredProvider')}</option>
            {providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name} · {provider.defaultModel || t('migration.configuredModel')}</option>)}
          </select>
          {!providers.length && <p><AlertTriangle size={15} /> {t('migration.enableProviderFirst')}</p>}
        </section>
        <section className="migration-components">
          <header><div><h3>{t('migration.decisionsPerComponent')}</h3><p>{t('migration.decisionsDescription')}</p></div><span>{t('migration.classCount', { count: migration.components.length })}</span></header>
          {!migration.components.length && <div className="migration-empty">{t('migration.noComponentNeedsDecision')}</div>}
          {migration.components.map((item) => <article key={item.className}>
            <div className="migration-component-name"><strong>{item.className}</strong><span>{t('migration.occurrences', { count: item.occurrences })} · {item.family}</span></div>
            <span className={`migration-risk ${item.risk}`}>{t('migration.risk')} {uiRiskLabels[item.risk]}</span>
            <div className="migration-decision">
              <label>{uiStrategyLabels[item.strategy]}</label>
              {item.strategy === 'native-candidate' ? <select value={choices[item.className] ?? 'analyze'} onChange={(event) => setChoices((current) => ({ ...current, [item.className]: event.target.value }))}>
                <option value="analyze">{t('migration.aiEvaluatesMatch')}</option>
                <option value="keep">{t('migration.keepThirdParty')}</option>
                {item.nativeCandidates.map((candidate) => <option key={candidate} value={candidate}>{t('migration.migrateTo', { target: candidate })}</option>)}
              </select> : <div className="migration-fixed-decision">{item.strategy === 'keep-update' ? t('migration.keepAndUpdateIntegration') : item.strategy === 'keep-required' ? t('migration.keepThirdParty') : t('migration.preserveAndReviewManually')}</div>}
            </div>
            <p>{item.rationale}</p>
          </article>)}
        </section>
        {migration.notes.length > 0 && <section className="migration-notes">{migration.notes.map((note) => <p key={note}><AlertTriangle size={14} /> {note}</p>)}</section>}
      </div>
      <footer>
        <button className="secondary" onClick={onClose}><ArrowLeft size={17} /> {t('common.back')}</button>
        <button onClick={start} disabled={!providerId}><Sparkles size={17} /> {t('migration.generateSafePlan')}</button>
      </footer>
    </section>
  </div>
}
