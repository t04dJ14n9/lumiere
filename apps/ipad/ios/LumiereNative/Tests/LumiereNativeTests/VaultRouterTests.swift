import Capacitor
import XCTest
@testable import LumiereNative

/// Capacitor's router stands in for the app's files.
private struct AppFiles: Router {
    var basePath = "/app/public"
    func route(for path: String) -> String { basePath + path }
}

final class VaultRouterTests: XCTestCase {
    private var folder: URL!
    private var router: VaultRouter!

    override func setUpWithError() throws {
        folder = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        let notes = folder.appendingPathComponent("Documents/Attachments", isDirectory: true)
        try FileManager.default.createDirectory(at: notes, withIntermediateDirectories: true)
        try Data("%PDF".utf8).write(to: notes.appendingPathComponent("Light and growth.pdf"))
        try Data("{}".utf8).write(to: folder.appendingPathComponent("secret.json"))
        let vaults = VaultStore(
            appFolder: folder.appendingPathComponent("Documents", isDirectory: true),
            dataFolder: folder.appendingPathComponent("Support", isDirectory: true)
        )
        router = VaultRouter(vaults: vaults, fallback: AppFiles())
    }

    override func tearDownWithError() throws {
        try FileManager.default.removeItem(at: folder)
    }

    func testServesAFileInsideTheVault() throws {
        let served = router.route(for: "/_lumiere/vault/app/Attachments/Light and growth.pdf")
        XCTAssertEqual(URL(fileURLWithPath: served).lastPathComponent, "Light and growth.pdf")
        XCTAssertEqual(try Data(contentsOf: URL(fileURLWithPath: served)), Data("%PDF".utf8))
    }

    func testRefusesEverythingElseAsMissing() {
        let missing = "/app/public/_lumiere/missing"
        for path in [
            "/_lumiere/vault/app/../secret.json",
            "/_lumiere/vault/app/Attachments",
            "/_lumiere/vault/app/Attachments/none.pdf",
            "/_lumiere/vault/unknown/Attachments/Light and growth.pdf",
            "/_lumiere/vault/app",
        ] {
            XCTAssertEqual(router.route(for: path), missing, path)
        }
    }

    func testLeavesTheAppsOwnFilesToCapacitor() {
        XCTAssertEqual(router.route(for: "/index.html"), "/app/public/index.html")
        XCTAssertEqual(router.basePath, "/app/public")
    }
}
