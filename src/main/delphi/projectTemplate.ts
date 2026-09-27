import { randomUUID } from 'crypto'
import { DELPHI_PROFILES, type DelphiProfileId } from './profiles'

export interface UnitSpec {
  unitName: string
  pasContent: string
  dfmContent: string | null
  isMainForm: boolean
  formClassName?: string
}

export interface ProjectSpec {
  projectName: string
  units: UnitSpec[]
}

function formUnits(units: UnitSpec[]): UnitSpec[] {
  const forms = units.filter((u) => u.dfmContent !== null)
  return [
    ...forms.filter((u) => u.isMainForm),
    ...forms.filter((u) => !u.isMainForm)
  ]
}

/**
 * A classe real de um formulário/DataModule é a que está gravada na primeira
 * linha do próprio .dfm ("object NomeDaInstancia: TNomeDaClasse"). Isso NUNCA
 * pode ser adivinhado a partir do nome da unit (ex.: "UnitDatabase" quase
 * sempre declara uma classe como "TdmDatabase", não "TUnitDatabase") — usar
 * esse tipo de suposição gera "Undeclared identifier" no .dpr sempre que
 * `formClassName` não vier preenchido corretamente (ex.: resposta da IA sem o
 * marcador de classe, ou merge de units existentes). O .dfm é a única fonte
 * de verdade; só recorremos ao nome da unit no caso extremo de não haver .dfm
 * algum (o que não deveria acontecer para uma unit com formulário).
 */
function resolveFormClassName(unit: UnitSpec): string {
  if (unit.dfmContent) {
    const rootMatch = /^\s*(?:object|inherited|inline)\s+[A-Za-z][A-Za-z0-9_]*\s*:\s*([A-Za-z][A-Za-z0-9_.]*)/m.exec(unit.dfmContent)
    if (rootMatch) return rootMatch[1]
  }
  return unit.formClassName ?? `T${unit.unitName}`
}

export function buildDpr(spec: ProjectSpec, profileId: DelphiProfileId = 'delphi10_13'): string {
  const profile = DELPHI_PROFILES[profileId]
  const forms = formUnits(spec.units)
  const usesLines = spec.units
    .map((u) => `  ${u.unitName} in '${u.unitName}.pas'${u.dfmContent !== null ? ` {${resolveFormClassName(u)}}` : ''}`)
    .join(',\n')
  const createFormLines = forms
    .map((u) => {
      const className = resolveFormClassName(u)
      return `  Application.CreateForm(${className}, ${className.replace(/^T/, '')});`
    })
    .join('\n')
  const formsUnit = profile.namespacedUnits ? 'Vcl.Forms' : 'Forms'
  const resourceLine = profile.buildSystem === 'msbuild' ? '{$R *.res}\n\n' : ''
  const taskbarLine = profileId === 'delphi7_2007' ? '' : '  Application.MainFormOnTaskbar := True;\n'

  return `program ${spec.projectName};

uses
  ${formsUnit},
${usesLines};

${resourceLine}begin
  Application.Initialize;
${taskbarLine}${createFormLines}
  Application.Run;
end.
`
}

export function buildDproj(spec: ProjectSpec, existingGuid?: string): string {
  const guid = existingGuid ?? `{${randomUUID().toUpperCase()}}`

  const dccReferences = spec.units
    .map((u) => {
      if (u.dfmContent !== null) {
        return `        <DCCReference Include="${u.unitName}.pas">
            <Form>${resolveFormClassName(u).replace(/^T/, '')}</Form>
            <FormType>dfm</FormType>
        </DCCReference>`
      }
      return `        <DCCReference Include="${u.unitName}.pas"/>`
    })
    .join('\n')

  return `<Project xmlns="http://schemas.microsoft.com/developer/msbuild/2003">
    <PropertyGroup>
        <ProjectGuid>${guid}</ProjectGuid>
        <ProjectVersion>20.3</ProjectVersion>
        <FrameworkType>VCL</FrameworkType>
        <Base>True</Base>
        <Config Condition="'$(Config)'==''">Debug</Config>
        <Platform Condition="'$(Platform)'==''">Win32</Platform>
        <ProjectName Condition="'$(ProjectName)'==''">${spec.projectName}</ProjectName>
        <TargetedPlatforms>3</TargetedPlatforms>
        <AppType>Application</AppType>
        <MainSource>${spec.projectName}.dpr</MainSource>
    </PropertyGroup>
    <PropertyGroup Condition="'$(Config)'=='Base' or '$(Base)'!=''">
        <Base>true</Base>
    </PropertyGroup>
    <PropertyGroup Condition="('$(Platform)'=='Win32' and '$(Base)'=='true') or '$(Base_Win32)'!=''">
        <Base_Win32>true</Base_Win32>
        <CfgParent>Base</CfgParent>
        <Base>true</Base>
    </PropertyGroup>
    <PropertyGroup Condition="('$(Platform)'=='Win64' and '$(Base)'=='true') or '$(Base_Win64)'!=''">
        <Base_Win64>true</Base_Win64>
        <CfgParent>Base</CfgParent>
        <Base>true</Base>
    </PropertyGroup>
    <PropertyGroup Condition="'$(Config)'=='Debug' or '$(Cfg_1)'!=''">
        <Cfg_1>true</Cfg_1>
        <CfgParent>Base</CfgParent>
        <Base>true</Base>
    </PropertyGroup>
    <PropertyGroup Condition="('$(Platform)'=='Win32' and '$(Cfg_1)'=='true') or '$(Cfg_1_Win32)'!=''">
        <Cfg_1_Win32>true</Cfg_1_Win32>
        <CfgParent>Cfg_1</CfgParent>
        <Cfg_1>true</Cfg_1>
        <Base>true</Base>
    </PropertyGroup>
    <PropertyGroup Condition="('$(Platform)'=='Win64' and '$(Cfg_1)'=='true') or '$(Cfg_1_Win64)'!=''">
        <Cfg_1_Win64>true</Cfg_1_Win64>
        <CfgParent>Cfg_1</CfgParent>
        <Cfg_1>true</Cfg_1>
        <Base>true</Base>
    </PropertyGroup>
    <PropertyGroup Condition="'$(Config)'=='Release' or '$(Cfg_2)'!=''">
        <Cfg_2>true</Cfg_2>
        <CfgParent>Base</CfgParent>
        <Base>true</Base>
    </PropertyGroup>
    <PropertyGroup Condition="('$(Platform)'=='Win32' and '$(Cfg_2)'=='true') or '$(Cfg_2_Win32)'!=''">
        <Cfg_2_Win32>true</Cfg_2_Win32>
        <CfgParent>Cfg_2</CfgParent>
        <Cfg_2>true</Cfg_2>
        <Base>true</Base>
    </PropertyGroup>
    <PropertyGroup Condition="('$(Platform)'=='Win64' and '$(Cfg_2)'=='true') or '$(Cfg_2_Win64)'!=''">
        <Cfg_2_Win64>true</Cfg_2_Win64>
        <CfgParent>Cfg_2</CfgParent>
        <Cfg_2>true</Cfg_2>
        <Base>true</Base>
    </PropertyGroup>
    <PropertyGroup Condition="'$(Base)'!=''">
        <DCC_DcuOutput>.\\$(Platform)\\$(Config)</DCC_DcuOutput>
        <DCC_ExeOutput>.\\$(Platform)\\$(Config)</DCC_ExeOutput>
        <EnableRuntimeThemes>true</EnableRuntimeThemes>
        <DCC_Namespace>System;Xml;Data;Datasnap;Web;Soap;Vcl;Vcl.Imaging;Vcl.Touch;Vcl.Samples;Vcl.Shell;$(DCC_Namespace)</DCC_Namespace>
        <SanitizedProjectName>${spec.projectName}</SanitizedProjectName>
    </PropertyGroup>
    <PropertyGroup Condition="'$(Base_Win32)'!=''">
        <DCC_Namespace>Winapi;System.Win;Data.Win;Datasnap.Win;Web.Win;Soap.Win;Xml.Win;Bde;$(DCC_Namespace)</DCC_Namespace>
        <BT_BuildType>Debug</BT_BuildType>
        <Manifest_File>$(BDS)\\bin\\default_app.manifest</Manifest_File>
    </PropertyGroup>
    <PropertyGroup Condition="'$(Base_Win64)'!=''">
        <DCC_Namespace>Winapi;System.Win;Data.Win;Datasnap.Win;Web.Win;Soap.Win;Xml.Win;$(DCC_Namespace)</DCC_Namespace>
        <BT_BuildType>Debug</BT_BuildType>
        <Manifest_File>$(BDS)\\bin\\default_app.manifest</Manifest_File>
    </PropertyGroup>
    <PropertyGroup Condition="'$(Cfg_1)'!=''">
        <DCC_Define>DEBUG;$(DCC_Define)</DCC_Define>
        <DCC_DebugDCUs>true</DCC_DebugDCUs>
        <DCC_Optimize>false</DCC_Optimize>
        <DCC_GenerateStackFrames>true</DCC_GenerateStackFrames>
        <DCC_DebugInfoInExe>true</DCC_DebugInfoInExe>
        <DCC_RemoteDebug>true</DCC_RemoteDebug>
    </PropertyGroup>
    <PropertyGroup Condition="'$(Cfg_1_Win32)'!=''">
        <DCC_RemoteDebug>false</DCC_RemoteDebug>
        <AppDPIAwarenessMode>PerMonitorV2</AppDPIAwarenessMode>
    </PropertyGroup>
    <PropertyGroup Condition="'$(Cfg_1_Win64)'!=''">
        <AppDPIAwarenessMode>PerMonitorV2</AppDPIAwarenessMode>
    </PropertyGroup>
    <PropertyGroup Condition="'$(Cfg_2)'!=''">
        <DCC_LocalDebugSymbols>false</DCC_LocalDebugSymbols>
        <DCC_Define>RELEASE;$(DCC_Define)</DCC_Define>
        <DCC_SymbolReferenceInfo>0</DCC_SymbolReferenceInfo>
        <DCC_DebugInformation>0</DCC_DebugInformation>
    </PropertyGroup>
    <PropertyGroup Condition="'$(Cfg_2_Win32)'!=''">
        <AppDPIAwarenessMode>PerMonitorV2</AppDPIAwarenessMode>
    </PropertyGroup>
    <PropertyGroup Condition="'$(Cfg_2_Win64)'!=''">
        <AppDPIAwarenessMode>PerMonitorV2</AppDPIAwarenessMode>
    </PropertyGroup>
    <ItemGroup>
        <DelphiCompile Include="$(MainSource)">
            <MainSource>MainSource</MainSource>
        </DelphiCompile>
${dccReferences}
        <BuildConfiguration Include="Base">
            <Key>Base</Key>
        </BuildConfiguration>
        <BuildConfiguration Include="Release">
            <Key>Cfg_2</Key>
            <CfgParent>Base</CfgParent>
        </BuildConfiguration>
        <BuildConfiguration Include="Debug">
            <Key>Cfg_1</Key>
            <CfgParent>Base</CfgParent>
        </BuildConfiguration>
    </ItemGroup>
    <ProjectExtensions>
        <Borland.Personality>Delphi.Personality.12</Borland.Personality>
        <Borland.ProjectType>Application</Borland.ProjectType>
        <BorlandProject>
            <Delphi.Personality>
                <Source>
                    <Source Name="MainSource">${spec.projectName}.dpr</Source>
                </Source>
            </Delphi.Personality>
        </BorlandProject>
    </ProjectExtensions>
    <Import Project="$(BDS)\\Bin\\CodeGear.Delphi.Targets" Condition="Exists('$(BDS)\\Bin\\CodeGear.Delphi.Targets')"/>
    <Import Project="$(APPDATA)\\Embarcadero\\$(BDSAPPDATABASEDIR)\\$(PRODUCTVERSION)\\UserTools.proj" Condition="Exists('$(APPDATA)\\Embarcadero\\$(BDSAPPDATABASEDIR)\\$(PRODUCTVERSION)\\UserTools.proj')"/>
</Project>
`
}
