// swift-tools-version: 5.9
// Lumière's native plugins for the iPad app: host services the TypeScript
// side injects (files, key commands, ink). They know nothing of Markdown or
// PDFs. The App target links this package and starts LumiereViewController.
import PackageDescription

let package = Package(
    name: "LumiereNative",
    platforms: [.iOS(.v17)],
    products: [
        .library(name: "LumiereNative", targets: ["LumiereNative"])
    ],
    dependencies: [
        // The same Capacitor as CapApp-SPM (apps/ipad/package.json pins it).
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.5.3")
    ],
    targets: [
        .target(
            name: "LumiereNative",
            dependencies: [.product(name: "Capacitor", package: "capacitor-swift-pm")]
        ),
        .testTarget(name: "LumiereNativeTests", dependencies: ["LumiereNative"]),
    ]
)
