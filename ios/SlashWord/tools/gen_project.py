#!/usr/bin/env python3
"""生成 SlashWord.xcodeproj —— 手写 pbxproj 的 ID 很容易写错长度，用脚本保证。"""
import pathlib

root = pathlib.Path(__file__).resolve().parent.parent
proj = root / "SlashWord.xcodeproj"
if not proj.exists():
    proj.mkdir()

_n = [0]


def oid():
    _n[0] += 1
    return f"AA{_n[0]:022X}"


PROJ = oid()
MAIN = oid()
SRCDIR = oid()
PRODUCTS = oid()
TARGET = oid()
APP_REF = oid()
APP_SRC, APP_BF = oid(), oid()
WV_SRC, WV_BF = oid(), oid()
PLIST = oid()
ASSETS, ASSETS_BF = oid(), oid()
SOURCES = oid()
FRAMEWORKS = oid()
RESOURCES = oid()
P_CFGS, P_DBG, P_REL = oid(), oid(), oid()
T_CFGS, T_DBG, T_REL = oid(), oid(), oid()

common_project = """			ALWAYS_SEARCH_USER_PATHS = NO;
			CLANG_ANALYZER_NONNULL = YES;
			CLANG_ENABLE_MODULES = YES;
			CLANG_ENABLE_OBJC_ARC = YES;
			COPY_PHASE_STRIP = NO;
			ENABLE_STRICT_OBJC_MSGSEND = YES;
			GCC_C_LANGUAGE_STANDARD = gnu11;
			GCC_NO_COMMON_BLOCKS = YES;
			IPHONEOS_DEPLOYMENT_TARGET = 16.0;
			SDKROOT = iphoneos;
			SWIFT_EMIT_LOC_STRINGS = YES;
			SWIFT_VERSION = 5.0;"""

content = f"""// !$*UTF8*$!
{{
	archiveVersion = 1;
	classes = {{
	}};
	objectVersion = 56;
	objects = {{

/* Begin PBXBuildFile section */
		{APP_BF} /* App.swift in Sources */ = {{isa = PBXBuildFile; fileRef = {APP_SRC} /* App.swift */; }};
		{WV_BF} /* WebView.swift in Sources */ = {{isa = PBXBuildFile; fileRef = {WV_SRC} /* WebView.swift */; }};
		{ASSETS_BF} /* Assets.xcassets in Resources */ = {{isa = PBXBuildFile; fileRef = {ASSETS} /* Assets.xcassets */; }};
/* End PBXBuildFile section */

/* Begin PBXFileReference section */
		{APP_REF} /* SlashWord.app */ = {{isa = PBXFileReference; explicitFileType = wrapper.application; includeInIndex = 0; path = SlashWord.app; sourceTree = BUILT_PRODUCTS_DIR; }};
		{APP_SRC} /* App.swift */ = {{isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = App.swift; sourceTree = "<group>"; }};
		{WV_SRC} /* WebView.swift */ = {{isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = WebView.swift; sourceTree = "<group>"; }};
		{PLIST} /* Info.plist */ = {{isa = PBXFileReference; lastKnownFileType = text.plist.xml; path = Info.plist; sourceTree = "<group>"; }};
		{ASSETS} /* Assets.xcassets */ = {{isa = PBXFileReference; lastKnownFileType = folder.assetcatalog; path = Assets.xcassets; sourceTree = "<group>"; }};
/* End PBXFileReference section */

/* Begin PBXFrameworksBuildPhase section */
		{FRAMEWORKS} /* Frameworks */ = {{
			isa = PBXFrameworksBuildPhase;
			buildActionMask = 2147483647;
			files = (
			);
			runOnlyForDeploymentPostprocessing = 0;
		}};
/* End PBXFrameworksBuildPhase section */

/* Begin PBXGroup section */
		{MAIN} = {{
			isa = PBXGroup;
			children = (
				{SRCDIR} /* SlashWord */,
				{PRODUCTS} /* Products */,
			);
			sourceTree = "<group>";
		}};
		{SRCDIR} /* SlashWord */ = {{
			isa = PBXGroup;
			children = (
				{APP_SRC} /* App.swift */,
				{WV_SRC} /* WebView.swift */,
				{PLIST} /* Info.plist */,
				{ASSETS} /* Assets.xcassets */,
			);
			path = SlashWord;
			sourceTree = "<group>";
		}};
		{PRODUCTS} /* Products */ = {{
			isa = PBXGroup;
			children = (
				{APP_REF} /* SlashWord.app */,
			);
			name = Products;
			sourceTree = "<group>";
		}};
/* End PBXGroup section */

/* Begin PBXNativeTarget section */
		{TARGET} /* SlashWord */ = {{
			isa = PBXNativeTarget;
			buildConfigurationList = {T_CFGS} /* Build configuration list for PBXNativeTarget "SlashWord" */;
			buildPhases = (
				{SOURCES} /* Sources */,
				{FRAMEWORKS} /* Frameworks */,
				{RESOURCES} /* Resources */,
			);
			buildRules = (
			);
			dependencies = (
			);
			name = SlashWord;
			productName = SlashWord;
			productReference = {APP_REF} /* SlashWord.app */;
			productType = "com.apple.product-type.application";
		}};
/* End PBXNativeTarget section */

/* Begin PBXProject section */
		{PROJ} /* Project object */ = {{
			isa = PBXProject;
			attributes = {{
				BuildIndependentTargetsInParallel = 1;
				LastSwiftUpdateCheck = 1600;
				LastUpgradeCheck = 1600;
				TargetAttributes = {{
					{TARGET} = {{
						CreatedOnToolsVersion = 16.0;
					}};
				}};
			}};
			buildConfigurationList = {P_CFGS} /* Build configuration list for PBXProject "SlashWord" */;
			compatibilityVersion = "Xcode 14.0";
			developmentRegion = en;
			hasScannedForEncodings = 0;
			knownRegions = (
				en,
				Base,
				"zh-Hans",
			);
			mainGroup = {MAIN};
			productRefGroup = {PRODUCTS} /* Products */;
			projectDirPath = "";
			projectRoot = "";
			targets = (
				{TARGET} /* SlashWord */,
			);
		}};
/* End PBXProject section */

/* Begin PBXResourcesBuildPhase section */
		{RESOURCES} /* Resources */ = {{
			isa = PBXResourcesBuildPhase;
			buildActionMask = 2147483647;
			files = (
				{ASSETS_BF} /* Assets.xcassets in Resources */,
			);
			runOnlyForDeploymentPostprocessing = 0;
		}};
/* End PBXResourcesBuildPhase section */

/* Begin PBXSourcesBuildPhase section */
		{SOURCES} /* Sources */ = {{
			isa = PBXSourcesBuildPhase;
			buildActionMask = 2147483647;
			files = (
				{APP_BF} /* App.swift in Sources */,
				{WV_BF} /* WebView.swift in Sources */,
			);
			runOnlyForDeploymentPostprocessing = 0;
		}};
/* End PBXSourcesBuildPhase section */

/* Begin XCBuildConfiguration section */
		{P_DBG} /* Debug */ = {{
			isa = XCBuildConfiguration;
			buildSettings = {{
{common_project}
				DEBUG_INFORMATION_FORMAT = dwarf;
				ENABLE_TESTABILITY = YES;
				GCC_OPTIMIZATION_LEVEL = 0;
				ONLY_ACTIVE_ARCH = YES;
				SWIFT_ACTIVE_COMPILATION_CONDITIONS = "DEBUG $(inherited)";
				SWIFT_OPTIMIZATION_LEVEL = "-Onone";
			}};
			name = Debug;
		}};
		{P_REL} /* Release */ = {{
			isa = XCBuildConfiguration;
			buildSettings = {{
{common_project}
				DEBUG_INFORMATION_FORMAT = "dwarf-with-dsym";
				SWIFT_COMPILATION_MODE = wholemodule;
			}};
			name = Release;
		}};
		{T_DBG} /* Debug */ = {{
			isa = XCBuildConfiguration;
			buildSettings = {{
				ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;
				ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME = "";
				CODE_SIGN_STYLE = Automatic;
				CURRENT_PROJECT_VERSION = 1;
				GENERATE_INFOPLIST_FILE = NO;
				INFOPLIST_FILE = SlashWord/Info.plist;
				IPHONEOS_DEPLOYMENT_TARGET = 16.0;
				LD_RUNPATH_SEARCH_PATHS = (
					"$(inherited)",
					"@executable_path/Frameworks",
				);
				MARKETING_VERSION = 1.1.0;
				PRODUCT_BUNDLE_IDENTIFIER = top.slashbro.word;
				PRODUCT_NAME = "$(TARGET_NAME)";
				SWIFT_VERSION = 5.0;
				TARGETED_DEVICE_FAMILY = "1,2";
			}};
			name = Debug;
		}};
		{T_REL} /* Release */ = {{
			isa = XCBuildConfiguration;
			buildSettings = {{
				ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;
				ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME = "";
				CODE_SIGN_STYLE = Automatic;
				CURRENT_PROJECT_VERSION = 1;
				GENERATE_INFOPLIST_FILE = NO;
				INFOPLIST_FILE = SlashWord/Info.plist;
				IPHONEOS_DEPLOYMENT_TARGET = 16.0;
				LD_RUNPATH_SEARCH_PATHS = (
					"$(inherited)",
					"@executable_path/Frameworks",
				);
				MARKETING_VERSION = 1.1.0;
				PRODUCT_BUNDLE_IDENTIFIER = top.slashbro.word;
				PRODUCT_NAME = "$(TARGET_NAME)";
				SWIFT_VERSION = 5.0;
				TARGETED_DEVICE_FAMILY = "1,2";
			}};
			name = Release;
		}};
/* End XCBuildConfiguration section */

/* Begin XCConfigurationList section */
		{P_CFGS} /* Build configuration list for PBXProject "SlashWord" */ = {{
			isa = XCConfigurationList;
			buildConfigurations = (
				{P_DBG} /* Debug */,
				{P_REL} /* Release */,
			);
			defaultConfigurationIsVisible = 0;
			defaultConfigurationName = Release;
		}};
		{T_CFGS} /* Build configuration list for PBXNativeTarget "SlashWord" */ = {{
			isa = XCConfigurationList;
			buildConfigurations = (
				{T_DBG} /* Debug */,
				{T_REL} /* Release */,
			);
			defaultConfigurationIsVisible = 0;
			defaultConfigurationName = Release;
		}};
/* End XCConfigurationList section */
	}};
	rootObject = {PROJ} /* Project object */;
}}
"""

(proj / "project.pbxproj").write_text(content, encoding="utf-8")
print("已生成", proj / "project.pbxproj")

# scheme：xcodebuild 带 -derivedDataPath 必须要有它，
# Ray 用 Xcode 打开工程时也需要
scheme_dir = proj / "xcshareddata" / "xcschemes"
if not scheme_dir.exists():
    scheme_dir.mkdir(parents=True)

ref = (
    '<BuildableReference BuildableIdentifier="primary" '
    f'BlueprintIdentifier="{TARGET}" BuildableName="SlashWord.app" '
    'BlueprintName="SlashWord" ReferencedContainer="container:SlashWord.xcodeproj">'
    "</BuildableReference>"
)
scheme = f"""<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion="1600" version="1.7">
   <BuildAction parallelizeBuildables="YES" buildImplicitDependencies="YES">
      <BuildActionEntries>
         <BuildActionEntry buildForTesting="YES" buildForRunning="YES" buildForProfiling="YES" buildForArchiving="YES" buildForAnalyzing="YES">
            {ref}
         </BuildActionEntry>
      </BuildActionEntries>
   </BuildAction>
   <TestAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.DebuggerFoundation.Launcher.LLDB" shouldUseLaunchSchemeArgsEnv="YES">
      <Testables>
      </Testables>
   </TestAction>
   <LaunchAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.DebuggerFoundation.Launcher.LLDB" launchStyle="0" useCustomWorkingDirectory="NO" ignoresPersistentStateOnLaunch="NO" debugDocumentVersioning="YES" debugServiceExtension="internal" allowLocationSimulation="YES">
      {ref}
   </LaunchAction>
   <ProfileAction buildConfiguration="Release" shouldUseLaunchSchemeArgsEnv="YES" savedToolIdentifier="" useCustomWorkingDirectory="NO" debugDocumentVersioning="YES">
      {ref}
   </ProfileAction>
   <AnalyzeAction buildConfiguration="Debug">
   </AnalyzeAction>
   <ArchiveAction buildConfiguration="Release" revealArchiveInOrganizer="YES">
   </ArchiveAction>
</Scheme>
"""
(scheme_dir / "SlashWord.xcscheme").write_text(scheme, encoding="utf-8")
print("已生成", scheme_dir / "SlashWord.xcscheme")
