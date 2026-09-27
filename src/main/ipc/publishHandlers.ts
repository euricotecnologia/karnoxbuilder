import { BrowserWindow, ipcMain } from 'electron'
import { listPublishProfiles, savePublishProfile } from '../db/repositories/publishProfilesRepo'
import {
  analyzePublish, generateUpdaterUnit, preparePublishMetadata, publishProject
} from '../publish/publishService'
import type { PublishProfile } from '../publish/types'

function validateProfile(profile: PublishProfile): void {
  if (!profile.projectPath || !profile.projectName) throw new Error('Abra um projeto antes de publicar.')
  if (!['debug', 'staging', 'production'].includes(profile.environment)) throw new Error('Ambiente de publicação inválido.')
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(profile.version)) throw new Error('Use a versão no formato 1.0.0.0.')
  if (/\r|\n/.test(profile.outputDir)) throw new Error('Diretório de saída inválido.')
}

export function registerPublishHandlers(mainWindow: BrowserWindow): void {
  ipcMain.handle('publish:profiles', (_event, args: { projectPath: string; projectName: string }) =>
    listPublishProfiles(args.projectPath, args.projectName))
  ipcMain.handle('publish:saveProfile', (_event, args: { profile: PublishProfile; certificatePassword?: string }) => {
    validateProfile(args.profile)
    savePublishProfile(args.profile, args.certificatePassword)
    return listPublishProfiles(args.profile.projectPath, args.profile.projectName)
  })
  ipcMain.handle('publish:analyze', (_event, profile: PublishProfile) => {
    validateProfile(profile)
    return analyzePublish(profile)
  })
  ipcMain.handle('publish:prepareMetadata', (_event, profile: PublishProfile) => {
    validateProfile(profile)
    return preparePublishMetadata(profile)
  })
  ipcMain.handle('publish:run', (_event, profile: PublishProfile) => {
    validateProfile(profile)
    return publishProject(profile, (message) => mainWindow.webContents.send('publish:progress', message))
  })
  ipcMain.handle('publish:generateUpdater', (_event, profile: PublishProfile) => {
    validateProfile(profile)
    return generateUpdaterUnit(profile)
  })
}
