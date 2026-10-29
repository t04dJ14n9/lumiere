import Foundation

public enum VaultError: LocalizedError, Equatable {
    case invalidPath(String)
    case outsideVault(String)
    case unknownVault(String)
    case notFound(String)
    case changedOnDisk(String)
    case unreadable(String)

    public var errorDescription: String? {
        switch self {
        case .invalidPath(let path): return "\"\(path)\" is not a path inside a vault."
        case .outsideVault(let path): return "\"\(path)\" leads outside the vault."
        case .unknownVault(let id): return "There is no vault \"\(id)\"."
        case .notFound(let path): return "\"\(path)\" does not exist."
        case .changedOnDisk(let path): return "\"\(path)\" changed on disk since it was read."
        case .unreadable(let path): return "\"\(path)\" is not text."
        }
    }

    /// The code the window sees (`error.code`), to tell the cases apart.
    public var code: String {
        switch self {
        case .invalidPath: return "invalid-path"
        case .outsideVault: return "outside-vault"
        case .unknownVault: return "unknown-vault"
        case .notFound: return "not-found"
        case .changedOnDisk: return "changed"
        case .unreadable: return "unreadable"
        }
    }
}

/// A path inside a vault as the window names it: relative to the vault's
/// folder, separated by "/". The window is not trusted with the file system:
/// every path is checked again here. No absolute paths, no empty, "." or
/// ".." segments, and nothing that resolves outside the vault's folder,
/// through a symbolic link or otherwise.
public enum VaultPath {
    /// The file a path names. The empty path is the vault's folder itself.
    public static func url(for path: String, in root: URL) throws -> URL {
        let target = try segments(of: path).reduce(root) { url, segment in
            url.appendingPathComponent(segment)
        }
        try checkInside(target, root: root, path: path)
        return target
    }

    /// The window's name for a file in the vault, or nil outside it. The
    /// folders above the file are resolved (iOS reaches the app's own
    /// folder through /private), the file's own name is kept as it is.
    public static func relative(_ url: URL, to root: URL) -> String? {
        let base = root.standardizedFileURL.resolvingSymlinksInPath().pathComponents
        let standard = url.standardizedFileURL
        let folder = standard.deletingLastPathComponent().resolvingSymlinksInPath()
        let full = folder.appendingPathComponent(standard.lastPathComponent).pathComponents
        guard full.count > base.count, full.starts(with: base) else { return nil }
        return full.dropFirst(base.count).joined(separator: "/")
    }

    static func segments(of path: String) throws -> [String] {
        if path.isEmpty {
            return []
        }
        let segments = path.split(separator: "/", omittingEmptySubsequences: false).map(String.init)
        let isValid = segments.allSatisfy { segment in
            !segment.isEmpty && segment != "." && segment != ".." && !segment.contains("\0")
        }
        guard isValid else { throw VaultError.invalidPath(path) }
        return segments
    }

    /// The deepest part of the path that exists must resolve inside the
    /// vault; what is still to be created then lands inside it too. A
    /// symbolic link that points nowhere could later point anywhere, so it
    /// is refused.
    private static func checkInside(_ target: URL, root: URL, path: String) throws {
        let realRoot = root.standardizedFileURL.resolvingSymlinksInPath().pathComponents
        var existing = target
        while !itemExists(existing) {
            let parent = existing.deletingLastPathComponent()
            guard parent.path != existing.path else { throw VaultError.outsideVault(path) }
            existing = parent
        }
        if isSymbolicLink(existing), !FileManager.default.fileExists(atPath: existing.path) {
            throw VaultError.outsideVault(path)
        }
        let real = existing.standardizedFileURL.resolvingSymlinksInPath().pathComponents
        guard real.starts(with: realRoot) else { throw VaultError.outsideVault(path) }
    }

    /// Whether something is there, a symbolic link itself included (where
    /// `fileExists` would follow the link).
    private static func itemExists(_ url: URL) -> Bool {
        (try? FileManager.default.attributesOfItem(atPath: url.path)) != nil
    }

    private static func isSymbolicLink(_ url: URL) -> Bool {
        let type = (try? FileManager.default.attributesOfItem(atPath: url.path))?[.type] as? FileAttributeType
        return type == .typeSymbolicLink
    }
}
