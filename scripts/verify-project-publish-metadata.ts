import { strict as assert } from 'assert'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { readProjectPublishMetadata } from '../src/main/publish/projectMetadata'

const directory = mkdtempSync(join(tmpdir(), 'karnox-publish-metadata-'))
try {
  writeFileSync(join(directory, 'ClienteApp.dproj'), `<?xml version="1.0"?>
<Project>
  <PropertyGroup>
    <VerInfo_MajorVer>3</VerInfo_MajorVer>
    <VerInfo_MinorVer>2</VerInfo_MinorVer>
    <VerInfo_Release>1</VerInfo_Release>
    <VerInfo_Build>7</VerInfo_Build>
    <VerInfo_Keys>CompanyName=KarnoX;FileDescription=Sistema do cliente;ProductName=Cliente ERP;LegalCopyright=Copyright 2026</VerInfo_Keys>
    <Icon_MainIcon>assets\\cliente.ico</Icon_MainIcon>
    <Manifest_File>assets\\cliente.manifest</Manifest_File>
  </PropertyGroup>
</Project>`)
  const metadata = readProjectPublishMetadata(directory, 'ClienteApp')
  assert(metadata)
  assert.equal(metadata.version, '3.2.1.7')
  assert.equal(metadata.companyName, 'KarnoX')
  assert.equal(metadata.productName, 'Cliente ERP')
  assert.equal(metadata.description, 'Sistema do cliente')
  assert.equal(metadata.iconPath, join(directory, 'assets', 'cliente.ico'))
  assert.equal(metadata.manifestPath, join(directory, 'assets', 'cliente.manifest'))
  process.stdout.write('Existing Delphi publish metadata import test: OK\n')
} finally {
  rmSync(directory, { recursive: true, force: true })
}
