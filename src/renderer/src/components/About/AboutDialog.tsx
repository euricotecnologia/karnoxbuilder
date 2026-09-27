import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, Mail, Phone, User, X } from 'lucide-react'
import './AboutDialog.css'

const GITHUB_URL = 'https://github.com/euricotecnologia/karnoxbuilder'

export function AboutDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const { t } = useTranslation()
  const [version, setVersion] = useState('')

  useEffect(() => {
    void window.api.system.getVersion().then(setVersion)
  }, [])

  return (
    <div className="about-dialog-overlay" onClick={onClose}>
      <section
        className="about-dialog-modal"
        role="dialog"
        aria-modal="true"
        aria-label={t('about.title')}
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <div>
            <h2>KarnoX Builder</h2>
            <p>{t('about.tagline')}</p>
          </div>
          <button onClick={onClose} title={t('common.close')}><X size={20} /></button>
        </header>

        <div className="about-dialog-body">
          <dl>
            <dt>{t('about.version')}</dt>
            <dd>{version || '—'}</dd>

            <dt><User size={13} /> {t('about.developedBy')}</dt>
            <dd>Eurico Júnior</dd>

            <dt><Mail size={13} /> {t('about.email')}</dt>
            <dd>euricotecnologia@hotmail.com</dd>

            <dt><Phone size={13} /> {t('about.contact')}</dt>
            <dd>+55 19 97139-5449</dd>

            <dt><Download size={13} /> {t('about.github')}</dt>
            <dd>
              <button
                type="button"
                className="about-dialog-link"
                onClick={() => void window.api.system.openExternal(GITHUB_URL)}
              >
                {t('about.downloadOnGithub')}
              </button>
            </dd>
          </dl>

          <p className="about-dialog-copyright">© {new Date().getFullYear()} KarnoX Builder. {t('about.allRightsReserved')}</p>
        </div>
      </section>
    </div>
  )
}
