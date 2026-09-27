import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, ArrowRight, Bot, Boxes, CodeXml, Database, FileCode2, FolderSearch, X } from 'lucide-react'
import { MigrationPlanner, type ProjectMigrationView } from './MigrationPlanner'
import './ProjectAnalysisModal.css'

export interface ProjectAnalysisView {
  projectName: string
  manifestPath: string
  summaryPath: string
  counts: { files: number; projects: number; projectGroups: number; packages: number; units: number; forms: number; dataModules: number; frames: number; services: number; tests: number }
  technologies: Array<{ name: string; category: string; files: string[] }>
  databaseConnections: Array<{ library: string; componentClass: string; componentName: string; sourceFile: string; driver?: string; database?: string; server?: string; connectionName?: string; confidence: string }>
  thirdPartyComponents: Array<{ className: string; occurrences: number; files: string[] }>
  databaseStatus: 'configured' | 'detected' | 'ambiguous' | 'not-detected'
  hasDatabaseIni: boolean
  warnings: string[]
  delphiVersion: { label: string; profile: string; sourceFile?: string; sourceValue?: string; confidence: 'high' | 'medium' | 'low' }
  migration?: ProjectMigrationView
}

function warningLabel(t: (key: string, options?: Record<string, unknown>) => string, warning: string): string {
  if (warning === 'warning:database-ini-missing') return t('projectAnalysis.warningDatabaseIniMissing')
  if (warning === 'warning:database-ambiguous') return t('projectAnalysis.warningDatabaseAmbiguous')
  if (warning.startsWith('warning:scan-limit:')) return t('projectAnalysis.warningScanLimit', { limit: warning.split(':')[2] })
  return warning
}

export function ProjectAnalysisModal({ analysis, onClose }: { analysis: ProjectAnalysisView; onClose: () => void }): JSX.Element {
  const { t } = useTranslation()
  const [showMigration, setShowMigration] = useState(false)
  const statusLabels: Record<ProjectAnalysisView['databaseStatus'], string> = {
    configured: t('projectAnalysis.databaseIniConfigured'),
    detected: t('projectAnalysis.connectionDetected'),
    ambiguous: t('projectAnalysis.multipleConnections'),
    'not-detected': t('projectAnalysis.noConnectionFound')
  }
  return <>{showMigration && analysis.migration && <MigrationPlanner analysis={analysis} migration={analysis.migration} onClose={() => setShowMigration(false)} onStarted={onClose} />}<div className="project-analysis-overlay">
    <section className="project-analysis-modal" role="dialog" aria-modal="true" aria-label={t('projectAnalysis.title')}>
      <header>
        <div className="project-analysis-title-icon"><FolderSearch size={23} /></div>
        <div><h2>{t('projectAnalysis.title')}</h2><p>{t('projectAnalysis.analyzedWithoutChanges', { name: analysis.projectName })}</p></div>
        <button onClick={onClose} title={t('common.close')}><X size={20} /></button>
      </header>
      <div className="project-analysis-body">
        <section className="project-analysis-version">
          <CodeXml size={20} />
          <div><span>{t('projectAnalysis.delphiVersion')}</span><strong>{analysis.delphiVersion.label}</strong></div>
          <small>{analysis.delphiVersion.sourceFile ? t('projectAnalysis.detectedIn', { file: analysis.delphiVersion.sourceFile, value: analysis.delphiVersion.sourceValue ? ` · ${analysis.delphiVersion.sourceValue}` : '' }) : t('projectAnalysis.noVersionMetadata')}</small>
        </section>
        <div className="project-analysis-cards">
          <article><FileCode2 /><strong>{analysis.counts.units}</strong><span>Units</span></article>
          <article><Boxes /><strong>{analysis.counts.forms}</strong><span>{t('projectAnalysis.forms')}</span></article>
          <article><Boxes /><strong>{analysis.counts.dataModules}</strong><span>DataModules</span></article>
          <article><Database /><strong>{analysis.databaseConnections.length}</strong><span>{t('projectAnalysis.connections')}</span></article>
        </div>
        <section className={'project-analysis-database ' + analysis.databaseStatus}>
          <div><Database size={19} /><strong>{t('toolbar.database')}</strong><span>{statusLabels[analysis.databaseStatus]}</span></div>
          {!analysis.databaseConnections.length
            ? <p>{t('projectAnalysis.noConnectionComponent')}</p>
            : analysis.databaseConnections.map((item, index) => <article key={item.sourceFile + item.componentName + index}>
                <strong>{item.library}</strong>
                <span>{item.componentName} · {item.componentClass}</span>
                <small>{[item.driver && `${t('projectAnalysis.driver')}: ` + item.driver, item.database && `${t('projectAnalysis.database')}: ` + item.database, item.server && `${t('projectAnalysis.server')}: ` + item.server, item.connectionName && `${t('projectAnalysis.connection')}: ` + item.connectionName].filter(Boolean).join(' · ') || t('projectAnalysis.runtimeParameters')}</small>
                <em>{item.sourceFile}</em>
              </article>)}
          {analysis.databaseStatus === 'ambiguous' && <div className="project-analysis-caution"><AlertTriangle size={16} /> {t('projectAnalysis.ambiguousWarning')}</div>}
        </section>
        <div className="project-analysis-columns">
          <section><h3>{t('projectAnalysis.technologiesFound')}</h3><div className="project-analysis-tags">{analysis.technologies.length ? analysis.technologies.map((item) => <span key={item.name}>{item.name}</span>) : <p>{t('projectAnalysis.noTechnologyFound')}</p>}</div></section>
          <section><h3>{t('projectAnalysis.thirdPartyComponents')}</h3><p>{t('projectAnalysis.classesIdentified', { count: analysis.thirdPartyComponents.length })}</p>{analysis.thirdPartyComponents.slice(0, 8).map((item) => <small key={item.className}>{item.className} ({item.occurrences})</small>)}</section>
        </div>
        {analysis.warnings.length > 0 && <section className="project-analysis-warnings"><h3>{t('projectAnalysis.attention')}</h3>{analysis.warnings.map((item) => <p key={item}><AlertTriangle size={15} />{warningLabel(t, item)}</p>)}</section>}
        <footer className="project-analysis-paths"><span>{t('projectAnalysis.summary')}: {analysis.summaryPath}</span><span>{t('projectAnalysis.manifest')}: {analysis.manifestPath}</span></footer>
      </div>
      <div className="project-analysis-actions">{analysis.migration?.available && <button className="migration-button" onClick={() => setShowMigration(true)}><Bot size={17} /> {t('projectAnalysis.evaluateMigration', { target: analysis.migration.targetLabel })}</button>}<button onClick={onClose}>{t('projectAnalysis.continueInProject')} <ArrowRight size={17} /></button></div>
    </section>
  </div></>
}
