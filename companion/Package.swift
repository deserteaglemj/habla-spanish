// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "CallTranslatorCore",
    platforms: [.macOS("26.0")],
    products: [
        .library(name: "CallTranslatorCore", targets: ["CallTranslatorCore"])
    ],
    targets: [
        .target(name: "CallTranslatorCore"),
        .testTarget(name: "CallTranslatorCoreTests", dependencies: ["CallTranslatorCore"]),
        .executableTarget(
            name: "CallTranslatorApp",
            dependencies: ["CallTranslatorCore"],
            path: "App"
        ),
        .testTarget(
            name: "CallTranslatorAppTests",
            dependencies: ["CallTranslatorApp"],
            path: "AppTests"
        )
    ]
)
