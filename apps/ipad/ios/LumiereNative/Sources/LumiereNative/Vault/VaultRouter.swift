import Capacitor
import Foundation

/// Serves vault files to the web view at `/_lumiere/vault/<vault id>/<path>`,
/// the URLs the window gives a note's images, videos and embedded PDFs
/// (apps/ipad/src/resources.ts). Capacitor's own file handler then answers
/// them, with their types and byte ranges, as it does the app's files. The
/// path is checked as every vault path is (VaultPath): nothing outside the
/// vault's folder. Every other path is Capacitor's.
public struct VaultRouter: Router {
    public static let prefix = "/_lumiere/vault/"

    private let vaults: VaultStore
    private var fallback: Router

    public init(vaults: VaultStore, fallback: Router) {
        self.vaults = vaults
        self.fallback = fallback
    }

    public var basePath: String {
        get { fallback.basePath }
        set { fallback.basePath = newValue }
    }

    public func route(for path: String) -> String {
        guard path.hasPrefix(Self.prefix) else { return fallback.route(for: path) }
        // A path that is not there, for anything refused: the handler answers it as missing.
        return (try? file(for: String(path.dropFirst(Self.prefix.count))))?.path
            ?? fallback.route(for: "/_lumiere/missing")
    }

    /// The vault file `rest` (`<vault id>/<path>`) names, if it is one.
    func file(for rest: String) throws -> URL {
        guard let slash = rest.firstIndex(of: "/") else { throw VaultError.invalidPath(rest) }
        let id = String(rest[..<slash])
        let path = String(rest[rest.index(after: slash)...])
        let url = try VaultPath.url(for: path, in: try vaults.root(of: id))
        var isFolder: ObjCBool = false
        guard FileManager.default.fileExists(atPath: url.path, isDirectory: &isFolder), !isFolder.boolValue
        else { throw VaultError.notFound(path) }
        return url
    }
}
